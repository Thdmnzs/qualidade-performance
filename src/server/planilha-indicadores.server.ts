/**
 * A leitura da planilha dos indicadores (15/10/2026), todo dia às 8h (na tarefa da manhã) e quando o
 * ADM pede. Lê as abas "Dados" e "Análise" com a conta de serviço (só leitura), numa chamada só:
 *   * da "Dados", os números de cada pessoa e dia (para as telas do colaborador), que o banco liga ao
 *     cadastro (sem o TIME e sem o dia de hoje), e a CÓPIA da aba inteira (para a supervisão escolher o dia);
 *   * da "Análise", a CÓPIA da aba inteira (o consolidado da própria planilha, para a supervisão).
 * As cópias guardam os valores como o Google os mostra (a formatação da planilha): nada é calculado.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { copiaDaAba, linhasDaPlanilha, PLANILHA_DOS_INDICADORES } from "@/lib/planilha-indicadores";
import { tokenDoGoogle } from "@/server/google.server";

const ESCOPO = "https://www.googleapis.com/auth/spreadsheets.readonly";

export type ResultadoDaLeitura =
  | { ok: true; gravadas: number; linhas: number; ignoradas: { nome: string; linhas: number }[] }
  | { ok: false; erro: string };

export async function lerPlanilhaDosIndicadores(
  origem: "automatica" | "manual",
): Promise<ResultadoDaLeitura> {
  try {
    const token = await tokenDoGoogle(ESCOPO);
    const intervalos = [
      `${PLANILHA_DOS_INDICADORES.aba}!A1:Z`,
      `${PLANILHA_DOS_INDICADORES.analise}!A1:Z200`,
    ]
      .map((r) => `ranges=${encodeURIComponent(r)}`)
      .join("&");
    const r = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${PLANILHA_DOS_INDICADORES.id}/values:batchGet?${intervalos}`,
      {
        headers: { authorization: `Bearer ${token}` },
      },
    );
    if (r.status === 403 || r.status === 404)
      throw new Error(
        "A conta de serviço não tem acesso à planilha (compartilhe-a com ela, como leitora).",
      );
    if (!r.ok) throw new Error(`O Google recusou a leitura da planilha (código ${r.status}).`);
    const { valueRanges = [] } = (await r.json()) as { valueRanges?: { values?: unknown[][] }[] };
    const dados = valueRanges[0]?.values ?? [];
    const analise = valueRanges[1]?.values ?? [];
    // Os números de cada pessoa e dia (o banco liga ao cadastro, e registra a leitura).
    const linhas = linhasDaPlanilha(dados);
    const { data, error } = await supabaseAdmin.rpc("gravar_leitura_da_planilha", {
      _origem: origem,
      _linhas: linhas,
    });
    if (error) throw new Error(error.message);
    // As cópias, para a tabela da supervisão: a "Dados" inteira (o filtro do dia; o "dia" guarda o último que
    // ela tem), e a "Análise" inteira.
    const copiaDados = copiaDaAba(dados);
    const copias = await Promise.all([
      supabaseAdmin.rpc("gravar_copia_da_planilha", {
        _aba: "dados",
        _valores: copiaDados.valores,
        _dia: copiaDados.ultimoDia,
      }),
      supabaseAdmin.rpc("gravar_copia_da_planilha", {
        _aba: "analise",
        _valores: analise.map((l) => l.map((c) => (c == null ? "" : String(c)))),
        _dia: null,
      }),
    ]);
    const erroDaCopia = copias.find((c) => c.error)?.error;
    if (erroDaCopia) throw new Error(erroDaCopia.message);
    const l = data as {
      gravadas: number;
      linhas: number;
      ignoradas: { nome: string; linhas: number }[];
    };
    return { ok: true, gravadas: l.gravadas, linhas: l.linhas, ignoradas: l.ignoradas };
  } catch (e) {
    const erro = e instanceof Error ? e.message : String(e);
    console.error("[planilha dos indicadores] a leitura falhou:", erro);
    await supabaseAdmin.rpc("registrar_erro_da_leitura", { _origem: origem, _erro: erro });
    return { ok: false, erro };
  }
}
