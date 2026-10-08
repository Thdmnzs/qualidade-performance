import { describe, expect, it } from "vitest";
import {
  CENTRAIS,
  nivelDe,
  progressoDaCentral,
  raridade,
  subiuDeNivel,
  textoDoBonus,
} from "../gamificacao";

describe("nivelDe (1.000 XP por nível, sem teto, desde 08/10/2026)", () => {
  it("as fronteiras da régua", () => {
    expect(nivelDe(0)).toMatchObject({ nivel: 1, inicio: 0, proximo: 1000 });
    expect(nivelDe(999).nivel).toBe(1);
    expect(nivelDe(1000)).toMatchObject({ nivel: 2, inicio: 1000, proximo: 2000 });
    expect(nivelDe(12000)).toMatchObject({ nivel: 13, inicio: 12000, proximo: 13000 });
  });
  it("o progresso dentro do nível (12.400 XP: nível 13, 40% do caminho)", () => {
    expect(nivelDe(12400).progresso).toBeCloseTo(0.4, 5);
  });
  it("não há nível máximo, e XP estranho não quebra a régua", () => {
    expect(nivelDe(1_000_000).nivel).toBe(1001);
    expect(nivelDe(-5).nivel).toBe(1);
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
    expect(raridade(700).nome).toBe("Ultra épica");
    expect(raridade(1500).nome).toBe("Suprema");
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

describe("as Centrais de Comando", () => {
  const CAT = [
    { numero: 1, dimensao: "sinal", ativa: true },
    { numero: 2, dimensao: "sinal", ativa: true },
    { numero: 56, dimensao: "sinal", ativa: true },
    { numero: 11, dimensao: "velocidade", ativa: false },
    { numero: 57, dimensao: "velocidade", ativa: false },
  ];
  it("o progresso conta só as outras da dimensão (sem a própria Central)", () => {
    expect(progressoDaCentral(CAT[2]!, CAT, new Set([1]))).toEqual({
      ganhas: 1,
      total: 2,
      ativas: 2,
    });
    expect(progressoDaCentral(CAT[4]!, CAT, new Set())).toEqual({ ganhas: 0, total: 1, ativas: 0 });
  });
  it("são seis, uma por dimensão", () => expect(CENTRAIS).toHaveLength(6));
});

describe("subiuDeNivel", () => {
  it("só quando passou do último visto", () => {
    expect(subiuDeNivel(13, 12)).toBe(true);
    expect(subiuDeNivel(13, 13)).toBe(false);
  });
  it("na primeira visita (sem um nível visto), não mostra o aviso", () =>
    expect(subiuDeNivel(13, null)).toBe(false));
});
