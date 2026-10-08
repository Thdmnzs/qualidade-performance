import { describe, expect, it } from "vitest";
import { deveApagarAMemoria } from "../memoria-da-sessao";

describe("deveApagarAMemoria: a memória da tela acompanha quem está logado", () => {
  it("ao abrir o site, não apaga (ainda não havia memória de ninguém)", () => {
    expect(deveApagarAMemoria(undefined, "u1")).toBe(false);
    expect(deveApagarAMemoria(undefined, null)).toBe(false);
  });
  it("alguém entrou (a memória de 'ninguém logado' não pode ficar)", () => {
    expect(deveApagarAMemoria(null, "u1")).toBe(true);
  });
  it("alguém saiu", () => expect(deveApagarAMemoria("u1", null)).toBe(true));
  it("outra pessoa entrou no mesmo navegador", () =>
    expect(deveApagarAMemoria("u1", "u2")).toBe(true));
  it("a mesma pessoa (a renovação da sessão): não apaga", () =>
    expect(deveApagarAMemoria("u1", "u1")).toBe(false));
});
