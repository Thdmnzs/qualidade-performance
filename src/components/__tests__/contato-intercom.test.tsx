// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// O servidor, simulado (as funções que o cartão chama).
const sortear = vi.fn();
const buscar = vi.fn();
const descartar = vi.fn();
const emAberto = vi.fn();
vi.mock("@/lib/intercom.functions", () => ({
  contatoEmAbertoFn: (...a: unknown[]) => emAberto(...a),
  sortearContatoFn: (...a: unknown[]) => sortear(...a),
  buscarContatoFn: (...a: unknown[]) => buscar(...a),
  descartarContatoFn: (...a: unknown[]) => descartar(...a),
}));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (f: unknown) => f }));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

const { ContatoIntercom } = await import("../contato-intercom");

const contato = (id: string, sorteioId: string | null) => ({
  sorteioId,
  jaEmAberto: false,
  conversaId: id,
  link: `https://app.intercom.com/a/inbox/x/inbox/conversation/${id}`,
  assunto: `Assunto ${id}`,
  dataContato: "2026-10-03",
  canal: { tipo: "app", rotulo: "App" },
  atendenteEscreveu: true,
  mensagens: [{ autor: "cliente", nome: "Cliente", quando: 1, texto: `Mensagem ${id}` }],
  atributos: [],
});

function montar(onContato = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <ContatoIntercom
        employeeId="emp-1"
        fortnightId="q-1"
        tipo="interacao"
        limparQuando={0}
        onContato={onContato}
      />
    </QueryClientProvider>,
  );
  return onContato;
}

beforeEach(() => {
  sortear.mockResolvedValue(contato("100", "s-1"));
  buscar.mockImplementation(async ({ data }: { data: { referencia: string } }) =>
    contato(data.referencia.split("/").pop()!, null),
  );
  descartar.mockResolvedValue({ ok: true });
  emAberto.mockResolvedValue(null);
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("o contato sorteado, e depois um link (o fluxo do Inserir link)", () => {
  it("sortear → Inserir link → descartar com motivo → colar o link → Buscar: o contato novo aparece", async () => {
    const u = userEvent.setup();
    const onContato = montar();
    await u.click(screen.getByRole("button", { name: /sortear contato/i }));
    await screen.findByText("Mensagem 100");

    await u.click(screen.getByRole("button", { name: /inserir link/i }));
    await u.type(
      await screen.findByRole("textbox", { name: /por que descartar/i }),
      "Contato sem interação do colaborador",
    );
    await u.click(screen.getByRole("button", { name: /descartar e inserir link/i }));
    await waitFor(() =>
      expect(descartar).toHaveBeenCalledWith({
        data: { sorteioId: "s-1", motivo: "Contato sem interação do colaborador" },
      }),
    );

    const campo = await screen.findByRole("textbox", { name: /cole o link/i });
    await u.type(campo, "https://app.intercom.com/a/inbox/x/inbox/conversation/200");
    await u.click(screen.getByRole("button", { name: /^buscar$/i }));

    await waitFor(() => expect(buscar).toHaveBeenCalledTimes(1));
    expect(buscar.mock.calls[0]![0]).toEqual({
      data: {
        employeeId: "emp-1",
        referencia: "https://app.intercom.com/a/inbox/x/inbox/conversation/200",
        tipo: "interacao",
        fortnightId: "q-1",
      },
    });
    await screen.findByText("Mensagem 200");
    expect(onContato).toHaveBeenLastCalledWith(
      expect.objectContaining({
        link: "https://app.intercom.com/a/inbox/x/inbox/conversation/200",
      }),
    );
  });
});

describe("o sorteio em aberto volta ao abrir o cartão (a brecha do recarregar)", () => {
  it("com um contato sorteado em aberto, ele aparece direto, e o campo do link não", async () => {
    emAberto.mockResolvedValue({ ...contato("300", "s-9"), jaEmAberto: true });
    const onContato = montar();
    await screen.findByText("Mensagem 300");
    expect(screen.queryByRole("textbox", { name: /cole o link/i })).toBeNull();
    expect(screen.getByRole("button", { name: /inserir link/i })).toBeTruthy();
    expect(onContato).toHaveBeenCalledWith(
      expect.objectContaining({
        link: "https://app.intercom.com/a/inbox/x/inbox/conversation/300",
      }),
    );
    expect(emAberto).toHaveBeenCalledWith({
      data: { employeeId: "emp-1", fortnightId: "q-1", tipo: "interacao" },
    });
  });
  it("sem sorteio em aberto, o cartão começa vazio, com o sorteio e o campo do link", async () => {
    montar();
    await waitFor(() => expect(emAberto).toHaveBeenCalled());
    expect(screen.getByRole("textbox", { name: /cole o link/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /sortear contato/i })).toBeTruthy();
  });
});
