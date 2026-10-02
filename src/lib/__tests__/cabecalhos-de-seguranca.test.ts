import { describe, expect, it } from "vitest";
import { CABECALHOS_DE_SEGURANCA, comCabecalhosDeSeguranca, CSP } from "../cabecalhos-de-seguranca";

describe("cabeçalhos de segurança", () => {
  it("aplica todos, mantendo o status, o corpo e os cabeçalhos originais", async () => {
    const original = new Response("<p>ok</p>", {
      status: 404,
      headers: { "content-type": "text/html" },
    });
    const r = comCabecalhosDeSeguranca(original);
    expect(r.status).toBe(404);
    expect(r.headers.get("content-type")).toBe("text/html");
    expect(await r.text()).toBe("<p>ok</p>");
    for (const [nome, valor] of Object.entries(CABECALHOS_DE_SEGURANCA))
      expect(r.headers.get(nome)).toBe(valor);
  });
  it("funciona com cabeçalhos imutáveis (como os de uma resposta de fetch)", () => {
    const imutavel = Response.redirect("https://example.com/", 302); // cabeçalhos "immutable"
    expect(() => imutavel.headers.set("x", "y")).toThrow();
    expect(comCabecalhosDeSeguranca(imutavel).headers.get("X-Frame-Options")).toBe("DENY");
  });
  it("a CSP proíbe ser embutida em outro site e plugins, e só fala com o próprio domínio e o Supabase", () => {
    expect(CSP).toContain("frame-ancestors 'none'");
    expect(CSP).toContain("object-src 'none'");
    expect(CSP).toMatch(/connect-src 'self' https:\/\/zugwegvitdqkkeqttuez\.supabase\.co wss:/);
    expect(CSP).not.toMatch(/\*/); // nenhum curinga
  });
});
