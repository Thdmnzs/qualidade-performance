import { describe, expect, it } from "vitest";
import {
  blocosParaTexto,
  idDaUrlDoNotion,
  idSemHifens,
  itemDoIndice,
  montarProcesso,
  type Bloco,
  type LinhaDoIndice,
} from "../notion";

const rt = (t: string) => [{ plain_text: t }];
const b = (id: string, type: string, dados: Record<string, unknown>, filhos?: Bloco[]): Bloco => ({
  id,
  type,
  has_children: !!filhos?.length,
  [type]: dados,
  ...(filhos ? { filhos } : {}),
});

describe("identificadores do Notion", () => {
  it("padroniza sem hífens", () => {
    expect(idSemHifens("368cc47b-1d7c-817e-9319-c75f5baaacf6")).toBe(
      "368cc47b1d7c817e9319c75f5baaacf6",
    );
  });
  it("extrai de links nos formatos do Notion", () => {
    expect(
      idDaUrlDoNotion("https://app.notion.com/p/368cc47b1d7c812a8344f343fe872a20?pvs=204"),
    ).toBe("368cc47b1d7c812a8344f343fe872a20");
    expect(
      idDaUrlDoNotion(
        "https://www.notion.so/fluke/Internet-lenta-368cc47b1d7c812a8344f343fe872a20",
      ),
    ).toBe("368cc47b1d7c812a8344f343fe872a20");
    expect(idDaUrlDoNotion("https://example.com/sem-id")).toBeNull();
    expect(idDaUrlDoNotion(null)).toBeNull();
  });
});

describe("blocosParaTexto", () => {
  it("converte a estrutura típica de um processo da Flukepédia", () => {
    const blocos: Bloco[] = [
      b("1", "heading_2", { rich_text: rt("1️⃣ Verificar data da Subscription") }),
      b("2", "paragraph", { rich_text: rt("Verifique na Wave a data de criação.") }),
      b("3", "bulleted_list_item", { rich_text: rt("✅ Data a partir de 2025 → etapa 2") }),
      b("4", "bulleted_list_item", { rich_text: rt("⚠️ Data de 2024 → etapa 7") }),
      b("5", "toggle", { rich_text: rt("Aplicar macro 🟢 [internet] reiniciar linha") }, [
        b("5a", "paragraph", { rich_text: rt("fiz uma atualização no seu chip por aqui") }),
      ]),
      b("6", "callout", { rich_text: rt("Se liga!"), icon: { emoji: "😉" } }, [
        b("6a", "paragraph", { rich_text: rt("Peça os prints antes do ticket.") }),
      ]),
      b("7", "image", { caption: rt("tela da Wave") }),
      b("8", "numbered_list_item", { rich_text: rt("primeiro") }),
      b("9", "numbered_list_item", { rich_text: rt("segundo") }),
      b("10", "table", {}, [
        b("r1", "table_row", { cells: [rt("Categoria"), rt("Código")] }),
        b("r2", "table_row", { cells: [rt("Conectividade"), rt("CNT")] }),
      ]),
      b("11", "child_page", { title: "Exemplo de atendimento" }),
      b("12", "bookmark", { url: "https://x" }),
    ];
    expect(blocosParaTexto(blocos)).toBe(
      [
        "### 1️⃣ Verificar data da Subscription",
        "Verifique na Wave a data de criação.",
        "- ✅ Data a partir de 2025 → etapa 2",
        "- ⚠️ Data de 2024 → etapa 7",
        "▸ Aplicar macro 🟢 [internet] reiniciar linha",
        "  fiz uma atualização no seu chip por aqui",
        "> 😉 Se liga!",
        ">   Peça os prints antes do ticket.",
        "[imagem: tela da Wave]",
        "1. primeiro",
        "2. segundo",
        "| Categoria | Código |",
        "| Conectividade | CNT |",
        "[página: Exemplo de atendimento]",
      ].join("\n"),
    );
  });
  it("páginas vazias viram texto vazio", () => {
    expect(blocosParaTexto([])).toBe("");
  });
});

const linha = (props: Record<string, unknown>): LinhaDoIndice => ({
  id: "x",
  properties: props as LinhaDoIndice["properties"],
});
const indice = linha({
  Nome: { type: "title", title: rt("Internet lenta") },
  Código: { type: "rich_text", rich_text: rt("B2C-CNT-INT-02") },
  Categoria: { type: "select", select: { name: "Conectividade" } },
  Subcategoria: { type: "select", select: { name: "Internet" } },
  "Status Notion": { type: "select", select: { name: "✅ Concluído" } },
  "Última revisão": { type: "date", date: { start: "2026-09-03" } },
  "Link do processo": {
    type: "url",
    url: "https://app.notion.com/p/368cc47b1d7c812a8344f343fe872a20",
  },
});

describe("itemDoIndice", () => {
  it("lê código, classificação, revisão e a página do processo", () => {
    expect(itemDoIndice(indice, "B2C")).toEqual({
      pageId: "368cc47b1d7c812a8344f343fe872a20",
      base: "B2C",
      codigo: "B2C-CNT-INT-02",
      titulo: "Internet lenta",
      categoria: "Conectividade",
      subcategoria: "Internet",
      revisado: true,
      ultimaRevisao: "2026-09-03",
      url: "https://www.notion.so/368cc47b1d7c812a8344f343fe872a20",
    });
  });
  it("pendente = não revisado; sem link, a linha é ignorada", () => {
    const pendente = linha({
      ...indice.properties,
      "Status Notion": { type: "select", select: { name: "⏳ Pendente" } },
    });
    expect(itemDoIndice(pendente, "B2B")?.revisado).toBe(false);
    expect(
      itemDoIndice(
        linha({ ...indice.properties, "Link do processo": { type: "url", url: null } }),
        "B2C",
      ),
    ).toBeNull();
  });
});

describe("montarProcesso", () => {
  it("cabeçalho com código e data; avisa quando não foi revisado", () => {
    const item = itemDoIndice(indice, "B2C")!;
    expect(montarProcesso(item, "corpo")).toBe(
      "# Internet lenta (B2C-CNT-INT-02)\núltima revisão: 03/09/2026\n\ncorpo",
    );
    expect(montarProcesso({ ...item, revisado: false }, "corpo")).toContain(
      "ainda não revisado pela Qualidade",
    );
  });
});
