// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import {
  buscarAtalhos,
  gruposVisiveis,
  lerAtalhos,
  salvarAtalhos,
  type GrupoDeAtalhos,
} from "../acesso-rapido";

// (A lista de verdade mora no banco desde 14/10/2026: a carga dos 50 links, os slides e os restritos são
// conferidos no ensaio da migration.)
const GRUPOS: GrupoDeAtalhos[] = [
  {
    nome: "Atendimento",
    icone: "🎧",
    links: [{ nome: "Intercom", url: "https://app.intercom.com" }],
  },
  {
    nome: "Material de apoio",
    icone: "📚",
    links: [
      { nome: "Portabilidade", url: "https://docs.google.com/p", sub: "Slides" },
      { nome: "Dicionário de tags", url: "https://www.notion.so/d" },
    ],
  },
  {
    nome: "Comunicação",
    icone: "✉️",
    links: [
      { nome: "Gmail", url: "https://mail.google.com" },
      { nome: "Slack", url: "https://app.slack.com" },
    ],
  },
  {
    nome: "Planilhas",
    icone: "📊",
    links: [
      { nome: "PIN/PUK (eSIM)", url: "https://docs.google.com/s", restrito: true },
      { nome: "PIN/PUK (chips físicos)", url: "https://docs.google.com/t", restrito: true },
    ],
  },
];
describe("o acesso rápido", () => {
  it("os restritos só para o ADM; e um grupo que ficaria vazio some", () => {
    expect(gruposVisiveis("colaborador", GRUPOS).map((g) => g.nome)).toEqual([
      "Atendimento",
      "Material de apoio",
      "Comunicação",
    ]);
    expect(
      gruposVisiveis("adm", GRUPOS)
        .flatMap((g) => g.links)
        .filter((l) => l.restrito),
    ).toHaveLength(2);
  });
  it("a busca, sem acento, no nome, no grupo e no subgrupo", () => {
    const g = gruposVisiveis("colaborador", GRUPOS);
    expect(buscarAtalhos(g, "portab").map((l) => l.nome)).toEqual(["Portabilidade"]);
    expect(buscarAtalhos(g, "comunicacao").map((l) => l.nome)).toEqual(["Gmail", "Slack"]);
    expect(buscarAtalhos(g, "slides").map((l) => l.nome)).toEqual(["Portabilidade"]);
    expect(buscarAtalhos(g, "pin/puk")).toEqual([]);
    expect(buscarAtalhos(g, "  ")).toEqual([]);
  });
  it("os Meus atalhos: guardados por pessoa, no navegador", () => {
    salvarAtalhos("ana", ["https://a"]);
    salvarAtalhos("vera", ["https://b", "https://c"]);
    expect(lerAtalhos("ana")).toEqual(["https://a"]);
    expect(lerAtalhos("vera")).toEqual(["https://b", "https://c"]);
    localStorage.setItem("cxhub-atalhos:ivo", "isto não é uma lista");
    expect(lerAtalhos("ivo")).toEqual([]);
  });
});
