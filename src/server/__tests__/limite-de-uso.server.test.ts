import { afterEach, describe, expect, it, vi } from "vitest";

let resposta: { data: unknown; error: { message: string } | null } = { data: true, error: null };
const rpc = vi.fn(async (..._a: unknown[]) => resposta);
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { rpc: (...a: unknown[]) => rpc(...a) },
}));
const { consumirLimite } = await import("../limite-de-uso.server");
afterEach(() => vi.clearAllMocks());

describe("o limite de uso", () => {
  it("pergunta ao banco com a chave, o máximo e a janela", async () => {
    resposta = { data: true, error: null };
    expect(await consumirLimite("pre_avaliacao:ana", 30, 3600)).toBe(true);
    expect(rpc).toHaveBeenCalledWith("consumir_limite_de_uso", {
      _chave: "pre_avaliacao:ana",
      _maximo: 30,
      _janela_em_segundos: 3600,
    });
  });
  it("passou do limite: recusa", async () => {
    resposta = { data: false, error: null };
    expect(await consumirLimite("pre_avaliacao:ana", 30, 3600)).toBe(false);
  });
  it("se o contador falhar, a função segue (e o erro vai para o registro)", async () => {
    resposta = { data: null, error: { message: "o banco caiu" } };
    const registro = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await consumirLimite("pre_avaliacao:ana", 30, 3600)).toBe(true);
    expect(registro).toHaveBeenCalled();
    registro.mockRestore();
  });
});
