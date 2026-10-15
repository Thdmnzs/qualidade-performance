// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { buscarAtalhos, GRUPOS, gruposVisiveis, lerAtalhos, salvarAtalhos } from "../acesso-rapido";

const todos = GRUPOS.flatMap((g) => g.links);
describe("o acesso rápido", () => {
  it("os 7 grupos e os 50 links; todos com https, e sem um registro específico", () => {
    expect(GRUPOS.map((g) => g.nome)).toEqual([
      "Atendimento",
      "Material de apoio",
      "Financeiro",
      "Comunicação",
      "A Fluke na web",
      "Consultas",
      "Planilhas",
    ]);
    expect(todos).toHaveLength(50);
    expect(todos.every((l) => l.url.startsWith("https://"))).toBe(true);
    for (const proibido of [
      "9744340",
      "Ubl43jGm7",
      "conversation/",
      "token=",
      "app_error_code",
      "supabase.com/dashboard",
      "github.com",
    ])
      expect(todos.some((l) => l.url.includes(proibido))).toBe(false);
    expect(
      GRUPOS.find((g) => g.nome === "Material de apoio")!.links.filter((l) => l.sub === "Slides"),
    ).toHaveLength(16);
  });
  it("os restritos (as planilhas de PIN/PUK) só para o ADM", () => {
    const pinPuk = (perfil: string) =>
      gruposVisiveis(perfil)
        .flatMap((g) => g.links)
        .filter((l) => /PIN\/PUK/.test(l.nome)).length;
    expect(pinPuk("colaborador")).toBe(0);
    expect(pinPuk("avaliador")).toBe(0);
    expect(pinPuk("adm")).toBe(2);
  });
  it("a busca, sem acento, no nome, no grupo e no subgrupo", () => {
    const g = gruposVisiveis("colaborador");
    expect(buscarAtalhos(g, "portab").map((l) => l.nome)).toContain("Portabilidade");
    expect(buscarAtalhos(g, "comunicacao").map((l) => l.nome)).toEqual(["Gmail", "Slack"]);
    expect(buscarAtalhos(g, "pin/puk")).toEqual([]);
    expect(buscarAtalhos(g, "  ")).toEqual([]);
  });
  it("os Meus atalhos: guardados por pessoa, no navegador", () => {
    salvarAtalhos("ana", ["https://a"]);
    salvarAtalhos("vera", ["https://b", "https://c"]);
    expect(lerAtalhos("ana")).toEqual(["https://a"]);
    expect(lerAtalhos("vera")).toEqual(["https://b", "https://c"]);
    localStorage.setItem("cxhub-atalhos:ivo", "isto não é uma lista");
    expect(lerAtalhos("ivo")).toEqual([]); // um valor estragado não quebra nada
  });
});
