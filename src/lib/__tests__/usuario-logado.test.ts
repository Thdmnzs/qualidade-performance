import { afterEach, describe, expect, it, vi } from "vitest";

let SESSAO: { user: { id: string } } | null = { user: { id: "thiago" } };
const getUser = vi.fn(async () => ({ data: { user: SESSAO?.user ?? null }, error: null }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: SESSAO } }), getUser: () => getUser() },
  },
}));
const { esquecerAConferencia, INTERVALO_DA_CONFERENCIA_MS, usuarioLogado } =
  await import("../usuario-logado");
afterEach(() => {
  esquecerAConferencia();
  vi.clearAllMocks();
  SESSAO = { user: { id: "thiago" } };
});

describe("a guarda das telas: o servidor de login confere no máximo a cada 5 minutos (23/10/2026)", () => {
  it("a primeira navegação confere; as seguintes, dentro de 5 minutos, não (a tela troca na hora)", async () => {
    const T = 1_000_000;
    expect((await usuarioLogado(T))?.id).toBe("thiago");
    expect((await usuarioLogado(T + 1_000))?.id).toBe("thiago");
    expect((await usuarioLogado(T + INTERVALO_DA_CONFERENCIA_MS - 1))?.id).toBe("thiago");
    expect(getUser).toHaveBeenCalledTimes(1);
  });
  it("depois de 5 minutos, confere de novo", async () => {
    await usuarioLogado(0);
    await usuarioLogado(INTERVALO_DA_CONFERENCIA_MS + 1);
    expect(getUser).toHaveBeenCalledTimes(2);
  });
  it("se a pessoa logada muda, confere de novo na hora", async () => {
    await usuarioLogado(0);
    SESSAO = { user: { id: "amanda" } };
    expect((await usuarioLogado(1_000))?.id).toBe("amanda");
    expect(getUser).toHaveBeenCalledTimes(2);
  });
  it("sem sessão, ninguém entra (e o servidor de login nem é chamado)", async () => {
    SESSAO = null;
    expect(await usuarioLogado(0)).toBeNull();
    expect(getUser).not.toHaveBeenCalled();
  });
  it("se o servidor de login recusar (a sessão foi encerrada em outro lugar), ninguém entra", async () => {
    getUser.mockResolvedValueOnce({
      data: { user: null },
      error: { message: "sessão inválida" },
    } as never);
    expect(await usuarioLogado(0)).toBeNull();
  });
});
