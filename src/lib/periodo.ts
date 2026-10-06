/**
 * Filtro de período da aba Indicadores: 5 dias, 7 dias ou personalizado.
 * "5 dias" e "7 dias" são os últimos dias COM DADOS (o banco escolhe). O
 * personalizado é validado aqui e de novo no banco (até 92 dias).
 */
export type Filtro = "5" | "7" | "personalizado";
export const LIMITE_DE_DIAS = 92;

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const diasEntre = (de: string, ate: string) =>
  Math.round((Date.parse(`${ate}T12:00:00`) - Date.parse(`${de}T12:00:00`)) / 86_400_000) + 1;

/** O personalizado começa nos 7 dias corridos até ontem. */
export function periodoPadrao(hoje: Date): { de: string; ate: string } {
  const ontem = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - 1);
  const de = new Date(ontem.getFullYear(), ontem.getMonth(), ontem.getDate() - 6);
  return { de: iso(de), ate: iso(ontem) };
}

/** A mensagem do problema, ou null quando o período é válido. */
export function validarPeriodo(de: string, ate: string): string | null {
  if (!de || !ate) return "Escolha as duas datas.";
  if (de > ate) return "A data inicial é depois da final.";
  if (diasEntre(de, ate) > LIMITE_DE_DIAS)
    return `Escolha um período de até ${LIMITE_DE_DIAS} dias.`;
  return null;
}

/** "01/10 a 05/10 · 3 dias" (ou "05/10 · 1 dia"). */
export function textoDoPeriodo(de: string, ate: string, diasComDados: number): string {
  const curta = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
  const faixa = de === ate ? curta(de) : `${curta(de)} a ${curta(ate)}`;
  return `${faixa} · ${diasComDados} ${diasComDados === 1 ? "dia" : "dias"}`;
}
