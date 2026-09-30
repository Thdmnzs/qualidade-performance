import { describe, expect, it } from "vitest";
import { REGRAS_SENHA, senhaAtendeRegras } from "../senha";

describe("senhaAtendeRegras", () => {
  it("aceita senha forte", () => {
    expect(senhaAtendeRegras("Qualidade#2026")).toBe(true);
  });

  it.each([
    ["curta", "Ab1!"],
    ["sem maiúscula", "qualidade#2026"],
    ["sem minúscula", "QUALIDADE#2026"],
    ["sem número", "Qualidade#abc"],
    ["sem símbolo", "Qualidade2026"],
  ])("recusa senha %s", (_caso, senha) => {
    expect(senhaAtendeRegras(senha)).toBe(false);
  });

  it("aponta exatamente a regra que falta", () => {
    const faltando = REGRAS_SENHA.filter((r) => !r.atende("Qualidade2026")).map((r) => r.id);
    expect(faltando).toEqual(["simbolo"]);
  });
});
