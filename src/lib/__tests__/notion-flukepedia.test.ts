import { describe, expect, it } from "vitest";

import {
  juntarComFlukepedia,
  nomeLimpo,
  processosDaFlukepedia,
  type Bloco,
  type ItemDaFila,
} from "../notion";

const txt = (texto: string, bold = false) => ({ plain_text: texto, annotations: { bold } });
const titulo = (texto: string): Bloco => ({
  id: `h-${texto}`,
  type: "heading_2",
  heading_2: { rich_text: [txt(texto)] },
});
const rotulo = (texto: string, resto = ""): Bloco => ({
  id: `r-${texto}`,
  type: "paragraph",
  paragraph: { rich_text: [txt(texto, true), ...(resto ? [txt(resto)] : [])] },
});
const pagina = (id: string, title: string): Bloco => ({
  id,
  type: "child_page",
  child_page: { title },
});
const coluna = (...filhos: Bloco[]): Bloco => ({
  id: `c-${filhos.length}-${Math.random()}`,
  type: "column",
  has_children: true,
  filhos,
});
const colunas = (...cols: Bloco[]): Bloco => ({
  id: `cl-${Math.random()}`,
  type: "column_list",
  has_children: true,
  filhos: cols,
});
const vazio: Bloco = { id: "v", type: "paragraph", paragraph: { rich_text: [] } };

// Uma Flukepédia de exemplo, no formato da de verdade
const FLUKEPEDIA: Bloco[] = [
  pagina("aaaa-0000", "Índice Mestre de Processos"), // antes da primeira seção: fica de fora
  titulo("📱 Aplicativo e Chip"),
  colunas(
    coluna(rotulo("Aplicativo"), pagina("aaaa-0001", "Aplicativo travou"), vazio),
    coluna(rotulo("Chip ", "[🚧 EM REVISÃO]"), pagina("aaaa-0002", "PIN e PUK")),
  ),
  titulo("🚚 Aquisição e Logística"),
  colunas(
    coluna(rotulo("Aquisição ", "[🚧 EM REVISÃO]"), pagina("aaaa-0003", "Como pedir meu chip?")),
    coluna(vazio, pagina("aaaa-0004", "Qual o preço?")), // sem o rótulo: continua a Aquisição
  ),
  titulo("🎬 Streaming [🚧 EM REVISÃO]"),
  colunas(coluna(pagina("aaaa-0005", "Como cancelar?"))),
  {
    id: "m",
    type: "paragraph",
    paragraph: {
      rich_text: [
        {
          type: "mention",
          plain_text: "Parcerias",
          mention: { type: "page", page: { id: "aaaa-0006" } },
        },
      ],
    },
  },
  { id: "l", type: "link_to_page", link_to_page: { page_id: "aaaa-0007" } },
];

describe("a página da Flukepédia", () => {
  it("o nome limpo: sem o emoji e sem o EM REVISÃO", () => {
    expect(nomeLimpo("📱 Aplicativo e Chip")).toBe("Aplicativo e Chip");
    expect(nomeLimpo("🎬 Streaming [🚧 EM REVISÃO]")).toBe("Streaming");
    expect(nomeLimpo("Chip [🚧 EM REVISÃO]")).toBe("Chip");
  });
  it("cada seção é a categoria; o negrito, a subcategoria; cada subpágina, um processo", () => {
    const r = processosDaFlukepedia(FLUKEPEDIA, "B2C");
    expect(r.map((i) => [i.titulo, i.categoria, i.subcategoria])).toEqual([
      ["Aplicativo travou", "Aplicativo e Chip", "Aplicativo"],
      ["PIN e PUK", "Aplicativo e Chip", "Chip"],
      ["Como pedir meu chip?", "Aquisição e Logística", "Aquisição"],
      ["Qual o preço?", "Aquisição e Logística", "Aquisição"],
      ["Como cancelar?", "Streaming", null],
      ["Parcerias", "Streaming", null],
      ["(sem título)", "Streaming", null], // o "link para página" (o título vem da página, na sincronização)
    ]);
  });
  it("o link do Índice Mestre, antes da primeira seção, fica de fora; e todos entram como não revisados", () => {
    const r = processosDaFlukepedia(FLUKEPEDIA, "B2C");
    expect(r.some((i) => i.titulo === "Índice Mestre de Processos")).toBe(false);
    expect(r.every((i) => !i.revisado && i.codigo === null && i.base === "B2C")).toBe(true);
    expect(r[0]!.pageId).toBe("aaaa0001");
  });
});

describe("a junção com o Índice Mestre", () => {
  const doIndice: ItemDaFila[] = [
    {
      pageId: "aaaa0001",
      base: "B2C",
      codigo: "B2C-APP-APL-01",
      titulo: "Aplicativo travou",
      categoria: "Aplicativo e Chip",
      subcategoria: "Aplicativo",
      revisado: true,
      ultimaRevisao: "2026-09-29",
      url: "u",
    },
    {
      pageId: "bbbb0009",
      base: "B2C",
      codigo: "B2C-X",
      titulo: "Só no Índice",
      categoria: null,
      subcategoria: null,
      revisado: true,
      ultimaRevisao: null,
      url: "u",
    },
  ];
  it("o Índice tem a prioridade; os da Flukepédia entram como não revisados; sem repetidos", () => {
    const r = juntarComFlukepedia(doIndice, processosDaFlukepedia(FLUKEPEDIA, "B2C"));
    expect(r).toHaveLength(2 + 6); // os 2 do Índice e os 6 que só estão na Flukepédia
    expect(r.find((i) => i.pageId === "aaaa0001")!.codigo).toBe("B2C-APP-APL-01"); // o do Índice
    expect(r.find((i) => i.pageId === "aaaa0002")!.revisado).toBe(false); // só na Flukepédia
    expect(r.filter((i) => i.pageId === "aaaa0001")).toHaveLength(1);
  });
});

describe("um título menor dentro de uma coluna (como na Flukepédia do B2B)", () => {
  it("não vira categoria, e o que está dentro dele não é lido", () => {
    const blocos: Bloco[] = [
      titulo("⁉️ FAQ e apoio"),
      colunas(
        coluna(
          rotulo("FAQ ", "[🚧 EM REVISÃO]"),
          pagina("cccc-0001", "FAQ B2B"),
          {
            id: "t3",
            type: "heading_3",
            heading_3: { rich_text: [txt("CONTA TESTE")] },
            has_children: true,
            filhos: [pagina("cccc-0002", "Uma página dentro do recolhível")],
          },
          pagina("cccc-0003", "Depois do recolhível"),
        ),
      ),
    ];
    const r = processosDaFlukepedia(blocos, "B2B");
    expect(r.map((i) => [i.titulo, i.categoria, i.subcategoria])).toEqual([
      ["FAQ B2B", "FAQ e apoio", "FAQ"],
      ["Depois do recolhível", "FAQ e apoio", "FAQ"],
    ]);
  });
});
