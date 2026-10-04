import { describe, expect, it } from "vitest";
import { nivelDe, raridade, textoDoBonus } from "../gamificacao";

describe("nivelDe (500 × n XP para subir, sem teto)", () => {
  it("as fronteiras da régua", () => {
    expect(nivelDe(0)).toMatchObject({ nivel: 1, inicio: 0, proximo: 500 });
    expect(nivelDe(499).nivel).toBe(1);
    expect(nivelDe(500)).toMatchObject({ nivel: 2, inicio: 500, proximo: 1500 });
    expect(nivelDe(1500)).toMatchObject({ nivel: 3, proximo: 3000 });
    expect(nivelDe(3000)).toMatchObject({ nivel: 4, proximo: 5000 });
    expect(nivelDe(5000).nivel).toBe(5);
  });
  it("progresso dentro do nível (2.213 XP: nível 3, 47,5% do caminho até 3.000)", () => {
    const n = nivelDe(2213);
    expect(n.nivel).toBe(3);
    expect(n.progresso).toBeCloseTo((2213 - 1500) / 1500, 5);
  });
  it("não há nível máximo", () => {
    expect(nivelDe(1_000_000).nivel).toBeGreaterThan(60);
  });
});

describe("raridade", () => {
  it("segue a escala do PDF", () => {
    expect(raridade(50).nome).toBe("Comum");
    expect(raridade(100).nome).toBe("Rara");
    expect(raridade(150).nome).toBe("Rara");
    expect(raridade(200).nome).toBe("Épica");
    expect(raridade(250).nome).toBe("Épica");
    expect(raridade(350).nome).toBe("Lendária");
    expect(raridade(500).nome).toBe("Mítica");
  });
});

describe("textoDoBonus", () => {
  it("só aparece a partir da 2ª seguida", () => {
    expect(textoDoBonus(1)).toBeNull();
    expect(textoDoBonus(2)).toBe("2ª seguida, bônus de +10%");
    expect(textoDoBonus(3)).toBe("3ª seguida, bônus de +20%");
    expect(textoDoBonus(7)).toBe("7ª seguida, bônus de +25%");
  });
});
