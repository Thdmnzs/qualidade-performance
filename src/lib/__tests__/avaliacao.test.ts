import { describe, expect, it } from "vitest";

import {
  agruparPorColaborador,
  avaliacaoApontada,
  avaliadoresDe,
  avisoDeQuantidade,
  calcularNota,
  contarPorTipo,
  contestacaoEmAndamento,
  filtrarMinhasAvaliacoes,
  motivoContestacaoValido,
  motivoValido,
  type CriterioDaFicha,
  type Resposta,
} from "../avaliacao";

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

describe("agruparPorColaborador", () => {
  const av = (
    employee_id: string,
    colaborador: string,
    created_at: string,
    avaliado_por: string,
    tipo: "interacao" | "ticket_n2" = "interacao",
  ) => ({
    id: `${employee_id}-${created_at}`,
    employee_id,
    colaborador,
    fortnight_id: "q1",
    tipo,
    assunto: "Portabilidade",
    data_contato: "2026-09-01",
    nota: 100,
    created_at,
    avaliado_por,
    pode_excluir: true,
  });
  const lista = [
    av("e2", "Thiago Dantas", "2026-09-02T10:00:00Z", "Rachel Kivel"),
    av("e1", "Ana Colab", "2026-09-01T10:00:00Z", "Admin Teste", "ticket_n2"),
    av("e2", "Thiago Dantas", "2026-09-05T10:00:00Z", "Admin Teste"),
    av("e3", "Érica Lima", "2026-09-03T10:00:00Z", "Rachel Kivel"),
  ];

  it("cria um bloco por colaborador, em ordem alfabética (com acento)", () => {
    expect(agruparPorColaborador(lista).map((b) => b.colaborador)).toEqual([
      "Ana Colab",
      "Érica Lima",
      "Thiago Dantas",
    ]);
  });

  it("dentro do bloco, a avaliação mais recente vem primeiro", () => {
    const thiago = agruparPorColaborador(lista).find((b) => b.employeeId === "e2")!;
    expect(thiago.avaliacoes.map((a) => a.created_at)).toEqual([
      "2026-09-05T10:00:00Z",
      "2026-09-02T10:00:00Z",
    ]);
  });

  it("conta por tipo e lista quem avaliou sem repetir", () => {
    const thiago = agruparPorColaborador(lista).find((b) => b.employeeId === "e2")!;
    expect(contarPorTipo(thiago.avaliacoes)).toEqual({ interacao: 2, ticket_n2: 0 });
    expect(avaliadoresDe(thiago.avaliacoes)).toEqual(["Admin Teste", "Rachel Kivel"]);
  });

  it("lista vazia não gera blocos", () => expect(agruparPorColaborador([])).toEqual([]));
});

describe("motivoValido (mesma regra do banco)", () => {
  it("exige pelo menos 5 caracteres úteis", () => {
    expect(motivoValido("Ticket errado")).toBe(true);
    expect(motivoValido("  ab  ")).toBe(false);
    expect(motivoValido("")).toBe(false);
  });
});

describe("avaliacaoApontada", () => {
  it("é apontada com qualquer Não ou Médio", () => {
    expect(avaliacaoApontada([{ resposta: "sim" }, { resposta: "nao" }])).toBe(true);
    expect(avaliacaoApontada([{ resposta: "medio" }])).toBe(true);
  });
  it("não é apontada quando tudo é Sim", () => {
    expect(avaliacaoApontada([{ resposta: "sim" }, { resposta: "sim" }])).toBe(false);
  });
});

describe("filtrarMinhasAvaliacoes", () => {
  const lista = [
    { id: "1", fortnight_id: "q1", apontada: true },
    { id: "2", fortnight_id: "q1", apontada: false },
    { id: "3", fortnight_id: "q2", apontada: true },
  ];
  const ids = (r: { id: string }[]) => r.map((a) => a.id);

  it("sem filtro, mostra tudo", () => {
    expect(ids(filtrarMinhasAvaliacoes(lista, { quinzena: "todas", apontada: "todas" }))).toEqual([
      "1",
      "2",
      "3",
    ]);
  });
  it("filtra por quinzena", () => {
    expect(ids(filtrarMinhasAvaliacoes(lista, { quinzena: "q1", apontada: "todas" }))).toEqual([
      "1",
      "2",
    ]);
  });
  it("filtra por apontada", () => {
    expect(ids(filtrarMinhasAvaliacoes(lista, { quinzena: "todas", apontada: "sim" }))).toEqual([
      "1",
      "3",
    ]);
    expect(ids(filtrarMinhasAvaliacoes(lista, { quinzena: "todas", apontada: "nao" }))).toEqual([
      "2",
    ]);
  });
  it("combina os dois filtros", () => {
    expect(ids(filtrarMinhasAvaliacoes(lista, { quinzena: "q1", apontada: "sim" }))).toEqual(["1"]);
  });
});

describe("motivoContestacaoValido (mesma regra do banco)", () => {
  it("aceita exatamente 10 caracteres e recusa 9", () => {
    expect(motivoContestacaoValido("1234567890")).toBe(true);
    expect(motivoContestacaoValido("123456789")).toBe(false);
  });
  it("ignora espaços em volta, como o banco", () => {
    expect(motivoContestacaoValido("   123456789   ")).toBe(false);
  });
});

describe("contestacaoEmAndamento", () => {
  it("aberta e em análise bloqueiam nova contestação; respondida não", () => {
    expect(contestacaoEmAndamento("aberta")).toBe(true);
    expect(contestacaoEmAndamento("em_analise")).toBe(true);
    expect(contestacaoEmAndamento("respondida")).toBe(false);
    expect(contestacaoEmAndamento(undefined)).toBe(false);
  });
});
