import { describe, expect, it } from "vitest";
import { filtrarContestacoes } from "../filtro-de-contestacoes";

const C = [
  {
    id: 1,
    assunto: "Avaliação de Interação · SMS",
    descricao: "Encerrei o ticket corretamente.",
    resolucao: "O critério 13 foi corrigido.",
    status: "deferida",
  },
  {
    id: 2,
    assunto: "Avaliação de Interação · Fluke",
    descricao: "Fui empática no atendimento.",
    resolucao: "A frustração não foi reconhecida.",
    status: "indeferida",
  },
  {
    id: 3,
    assunto: "Avaliação de Ticket de back-office",
    descricao: "Os campos não eram obrigatórios.",
    resolucao: null,
    status: "aberta",
  },
  {
    id: 4,
    assunto: "Avaliação de Interação · eSIM",
    descricao: "A tag estava certa.",
    resolucao: null,
    status: "em_analise",
  },
];
const ids = (l: { id: number }[]) => l.map((c) => c.id);

describe("filtrarContestacoes", () => {
  it("sem filtro, todas", () => expect(ids(filtrarContestacoes(C, "", ""))).toEqual([1, 2, 3, 4]));
  it("pela situação: aceitas e recusadas", () => {
    expect(ids(filtrarContestacoes(C, "", "deferida"))).toEqual([1]);
    expect(ids(filtrarContestacoes(C, "", "indeferida"))).toEqual([2]);
  });
  it("'Em análise' inclui as recém-abertas", () => {
    expect(ids(filtrarContestacoes(C, "", "em_analise"))).toEqual([3, 4]);
  });
  it("a busca olha o assunto, o pedido e a resposta, sem diferenciar acentos e maiúsculas", () => {
    expect(ids(filtrarContestacoes(C, "EMPATICA", ""))).toEqual([2]);
    expect(ids(filtrarContestacoes(C, "critério 13", ""))).toEqual([1]);
    expect(ids(filtrarContestacoes(C, "back-office", ""))).toEqual([3]);
  });
  it("a busca e a situação juntas", () => {
    expect(ids(filtrarContestacoes(C, "interacao", "em_analise"))).toEqual([4]);
    expect(ids(filtrarContestacoes(C, "nada disso", ""))).toEqual([]);
  });
});
