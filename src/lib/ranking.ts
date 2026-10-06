/**
 * Ranking e pódio: regras de exibição. A classificação é calculada no banco.
 */
export type NoPodio = { posicao: number; employee_id: string; nome: string; destaques: number[] };

/**
 * Os três degraus do pódio, na ordem do desenho: 2º à esquerda, 1º no centro,
 * 3º à direita. Com empate, mais de uma pessoa divide o mesmo degrau.
 */
export function degrausDoPodio(lista: NoPodio[]): { posicao: 1 | 2 | 3; pessoas: NoPodio[] }[] {
  const em = (p: number) =>
    lista.filter((x) => x.posicao === p).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  return ([2, 1, 3] as const).map((posicao) => ({ posicao, pessoas: em(posicao) }));
}

/** Nome no pódio: em minúsculas, como a especificação pede. */
export const nomeNoPodio = (nome: string) => nome.trim().toLocaleLowerCase("pt-BR");

/** Nome do arquivo da imagem baixada (sem acentos nem espaços). */
export function arquivoDoPodio(tituloDaQuinzena: string): string {
  const base = tituloDaQuinzena
    // NFKD (e não NFD): converte também o "ª" de "1ª" em "a".
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `podio-${base}.png`;
}
