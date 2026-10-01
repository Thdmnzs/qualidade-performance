import { describe, expect, it } from "vitest";
import {
  aceitaAvaliacoes,
  contestacaoAtrasada,
  prazoDeContestacaoAberto,
  publicada,
  quinzenaEmPrazo,
  quinzenaPadraoParaAvaliar,
  quinzenasDoCiclo,
  quinzenasPublicadas,
  situacaoDoFechamento,
  situacaoExibida,
} from "../quinzena";

// Prazo: quarta 16/09/2026, 23h59 em Fortaleza (= 02:59:59 UTC do dia 17).
const PRAZO = "2026-09-17T02:59:59.999Z";
const emContestacao = { status: "em_contestacao", prazo_contestacao_ate: PRAZO };
const quarta23h58 = new Date("2026-09-17T02:58:00Z");
const quinta00h01 = new Date("2026-09-17T03:01:00Z");

describe("prazoDeContestacaoAberto", () => {
  it("aberto até 23h59 do último dia (no fuso de Fortaleza)", () => {
    expect(prazoDeContestacaoAberto(emContestacao, quarta23h58)).toBe(true);
    expect(prazoDeContestacaoAberto(emContestacao, quinta00h01)).toBe(false);
  });
  it("fechado em qualquer outro status, e sem prazo registrado", () => {
    expect(prazoDeContestacaoAberto({ ...emContestacao, status: "fechada" }, quarta23h58)).toBe(
      false,
    );
    expect(
      prazoDeContestacaoAberto(
        { status: "em_contestacao", prazo_contestacao_ate: null },
        quarta23h58,
      ),
    ).toBe(false);
  });
});

describe("contestacaoAtrasada", () => {
  const responderAte = "2026-09-18T02:59:59.999Z"; // quinta 17/09, 23h59
  it("pendente e com o prazo vencido", () => {
    expect(
      contestacaoAtrasada(
        { status: "aberta", responder_ate: responderAte },
        new Date("2026-09-18T03:00:00Z"),
      ),
    ).toBe(true);
  });
  it("dentro do prazo, ou já respondida, não está atrasada", () => {
    expect(
      contestacaoAtrasada({ status: "aberta", responder_ate: responderAte }, quinta00h01),
    ).toBe(false);
    expect(
      contestacaoAtrasada(
        { status: "indeferida", responder_ate: responderAte },
        new Date("2026-09-20T00:00:00Z"),
      ),
    ).toBe(false);
  });
});

describe("situacaoDoFechamento", () => {
  it("não fecha durante o prazo", () => {
    expect(situacaoDoFechamento(emContestacao, 0, quarta23h58)).toEqual({
      podeFechar: false,
      motivo: "O prazo de contestação ainda não terminou.",
    });
  });
  it("não fecha com pendências, e diz quantas", () => {
    expect(situacaoDoFechamento(emContestacao, 2, quinta00h01).motivo).toBe(
      "2 contestações pendentes.",
    );
    expect(situacaoDoFechamento(emContestacao, 1, quinta00h01).motivo).toBe(
      "1 contestação pendente.",
    );
  });
  it("fecha depois do prazo e sem pendências", () => {
    expect(situacaoDoFechamento(emContestacao, 0, quinta00h01)).toEqual({
      podeFechar: true,
      motivo: null,
    });
  });
  it("só fecha quinzena em contestação", () => {
    expect(
      situacaoDoFechamento({ status: "aberta", prazo_contestacao_ate: null }, 0, quinta00h01)
        .podeFechar,
    ).toBe(false);
  });
});

describe("aceitaAvaliacoes e publicada", () => {
  it("são complementares no ciclo", () => {
    expect([aceitaAvaliacoes({ status: "aberta" }), publicada({ status: "aberta" })]).toEqual([
      true,
      false,
    ]);
    expect([
      aceitaAvaliacoes({ status: "em_contestacao" }),
      publicada({ status: "em_contestacao" }),
    ]).toEqual([false, true]);
    expect([aceitaAvaliacoes({ status: "fechada" }), publicada({ status: "fechada" })]).toEqual([
      false,
      true,
    ]);
  });
});

describe("situacaoExibida (o selo depois do prazo)", () => {
  it("dentro do prazo: Em contestação", () => {
    expect(situacaoExibida(emContestacao, 0, quarta23h58)).toEqual({
      rotulo: "Em contestação",
      tom: "atencao",
    });
  });
  it("prazo encerrado sem pendências: Pronta para fechamento", () => {
    expect(situacaoExibida(emContestacao, 0, quinta00h01)).toEqual({
      rotulo: "Pronta para fechamento",
      tom: "positivo",
    });
  });
  it("prazo encerrado com pendências: alerta, com a quantidade", () => {
    expect(situacaoExibida(emContestacao, 2, quinta00h01)).toEqual({
      rotulo: "Prazo encerrado · 2 pendentes",
      tom: "alerta",
    });
    expect(situacaoExibida(emContestacao, 1, quinta00h01).rotulo).toBe(
      "Prazo encerrado · 1 pendente",
    );
  });
  it("aberta e fechada não mudam", () => {
    expect(situacaoExibida({ status: "aberta", prazo_contestacao_ate: null }, 0).rotulo).toBe(
      "Aberta",
    );
    expect(
      situacaoExibida({ status: "fechada", prazo_contestacao_ate: PRAZO }, 0, quinta00h01).rotulo,
    ).toBe("Fechada");
  });
});

describe("várias quinzenas ativas ao mesmo tempo", () => {
  // Da mais recente para a mais antiga, como vem do banco.
  const segundaAberta = { id: "q2", status: "aberta", prazo_contestacao_ate: null };
  const primeiraEmContestacao = {
    id: "q1",
    status: "em_contestacao",
    prazo_contestacao_ate: PRAZO,
  };
  const agostoFechada = {
    id: "q0",
    status: "fechada",
    prazo_contestacao_ate: "2026-09-03T02:59:59.999Z",
  };
  const lista = [segundaAberta, primeiraEmContestacao, agostoFechada];

  it("um cartão de ciclo para cada quinzena não fechada", () => {
    expect(quinzenasDoCiclo(lista).map((q) => q.id)).toEqual(["q2", "q1"]);
  });
  it("todas fechadas: cartão só da mais recente (para poder reabrir)", () => {
    expect(
      quinzenasDoCiclo([agostoFechada, { ...agostoFechada, id: "antiga" }]).map((q) => q.id),
    ).toEqual(["q0"]);
  });
  it("avaliar: pré-seleciona a mais recente aberta", () => {
    expect(quinzenaPadraoParaAvaliar(lista)?.id).toBe("q2");
    expect(quinzenaPadraoParaAvaliar([primeiraEmContestacao, agostoFechada])).toBeUndefined();
  });
  it("contestação geral vai para a quinzena no prazo, mesmo não sendo a mais recente", () => {
    expect(quinzenaEmPrazo(lista, quarta23h58)?.id).toBe("q1");
    expect(quinzenaEmPrazo(lista, quinta00h01)).toBeUndefined();
  });
});

describe("quinzenasPublicadas (Visão geral do colaborador)", () => {
  it("só as publicadas, mantendo a ordem da mais recente para a mais antiga", () => {
    const lista = [
      { id: "out1", status: "aberta" },
      { id: "set2", status: "em_contestacao" },
      { id: "set1", status: "fechada" },
    ];
    expect(quinzenasPublicadas(lista).map((q) => q.id)).toEqual(["set2", "set1"]);
  });
});
