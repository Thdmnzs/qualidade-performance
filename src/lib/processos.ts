/**
 * A tela de Processos (14/10/2026): as duas colunas (o B2C e o B2B) e as outras referências, na
 * ordem da Flukepédia, com a busca. Puro, para ser testado.
 */
export type ProcessoDaLista = {
  id: string;
  codigo: string | null;
  titulo: string;
  base: string;
  revisado: boolean;
  versao_atual: number;
  categoria: string | null;
  subcategoria: string | null;
  ordem: number | null;
  url: string | null;
};

/** As páginas das Flukepédias, para o botão "Abrir no Notion" de cada coluna. */
export const FLUKEPEDIAS = {
  B2C: "https://www.notion.so/368cc47b1d7c81dc992bea98666c9891",
  B2B: "https://www.notion.so/3eacc47b1d7c8187ad58faef80ba8f98",
} as const;

const normal = (t: string | null | undefined) =>
  (t ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

/** A busca: pelo nome, pelo código, pela categoria ou pela subcategoria (sem acento). */
export const casaComABusca = (p: ProcessoDaLista, busca: string) =>
  !busca.trim() ||
  normal(`${p.titulo} ${p.codigo ?? ""} ${p.categoria ?? ""} ${p.subcategoria ?? ""}`).includes(
    normal(busca.trim()),
  );

/** Os processos de uma base, na ordem da Flukepédia (os sem posição, no fim, pelo título). */
export function daBase(processos: ProcessoDaLista[], base: string): ProcessoDaLista[] {
  return processos
    .filter((p) => p.base === base)
    .sort(
      (a, b) =>
        (a.ordem ?? Infinity) - (b.ordem ?? Infinity) || a.titulo.localeCompare(b.titulo, "pt-BR"),
    );
}

/** Os grupos da coluna: a categoria e, dentro dela, a subcategoria, na ordem em que aparecem. */
export type Grupo = {
  categoria: string | null;
  subgrupos: { subcategoria: string | null; processos: ProcessoDaLista[] }[];
};
export function agrupar(processos: ProcessoDaLista[]): Grupo[] {
  const grupos: Grupo[] = [];
  for (const p of processos) {
    let g = grupos[grupos.length - 1];
    if (!g || g.categoria !== p.categoria)
      grupos.push((g = { categoria: p.categoria, subgrupos: [] }));
    let s = g.subgrupos[g.subgrupos.length - 1];
    if (!s || s.subcategoria !== p.subcategoria)
      g.subgrupos.push((s = { subcategoria: p.subcategoria, processos: [] }));
    s.processos.push(p);
  }
  return grupos;
}

/** O trecho da busca, para destacar: [antes, encontrado, depois], ou null. */
export function trechoDaBusca(texto: string, busca: string): [string, string, string] | null {
  const b = busca.trim();
  if (!b) return null;
  const i = normal(texto).indexOf(normal(b));
  return i < 0
    ? null
    : [texto.slice(0, i), texto.slice(i, i + b.length), texto.slice(i + b.length)];
}
