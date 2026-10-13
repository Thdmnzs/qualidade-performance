import { describe, expect, it } from "vitest";

import { contagemDaBolinha, quandoFoi, rotaDaNotificacao, textoDaBolinha } from "../notificacoes";

describe("a central de notificações", () => {
  it("para onde cada uma leva, conforme o perfil", () => {
    expect(rotaDaNotificacao("troca_para_voce", "colaborador")).toBe("/escala");
    expect(rotaDaNotificacao("contestacao_para_responder", "adm")).toBe("/admin/contestacoes");
    expect(rotaDaNotificacao("contestacao", "colaborador")).toBe("/contestacoes");
    expect(rotaDaNotificacao("resultado", "colaborador")).toBe("/minhas-avaliacoes");
    expect(rotaDaNotificacao("aniversario", "colaborador")).toBe("/painel");
    expect(rotaDaNotificacao("aniversario", "adm")).toBe("/admin");
    expect(rotaDaNotificacao("algo_novo", "avaliador")).toBe("/admin");
  });
  it("a bolinha: as ações (até serem feitas) + as novidades não lidas", () => {
    const p = { tipo: "troca_para_voce", id: "1", titulo: "", texto: null, quando: "" };
    const n = (lida: boolean) => ({
      id: String(Math.random()),
      tipo: "escala",
      titulo: "",
      texto: null,
      quando: "",
      lida,
    });
    expect(contagemDaBolinha({ pendencias: [p], novidades: [n(false), n(false), n(true)] })).toBe(
      3,
    );
    expect(contagemDaBolinha({ pendencias: [], novidades: [n(true)] })).toBe(0);
    expect(contagemDaBolinha(undefined)).toBe(0);
    expect(textoDaBolinha(12)).toBe("9+");
  });
  it("quando foi", () => {
    const agora = new Date("2026-10-13T18:00:00Z"); // 15h em Fortaleza
    expect(quandoFoi("2026-10-13T17:48:00Z", agora)).toBe("há 12 min");
    expect(quandoFoi("2026-10-13T16:00:00Z", agora)).toBe("há 2 h");
    expect(quandoFoi("2026-10-12T19:40:00Z", agora)).toBe("ontem, 16:40");
    expect(quandoFoi("2026-10-01T12:00:00Z", agora)).toBe("01/10");
  });
});
