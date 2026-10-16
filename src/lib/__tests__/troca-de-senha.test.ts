import { describe, expect, it } from "vitest";

import { problemaDaTroca, traduzirErroDaTroca } from "../senha";

describe("a troca de senha: a regra", () => {
  const BOA = "Nova!Senha2026";
  it("as mesmas regras da primeira senha; a nova diferente da atual; a confirmação igual", () => {
    expect(problemaDaTroca({ atual: "", nova: BOA, confirmacao: BOA })).toBe(
      "Informe a sua senha atual.",
    );
    expect(
      problemaDaTroca({ atual: "Antiga!2025x", nova: "curta1!A", confirmacao: "curta1!A" }),
    ).toContain("regras");
    expect(
      problemaDaTroca({
        atual: "Antiga!2025x",
        nova: "semsimbolo2026A",
        confirmacao: "semsimbolo2026A",
      }),
    ).toContain("regras");
    expect(problemaDaTroca({ atual: BOA, nova: BOA, confirmacao: BOA })).toContain("diferente");
    expect(problemaDaTroca({ atual: "Antiga!2025x", nova: BOA, confirmacao: BOA + "x" })).toContain(
      "confirmação",
    );
    expect(problemaDaTroca({ atual: "Antiga!2025x", nova: BOA, confirmacao: BOA })).toBeNull();
  });
  it("os erros, numa frase", () => {
    expect(traduzirErroDaTroca("senha_atual")).toBe("A senha atual não confere.");
    expect(traduzirErroDaTroca("weak_password")).toContain("política de segurança");
    expect(traduzirErroDaTroca("limite")).toContain("Muitas tentativas");
    expect(traduzirErroDaTroca(undefined)).toContain("Não foi possível");
  });
});
