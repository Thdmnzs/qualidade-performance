import { describe, expect, it } from "vitest";

import { agrupar, casaComABusca, daBase, trechoDaBusca, type ProcessoDaLista } from "../processos";

const p = (titulo: string, extra: Partial<ProcessoDaLista> = {}): ProcessoDaLista => ({
  id: titulo,
  codigo: null,
  titulo,
  base: "B2C",
  revisado: false,
  versao_atual: 1,
  categoria: null,
  subcategoria: null,
  ordem: null,
  url: null,
  ...extra,
});

describe("a tela de Processos", () => {
  const lista = [
    p("Internet lenta", {
      ordem: 3,
      categoria: "Conectividade",
      subcategoria: "Internet",
      codigo: "B2C-CNT-INT-02",
    }),
    p("Aplicativo travou", {
      ordem: 1,
      categoria: "Aplicativo e Chip",
      subcategoria: "Aplicativo",
    }),
    p("PIN e PUK", { ordem: 2, categoria: "Aplicativo e Chip", subcategoria: "Chip" }),
    p("FAQ B2B", { base: "B2B", ordem: 1 }),
    p("Sem posição", { ordem: null, categoria: "Conectividade" }),
  ];
  it("cada base na ordem da Flukepédia; os sem posição no fim", () => {
    expect(daBase(lista, "B2C").map((x) => x.titulo)).toEqual([
      "Aplicativo travou",
      "PIN e PUK",
      "Internet lenta",
      "Sem posição",
    ]);
    expect(daBase(lista, "B2B").map((x) => x.titulo)).toEqual(["FAQ B2B"]);
  });
  it("os grupos: a categoria e a subcategoria, na ordem em que aparecem", () => {
    const g = agrupar(daBase(lista, "B2C"));
    expect(g.map((x) => [x.categoria, x.subgrupos.map((s) => s.subcategoria)])).toEqual([
      ["Aplicativo e Chip", ["Aplicativo", "Chip"]],
      ["Conectividade", ["Internet", null]],
    ]);
  });
  it("a busca: pelo nome, pelo código e pela categoria, sem acento", () => {
    expect(casaComABusca(lista[0]!, "LENTA")).toBe(true);
    expect(casaComABusca(lista[0]!, "cnt-int")).toBe(true);
    expect(casaComABusca(lista[1]!, "aplicativo e chip")).toBe(true);
    expect(casaComABusca(lista[2]!, "conectividade")).toBe(false);
    expect(casaComABusca(lista[2]!, "  ")).toBe(true);
  });
  it("o trecho a destacar", () => {
    expect(trechoDaBusca("Portabilidade sainte", "SAINTE")).toEqual([
      "Portabilidade ",
      "sainte",
      "",
    ]);
    expect(trechoDaBusca("Portabilidade sainte", "xyz")).toBeNull();
  });
});
