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
