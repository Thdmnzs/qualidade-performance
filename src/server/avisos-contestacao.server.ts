/**
 * Os avisos de contestação no Slack (08/10/2026): a abertura (no canal), o
 * lembrete do dia do prazo e a resposta (na conversa da abertura).
 *
 * Nenhum aviso sai duas vezes: cada um é RESERVADO no banco antes de postar; se o
 * Slack falhar, a reserva é desfeita, e a tarefa da manhã tenta de novo.
 */
import { timingSafeEqual } from "node:crypto";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  textoDaAbertura,
  textoDaResposta,
  TEXTO_DO_LEMBRETE,
  type DadosDoAviso,
} from "@/lib/avisos-contestacao";
import { postarNoSlack, slackConfigurado } from "@/server/slack.server";

type Evento = "abertura" | "lembrete" | "resposta";
const URL_DO_QUALITYHUB = () =>
  process.env["QUALITYHUB_URL"] || "https://qualidade-performance.vercel.app";

async function dados(id: string) {
  const { data, error } = await supabaseAdmin.rpc("dados_do_aviso_de_contestacao", { _id: id });
  if (error) throw new Error(error.message);
  return (data?.[0] ?? null) as
    | (DadosDoAviso & {
        slack_ts: string | null;
        slack_abertura_em: string | null;
        slack_resposta_em: string | null;
      })
    | null;
}

/** Reserva o aviso, faz a ação, e desfaz a reserva se ela falhar. */
async function comReserva(id: string, evento: Evento, acao: () => Promise<void>): Promise<boolean> {
  const { data: reservado, error } = await supabaseAdmin.rpc("reservar_aviso_slack", {
    _id: id,
    _evento: evento,
  });
  if (error) throw new Error(error.message);
  if (!reservado) return false; // outra tentativa já cuidou dele
  try {
    await acao();
    return true;
  } catch (e) {
    await supabaseAdmin.rpc("desfazer_aviso_slack", { _id: id, _evento: evento });
    console.error(
      `[avisos] o aviso de ${evento} da contestação ${id} não saiu:`,
      e instanceof Error ? e.message : e,
    );
    return false;
  }
}

/** A abertura e a resposta que faltam (chamado logo depois de contestar ou de responder). */
export async function avisarContestacao(id: string): Promise<void> {
  if (!slackConfigurado()) return;
  const d = await dados(id);
  if (!d) return;
  if (!d.slack_abertura_em) {
    await comReserva(id, "abertura", async () => {
      const ts = await postarNoSlack({ texto: textoDaAbertura(d, URL_DO_QUALITYHUB()) });
      await supabaseAdmin.rpc("guardar_mensagem_slack", { _id: id, _ts: ts });
    });
  }
  if ((d.status === "deferida" || d.status === "indeferida") && !d.slack_resposta_em) {
    const ts = (await dados(id))?.slack_ts ?? null; // a conversa da abertura (se ela saiu)
    await comReserva(id, "resposta", async () => {
      await postarNoSlack({ texto: textoDaResposta(d), naConversaDe: ts });
    });
  }
}

/** O lembrete do dia do prazo, na conversa da abertura e também no canal. */
async function lembrar(id: string): Promise<void> {
  const d = await dados(id);
  if (!d) return;
  await comReserva(id, "lembrete", async () => {
    await postarNoSlack({
      texto: TEXTO_DO_LEMBRETE,
      naConversaDe: d.slack_ts,
      tambemNoCanal: true,
    });
  });
}

/** A tarefa da manhã (8h): os lembretes do dia e os avisos que se perderam. */
export async function tarefaDosAvisos(request: Request): Promise<Response> {
  const segredo = process.env["CRON_SECRET"];
  const recebido = request.headers.get("authorization") ?? "";
  const esperado = `Bearer ${segredo ?? ""}`;
  const igual =
    !!segredo &&
    recebido.length === esperado.length &&
    timingSafeEqual(Buffer.from(recebido), Buffer.from(esperado));
  if (!igual) return new Response("Não autorizado.", { status: 401 });
  // A Central de Turnos (13/10/2026) também recupera, de manhã, os avisos de troca que se perderam.
  // Os indicadores (15/10/2026): a planilha é lida todo dia às 8h, junto da tarefa da manhã.
  const { lerPlanilhaDosIndicadores } = await import("@/server/planilha-indicadores.server");
  const leitura = await lerPlanilhaDosIndicadores("automatica");
  if (!leitura.ok)
    console.error("[tarefa da manhã] a planilha dos indicadores não foi lida:", leitura.erro);
  // O termômetro do humor (21/10/2026): os registros de mais de 90 dias são apagados.
  const { error: erroDoHumor } = await supabaseAdmin.rpc("apagar_humores_antigos");
  if (erroDoHumor)
    console.error("[tarefa da manhã] os humores antigos não foram apagados:", erroDoHumor.message);
  // O mural do CX (20/10/2026): a releitura do canal, como mais uma rede de segurança.
  try {
    const { lerMuralSePreciso } = await import("@/server/slack-mural.server");
    await lerMuralSePreciso(0);
  } catch (e) {
    console.error("[tarefa da manhã] o mural não foi relido:", e instanceof Error ? e.message : e);
  }
  const { avisosDeTrocaPendentes } = await import("@/server/central-de-turnos.server");
  const trocas = await avisosDeTrocaPendentes();
  // A central de notificações (13/10/2026): as novidades com mais de 30 dias são apagadas.
  const { error: erroDaLimpeza } = await supabaseAdmin.rpc("limpar_notificacoes_antigas");
  if (erroDaLimpeza) console.error("[notificações] erro na limpeza:", erroDaLimpeza.message);
  // O limite de uso (13/10/2026): as contagens com mais de um dia são apagadas.
  const { error: erroDosLimites } = await supabaseAdmin.rpc("limpar_limites_de_uso");
  if (erroDosLimites) console.error("[limite de uso] erro na limpeza:", erroDosLimites.message);
  if (!slackConfigurado())
    return Response.json({ avisos: 0, trocas, motivo: "Slack não configurado" });
  const { data: pendentes, error } = await supabaseAdmin.rpc("avisos_slack_pendentes");
  if (error) {
    console.error("[avisos] erro ao ler a fila:", error);
    return new Response("Erro ao ler a fila de avisos.", { status: 500 });
  }
  let feitos = 0;
  for (const p of pendentes ?? []) {
    try {
      if (p.evento === "lembrete") await lembrar(p.id);
      else await avisarContestacao(p.id);
      feitos++;
    } catch (e) {
      console.error("[avisos] erro na tarefa da manhã:", e instanceof Error ? e.message : e);
    }
  }
  return Response.json({ avisos: feitos, trocas });
}
