/**
 * Conversão de páginas do Notion em texto (markdown simples), para a base de
 * processos. Funções puras: o servidor busca os blocos, aqui só se converte.
 * Formato dos blocos: API do Notion (versão 2022-06-28).
 */

/** Identificador do Notion sem hífens (o formato guardado no banco). */
export const idSemHifens = (id: string) => id.replace(/-/g, "").toLowerCase();

/** Extrai o identificador de 32 caracteres de um link do Notion. */
export function idDaUrlDoNotion(url: string | null | undefined): string | null {
  if (!url) return null;
  const limpo = url.split(/[?#]/)[0]!.replace(/-/g, "");
  const m = limpo.match(/([0-9a-f]{32})$/i);
  return m ? m[1]!.toLowerCase() : null;
}

type TextoRico = { plain_text?: string | null }[];
export type Bloco = {
  id: string;
  type: string;
  has_children?: boolean;
  /** Filhos já buscados pelo servidor (blocos recolhíveis, listas, callouts...). */
  filhos?: Bloco[];
  [tipo: string]: unknown;
};

export const textoRico = (rt: unknown): string =>
  Array.isArray(rt) ? (rt as TextoRico).map((t) => t.plain_text ?? "").join("") : "";

const conteudo = (b: Bloco) => (b[b.type] ?? {}) as Record<string, unknown>;

/** Blocos em texto. Imagens viram uma nota; páginas filhas, só o título (elas são sincronizadas à parte). */
export function blocosParaTexto(blocos: Bloco[], nivel = 0): string {
  const recuo = "  ".repeat(nivel);
  const linhas: string[] = [];
  let numero = 0;
  for (const b of blocos) {
    const c = conteudo(b);
    const t = textoRico(c["rich_text"]);
    const filhos = b.filhos?.length ? blocosParaTexto(b.filhos, nivel + 1) : "";
    if (b.type !== "numbered_list_item") numero = 0;
    switch (b.type) {
      case "heading_1":
      case "heading_2":
      case "heading_3": {
        const n = Number(b.type.slice(-1)) + 1; // títulos de página viram ##, ###...
        linhas.push(`\n${"#".repeat(n)} ${t}`);
        if (filhos) linhas.push(filhos); // títulos recolhíveis
        break;
      }
      case "paragraph":
        if (t) linhas.push(`${recuo}${t}`);
        if (filhos) linhas.push(filhos);
        break;
      case "bulleted_list_item":
        linhas.push(`${recuo}- ${t}`);
        if (filhos) linhas.push(filhos);
        break;
      case "numbered_list_item":
        numero += 1;
        linhas.push(`${recuo}${numero}. ${t}`);
        if (filhos) linhas.push(filhos);
        break;
      case "to_do":
        linhas.push(`${recuo}- [${c["checked"] ? "x" : " "}] ${t}`);
        if (filhos) linhas.push(filhos);
        break;
      case "toggle":
        linhas.push(`${recuo}▸ ${t}`);
        if (filhos) linhas.push(filhos);
        break;
      case "quote":
      case "callout": {
        const icone = (c["icon"] as { emoji?: string } | undefined)?.emoji;
        linhas.push(`${recuo}> ${icone ? `${icone} ` : ""}${t}`);
        if (filhos) linhas.push(filhos.replace(/^/gm, `${recuo}> `));
        break;
      }
      case "code":
        linhas.push(`${recuo}\`\`\`\n${t}\n${recuo}\`\`\``);
        break;
      case "divider":
        linhas.push(`${recuo}---`);
        break;
      case "image": {
        const legenda = textoRico(c["caption"]);
        linhas.push(`${recuo}[imagem${legenda ? `: ${legenda}` : ""}]`);
        break;
      }
      case "child_page":
        linhas.push(`${recuo}[página: ${String(c["title"] ?? "")}]`);
        break;
      case "table":
        if (b.filhos?.length) {
          for (const linha of b.filhos) {
            const celulas = ((conteudo(linha)["cells"] as unknown[]) ?? []).map((cel) =>
              textoRico(cel),
            );
            linhas.push(`${recuo}| ${celulas.join(" | ")} |`);
          }
        }
        break;
      case "column_list":
      case "column":
      case "synced_block":
        if (filhos)
          linhas.push(
            b.type === "column" || b.type === "synced_block"
              ? blocosParaTexto(b.filhos!, nivel)
              : filhos,
          );
        break;
      default:
        // Tipos sem texto útil (bookmark, embed, vídeo, base de dados...) ficam de fora.
        if (t) linhas.push(`${recuo}${t}`);
        if (filhos) linhas.push(filhos);
    }
  }
  // Só as quebras de linha das pontas: o recuo da primeira linha precisa ficar
  // (é ele que mostra que um texto pertence a uma macro ou a um aviso).
  return linhas
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^\n+|\n+$/g, "");
}

/** Uma linha do Índice Mestre (base de dados do Notion). */
type Propriedade = {
  type?: string;
  title?: TextoRico;
  rich_text?: TextoRico;
  select?: { name?: string } | null;
  date?: { start?: string } | null;
  url?: string | null;
};
export type LinhaDoIndice = { id: string; url?: string; properties: Record<string, Propriedade> };

export type ItemDaFila = {
  pageId: string;
  base: "B2C" | "B2B" | "Guia";
  codigo: string | null;
  titulo: string;
  categoria: string | null;
  subcategoria: string | null;
  revisado: boolean;
  ultimaRevisao: string | null;
  url: string;
  /** A posição na Flukepédia (14/10/2026): a tela mostra cada base nessa ordem. */
  ordem?: number;
};

const valor = (p: Propriedade | undefined): string => {
  if (!p) return "";
  if (p.type === "title") return textoRico(p.title).trim();
  if (p.type === "rich_text") return textoRico(p.rich_text).trim();
  if (p.type === "select") return p.select?.name?.trim() ?? "";
  if (p.type === "date") return p.date?.start ?? "";
  if (p.type === "url") return p.url ?? "";
  return "";
};

/**
 * Linha do Índice em item da fila. "Status Notion = ✅ Concluído" significa
 * processo REVISADO. Sem link para a página, a linha é ignorada (null).
 */
export function itemDoIndice(linha: LinhaDoIndice, base: "B2C" | "B2B"): ItemDaFila | null {
  const p = linha.properties;
  const link = valor(p["Link do processo"]);
  const pageId = idDaUrlDoNotion(link);
  if (!pageId) return null;
  return {
    pageId,
    base,
    codigo: valor(p["Código"]) || null,
    titulo: valor(p["Nome"]) || "(sem título)",
    categoria: valor(p["Categoria"]) || null,
    subcategoria: valor(p["Subcategoria"]) || null,
    revisado: valor(p["Status Notion"]).includes("Concluído"),
    ultimaRevisao: valor(p["Última revisão"]).slice(0, 10) || null,
    url: `https://www.notion.so/${pageId}`,
  };
}

/** Texto final guardado: cabeçalho com código e revisão, e o conteúdo da página. */
export function montarProcesso(item: ItemDaFila, corpo: string): string {
  const cab = [`# ${item.titulo}${item.codigo ? ` (${item.codigo})` : ""}`];
  if (item.ultimaRevisao)
    cab.push(`última revisão: ${item.ultimaRevisao.split("-").reverse().join("/")}`);
  if (!item.revisado && item.base !== "Guia") cab.push("status: ainda não revisado pela Qualidade");
  return `${cab.join("\n")}\n\n${corpo}`.trim();
}

/** Endereços oficiais do Notion. */
const HOSTS_DO_NOTION = new Set(["notion.so", "www.notion.so", "app.notion.com"]);

/**
 * Só aceita links que apontam DE FATO para o Notion (https, sem usuário antes
 * do @). Qualquer outro endereço volta null, e a tela não mostra o botão.
 */
export function linkSeguroDoNotion(url: string | null | undefined): string | null {
  if (!url) return null;
  let u: URL;
  try {
    u = new URL(url.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "https:" || u.username || u.password) return null;
  return HOSTS_DO_NOTION.has(u.hostname.toLowerCase()) ? u.toString() : null;
}

// ---------- A página da Flukepédia (14/10/2026) ----------
// O Índice Mestre lista só os processos já revisados (no B2C, 32 de cerca de 120). A página da
// Flukepédia lista TODOS: cada seção é a categoria; o texto em negrito no topo de uma coluna, a
// subcategoria; e cada subpágina, um processo.

type TextoComEstilo = {
  plain_text?: string | null;
  annotations?: { bold?: boolean };
  type?: string;
  mention?: { type?: string; page?: { id?: string } };
}[];

/** "📱 Aplicativo e Chip [🚧 EM REVISÃO]" → "Aplicativo e Chip". */
export const nomeLimpo = (texto: string) =>
  texto
    .replace(/\[[^\]]*EM REVIS[ÃA]O[^\]]*\]/giu, "")
    .replace(/^[^\p{L}\p{N}]+/u, "")
    .replace(/\s+/g, " ")
    .trim();

// Só os títulos de SEÇÃO (os dois níveis maiores) são categorias: um título menor dentro de uma coluna
// (como um bloco recolhível de anotações) não muda a categoria, e o que está dentro dele não é lido.
const ehTitulo = (tipo: string) => tipo === "heading_1" || tipo === "heading_2";

/** A subcategoria: um parágrafo que começa em negrito (o rótulo da coluna). */
function rotuloEmNegrito(b: Bloco): string | null {
  if (b.type !== "paragraph") return null;
  const rt = (
    (b["paragraph"] as { rich_text?: TextoComEstilo } | undefined)?.rich_text ?? []
  ).filter((t) => (t.plain_text ?? "").trim());
  if (!rt.length || !rt[0]!.annotations?.bold || rt.some((t) => t.type === "mention")) return null;
  const nome = nomeLimpo(textoRico(rt));
  return nome || null;
}

/** As páginas de um bloco: a subpágina, o "link para página", e a menção dentro de um parágrafo. */
function paginasDoBloco(b: Bloco): { id: string; titulo: string | null }[] {
  if (b.type === "child_page")
    return [
      { id: b.id, titulo: (b["child_page"] as { title?: string } | undefined)?.title ?? null },
    ];
  if (b.type === "link_to_page") {
    const id = (b["link_to_page"] as { page_id?: string } | undefined)?.page_id;
    return id ? [{ id, titulo: null }] : [];
  }
  if (b.type === "paragraph") {
    const rt = (b["paragraph"] as { rich_text?: TextoComEstilo } | undefined)?.rich_text ?? [];
    return rt
      .filter((t) => t.type === "mention" && t.mention?.type === "page" && t.mention.page?.id)
      .map((t) => ({ id: t.mention!.page!.id!, titulo: (t.plain_text ?? "").trim() || null }));
  }
  return [];
}

/**
 * Os processos da página da Flukepédia, na ordem da página. Só conta o que vem DEPOIS da primeira
 * seção (o link para o Índice Mestre, no topo, fica de fora). Uma coluna sem o rótulo em negrito
 * continua a subcategoria da anterior; uma seção sem rótulos (o Streaming) fica sem subcategoria.
 */
export function processosDaFlukepedia(blocos: Bloco[], base: "B2C" | "B2B"): ItemDaFila[] {
  const itens: ItemDaFila[] = [];
  let categoria: string | null = null;
  let subcategoria: string | null = null;
  const percorrer = (lista: Bloco[]) => {
    for (const b of lista) {
      if (ehTitulo(b.type)) {
        categoria =
          nomeLimpo(textoRico((b[b.type] as { rich_text?: unknown } | undefined)?.rich_text)) ||
          null;
        subcategoria = null;
        continue;
      }
      if (b.type === "column_list" || b.type === "column") {
        percorrer(b.filhos ?? []);
        continue;
      }
      if (!categoria) continue; // antes da primeira seção (o link do Índice Mestre)
      const rotulo = rotuloEmNegrito(b);
      if (rotulo) {
        subcategoria = rotulo;
        continue;
      }
      for (const p of paginasDoBloco(b)) {
        const pageId = idSemHifens(p.id);
        itens.push({
          pageId,
          base,
          codigo: null,
          titulo: p.titulo || "(sem título)",
          categoria,
          subcategoria,
          revisado: false,
          ultimaRevisao: null,
          url: `https://www.notion.so/${pageId}`,
        });
      }
    }
  };
  percorrer(blocos);
  return itens;
}

/**
 * Junta o Índice Mestre e a Flukepédia: o Índice tem a prioridade (o código, o "revisado" e a data);
 * os que só estão na Flukepédia entram como "ainda não revisado". Sem repetidos.
 */
export function juntarComFlukepedia(doIndice: ItemDaFila[], daPagina: ItemDaFila[]): ItemDaFila[] {
  const noIndice = new Map(doIndice.map((i) => [i.pageId, i]));
  const vistos = new Set<string>();
  const fila: ItemDaFila[] = [];
  for (const i of [...doIndice, ...daPagina]) {
    if (vistos.has(i.pageId)) continue;
    vistos.add(i.pageId);
    const doIdx = noIndice.get(i.pageId);
    // Do Índice, mas sem a categoria? Usa a da página.
    fila.push(
      doIdx
        ? {
            ...doIdx,
            categoria: doIdx.categoria ?? i.categoria,
            subcategoria: doIdx.subcategoria ?? i.subcategoria,
          }
        : i,
    );
  }
  // A posição: a ordem da página da Flukepédia (os do Índice que não estão na página vão para o fim).
  const naPagina = new Map(daPagina.map((i, n) => [i.pageId, n]));
  return fila
    .map((i, n) => ({ i, pos: naPagina.get(i.pageId) ?? daPagina.length + n }))
    .sort((a, b) => a.pos - b.pos)
    .map(({ i }, n) => ({ ...i, ordem: n + 1 }));
}
