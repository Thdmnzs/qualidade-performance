import { describe, expect, it, vi } from "vitest";
import { MENSAGEM_GENERICA, mensagemSegura } from "../erros-do-banco.server";

describe("mensagemSegura", () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  it("as mensagens das regras passam (o banco as escreve para o usuário)", () => {
    expect(
      mensagemSegura(
        { code: "P0001", message: "Informe o motivo (pelo menos 10 caracteres)." },
        "t",
      ),
    ).toBe("Informe o motivo (pelo menos 10 caracteres).");
    expect(mensagemSegura({ code: "42501", message: "Apenas o ADM vê o Painel." }, "t")).toBe(
      "Apenas o ADM vê o Painel.",
    );
  });
  it("um erro técnico não passa (nem o nome da tabela, nem da restrição)", () => {
    const tecnico = {
      code: "23514",
      message: 'new row for relation "evaluations" violates check constraint "x"',
    };
    expect(mensagemSegura(tecnico, "t")).toBe(MENSAGEM_GENERICA);
    expect(
      mensagemSegura(
        { code: "42703", message: 'column "senha" does not exist' },
        "t",
        "Outra genérica.",
      ),
    ).toBe("Outra genérica.");
  });
  it("sem código, ou sem erro: a genérica", () => {
    expect(mensagemSegura({ message: "fetch failed" }, "t")).toBe(MENSAGEM_GENERICA);
    expect(mensagemSegura(null, "t")).toBe(MENSAGEM_GENERICA);
  });
});
