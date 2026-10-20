/**
 * A leitura da planilha dos indicadores (15/10/2026): a aba "Dados" de "CX - Métricas individuais do
 * time", uma linha por pessoa e por dia, vira as linhas que o banco grava. Puro, para ser testado.
 *
 *   * As colunas são achadas pelo NOME do cabeçalho (a ordem pode mudar na planilha).
 *   * Os números vêm como o Google os mostra ("60,00", "98,5%", "1.234"): a vírgula é o decimal.
 *   * O SLA geral do dia, por canal, é o "[Geral]" do Intercom (20/10/2026); sem essa coluna, a média do B2C e do B2B.
 *   * As horas ativas viram minutos (e são também as horas online da meta).
 *   * Uma célula vazia é "sem dado", e não zero.
 */
export type LinhaDaPlanilha = {
  nome: string;
  dia: string; // aaaa-mm-dd
  conversas: number | null;
  autoatribuicoes: number | null;
  tempo_ativo_min: number | null;
  sla_chat_s: number | null;
  sla_email_s: number | null;
  csat_positivas: number | null;
  csat_total: number | null;
  /** Os oito tempos do SLA (16/10/2026), para as abas do colaborador. */
  sla_b2c_chat_1_s: number | null;
  sla_b2c_email_1_s: number | null;
  sla_b2c_chat_g_s: number | null;
  sla_b2c_email_g_s: number | null;
  sla_b2b_chat_1_s: number | null;
  sla_b2b_email_1_s: number | null;
  sla_b2b_chat_g_s: number | null;
  sla_b2b_email_g_s: number | null;
};

export const PLANILHA_DOS_INDICADORES = {
  id: "1FevIlUGt3vxVi88QvoOk5BJmYrQr1ltqAVChYmwgk0w",
  aba: "Dados",
  analise: "Análise",
  url: "https://docs.google.com/spreadsheets/d/1FevIlUGt3vxVi88QvoOk5BJmYrQr1ltqAVChYmwgk0w/edit",
} as const;

const normal = (t: string) =>
  t
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
const COLUNAS = {
  dia: "data",
  nome: "membro",
  conversas: "conversas atribuidas (total)",
  autoatribuicoes: "conversas atribuidas (membro da equipe)",
  horas: "horas ativas",
  csat_positivas: "csat avaliacoes positivas",
  csat_total: "csat total de avaliacoes",
  b2c_chat_1: "[b2c] sla primeira resposta chat (s)",
  b2c_email_1: "[b2c] sla primeira resposta email (s)",
  b2b_chat_1: "[b2b] sla primeira resposta chat (s)",
  b2b_email_1: "[b2b] sla primeira resposta email (s)",
  b2c_chat: "[b2c] sla chat (s)",
  b2c_email: "[b2c] sla email (s)",
  b2b_chat: "[b2b] sla chat (s)",
  b2b_email: "[b2b] sla email (s)",
  // (20/10/2026) O SLA geral do Intercom: é ELE o SLA geral do colaborador, da Visão geral e do fechamento.
  geral_chat: "[geral] sla chat (s)",
  geral_email: "[geral] sla email (s)",
} as const;
const OBRIGATORIAS = ["dia", "nome", "conversas", "horas"] as const;

/** "60,00" → 60; "1.234,5" → 1234.5; "98,5%" → 98.5; "" → null. */
export function numero(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const t = String(v ?? "")
    .trim()
    .replace(/%$/, "")
    .replace(/\s/g, "");
  if (!t) return null;
  const n = Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
  return Number.isFinite(n) ? n : null;
}
/** "01/10/2026" → "2026-10-01" (ou null, se não for uma data). */
export function dataDaPlanilha(v: unknown): string | null {
  const m = String(v ?? "")
    .trim()
    .match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const [d, mes, a] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(a, mes - 1, d));
  if (dt.getUTCFullYear() !== a || dt.getUTCMonth() !== mes - 1 || dt.getUTCDate() !== d)
    return null;
  return `${a}-${String(mes).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
const media = (...xs: (number | null)[]) => {
  const v = xs.filter((x): x is number => x !== null);
  return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null;
};

/** As linhas da aba (a primeira é o cabeçalho). Uma coluna obrigatória faltando é um erro. */
export function linhasDaPlanilha(valores: unknown[][]): LinhaDaPlanilha[] {
  const [cabecalho = [], ...corpo] = valores;
  const pos = Object.fromEntries(
    Object.entries(COLUNAS).map(([k, nome]) => [
      k,
      cabecalho.findIndex((c) => normal(String(c ?? "")) === nome),
    ]),
  ) as Record<keyof typeof COLUNAS, number>;
  const faltando = OBRIGATORIAS.filter((k) => pos[k] < 0);
  if (faltando.length)
    throw new Error(
      `A planilha não tem a coluna ${faltando.map((k) => `"${COLUNAS[k]}"`).join(", ")}.`,
    );
  const cel = (l: unknown[], k: keyof typeof COLUNAS) => (pos[k] < 0 ? null : l[pos[k]]);
  const linhas: LinhaDaPlanilha[] = [];
  for (const l of corpo) {
    const nome = String(cel(l, "nome") ?? "").trim();
    const dia = dataDaPlanilha(cel(l, "dia"));
    if (!nome || !dia) continue;
    const horas = numero(cel(l, "horas"));
    linhas.push({
      nome,
      dia,
      conversas: numero(cel(l, "conversas")),
      autoatribuicoes: numero(cel(l, "autoatribuicoes")),
      tempo_ativo_min: horas === null ? null : Math.round(horas * 60 * 10) / 10,
      // O [Geral] do Intercom (20/10/2026). Só se a planilha não tiver essa coluna, a média do B2C e do B2B.
      sla_chat_s:
        pos.geral_chat >= 0
          ? numero(cel(l, "geral_chat"))
          : media(numero(cel(l, "b2c_chat")), numero(cel(l, "b2b_chat"))),
      sla_email_s:
        pos.geral_email >= 0
          ? numero(cel(l, "geral_email"))
          : media(numero(cel(l, "b2c_email")), numero(cel(l, "b2b_email"))),
      csat_positivas: numero(cel(l, "csat_positivas")),
      csat_total: numero(cel(l, "csat_total")),
      sla_b2c_chat_1_s: numero(cel(l, "b2c_chat_1")),
      sla_b2c_email_1_s: numero(cel(l, "b2c_email_1")),
      sla_b2c_chat_g_s: numero(cel(l, "b2c_chat")),
      sla_b2c_email_g_s: numero(cel(l, "b2c_email")),
      sla_b2b_chat_1_s: numero(cel(l, "b2b_chat_1")),
      sla_b2b_email_1_s: numero(cel(l, "b2b_email_1")),
      sla_b2b_chat_g_s: numero(cel(l, "b2b_chat")),
      sla_b2b_email_g_s: numero(cel(l, "b2b_email")),
    });
  }
  return linhas;
}

/** A cópia da aba "Dados" para a supervisão: o cabeçalho e as linhas do dia (como estão na planilha). */
export function copiaDoDia(valores: unknown[][], dia: string): string[][] {
  const [cabecalho = [], ...corpo] = valores;
  const pos = cabecalho.findIndex((c) => normal(String(c ?? "")) === COLUNAS.dia);
  const comoTexto = (l: unknown[]) => l.map((c) => (c == null ? "" : String(c)));
  return [
    comoTexto(cabecalho),
    ...corpo.filter((l) => dataDaPlanilha(l[pos]) === dia).map(comoTexto),
  ];
}

/**
 * A cópia da aba "Dados" inteira, para a supervisão (20/10/2026: o filtro do dia): o cabeçalho e todas as
 * linhas, como estão na planilha (os textos, sem conta); e o último dia que ela tem.
 */
export function copiaDaAba(valores: unknown[][]): {
  valores: string[][];
  ultimoDia: string | null;
} {
  const comoTexto = (l: unknown[]) => l.map((c) => (c == null ? "" : String(c)));
  const [cabecalho = [], ...corpo] = valores;
  const pos = cabecalho.findIndex((c) => normal(String(c ?? "")) === COLUNAS.dia);
  const dias = corpo.map((l) => dataDaPlanilha(l[pos])).filter((d): d is string => !!d);
  return {
    valores: valores.map(comoTexto),
    ultimoDia: dias.length ? dias.reduce((a, b) => (a > b ? a : b)) : null,
  };
}
