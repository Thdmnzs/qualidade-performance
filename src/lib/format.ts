export const brl = (value: number | null | undefined) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value ?? 0);

export const dataBR = (value: string | Date | null | undefined) => {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Fortaleza" }).format(d);
};

export const dataHoraBR = (value: string | Date | null | undefined) => {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Fortaleza",
    dateStyle: "short",
    timeStyle: "short",
  }).format(d);
};

export const numeroBR = (value: number | null | undefined, casas = 2) =>
  value == null
    ? "—"
    : new Intl.NumberFormat("pt-BR", {
        minimumFractionDigits: casas,
        maximumFractionDigits: casas,
      }).format(value);

export const MESES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

export const nomeQuinzena = (q: { ano: number; mes: number; tipo: string } | null | undefined) =>
  q ? `${q.tipo === "primeira" ? "1ª" : "2ª"} quinzena · ${MESES[q.mes - 1]}/${q.ano}` : "—";

export const rotuloIndicador: Record<string, string> = {
  qualidade: "Qualidade",
  produtividade: "Produtividade",
  csat: "CSAT",
  sla_chat: "SLA Chat",
  sla_email: "SLA E-mail",
  horas_online: "Horas online",
};

export const rotuloStatusQuinzena: Record<string, string> = {
  aberta: "Aberta",
  em_analise: "Em análise",
  em_contestacao: "Em contestação",
  pronta_para_fechamento: "Pronta para fechamento",
  fechada: "Fechada",
};

export const rotuloPerfil: Record<string, string> = {
  colaborador: "Colaborador",
  gestor: "Gestor",
  adm: "ADM",
};
