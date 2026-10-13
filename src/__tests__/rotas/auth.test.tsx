// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// O roteador e o Supabase, simulados.
const navegar = vi.fn();
let motivoNaUrl: Record<string, string> = {};
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (opcoes: Record<string, unknown>) => ({
    options: opcoes,
    useSearch: () => motivoNaUrl,
  }),
  useNavigate: () => navegar,
}));
let perfil = "colaborador";
const sair = vi.fn(async () => ({ error: null }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getUser: async () => ({ data: { user: null } }),
      signInWithPassword: async () => ({ error: null }),
      signOut: () => sair(),
    },
    rpc: async () => ({ data: perfil, error: null }),
  },
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), info: vi.fn(), success: vi.fn() } }));

const { Route } = await import("@/routes/auth");
const Pagina = (Route as unknown as { options: { component: () => React.ReactElement } }).options
  .component;

async function entrarPela(aba: "Colaborador" | "Avaliador") {
  const u = userEvent.setup();
  render(<Pagina />);
  await u.click(screen.getByRole("tab", { name: new RegExp(aba, "i") }));
  await u.type(screen.getByLabelText(/email/i), "thiago@flukeoperadora.com.br");
  await u.type(screen.getByLabelText(/^senha/i), "uma-senha-qualquer");
  await u.click(screen.getByRole("button", { name: /^entrar$/i }));
  return u;
}

beforeEach(() => {
  perfil = "colaborador";
  motivoNaUrl = {};
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("a aba errada bloqueia o login", () => {
  it("o colaborador pela aba Avaliador fica no login, com a orientação, e a sessão é encerrada", async () => {
    await entrarPela("Avaliador");
    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "Este acesso é de colaborador. Escolha a aba Colaborador para entrar.",
    );
    expect(sair).toHaveBeenCalledTimes(1);
    expect(navegar).not.toHaveBeenCalled();
  });
  it("ao trocar de aba, a mensagem some", async () => {
    const u = await entrarPela("Avaliador");
    await screen.findByRole("alert");
    await u.click(screen.getByRole("tab", { name: /colaborador/i }));
    expect(screen.queryByRole("alert")).toBeNull();
  });
  it("o colaborador pela aba certa entra na Visão geral", async () => {
    await entrarPela("Colaborador");
    await waitFor(() => expect(navegar).toHaveBeenCalledWith({ to: "/painel", replace: true }));
    expect(sair).not.toHaveBeenCalled();
  });
  it("o ADM pela aba Colaborador também é bloqueado", async () => {
    perfil = "adm";
    await entrarPela("Colaborador");
    expect((await screen.findByRole("alert")).textContent).toBe(
      "O perfil ADM entra pela aba Avaliador.",
    );
    expect(navegar).not.toHaveBeenCalled();
  });
});

describe("a sessão encerrada pelo prazo", () => {
  it("a tela de login explica o motivo", () => {
    motivoNaUrl = { motivo: "inatividade" };
    render(<Pagina />);
    expect(screen.getByRole("status").textContent).toBe(
      "Sua sessão foi encerrada depois de 30 minutos sem uso. Entre novamente.",
    );
  });
});
