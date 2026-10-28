/**
 * Treinar a IA (20/10/2026): as regras das telas. A IA não é retreinada; o que adapta as sugestões ao
 * estilo do time é o que vai junto de cada pré-avaliação (as orientações e os exemplos). Puro, para testes.
 */
export type Orientacao = {
  id: string;
  ordem: number;
  grupo: string;
  descricao: string;
  permite_medio: boolean;
  sim: string | null;
  medio: string | null;
  nao: string | null;
  exemplo: string | null;
  autor: string | null;
  em: string | null;
  versoes: number;
};
export type CriterioDaConcordancia = {
  id: string;
  ordem: number;
  grupo: string;
  descricao: string;
  tem_orientacao: boolean;
  total: number;
  acordos: number;
  mudanca: string | null;
  motivos: Record<string, number> | null;
};
export type Concordancia = {
  avaliacoes: number;
  pre_avaliadas: number;
  criterios: CriterioDaConcordancia[];
};
export type AvaliacaoParaExemplo = {
  id: string;
  data: string;
  pessoa: string;
  nota: number | null;
  exemplar: boolean;
  processo: string | null;
  assunto: string | null;
  comentario: string;
};

/** O "por quê?" de uma sugestão mudada (opcional, na ficha). */
export const MOTIVOS = {
  nao_viu: "A IA não viu algo na conversa",
  orientacao_nao_cobre: "A orientação não cobre este caso",
  criterio_do_avaliador: "Critério do avaliador",
  outro: "Outro",
} as const;
export type Motivo = keyof typeof MOTIVOS;

const NOME_DA_RESPOSTA: Record<string, string> = { sim: "Sim", medio: "Médio", nao: "Não" };
/** "sim>medio" → "Sim → Médio". */
export const mudancaLegivel = (m: string | null) => {
  if (!m) return "—";
  const [de, para] = m.split(">");
  return `${NOME_DA_RESPOSTA[de ?? ""] ?? de} → ${NOME_DA_RESPOSTA[para ?? ""] ?? para}`;
};
export const percentual = (c: { total: number; acordos: number }) =>
  c.total ? Math.round((c.acordos / c.total) * 100) : null;
/** A cor do acordo: verde (85% ou mais), amarelo (70% ou mais), vermelho (abaixo). */
export const corDoAcordo = (p: number | null) =>
  p == null ? "#9FB09F" : p >= 85 ? "#13A403" : p >= 70 ? "#D69E2E" : "#C62828";
/** O limite abaixo do qual o critério ganha o "Ajustar a orientação". */
export const PRECISA_DE_ATENCAO = 80;
/** Os critérios, do menor para o maior acordo (os sem dados no fim). */
export const doMenorAcordo = (cs: CriterioDaConcordancia[]) =>
  [...cs].sort((a, b) => (percentual(a) ?? 101) - (percentual(b) ?? 101) || a.ordem - b.ordem);
/** O acordo geral: a soma dos acordos ÷ a soma das sugestões (cada sugestão pesa igual). */
export const acordoGeral = (cs: CriterioDaConcordancia[]) => {
  const total = cs.reduce((a, c) => a + c.total, 0);
  return total ? Math.round((cs.reduce((a, c) => a + c.acordos, 0) / total) * 100) : null;
};

/** O texto que a IA recebe (o mesmo que o banco monta). */
export function textoParaAIA(
  o: { sim: string; medio: string; nao: string; exemplo: string },
  permiteMedio: boolean,
): string {
  const partes = [
    o.sim.trim() && `Conta como SIM: ${o.sim.trim()}`,
    permiteMedio && o.medio.trim() && `Conta como MÉDIO: ${o.medio.trim()}`,
    o.nao.trim() && `Conta como NÃO: ${o.nao.trim()}`,
    o.exemplo.trim() && `Exemplo: ${o.exemplo.trim()}`,
  ].filter(Boolean);
  return partes.join(" ");
}
