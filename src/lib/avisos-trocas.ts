/**
 * Os textos da Central de Turnos (13/10/2026), no formato combinado com a supervisão:
 * os rótulos em negrito (no Slack, um asterisco de cada lado) e um por linha.
 * Puro, para ser testado; quem posta é o servidor.
 */
import { dataCurta, DIAS_POR_EXTENSO } from "@/lib/escala";

export type DadosDoAvisoDeTroca = {
  tipo: "horarios" | "folgas" | "feriado";
  modo: "um" | "dois" | null;
  situacao: string;
  aplicada: boolean;
  de: string;
  para: string;
  datas: string[];
  folgas_de: string[];
  folgas_para: string[];
  horario_de: string | null;
  horario_para: string | null;
  decidida_por: string | null;
};

const primeiro = (nome: string) => nome.split(" ")[0] ?? nome;
const diaDaSemana = (iso: string) =>
  DIAS_POR_EXTENSO[(new Date(`${iso}T12:00:00Z`).getUTCDay() + 6) % 7]!;
const dataLonga = (iso: string) => `${diaDaSemana(iso)}, ${dataCurta(iso)}`;
/** "a, b e c" */
const lista = (xs: string[]) =>
  xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} e ${xs[xs.length - 1]}`;
/** "na quinta", "no sábado" */
const noDia = (iso: string) =>
  `${["sábado", "domingo"].includes(diaDaSemana(iso)) ? "no" : "na"} ${diaDaSemana(iso)}`;

export function aTroca(d: DadosDoAvisoDeTroca): string {
  if (d.tipo === "horarios") return `Os horários: ${dataLonga(d.datas[0]!)}`;
  if (d.tipo === "feriado") return `Sair da escala no feriado: ${dataLonga(d.datas[0]!)}`;
  const datas = d.datas.map(dataLonga);
  return d.modo === "dois"
    ? `As folgas (os dois dias): ${lista(datas)}`
    : `As folgas: ${datas.join(", e ")}`;
}

export function comoFica(d: DadosDoAvisoDeTroca): string {
  const a = primeiro(d.de);
  const b = primeiro(d.para);
  if (d.tipo === "feriado") return `${b} entra no lugar de ${a}`;
  if (d.tipo === "horarios")
    return d.horario_de && d.horario_para
      ? `${a} fica das ${d.horario_para}; ${b}, das ${d.horario_de}`
      : `${a} fica com o horário de ${b}, e ${b} com o de ${a}`;
  // Nas folgas, cada uma passa a folgar nos dias em que a outra folgava.
  return `${a} folga ${lista(d.folgas_para.map(noDia))}; ${b}, ${lista(d.folgas_de.map(noDia))}`;
}

export function textoDoAviso(d: DadosDoAvisoDeTroca, url: string): string {
  return [
    "🔁 *TROCA DE ESCALA PARA APROVAR*",
    `*Quem pediu*: ${d.de}`,
    `*Com quem*: ${d.para}`,
    `*A troca*: ${aTroca(d)}`,
    `*Como fica*: ${comoFica(d)}`,
    `<${url}/escala|Aprovar ou recusar no CX Hub>`,
  ].join("\n");
}

/** O fim, na conversa do aviso: o motivo de uma recusa NÃO vai (a supervisão fala com as duas no CX Hub). */
export function textoDoFim(d: DadosDoAvisoDeTroca): string | null {
  const quem = d.decidida_por ?? "a supervisão";
  if (d.situacao === "aprovada")
    return d.aplicada
      ? `🟢 *Aprovada* por ${quem}. A escala já mudou.`
      : `🟢 *Aprovada* por ${quem}. A troca entra na escala quando a semana for montada.`;
  if (d.situacao === "recusada") return `🔴 *Recusada* por ${quem}.`;
  if (d.situacao === "cancelada")
    return `↩️ *${primeiro(d.de)} cancelou o pedido*, antes da decisão da supervisão.`;
  return null;
}
