// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const navegar = vi.fn();
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => navegar }));
vi.mock("@/hooks/useAuth", () => ({
  usePermissoes: () => ({ perfil: "colaborador", employee: { id: "t", nome: "Thiago Dantas" } }),
}));
let dados = {
  pendencias: [
    {
      tipo: "troca_para_voce",
      id: "x1",
      titulo: "Amanda pediu uma troca com você",
      texto: "As folgas de 21/10 e 22/10",
      quando: new Date().toISOString(),
    },
  ],
  novidades: [
    {
      id: "n1",
      tipo: "resultado",
      titulo: "O resultado da 1ª quinzena de outubro saiu",
      texto: "Veja as suas avaliações.",
      quando: new Date().toISOString(),
      lida: false,
    },
    {
      id: "n2",
      tipo: "escala",
      titulo: "A escala de 19/10 a 25/10 foi publicada",
      texto: null,
      quando: new Date().toISOString(),
      lida: true,
    },
  ],
};
const api = {
  lerNotificacoes: vi.fn(async () => dados),
  marcarComoLidas: vi.fn(async (..._a: unknown[]) => {}),
};
vi.mock("@/lib/notificacoes-api", () => api);
const { CentralDeNotificacoes } = await import("../central-de-notificacoes");
const abrir = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <CentralDeNotificacoes />
    </QueryClientProvider>,
  );
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("a central de notificações", () => {
  it("a bolinha soma a ação e a novidade não lida", async () => {
    abrir();
    expect(await screen.findByRole("button", { name: "Notificações: 2 pendentes" })).toBeTruthy();
    expect(screen.getByText("2")).toBeTruthy();
  });
  it("abrir uma novidade a marca como lida e leva para a tela dela", async () => {
    abrir();
    fireEvent.click(await screen.findByRole("button", { name: /Notificações: 2/ }));
    fireEvent.click(
      await screen.findByRole("button", { name: /O resultado da 1ª quinzena de outubro saiu/ }),
    );
    await waitFor(() => expect(api.marcarComoLidas).toHaveBeenCalledWith(["n1"]));
    expect(navegar).toHaveBeenCalledWith({ to: "/minhas-avaliacoes" });
  });
  it("uma ação leva para a tela dela, sem marcar nada (ela fica até ser feita)", async () => {
    abrir();
    fireEvent.click(await screen.findByRole("button", { name: /Notificações: 2/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Amanda pediu uma troca com você/ }));
    expect(navegar).toHaveBeenCalledWith({ to: "/escala" });
    expect(api.marcarComoLidas).not.toHaveBeenCalled();
  });
  it("marcar as novidades como lidas; e a aba Para fazer esconde as novidades", async () => {
    abrir();
    fireEvent.click(await screen.findByRole("button", { name: /Notificações: 2/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Para fazer · 1" }));
    expect(screen.queryByText(/A escala de 19\/10/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Marcar as novidades como lidas" }));
    await waitFor(() => expect(api.marcarComoLidas).toHaveBeenCalledWith());
  });
  it("sem nada pendente, sem a bolinha", async () => {
    dados = { pendencias: [], novidades: [] };
    abrir();
    expect(await screen.findByRole("button", { name: "Notificações" })).toBeTruthy();
  });
});
