// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { ProcessoDaLista } from "@/lib/processos";

import { ColunasDosProcessos } from "../colunas-dos-processos";

const p = (
  titulo: string,
  base: string,
  extra: Partial<ProcessoDaLista> = {},
): ProcessoDaLista => ({
  id: `${base}-${titulo}`,
  codigo: null,
  titulo,
  base,
  revisado: false,
  versao_atual: 1,
  categoria: null,
  subcategoria: null,
  ordem: null,
  url: null,
  ...extra,
});
const PROCESSOS = [
  p("Internet lenta", "B2C", {
    ordem: 2,
    categoria: "Conectividade",
    subcategoria: "Internet",
    codigo: "B2C-CNT-INT-02",
    revisado: true,
  }),
  p("Portabilidade sainte", "B2C", {
    ordem: 3,
    categoria: "Portabilidade e Número",
    subcategoria: "Portabilidade",
  }),
  p("Aplicativo travou", "B2C", {
    ordem: 1,
    categoria: "Aplicativo e Chip",
    subcategoria: "Aplicativo",
    revisado: true,
  }),
  p("Portabilidade sainte", "B2B", {
    ordem: 1,
    categoria: "Portabilidade e Número",
    subcategoria: "Portabilidade",
  }),
  p("Guia de Clientes Atritados", "Guia", {
    url: "https://www.notion.so/299cc47b1d7c80fbb2c8d2c48a9de99e",
  }),
  p("Dicionário de Tags", "Guia", {
    url: "https://www.notion.so/3d3cc47b1d7c8083b9b2eada252f65c3",
  }),
];
const coluna = (rotulo: string) => screen.getByRole("region", { name: `Processos: ${rotulo}` });
afterEach(cleanup);

describe("os processos em duas colunas", () => {
  it("o B2C e o B2B lado a lado, na ordem da Flukepédia, com o botão do Notion", () => {
    render(<ColunasDosProcessos processos={PROCESSOS} />);
    const b2c = coluna("Flukepédia | B2C");
    expect(
      within(b2c)
        .getAllByRole("listitem")
        .map((li) => li.textContent?.split("Revisado")[0]?.split("Pendente")[0]),
    ).toEqual(["Aplicativo travou", "Internet lentaB2C-CNT-INT-02", "Portabilidade sainte"]);
    expect(within(b2c).getByText("3 processos · 2 revisados")).toBeTruthy();
    expect(
      (
        within(b2c).getByRole("link", {
          name: /Abrir Flukepédia \| B2C no Notion/,
        }) as HTMLAnchorElement
      ).href,
    ).toBe("https://www.notion.so/368cc47b1d7c81dc992bea98666c9891");
    expect(
      (
        within(coluna("Flukepédia | B2B")).getByRole("link", {
          name: /no Notion/,
        }) as HTMLAnchorElement
      ).href,
    ).toBe("https://www.notion.so/3eacc47b1d7c8187ad58faef80ba8f98");
  });
  it("recolher pelo nome; o link do Notion não está dentro do botão", () => {
    render(<ColunasDosProcessos processos={PROCESSOS} />);
    const b2b = coluna("Flukepédia | B2B");
    expect(
      within(b2b)
        .getByRole("link", { name: /no Notion/ })
        .closest("button"),
    ).toBeNull();
    fireEvent.click(within(b2b).getByRole("button", { name: /Flukepédia \| B2B/ }));
    expect(within(coluna("Flukepédia | B2B")).queryAllByRole("listitem")).toHaveLength(0);
  });
  it("a busca filtra as duas colunas, e abre as recolhidas", () => {
    render(<ColunasDosProcessos processos={PROCESSOS} />);
    fireEvent.change(screen.getByRole("searchbox", { name: "Buscar um processo" }), {
      target: { value: "sainte" },
    });
    expect(within(coluna("Flukepédia | B2C")).getAllByRole("listitem")).toHaveLength(1);
    expect(within(coluna("Flukepédia | B2B")).getAllByRole("listitem")).toHaveLength(1);
    expect(
      within(coluna("Flukepédia | B2C")).getByText("1 de 3 processos · 2 revisados"),
    ).toBeTruthy();
  });
  it("as outras referências: o Guia e o Dicionário de Tags, cada um com o seu botão", () => {
    render(<ColunasDosProcessos processos={PROCESSOS} />);
    const refs = coluna("Outras referências");
    expect(within(refs).queryByRole("link")).toBeNull(); // começa recolhida, e o cabeçalho não tem botão
    fireEvent.click(within(refs).getByRole("button", { name: /Outras referências/ }));
    expect(
      (
        within(coluna("Outras referências")).getByRole("link", {
          name: /Abrir Dicionário de Tags no Notion/,
        }) as HTMLAnchorElement
      ).href,
    ).toBe("https://www.notion.so/3d3cc47b1d7c8083b9b2eada252f65c3");
    expect(within(coluna("Outras referências")).getAllByRole("link")).toHaveLength(2);
  });
});
