/**
 * Indicadores e metas. As metas vêm do banco (business_settings, chave
 * "metas_indicadores"); aqui ficam só as regras de exibição.
 */
export type ChaveIndicador = "produtividade" | "sla_chat" | "sla_email" | "csat" | "horas_online";

export type Meta = {
  meta: number;
  unidade: string;
  sentido: "minimo" | "maximo";
  escopo: "individual" | "time";
  calculo?: string;
};

export type Metas = Partial<Record<ChaveIndicador, Meta>>;

/** Ordem dos cartões e o que cada um explica. */
export const INDICADORES: { chave: ChaveIndicador; titulo: string; explicacao: string }[] = [
  {
    chave: "produtividade",
    titulo: "Produtividade",
    explicacao: "Tickets por hora, pela mesma conta do relatório atual.",
  },
  {
    chave: "sla_chat",
    titulo: "SLA Chat",
    explicacao:
      "Mediana do tempo da 1ª resposta nas conversas de chat, só no horário de atendimento.",
  },
  {
    chave: "sla_email",
    titulo: "SLA E-mail",
    explicacao:
      "Mediana do tempo da 1ª resposta nas conversas de e-mail, só no horário de atendimento.",
  },
  {
    chave: "csat",
    titulo: "CSAT",
    explicacao:
      "Satisfação do cliente do time inteiro: avaliações positivas sobre o total. Igual para todos.",
  },
  {
    chave: "horas_online",
    titulo: "Horas logadas",
    explicacao: "Horas logadas na quinzena. A média semanal precisa atingir a meta.",
  },
];

/** Texto da meta: "mínimo 6 tickets/h", "máximo 5 min", "mínimo 97%". */
export function textoDaMeta(m: Meta): string {
  const valor = m.unidade === "%" ? `${m.meta}%` : `${m.meta} ${m.unidade}`;
  return `${m.sentido === "minimo" ? "mínimo" : "máximo"} ${valor}`;
}

/** Atingiu a meta? (mínimo: valor >= meta; máximo: valor <= meta). */
export function atingiuMeta(m: Meta, valor: number): boolean {
  return m.sentido === "minimo" ? valor >= m.meta : valor <= m.meta;
}

/** Dias corridos de uma quinzena (as datas vêm do banco como AAAA-MM-DD). */
export function diasDaQuinzena(q: { data_inicio: string; data_fim: string }): number {
  const umDia = 24 * 60 * 60 * 1000;
  return (
    Math.round(
      (Date.parse(`${q.data_fim}T00:00:00Z`) - Date.parse(`${q.data_inicio}T00:00:00Z`)) / umDia,
    ) + 1
  );
}

/** Horas exigidas na quinzena: meta semanal x semanas (dias corridos / 7). */
export function horasExigidas(
  q: { data_inicio: string; data_fim: string },
  metaSemanal: number,
): number {
  return (metaSemanal * diasDaQuinzena(q)) / 7;
}

/** Horas decimais como "42h51". */
export function horasEMinutos(horas: number): string {
  const totalMin = Math.round(horas * 60);
  return `${Math.floor(totalMin / 60)}h${String(totalMin % 60).padStart(2, "0")}`;
}

/* ---------------- Qualidade (especificação, card de qualidade) ---------------- */

/** Nota mínima de qualidade para elegibilidade (nível 4G). */
export const QUALIDADE_MINIMA = 91;

/**
 * Nível pela escala da especificação: 5G = 98 a 100; 4,5G = 95 a 97,99;
 * 4G = 91 a 94,99; 3G = 86 a 90,99; 2G = abaixo de 86.
 * (O exemplo da especificação, "95,3 — 5G", contradiz a escala: 95,3 é 4,5G.)
 */
export function nivelQualidade(nota: number): string {
  if (nota >= 98) return "5G";
  if (nota >= 95) return "4,5G";
  if (nota >= 91) return "4G";
  if (nota >= 86) return "3G";
  return "2G";
}

/* ---------------- Horas logadas ---------------- */

/** Média semanal: total da quinzena ÷ semanas (dias corridos ÷ 7). */
export function mediaSemanal(
  totalHoras: number,
  q: { data_inicio: string; data_fim: string },
): number {
  return totalHoras / (diasDaQuinzena(q) / 7);
}

/* ---------------- Formato dos valores ---------------- */

const decimal = (v: number, casas = 1) =>
  v.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: casas });

/**
 * Valor com a unidade do indicador. Os resultados ficam no banco já na
 * unidade da meta: tickets/h, minutos, % e horas (decimal).
 */
export function formatarValor(chave: ChaveIndicador | "qualidade", valor: number): string {
  switch (chave) {
    case "produtividade":
      return `${decimal(valor)} tickets/h`;
    case "sla_chat":
    case "sla_email":
      return minutosESegundos(valor);
    case "csat":
      return `${decimal(valor)}%`;
    case "horas_online":
      return horasEMinutos(valor);
    case "qualidade":
      return decimal(valor, 2);
  }
}

/** Minutos (com fração) em "8m 19s", como no painel de referência. */
export function minutosESegundos(minutos: number): string {
  const total = Math.round(Math.abs(minutos) * 60);
  const m = Math.floor(total / 60);
  const seg = total % 60;
  return `${m}m ${String(seg).padStart(2, "0")}s`;
}

/** Diferença já formatada, sem o sinal (o sinal vem à parte). */
function formatarDiferenca(chave: ChaveIndicador | "qualidade", d: number): string {
  switch (chave) {
    case "sla_chat":
    case "sla_email":
      return minutosESegundos(d);
    case "horas_online":
      return horasEMinutos(d);
    case "qualidade":
      return decimal(d, 1);
    default:
      return decimal(d);
  }
}

export type Variacao = { texto: string; bom: boolean | null };

/**
 * Variação em relação à quinzena anterior. A SETA mostra a direção (subiu ou
 * desceu); "bom" diz se isso foi positivo, conforme o sentido da meta: no SLA
 * (meta máxima), descer é bom; nos demais (meta mínima), subir é bom.
 */
export function variacao(
  chave: ChaveIndicador | "qualidade",
  atual: number | null,
  anterior: number | null,
  sentido: "minimo" | "maximo",
): Variacao | null {
  if (atual === null || anterior === null) return null;
  const d = atual - anterior;
  if (Math.abs(d) < 1e-9) return { texto: "= 0", bom: null };
  const subiu = d > 0;
  return {
    texto: `${subiu ? "▲ +" : "▼ −"}${formatarDiferenca(chave, Math.abs(d))}`,
    bom: sentido === "minimo" ? subiu : !subiu,
  };
}

/** Texto da pílula: "dentro da meta", ou "abaixo"/"acima" conforme o sentido. */
export function textoDaSituacao(naMeta: boolean | null, sentido: "minimo" | "maximo"): string {
  if (naMeta === null) return "aguardando o resultado";
  if (naMeta) return "dentro da meta";
  return sentido === "minimo" ? "abaixo da meta" : "acima da meta";
}
