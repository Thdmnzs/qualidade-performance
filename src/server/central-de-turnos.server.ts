/**
 * A Central de Turnos no Slack (13/10/2026): o aviso das trocas já aceitas pela colega
 * (no canal de escala) e o fim (na conversa do aviso). Mesmo esquema do Radar da Qualidade:
 * cada aviso é RESERVADO no banco antes de postar; se o Slack falhar, a reserva é desfeita,
 * e a tarefa da manhã tenta de novo. Sem as variáveis da Central, nada é postado.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { textoDoAviso, textoDoFim, type DadosDoAvisoDeTroca } from "@/lib/avisos-trocas";
import {
  CENTRAL_DE_TURNOS,
  centralDeTurnosConfigurada,
  postarNoSlack,
} from "@/server/slack.server";

type Evento = "aviso" | "fim";
const URL_DO_QUALITYHUB = () =>
  process.env["QUALITYHUB_URL"] || "https://qualidade-performance.vercel.app";

async function dados(id: string) {
  const { data, error } = await supabaseAdmin.rpc("dados_do_aviso_de_troca", { _id: id });
  if (error) throw new Error(error.message);
  return (data ?? null) as
    | (DadosDoAvisoDeTroca & {
        slack_ts: string | null;
        slack_aviso_em: string | null;
        slack_fim_em: string | null;
      })
    | null;
}

/** Reserva o aviso, faz a ação, e desfaz a reserva se ela falhar. */
async function comReserva(id: string, evento: Evento, acao: () => Promise<void>): Promise<boolean> {
  const { data: reservado, error } = await supabaseAdmin.rpc("reservar_aviso_de_troca", {
    _id: id,
    _evento: evento,
  });
  if (error) throw new Error(error.message);
  if (!reservado) return false; // outra tentativa já cuidou dele (ou ainda não é hora)
  try {
    await acao();
    return true;
  } catch (e) {
    await supabaseAdmin.rpc("desfazer_aviso_de_troca", { _id: id, _evento: evento });
    console.error(
      `[central de turnos] o ${evento} da troca ${id} não saiu:`,
      e instanceof Error ? e.message : e,
    );
    return false;
  }
}

/** O aviso e o fim que faltam (chamado logo depois de aceitar, decidir ou cancelar). */
export async function avisarTroca(id: string): Promise<void> {
  if (!centralDeTurnosConfigurada()) return;
  const d = await dados(id);
  if (!d) return;
  if (!d.slack_aviso_em)
    await comReserva(id, "aviso", async () => {
      const ts = await postarNoSlack({
        texto: textoDoAviso(d, URL_DO_QUALITYHUB()),
        robo: CENTRAL_DE_TURNOS(),
      });
      const { error } = await supabaseAdmin.rpc("guardar_mensagem_da_troca", { _id: id, _ts: ts });
      if (error) throw new Error(error.message);
    });
  // Depois do aviso (agora ou antes), o fim, se a troca já terminou.
  const depois = await dados(id);
  const fim = depois ? textoDoFim(depois) : null;
  if (depois?.slack_ts && !depois.slack_fim_em && fim)
    await comReserva(id, "fim", async () => {
      await postarNoSlack({ texto: fim, naConversaDe: depois.slack_ts, robo: CENTRAL_DE_TURNOS() });
    });
}

/** A tarefa da manhã: os avisos de troca que se perderam. Devolve quantos saíram. */
export async function avisosDeTrocaPendentes(): Promise<number> {
  if (!centralDeTurnosConfigurada()) return 0;
  const { data, error } = await supabaseAdmin.rpc("avisos_de_troca_pendentes");
  if (error) {
    console.error("[central de turnos] erro ao ler a fila:", error);
    return 0;
  }
  let feitos = 0;
  for (const id of new Set(((data ?? []) as { id: string }[]).map((p) => p.id))) {
    try {
      await avisarTroca(id);
      feitos++;
    } catch (e) {
      console.error(
        "[central de turnos] erro na tarefa da manhã:",
        e instanceof Error ? e.message : e,
      );
    }
  }
  return feitos;
}
