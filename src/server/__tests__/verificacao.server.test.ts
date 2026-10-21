import { afterEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn(async (n: string, _a?: unknown) => ({
  data: n === "is_admin" ? true : n === "usar_codigo_de_recuperacao" ? true : null,
  error: null,
}));
const listFactors = vi.fn(async () => ({ data: { factors: [{ id: "f1" }] }, error: null }));
const deleteFactor = vi.fn(async (_a: unknown) => ({ error: null }));
const insert = vi.fn(async (_a: unknown) => ({ error: null }));
const signIn = vi.fn(async (_a: unknown) => ({ data: { user: { id: "adm" } }, error: null }));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    rpc: (n: string, a?: unknown) => rpc(n, a),
    auth: {
      admin: {
        mfa: { listFactors: () => listFactors(), deleteFactor: (a: unknown) => deleteFactor(a) },
      },
    },
    from: () => {
      const c: Record<string, unknown> = {};
      for (const m of ["select", "eq", "not"]) c[m] = () => c;
      c["maybeSingle"] = async () => ({ data: { user_id: "alvo", nome: "Amanda Silva" } });
      c["insert"] = (a: unknown) => insert(a);
      return c;
    },
  },
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: { signInWithPassword: (a: unknown) => signIn(a), signOut: async () => ({}) },
  }),
}));
process.env["SUPABASE_URL"] = "https://x.supabase.co";
process.env["SUPABASE_PUBLISHABLE_KEY"] = "chave";
const { desligarVerificacao, gerarCodigosDeRecuperacao, usarCodigoDeRecuperacao } =
  await import("../verificacao.server");
afterEach(() => vi.clearAllMocks());
const DESLIGAR = {
  admId: "adm",
  admEmail: "carol@fluke.com.br",
  aal: "aal2",
  senha: "a-senha",
  employeeId: "11111111-1111-4111-8111-111111111111",
};

describe("os códigos de recuperação, no servidor", () => {
  it("gera e guarda os 10, só numa sessão com o código (aal2)", async () => {
    const codigos = await gerarCodigosDeRecuperacao({ userId: "u", aal: "aal2" });
    expect(codigos).toHaveLength(10);
    expect(rpc).toHaveBeenCalledWith("guardar_codigos_de_recuperacao", {
      _user_id: "u",
      _codigos: codigos,
    });
    await expect(gerarCodigosDeRecuperacao({ userId: "u", aal: "aal1" })).rejects.toThrow(
      /Confirme o código/,
    );
  });
  it("um código válido desliga o aplicativo antigo; um inválido, não", async () => {
    expect(await usarCodigoDeRecuperacao({ userId: "u", codigo: "r4tp 2wza" })).toBe(true);
    expect(rpc).toHaveBeenCalledWith("usar_codigo_de_recuperacao", {
      _user_id: "u",
      _codigo: "R4TP-2WZA",
    });
    expect(deleteFactor).toHaveBeenCalledWith({ id: "f1", userId: "u" });
    vi.clearAllMocks();
    rpc.mockResolvedValueOnce({ data: false, error: null });
    expect(await usarCodigoDeRecuperacao({ userId: "u", codigo: "AAAA-BBBB" })).toBe(false);
    expect(deleteFactor).not.toHaveBeenCalled();
    expect(await usarCodigoDeRecuperacao({ userId: "u", codigo: "curto" })).toBe(false);
  });
});

describe("o desligamento pelo ADM", () => {
  it("com a senha certa: desliga o aplicativo, apaga os códigos e as sessões, e registra no Histórico", async () => {
    await desligarVerificacao(DESLIGAR);
    expect(signIn).toHaveBeenCalledWith({ email: "carol@fluke.com.br", password: "a-senha" });
    expect(deleteFactor).toHaveBeenCalledWith({ id: "f1", userId: "alvo" });
    expect(rpc).toHaveBeenCalledWith("apagar_codigos_e_sessoes", { _user_id: "alvo" });
    expect(rpc).toHaveBeenCalledWith("registrar_no_historico", {
      _usuario_id: "adm",
      _acao: "verificacao_desligada",
      _entidade: "verificacao",
      _registro_id: DESLIGAR.employeeId,
      _valor_novo: { colaborador: "Amanda Silva" },
    });
    expect(insert).not.toHaveBeenCalled(); // pela função do banco, e nunca direto na tabela
  });
  it("com a senha errada: nada é desligado", async () => {
    signIn.mockResolvedValueOnce({
      data: { user: null },
      error: { code: "invalid_credentials" },
    } as never);
    await expect(desligarVerificacao(DESLIGAR)).rejects.toThrow("A sua senha está incorreta.");
    expect(deleteFactor).not.toHaveBeenCalled();
  });
  it("numa sessão sem o código (aal1), ou de quem não é ADM: recusado", async () => {
    await expect(desligarVerificacao({ ...DESLIGAR, aal: "aal1" })).rejects.toThrow(
      /Confirme o código/,
    );
    rpc.mockResolvedValueOnce({ data: false, error: null });
    await expect(desligarVerificacao(DESLIGAR)).rejects.toThrow(/Apenas administradores/);
    expect(signIn).not.toHaveBeenCalled();
  });
  it("o ADM não desliga a própria verificação", async () => {
    await expect(desligarVerificacao({ ...DESLIGAR, admId: "alvo" })).rejects.toThrow();
  });
});
