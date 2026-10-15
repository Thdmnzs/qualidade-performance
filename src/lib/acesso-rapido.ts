/**
 * O acesso rápido (14/10/2026): os links das ferramentas do time, na barra lateral. A lista mora no
 * banco (o ADM a edita na tela "Acesso rápido"), a partir dos favoritos curados (13/10/2026). Os
 * "restritos" só chegam ao ADM (o banco decide).
 */
export type Atalho = {
  id?: string;
  nome: string;
  url: string;
  sub?: string | null;
  restrito?: boolean;
};
export type GrupoDeAtalhos = { id?: string; nome: string; icone: string | null; links: Atalho[] };

const normal = (t: string) =>
  t
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

/** Os grupos que a pessoa vê (o restrito, só o ADM), sem os grupos que ficariam vazios. */
export function gruposVisiveis(
  perfil: string | null | undefined,
  grupos: GrupoDeAtalhos[],
): GrupoDeAtalhos[] {
  return grupos
    .map((g) => ({ ...g, links: g.links.filter((l) => !l.restrito || perfil === "adm") }))
    .filter((g) => g.links.length > 0);
}

/** A busca, sem acento, no nome do link, do grupo e do subgrupo. */
export function buscarAtalhos(
  grupos: GrupoDeAtalhos[],
  busca: string,
): (Atalho & { grupo: string })[] {
  const b = normal(busca.trim());
  if (!b) return [];
  return grupos.flatMap((g) =>
    g.links
      .filter((l) => normal(`${l.nome} ${g.nome} ${l.sub ?? ""}`).includes(b))
      .map((l) => ({ ...l, grupo: g.nome })),
  );
}

// ---------- Os "Meus atalhos": no navegador de cada pessoa (um por pessoa, no mesmo computador) ----------
const chave = (pessoa: string) => `cxhub-atalhos:${pessoa}`;
export function lerAtalhos(pessoa: string): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(chave(pessoa)) ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}
export function salvarAtalhos(pessoa: string, urls: string[]) {
  try {
    localStorage.setItem(chave(pessoa), JSON.stringify(urls));
  } catch {
    // Sem o armazenamento do navegador (uma janela anônima, por exemplo): os atalhos valem só agora.
  }
}
