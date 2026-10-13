import { describe, expect, it } from "vitest";
import { CABECALHOS_DE_SEGURANCA, comCabecalhosDeSeguranca, CSP } from "../cabecalhos-de-seguranca";

describe("os cabeçalhos de segurança", () => {
  it("a CSP BLOQUEIA (não só observa)", () => {
    expect(CABECALHOS_DE_SEGURANCA["Content-Security-Policy"]).toBe(CSP);
    expect(CABECALHOS_DE_SEGURANCA).not.toHaveProperty("Content-Security-Policy-Report-Only");
  });
  it("as conexões e os scripts só do próprio site e do Supabase", () => {
    expect(CSP).toContain("default-src 'self'");
    expect(CSP).toMatch(
      /connect-src 'self' https:\/\/[a-z0-9]+\.supabase\.co wss:\/\/[a-z0-9]+\.supabase\.co(;|$)/,
    );
    expect(CSP).not.toMatch(/script-src[^;]*https?:/);
  });
  it("ninguém embute o site em outro, nem troca a base dos links", () => {
    expect(CSP).toContain("frame-ancestors 'none'");
    expect(CSP).toContain("base-uri 'self'");
    expect(CSP).toContain("object-src 'none'");
    expect(CABECALHOS_DE_SEGURANCA["X-Frame-Options"]).toBe("DENY");
  });
  it("aplicados a qualquer resposta, sem perder o corpo nem o código", async () => {
    const r = comCabecalhosDeSeguranca(
      new Response("ok", { status: 201, headers: { "content-type": "text/plain" } }),
    );
    expect(r.status).toBe(201);
    expect(await r.text()).toBe("ok");
    expect(r.headers.get("content-security-policy")).toBe(CSP);
    expect(r.headers.get("strict-transport-security")).toContain("max-age=63072000");
    expect(r.headers.get("content-type")).toBe("text/plain");
  });
});

describe("os arquivos estáticos (o vercel.json)", () => {
  it("recebem exatamente os mesmos cabeçalhos do servidor", async () => {
    const { readFileSync } = await import("node:fs");
    const { CABECALHOS_DE_SEGURANCA } = await import("../cabecalhos-de-seguranca");
    const v = JSON.parse(readFileSync("vercel.json", "utf8")) as {
      headers: { source: string; headers: { key: string; value: string }[] }[];
    };
    expect(v.headers.length).toBeGreaterThan(0);
    for (const grupo of v.headers)
      expect(Object.fromEntries(grupo.headers.map((h) => [h.key, h.value]))).toEqual(
        CABECALHOS_DE_SEGURANCA,
      );
  });
  it("e só nos caminhos dos arquivos estáticos (as páginas recebem pelo servidor, sem repetir)", async () => {
    const { readFileSync } = await import("node:fs");
    const v = JSON.parse(readFileSync("vercel.json", "utf8")) as { headers: { source: string }[] };
    for (const g of v.headers) expect(g.source).not.toBe("/(.*)");
  });
});
