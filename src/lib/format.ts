export const brl = (value: number | null | undefined) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value ?? 0);

/** "AAAA-MM-DD": data de calendário, sem horário (coluna `date` do Postgres). */
const DATA_DE_CALENDARIO = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Formata como DD/MM/AAAA.
 *
 * Datas de calendário ("2026-09-01") são formatadas SEM conversão de fuso:
 * `new Date("2026-09-01")` seria meia-noite em UTC, que em Fortaleza (UTC-3)
 * ainda é 31/08 — o bug que mostrava as quinzenas um dia antes.
 * Momentos (timestamps com horário) continuam convertidos para America/Fortaleza.
 */
export const dataBR = (value: string | Date | null | undefined) => {
  if (!value) return "—";
  if (typeof value === "string") {
    const calendario = DATA_DE_CALENDARIO.exec(value);
    if (calendario) {
      const [, ano, mes, dia] = calendario;
      return `${dia}/${mes}/${ano}`;
    }
  }
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
  avaliador: "Avaliador",
  adm: "ADM",
};

/** Padrão de login aceito pelo banco (constraint employees_login_formato). */
export const LOGIN_VALIDO = /^[a-z0-9._-]{3,50}$/;

/** Sugere um login válido a partir do que foi digitado: "Thiago Dantas" -> "thiago.dantas". */
export const normalizarLogin = (valor: string) =>
  valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove acentos: "joão" -> "joao"
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ".")
    .replace(/[^a-z0-9._-]/g, "");

export const normalizarEmail = (valor: string) => valor.trim().toLowerCase();

export const rotuloStatusContestacao: Record<string, string> = {
  aberta: "Aberta",
  em_analise: "Em análise",
  respondida: "Respondida",
  deferida: "Deferida",
  indeferida: "Indeferida",
};

/** Confirmação por nome: mesma regra do banco (ignora maiúsculas e espaços nas pontas). */
export const confirmacaoConfere = (digitado: string, nome: string) =>
  digitado.trim().toLowerCase() === nome.trim().toLowerCase();

/**
 * "Hoje" no fuso de Fortaleza, como AAAA-MM-DD (formato do campo de data).
 * É o mesmo "hoje" que o banco usa para recusar data de contato futura,
 * então tela e banco não discordam perto da meia-noite.
 */
export const hojeEmFortaleza = (agora: Date = new Date()) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Fortaleza",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(agora);
