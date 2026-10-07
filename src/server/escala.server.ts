/**
 * Leitura da escala no servidor (07/10/2026): a planilha "escala cx", pela API
 * do Google Sheets, só de leitura. A planilha é compartilhada só com a conta de
 * serviço (como Leitor). Roda todo dia às 7h (tarefa agendada) e quando o ADM
 * pede ("Ler a escala agora").
 */
import { timingSafeEqual } from "node:crypto";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { abasNaJanela, lerEscala, type AbaDaEscala } from "@/lib/escala";
import { tokenDoGoogle } from "@/server/google.server";

export class ErroDaEscala extends Error {}

const ESCOPO = "https://www.googleapis.com/auth/spreadsheets.readonly";
// A planilha "escala cx" (o identificador não é segredo; pode ser trocado na Vercel).
const PLANILHA_PADRAO = "1JiXqutyy7BKV5b8aEuyhEDblMVX5iYtQwG4m0CIkpx4";

async function buscar<T>(caminho: string, token: string): Promise<T> {
  const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${caminho}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (r.status === 403 || r.status === 404) {
    throw new ErroDaEscala(
      "A conta de serviço não tem acesso à planilha da escala. Compartilhe a planilha com ela, como Leitor.",
    );
  }
  if (!r.ok) throw new ErroDaEscala(`O Google Sheets não respondeu (código ${r.status}).`);
  return (await r.json()) as T;
}

export async function lerEscalaDoGoogle(p: {
  origem: "automatica" | "manual";
  chamadorId: string | null;
}) {
  const planilha = process.env["ESCALA_SHEET_ID"] || PLANILHA_PADRAO;
  const registrar = (args: {
    linhas: unknown[];
    dias: string[];
    abas: number;
    erro: string | null;
  }) =>
    supabaseAdmin.rpc("registrar_leitura_escala", {
      _chamador: p.chamadorId,
      _origem: p.origem,
      _linhas: args.linhas as never,
      _dias: args.dias,
      _abas: args.abas,
      _erro: args.erro,
    });
  try {
    const token = await tokenDoGoogle(ESCOPO);
    const meta = await buscar<{ sheets?: { properties?: { title?: string } }[] }>(
      `${planilha}?fields=sheets.properties.title`,
      token,
    );
    const titulos = abasNaJanela(
      (meta.sheets ?? []).map((s) => s.properties?.title ?? "").filter(Boolean),
      new Date(),
    );
    let abas: AbaDaEscala[] = [];
    if (titulos.length) {
      const faixas = titulos
        .map((t) => `ranges=${encodeURIComponent(`'${t.replace(/'/g, "''")}'!A1:Z400`)}`)
        .join("&");
      const valores = await buscar<{ valueRanges?: { values?: string[][] }[] }>(
        `${planilha}/values:batchGet?${faixas}`,
        token,
      );
      abas = titulos.map((titulo, i) => ({
        titulo,
        linhas: valores.valueRanges?.[i]?.values ?? [],
      }));
    }
    const leitura = lerEscala(abas, new Date());
    const { data, error } = await registrar({
      linhas: leitura.linhas,
      dias: leitura.dias,
      abas: leitura.abas,
      erro: null,
    });
    if (error) throw new ErroDaEscala(error.message);
    return {
      abas: leitura.abas,
      dias: leitura.dias.length,
      ...(data as { gravadas: number; nao_reconhecidos: string[] }),
    };
  } catch (erro) {
    const motivo = erro instanceof Error ? erro.message : "Erro inesperado ao ler a escala.";
    await registrar({ linhas: [], dias: [], abas: 0, erro: motivo }); // fica registrado, sem apagar nada
    throw erro instanceof ErroDaEscala ? erro : new ErroDaEscala(motivo);
  }
}

/** A tarefa agendada (todo dia às 7h): só com o segredo CRON_SECRET, que a Vercel envia. */
export async function tarefaDiariaDaEscala(request: Request): Promise<Response> {
  const segredo = process.env["CRON_SECRET"];
  const recebido = request.headers.get("authorization") ?? "";
  const esperado = `Bearer ${segredo ?? ""}`;
  const igual =
    !!segredo &&
    recebido.length === esperado.length &&
    timingSafeEqual(Buffer.from(recebido), Buffer.from(esperado));
  if (!igual) return new Response("Não autorizado.", { status: 401 });
  try {
    return Response.json(await lerEscalaDoGoogle({ origem: "automatica", chamadorId: null }));
  } catch (erro) {
    return new Response(erro instanceof Error ? erro.message : "Erro ao ler a escala.", {
      status: 500,
    });
  }
}
