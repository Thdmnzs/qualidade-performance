import { createVerify, generateKeyPairSync } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { rpc: vi.fn(async () => ({ data: {}, error: null })) },
}));

const { tarefaDiariaDaEscala } = await import("../escala.server");
const { assinaturaDoPedido } = await import("../google.server");

afterEach(() => {
  delete process.env["CRON_SECRET"];
});

describe("tarefa agendada da escala", () => {
  it("sem o segredo configurado, ninguém dispara", async () => {
    const r = await tarefaDiariaDaEscala(
      new Request("https://x/api/escala-diaria", { headers: { authorization: "Bearer qualquer" } }),
    );
    expect(r.status).toBe(401);
  });
  it("com o segredo errado (ou de outro tamanho), recusa", async () => {
    process.env["CRON_SECRET"] = "segredo-certo";
    for (const h of ["Bearer segredo-errad", "Bearer segredo-errado-longo", ""]) {
      const r = await tarefaDiariaDaEscala(
        new Request("https://x/api/escala-diaria", { headers: { authorization: h } }),
      );
      expect(r.status).toBe(401);
    }
  });
});

describe("assinatura do pedido ao Google (JWT RS256)", () => {
  it("assina com a chave da conta e pede só leitura das planilhas", () => {
    const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    const jwt = assinaturaDoPedido(
      { client_email: "qh@projeto.iam.gserviceaccount.com", private_key: pem },
      "https://www.googleapis.com/auth/spreadsheets.readonly",
      1_000,
    );
    const [cab, corpo, assinatura] = jwt.split(".");
    expect(JSON.parse(Buffer.from(cab!, "base64url").toString())).toEqual({
      alg: "RS256",
      typ: "JWT",
    });
    expect(JSON.parse(Buffer.from(corpo!, "base64url").toString())).toMatchObject({
      iss: "qh@projeto.iam.gserviceaccount.com",
      scope: "https://www.googleapis.com/auth/spreadsheets.readonly",
      aud: "https://oauth2.googleapis.com/token",
      exp: 4_600,
    });
    const v = createVerify("RSA-SHA256");
    v.update(`${cab}.${corpo}`);
    expect(v.verify(publicKey, Buffer.from(assinatura!, "base64url"))).toBe(true);
  });
});
