/**
 * Os textos dos avisos de contestação no Slack (08/10/2026), do robô "Radar da Qualidade".
 * Puro, para ser testado à parte.
 *
 * Tudo o que vem dos dados é PROTEGIDO antes de ir para a mensagem: no Slack,
 * "<!channel>" chamaria o canal inteiro e "<http://...|texto>" viraria um link
 * disfarçado. O motivo escrito pelo colaborador nunca entra (não chega aqui).
 */
import { ROTULO_TIPO } from "@/lib/avaliacao";

export type DadosDoAviso = {
  status: string;
  colaborador: string;
  tipo: string | null;
  assunto: string | null;
  data_contato: string | null;
  avaliador: string | null;
  responder_ate: string | null;
  respondida_em: string | null;
  respondeu: string | null;
  nota_anterior: number | null;
  nota_nova: number | null;
};

/** Protege um texto vindo dos dados (os três caracteres que o Slack interpreta). */
export const protegerSlack = (s: string | null | undefined) =>
  (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const FUSO = "America/Fortaleza";
const data = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");
const dataHora = (iso: string) => {
  const d = new Date(iso);
  const dia = d.toLocaleDateString("pt-BR", { timeZone: FUSO });
  const hora = d.toLocaleTimeString("pt-BR", {
    timeZone: FUSO,
    hour: "2-digit",
    minute: "2-digit",
  });
  return { dia, hora };
};
const nota = (v: number) => (Math.round(v * 100) / 100).toString().replace(".", ",");

export function textoDaAbertura(d: DadosDoAviso, urlDoQualityHub: string): string {
  const quem = `*${protegerSlack(d.colaborador)}*`;
  const tipo = d.tipo ? (ROTULO_TIPO[d.tipo as keyof typeof ROTULO_TIPO] ?? d.tipo) : null;
  const oQue = tipo
    ? `a avaliação de *${protegerSlack(tipo)}* "${protegerSlack(d.assunto)}"${d.data_contato ? `, do contato de ${data(d.data_contato)}` : ""}${d.avaliador ? `, avaliada por *${protegerSlack(d.avaliador)}*` : ""}`
    : `"${protegerSlack(d.assunto)}"`;
  const prazo = d.responder_ate
    ? `Você tem *1 dia útil* para responder: até *${dataHora(d.responder_ate).dia}, ${dataHora(d.responder_ate).hora}*.`
    : "Responda assim que puder.";
  return [
    "*📝 UMA NOVA CONTESTAÇÃO FOI ABERTA*",
    `${quem} contestou ${oQue}.`,
    prazo,
    `<${urlDoQualityHub}/admin/contestacoes|Abrir no CX Hub>`,
  ].join("\n");
}

export const TEXTO_DO_LEMBRETE =
  "⏰ *Lembrete: o prazo para responder esta contestação vence hoje*, às 23:59. Ela ainda está sem resposta.";

export function textoDaResposta(d: DadosDoAviso): string {
  const aceita = d.status === "deferida";
  const quando = d.respondida_em ? dataHora(d.respondida_em) : null;
  const mudou =
    aceita && d.nota_anterior !== null && d.nota_nova !== null
      ? ` (nota ${nota(Number(d.nota_anterior))} → ${nota(Number(d.nota_nova))})`
      : "";
  return (
    `${aceita ? "✅" : "❌"} *${protegerSlack(d.respondeu ?? "Alguém")}* respondeu a contestação de *${protegerSlack(d.colaborador)}*` +
    (quando ? ` em ${quando.dia}, às ${quando.hora}` : "") +
    `: *${aceita ? "aceita" : "recusada"}*${mudou}.`
  );
}
