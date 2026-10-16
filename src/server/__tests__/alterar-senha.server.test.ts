import { afterEach, describe, expect, it, vi } from "vitest";

// A sessão separada (o Supabase simulado) e o banco (o Histórico)
let entrar: { data: { user: { id: string } | null }; error: { code?: string } | null };
let trocar: { error: { code?: string } | null };
const signInWithPassword = vi.fn(async (_a: unknown) => entrar);
const updateUser = vi.fn(async (_a: unknown) => trocar);
const signOut = vi.fn(async (_a: unknown) => ({ error: null }));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ auth: { signInWithPassword, updateUser, signOut } }),
}));
const insert = vi.fn(async (_a: unknown) => ({ error: null }));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: (t: string) =>
      t === "employees"
        ? {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: { id: "e1", nome: "Thiago Dantas" } }),
              }),
            }),
          }
        : { insert: (a: unknown) => insert(a) },
  },
}));
process.env["SUPABASE_URL"] = "https://exemplo.supabase.co";
process.env["SUPABASE_PUBLISHABLE_KEY"] = "chave-publica";
const { alterarSenha, ErroDaTroca } = await import("../alterar-senha.server");
const PEDIDO = {
  userId: "u1",
  email: "thiago@fluke.com",
  atual: "Antiga!2025x",
  nova: "Nova!Senha2026",
};
afterEach(() => vi.clearAllMocks());

describe("a troca de senha no servidor", () => {
  it("confere a senha atual numa sessão separada, troca por ela, encerra a sessão e registra (sem a senha)", async () => {
    entrar = { data: { user: { id: "u1" } }, error: null };
    trocar = { error: null };
    await alterarSenha(PEDIDO);
    expect(signInWithPassword).toHaveBeenCalledWith({
      email: "thiago@fluke.com",
      password: "Antiga!2025x",
    });
    expect(updateUser).toHaveBeenCalledWith({ password: "Nova!Senha2026" });
    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
    const registro = insert.mock.calls[0]![0] as Record<string, unknown>;
    expect(registro).toMatchObject({ acao: "senha_alterada", usuario_id: "u1" });
    expect(JSON.stringify(registro)).not.toContain("Senha"); // nenhuma senha no Histórico
  });
  it("a senha atual errada: nada é trocado", async () => {
    entrar = { data: { user: null }, error: { code: "invalid_credentials" } };
    await expect(alterarSenha(PEDIDO)).rejects.toMatchObject({ codigo: "senha_atual" });
    expect(updateUser).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });
  it("a senha de OUTRA pessoa (o e-mail não é o da sessão): nada é trocado", async () => {
    entrar = { data: { user: { id: "outra" } }, error: null };
    await expect(alterarSenha(PEDIDO)).rejects.toBeInstanceOf(ErroDaTroca);
    expect(updateUser).not.toHaveBeenCalled();
  });
  it("uma nova fraca (ou igual à atual) é recusada antes de ir ao Supabase", async () => {
    await expect(alterarSenha({ ...PEDIDO, nova: "fraca" })).rejects.toMatchObject({
      codigo: "weak_password",
    });
    await expect(alterarSenha({ ...PEDIDO, nova: PEDIDO.atual })).rejects.toMatchObject({
      codigo: "same_password",
    });
    expect(signInWithPassword).not.toHaveBeenCalled();
  });
  it("o Supabase recusa a nova (a política dele): o erro volta, e a sessão separada é encerrada mesmo assim", async () => {
    entrar = { data: { user: { id: "u1" } }, error: null };
    trocar = { error: { code: "weak_password" } };
    await expect(alterarSenha(PEDIDO)).rejects.toMatchObject({ codigo: "weak_password" });
    expect(signOut).toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });
});
