import { describe, expect, it, vi } from "vitest";

const rpc = vi.fn(async (_n: string, a: { _user_id: string }) => ({
  data: a._user_id === "da-troca",
  error: null,
}));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { rpc: (n: string, a: { _user_id: string }) => rpc(n, a) },
}));
const { podeAvisarTroca } = await import("../central-de-turnos.server");

describe("o aviso das trocas (21/10/2026, a revisão de segurança)", () => {
  it("só quem é da troca (ou um ADM) pode disparar; a conferência é do banco", async () => {
    expect(await podeAvisarTroca("t1", "da-troca")).toBe(true);
    expect(await podeAvisarTroca("t1", "outra-pessoa")).toBe(false);
    expect(rpc).toHaveBeenCalledWith("pode_avisar_troca", { _id: "t1", _user_id: "outra-pessoa" });
  });
});
