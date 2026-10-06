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
