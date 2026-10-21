// @vitest-environment jsdom
import { INATIVIDADE_MS } from "@/lib/expiracao-da-sessao";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const navegar = vi.fn();
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => navegar }));
const sair = vi.fn(async (_opcoes?: unknown) => ({ error: null }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { signOut: (o: unknown) => sair(o) } },
}));

const { VigiaDaSessao } = await import("../vigia-da-sessao");
const { lerRegistro } = await import("@/lib/expiracao-da-sessao");
const MIN = 60_000;

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: false });
  vi.setSystemTime(new Date("2026-10-09T11:00:00Z"));
  window.localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});
const passar = async (ms: number) =>
  act(async () => {
    vi.advanceTimersByTime(ms);
  });

describe("o vigia da sessão", () => {
  it("abrir a página registra o início e o uso", () => {
    render(<VigiaDaSessao userId="u1" />);
    expect(lerRegistro("u1")).toEqual({ inicio: Date.now(), atividade: Date.now() });
  });
  it("meio minuto antes do prazo sem uso: o aviso, com 'Continuar conectado'", async () => {
    render(<VigiaDaSessao userId="u1" />);
    await passar(INATIVIDADE_MS - 0.5 * MIN);
    expect(screen.getByText("Você ainda está aí?")).toBeTruthy();
    expect(sair).not.toHaveBeenCalled();
  });
  it("'Continuar conectado' renova o prazo, e o aviso some", async () => {
    render(<VigiaDaSessao userId="u1" />);
    await passar(INATIVIDADE_MS - 0.5 * MIN);
    fireEvent.click(screen.getByRole("button", { name: "Continuar conectado" }));
    await passar(10 * MIN);
    expect(screen.queryByText("Você ainda está aí?")).toBeNull();
    expect(sair).not.toHaveBeenCalled();
  });
  it("no prazo sem uso: encerra só esta sessão e vai para o login, com o motivo", async () => {
    render(<VigiaDaSessao userId="u1" />);
    await passar(INATIVIDADE_MS + 5_000);
    expect(sair).toHaveBeenCalledWith({ scope: "local" });
    expect(navegar).toHaveBeenCalledWith({
      to: "/auth",
      search: { motivo: "inatividade" },
      replace: true,
    });
    expect(lerRegistro("u1")).toBeNull();
  });
  it("o uso (um clique, uma tecla) adia o encerramento", async () => {
    render(<VigiaDaSessao userId="u1" />);
    await passar(20 * MIN);
    fireEvent.keyDown(window);
    await passar(20 * MIN);
    expect(sair).not.toHaveBeenCalled();
  });
  it("mesmo em uso, as 9 horas encerram a sessão (pelo limite)", async () => {
    render(<VigiaDaSessao userId="u1" />);
    for (let i = 0; i < 9 * 4; i++) {
      await passar(15 * MIN);
      fireEvent.pointerDown(window);
    }
    await passar(10_000);
    expect(navegar).toHaveBeenCalledWith({
      to: "/auth",
      search: { motivo: "limite" },
      replace: true,
    });
  });
});
