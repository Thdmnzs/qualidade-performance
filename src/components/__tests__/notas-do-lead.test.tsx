// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
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
const { NotasDoLead } = await import("../contato-intercom");
afterEach(cleanup);
const NOTA = {
  id: "3",
  autor: "Kaio",
  quando: 1_792_500_000,
  linhas: [
    [
      { texto: "B2B (43.180.755/0001-28): " },
      { texto: "o painel do cliente", url: "https://app-dash-fluke.vercel.app/clients/52a9" },
    ],
    [{ texto: "wave" }],
  ],
};

describe("as notas do lead, na ficha", () => {
  it("as notas, com os links clicáveis (numa aba nova, sem passar o endereço do CX Hub)", () => {
    render(<NotasDoLead notas={[NOTA]} />);
    const painel = screen.getByLabelText("As notas do lead");
    expect(within(painel).getByText("1")).toBeTruthy();
    const link = within(painel).getByRole("link", { name: "o painel do cliente" });
    expect(link.getAttribute("href")).toBe("https://app-dash-fluke.vercel.app/clients/52a9");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    expect(within(painel).getByText(/^Kaio · /)).toBeTruthy();
  });
  it("quando o Intercom não entregou as notas: o aviso, e a ficha segue", () => {
    render(<NotasDoLead notas={null} />);
    expect(screen.getByText(/Não foi possível ler as notas do lead/)).toBeTruthy();
  });
  it("sem notas: nada na tela", () => {
    const { container } = render(<NotasDoLead notas={[]} />);
    expect(container.textContent).toBe("");
  });
});
