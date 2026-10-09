import { afterEach, describe, expect, it, vi } from "vitest";

const { consultarPrefixo } = await import("../senha.server");
afterEach(() => vi.unstubAllGlobals());

describe("consultarPrefixo (o intermediário)", () => {
  it("pergunta só pelo prefixo, com o enchimento ligado", async () => {
    const pedidos: { url: string; headers: Record<string, string> }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, op: RequestInit) => {
        pedidos.push({ url, headers: op.headers as Record<string, string> });
        return new Response("1E4C9B93F3F0682250B6CF8331B7EE68FD8:10434004", { status: 200 });
      }),
    );
    expect(await consultarPrefixo("5BAA6")).toContain("1E4C9B");
    expect(pedidos[0]!.url).toBe("https://api.pwnedpasswords.com/range/5BAA6");
    expect(pedidos[0]!.headers["Add-Padding"]).toBe("true");
  });
  it("recusa qualquer coisa que não seja um prefixo de 5 caracteres (nada além disso sai do servidor)", async () => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    await expect(consultarPrefixo("5BAA61E4C9B93F3F")).rejects.toThrow("Prefixo inválido");
    await expect(consultarPrefixo("../../x")).rejects.toThrow("Prefixo inválido");
    expect(f).not.toHaveBeenCalled();
  });
  it("o serviço fora do ar vira um erro conhecido (a tela deixa salvar)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { status: 503 })),
    );
    await expect(consultarPrefixo("5BAA6")).rejects.toThrow("respondeu 503");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("rede");
      }),
    );
    await expect(consultarPrefixo("5BAA6")).rejects.toThrow("não respondeu");
  });
});
