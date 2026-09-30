import { describe, expect, it } from "vitest";
import { avisoDeQuantidade, calcularNota, type CriterioDaFicha, type Resposta } from "../avaliacao";

// Ficha versão 1, como está no banco (soma dos pesos = 200).
const pesos: Array<[number, number, number | null]> = [
  [1, 100, null], // LGPD (gravíssimo)
  [2, 14, 8], // Empatia: aceita "Médio"
  [3, 5, null],
  [4, 5, null],
  [5, 10, null],
  [6, 10, null],
  [7, 10, null],
  [8, 7, null],
  [9, 10, null],
  [10, 5, null],
  [11, 5, null],
  [12, 5, null],
  [13, 5, null],
  [14, 9, null],
];
const FICHA: CriterioDaFicha[] = pesos.map(([ordem, peso, peso_medio]) => ({
  id: `c${ordem}`,
  ordem,
  peso,
  peso_medio,
  permite_medio: peso_medio !== null,
}));

const respostas = (sobrescrever: Record<string, Resposta> = {}) =>
  Object.fromEntries(FICHA.map((c) => [c.id, sobrescrever[c.id] ?? "sim"]));

// Mesmos casos usados nos testes da função registrar_avaliacao (SQL), bloco "cálculo da nota".
describe("calcularNota (mesmos casos dos testes de SQL)", () => {
  it("tudo Sim = 100", () => expect(calcularNota(FICHA, respostas())).toBe(100));
  it("empatia Médio = 92", () => expect(calcularNota(FICHA, respostas({ c2: "medio" }))).toBe(92));
  it("empatia Não = 86", () => expect(calcularNota(FICHA, respostas({ c2: "nao" }))).toBe(86));
  it("falha em LGPD zera", () => expect(calcularNota(FICHA, respostas({ c1: "nao" }))).toBe(0));
  it("tudo Não não fica negativa", () => {
    const tudoNao = Object.fromEntries(FICHA.map((c) => [c.id, "nao" as const]));
    expect(calcularNota(FICHA, tudoNao)).toBe(0);
  });
  it("critério sem resposta não desconta (a validação é do banco)", () => {
    expect(calcularNota(FICHA, {})).toBe(100);
  });
});

describe("avisoDeQuantidade (avisar, mas permitir)", () => {
  it("não avisa abaixo do previsto", () => {
    expect(avisoDeQuantidade("interacao", 5)).toBeNull();
    expect(avisoDeQuantidade("ticket_n2", 3)).toBeNull();
  });
  it("avisa ao atingir o previsto", () => {
    expect(avisoDeQuantidade("interacao", 6)).toContain("já tem 6 avaliações de Interação");
    expect(avisoDeQuantidade("ticket_n2", 4)).toContain("o previsto são 4");
  });
});
