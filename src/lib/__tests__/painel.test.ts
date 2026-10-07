import { describe, expect, it } from "vitest";
import {
  acerto,
  acertoPorQuinzena,
  comDesconto,
  errosPorTipo,
  evolucaoIndividual,
  mediaPorQuinzena,
  notaPorPessoa,
  resumoDaQualidade,
  resumoDasMetricas,
  rotuloDaQuinzena,
  type AvaliacaoDoPainel,
  type MetricaDoPainel,
  type Resposta,
} from "../painel";

// 14 critérios "Sim", com as exceções informadas
const itens = (excecoes: Record<number, Resposta> = {}) =>
  Array.from({ length: 14 }, (_, k) => ({
    ordem: k + 1,
    resposta: excecoes[k + 1] ?? "sim",
    observacao: excecoes[k + 1] ? `obs ${k + 1}` : null,
  }));
const av = (
  nome: string,
  inicio: string,
  nota: number,
  exc: Record<number, Resposta> = {},
  dia = inicio,
): AvaliacaoDoPainel => ({
  evaluation_id: `${nome}-${inicio}-${nota}-${dia}`,
  quinzena_inicio: inicio,
  quinzena_status: "fechada",
  employee_id: nome,
  nome,
  turno: "Manhã",
  data_contato: dia,
  nota,
  comentarios: null,
  itens: itens(exc),
});
const AVS = [
  av("Fran", "2026-01-01", 100),
  av("Fran", "2026-01-01", 91, { 14: "nao" }, "2026-01-05"),
  av("Rachel", "2026-01-01", 86, { 14: "nao", 4: "nao" }, "2026-01-07"),
  av("Rachel", "2026-01-16", 93, { 2: "medio" }, "2026-01-20"),
];

describe("rotuloDaQuinzena", () => {
  it("como no relatório, com '(parcial)' se não está fechada", () => {
    expect(rotuloDaQuinzena("2026-01-01", "fechada")).toBe("2026-01 · Q1");
    expect(rotuloDaQuinzena("2026-01-16", "aberta")).toBe("2026-01 · Q2 (parcial)");
  });
});

describe("acerto: só o Sim conta", () => {
  it("tag: 2 'Não' em 4 avaliações = 50%", () => expect(acerto(AVS, 14)).toBe(50));
  it("empatia: o Médio não é acerto (3 de 4 = 75%)", () => expect(acerto(AVS, 2)).toBe(75));
  it("por quinzena: a tag em Q1 (1 de 3) e em Q2 (1 de 1)", () => {
    const r = acertoPorQuinzena(AVS, [14]);
    expect(r).toEqual([
      { quinzena: "2026-01 · Q1", c14: 33.3 },
      { quinzena: "2026-01 · Q2", c14: 100 },
    ]);
  });
});

describe("evolucaoIndividual", () => {
  it("uma coluna por pessoa; sem avaliação na quinzena, vazio", () => {
    const r = evolucaoIndividual(AVS, 14);
    expect(r.pessoas).toEqual(["Fran", "Rachel"]);
    expect(r.dados).toEqual([
      { quinzena: "2026-01 · Q1", Fran: 50, Rachel: 0 },
      { quinzena: "2026-01 · Q2", Fran: null, Rachel: 100 },
    ]);
  });
});

describe("errosPorTipo: todos contam", () => {
  it("cada Não e cada Médio (parcial); a avaliação com dois erros conta nos dois", () => {
    expect(errosPorTipo(AVS)).toEqual([
      { tipo: "Tagueamento", nao: 2, parcial: 0, total: 2 },
      { tipo: "Empatia", nao: 0, parcial: 1, total: 1 },
      { tipo: "Macro", nao: 1, parcial: 0, total: 1 },
    ]);
  });
});

describe("os resumos", () => {
  it("qualidade: média, com 100, abaixo do mínimo e o erro mais comum", () => {
    expect(resumoDaQualidade(AVS)).toEqual({
      total: 4,
      media: 92.5,
      com100: 1,
      abaixoDoMinimo: 1,
      maisComum: { tipo: "Tagueamento", vezes: 2 },
    });
  });
  it("nota por pessoa, da maior para a menor", () => {
    expect(notaPorPessoa(AVS)).toEqual([
      { nome: "Fran", media: 95.5 },
      { nome: "Rachel", media: 89.5 },
    ]);
  });
  it("com desconto: as mais recentes, com todos os erros", () => {
    const r = comDesconto(AVS, 2);
    expect(r.map((a) => a.data_contato)).toEqual(["2026-01-20", "2026-01-07"]);
    expect(r[1]!.erros.map((e) => e.tipo)).toEqual(["Macro", "Tagueamento"]);
    expect(r[0]!.erros[0]).toMatchObject({ tipo: "Empatia", parcial: true });
  });
});

describe("as métricas", () => {
  const m = (
    inicio: string,
    nome: string,
    prod: number | null,
    csat: number | null,
  ): MetricaDoPainel => ({
    quinzena_inicio: inicio,
    quinzena_status: "fechada",
    employee_id: nome,
    nome,
    turno: "Noite",
    produtividade: prod,
    qualidade: 95,
    sla_chat: 5,
    sla_email: 15,
    csat,
    horas_semanais: 20,
    quiz_entregue: true,
    elegivel: true,
    posicao: 1,
    premio: 500,
  });
  const MS = [
    m("2026-01-01", "Fran", 6, 100),
    m("2026-01-01", "Rachel", 8, null),
    m("2026-01-16", "Fran", 7, 96),
  ];
  it("a média por quinzena ignora os vazios", () => {
    expect(mediaPorQuinzena(MS, "produtividade")).toEqual([
      { quinzena: "2026-01 · Q1", valor: 7 },
      { quinzena: "2026-01 · Q2", valor: 7 },
    ]);
    expect(mediaPorQuinzena(MS, "csat")).toEqual([
      { quinzena: "2026-01 · Q1", valor: 100 },
      { quinzena: "2026-01 · Q2", valor: 96 },
    ]);
  });
  it("os cinco números do topo", () => {
    expect(resumoDasMetricas(MS)).toEqual({
      produtividade: 7,
      qualidade: 95,
      sla_chat: 5,
      sla_email: 15,
      csat: 98,
    });
  });
  it("sem nenhum dado: vazio (a tela mostra 'aguardando')", () => {
    expect(resumoDasMetricas([m("2026-01-01", "Fran", null, null)]).produtividade).toBeNull();
  });
});
