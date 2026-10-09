import { describe, expect, it } from "vitest";
import { apareceEmVazamentos, prefixoESufixo, PREFIXO_VALIDO } from "../senha-vazada";

describe("prefixoESufixo", () => {
  it("o SHA-1 de 'password' (o exemplo clássico): 5BAA6 + 1E4C9B...", async () => {
    expect(await prefixoESufixo("password")).toEqual({
      prefixo: "5BAA6",
      sufixo: "1E4C9B93F3F0682250B6CF8331B7EE68FD8",
    });
  });
  it("o prefixo tem sempre 5 caracteres hexadecimais (o que vai para fora)", async () => {
    const { prefixo, sufixo } = await prefixoESufixo("Uma senha qualquer! 123");
    expect(prefixo).toMatch(PREFIXO_VALIDO);
    expect(sufixo).toHaveLength(35);
  });
});

describe("apareceEmVazamentos", () => {
  const RESPOSTA =
    "003D68EB55068C33ACE09247EE4C639306B:3\r\n1E4C9B93F3F0682250B6CF8331B7EE68FD8:10434004\r\n011053FD0102E94D6AE2F8B83D76FAF94F6:0";
  it("o sufixo na lista, com vezes > 0: vazada", () => {
    expect(apareceEmVazamentos("1E4C9B93F3F0682250B6CF8331B7EE68FD8", RESPOSTA)).toBe(true);
  });
  it("as linhas de enchimento (0 vezes) não contam", () => {
    expect(apareceEmVazamentos("011053FD0102E94D6AE2F8B83D76FAF94F6", RESPOSTA)).toBe(false);
  });
  it("fora da lista: não vazada; e sem diferenciar maiúsculas", () => {
    expect(apareceEmVazamentos("FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF", RESPOSTA)).toBe(false);
    expect(apareceEmVazamentos("003d68eb55068c33ace09247ee4c639306b", RESPOSTA)).toBe(true);
  });
});

describe("PREFIXO_VALIDO", () => {
  it("só 5 caracteres hexadecimais maiúsculos", () => {
    expect(PREFIXO_VALIDO.test("5BAA6")).toBe(true);
    expect(PREFIXO_VALIDO.test("5BAA")).toBe(false);
    expect(PREFIXO_VALIDO.test("5baa6")).toBe(false);
    expect(PREFIXO_VALIDO.test("../x")).toBe(false);
  });
});
