// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ComponentType, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let SEARCH = { para: "/painel" };
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (opcoes: { component: ComponentType }) => ({
    options: opcoes,
    useSearch: () => SEARCH,
  }),
  Link: ({ children }: { children: ReactNode }) => <a>{children}</a>,
  redirect: (x: unknown) => x,
}));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (f: unknown) => f }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const CODIGOS = [
  "7KQ2-9MXD",
  "R4TP-2WZA",
  "H8NB-6CJE",
  "M3VF-8LQS",
  "Z5DY-1PRK",
  "C9WG-4TNH",
  "B2JX-7EMU",
  "P6LS-3KAV",
  "W1RT-5HZD",
  "F7EQ-9BNC",
];
const gerar = vi.fn(async () => CODIGOS);
const usar = vi.fn(async (_a: { data: { codigo: string } }) => true);
vi.mock("@/lib/verificacao.functions", () => ({
  gerarCodigosDeRecuperacaoFn: () => gerar(),
  usarCodigoDeRecuperacaoFn: (a: { data: { codigo: string } }) => usar(a),
}));
const mfa = {
  listFactors: vi.fn(async () => ({
    data: {
      all: [{ id: "velho", status: "unverified" }],
      totp: [{ id: "f1", status: "verified" }],
    },
  })),
  unenroll: vi.fn(async (_a: unknown) => ({})),
  enroll: vi.fn(async () => ({
    data: {
      id: "f2",
      totp: { qr_code: "data:image/svg+xml;utf-8,<svg/>", secret: "JBSWY3DPEHPK3PXP" },
    },
    error: null,
  })),
  challengeAndVerify: vi.fn(async (a: { code: string }) => ({
    error: a.code === "123456" ? null : { message: "inválido" },
  })),
};
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { mfa, refreshSession: vi.fn(async () => ({})), signOut: vi.fn() } },
}));
const assign = vi.fn();
beforeEach(() => {
  Object.defineProperty(window, "location", { value: { assign, href: "/" }, writable: true });
  SEARCH = { para: "/painel" };
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
const tela = async (arquivo: string) => {
  const { Route } = await import(`../${arquivo}`);
  const Tela = (Route as { options: { component: ComponentType } }).options.component;
  return render(<Tela />);
};
const digitar = (rotulo: string, valor: string) =>
  fireEvent.change(screen.getByLabelText(rotulo), { target: { value: valor } });

describe("a entrada com o código", () => {
  it("o código errado: o aviso, e o campo limpo", async () => {
    await tela("verificar");
    digitar("O código de 6 dígitos", "999999");
    fireEvent.click(screen.getByRole("button", { name: "Entrar" }));
    expect((await screen.findByRole("alert")).textContent).toContain("O código não confere");
    expect(assign).not.toHaveBeenCalled();
  });
  it("o código certo: volta para onde ia", async () => {
    SEARCH = { para: "/admin/avaliacoes" };
    await tela("verificar");
    digitar("O código de 6 dígitos", "123456");
    fireEvent.click(screen.getByRole("button", { name: "Entrar" }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/admin/avaliacoes"));
    expect(mfa.challengeAndVerify).toHaveBeenCalledWith({ factorId: "f1", code: "123456" });
  });
});

describe("o cadastro obrigatório", () => {
  it("desfaz o cadastro pela metade, mostra o QR code e a chave; o código certo mostra os 10 códigos; o Entrar só com o Guardei", async () => {
    await tela("proteger-a-conta");
    expect(await screen.findByAltText("O QR code do cadastro")).toBeTruthy();
    expect(screen.getByText("JBSWY3DPEHPK3PXP")).toBeTruthy();
    expect(mfa.unenroll).toHaveBeenCalledWith({ factorId: "velho" });
    digitar("O código de 6 dígitos", "123456");
    fireEvent.click(screen.getByRole("button", { name: "Ativar" }));
    const lista = await screen.findByLabelText("Os códigos de recuperação");
    expect(
      within(lista)
        .getAllByRole("listitem")
        .map((l) => l.textContent),
    ).toEqual(CODIGOS);
    const entrar = screen.getByRole("button", { name: "Entrar no CX Hub" }) as HTMLButtonElement;
    expect(entrar.disabled).toBe(true);
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(entrar);
    expect(assign).toHaveBeenCalledWith("/painel");
  });
  it("o código errado: o aviso, e nenhum código de recuperação é gerado", async () => {
    await tela("proteger-a-conta");
    await screen.findByAltText("O QR code do cadastro");
    digitar("O código de 6 dígitos", "000000");
    fireEvent.click(screen.getByRole("button", { name: "Ativar" }));
    expect((await screen.findByRole("alert")).textContent).toContain("O código não confere");
    expect(gerar).not.toHaveBeenCalled();
  });
});

describe("perdi o celular", () => {
  it("um código que não vale: o aviso", async () => {
    usar.mockResolvedValueOnce(false);
    await tela("recuperar-acesso");
    digitar("O código de recuperação", "AAAA-BBBB");
    fireEvent.click(screen.getByRole("button", { name: "Usar o código" }));
    expect((await screen.findByRole("alert")).textContent).toContain("não vale");
  });
  it("um código válido: aceito, e o atalho para cadastrar o celular novo", async () => {
    await tela("recuperar-acesso");
    digitar("O código de recuperação", "r4tp-2wza");
    fireEvent.click(screen.getByRole("button", { name: "Usar o código" }));
    fireEvent.click(await screen.findByRole("button", { name: "Cadastrar o celular novo" }));
    expect(usar).toHaveBeenCalledWith({ data: { codigo: "R4TP-2WZA" } });
    expect(assign).toHaveBeenCalledWith("/proteger-a-conta?para=%2Fpainel");
  });
});

describe("o destino depois do código", () => {
  it("só um caminho dentro do CX Hub", async () => {
    const { destinoSeguro } = await import("@/components/verificacao/moldura");
    expect(destinoSeguro("/admin/escala")).toBe("/admin/escala");
    expect(destinoSeguro("https://golpe.com")).toBe("/painel");
    expect(destinoSeguro("//golpe.com")).toBe("/painel");
    expect(destinoSeguro("/\\golpe.com")).toBe("/painel");
    expect(destinoSeguro(undefined)).toBe("/painel");
  });
});
