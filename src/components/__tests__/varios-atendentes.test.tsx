// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-start", () => ({
  useServerFn: (f: unknown) => f,
  createServerFn: () => ({
    middleware: () => ({ validator: () => ({ handler: () => vi.fn() }), handler: () => vi.fn() }),
  }),
}));
vi.mock("@/lib/intercom.functions", () => ({
  sortearContatoFn: vi.fn(),
  contatoEmAbertoFn: vi.fn(),
  buscarContatoFn: vi.fn(),
  descartarContatoFn: vi.fn(),
  verificarIntercomFn: vi.fn(),
}));
const { AvisoDeVariosAtendentes } = await import("../contato-intercom");
afterEach(cleanup);
const A = (nome: string, avaliado = false) => ({ id: nome, nome, avaliado, mensagens: 1 });

describe("o aviso dos vários atendentes, na ficha", () => {
  it("os três atendentes, e só a parte do avaliado", () => {
    render(
      <AvisoDeVariosAtendentes
        atendentes={[A("Rubia Lopes"), A("Suelen Rocha"), A("Thiago Dantas", true)]}
      />,
    );
    const aviso = screen.getByRole("note", { name: "Vários atendentes" });
    expect(aviso.textContent).toContain("Este contato teve 3 atendentes: Rubia, Suelen e Thiago.");
    expect(aviso.textContent).toContain("considera só a parte de Thiago");
    expect(aviso.textContent).toContain("selecione a pessoa e cole o link");
  });
  it("a pessoa selecionada não escreveu na conversa", () => {
    render(<AvisoDeVariosAtendentes atendentes={[A("Rubia Lopes"), A("Suelen Rocha")]} />);
    expect(screen.getByRole("note").textContent).toContain("não escreveu");
  });
  it("um atendente só (o avaliado): nenhum aviso", () => {
    const { container } = render(
      <AvisoDeVariosAtendentes atendentes={[A("Thiago Dantas", true)]} />,
    );
    expect(container.textContent).toBe("");
  });
});
