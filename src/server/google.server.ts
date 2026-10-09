/**
 * Autenticação de uma conta de serviço do Google (07/10/2026), só no servidor.
 *
 * Usa o fluxo JWT da conta de serviço com a criptografia do próprio Node.js
 * (sem biblioteca nova). A chave fica em GOOGLE_SERVICE_ACCOUNT_JSON (o JSON
 * baixado no Google Cloud), cadastrada na Vercel como segredo. Reaproveitada pela
 * escala (10/10/2026) e, depois, pela importação dos indicadores.
 */
import { createSign } from "node:crypto";

export class ErroDoGoogle extends Error {}

const b64url = (s: string | Buffer) => Buffer.from(s).toString("base64url");
let guardado: { escopo: string; token: string; expira: number } | null = null;

type Credencial = { client_email: string; private_key: string };

function credencial(): Credencial {
  const bruto = process.env["GOOGLE_SERVICE_ACCOUNT_JSON"];
  if (!bruto) throw new ErroDoGoogle("A conta de serviço do Google ainda não foi configurada.");
  try {
    const c = JSON.parse(bruto) as Partial<Credencial>;
    if (!c.client_email || !c.private_key) throw new Error();
    return { client_email: c.client_email, private_key: c.private_key };
  } catch {
    throw new ErroDoGoogle("A chave da conta de serviço do Google está num formato inválido.");
  }
}

/** A "assinatura" do pedido de acesso (JWT RS256), exposta para o teste. */
export function assinaturaDoPedido(c: Credencial, escopo: string, agora: number): string {
  const cabecalho = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const corpo = b64url(
    JSON.stringify({
      iss: c.client_email,
      scope: escopo,
      aud: "https://oauth2.googleapis.com/token",
      iat: agora,
      exp: agora + 3600,
    }),
  );
  const assinador = createSign("RSA-SHA256");
  assinador.update(`${cabecalho}.${corpo}`);
  return `${cabecalho}.${corpo}.${b64url(assinador.sign(c.private_key))}`;
}

/** Um token de acesso, guardado até perto de expirar. */
export async function tokenDoGoogle(escopo: string): Promise<string> {
  const agora = Math.floor(Date.now() / 1000);
  if (guardado && guardado.escopo === escopo && guardado.expira - 60 > agora) return guardado.token;
  const assertion = assinaturaDoPedido(credencial(), escopo, agora);
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!r.ok) throw new ErroDoGoogle(`O Google recusou a conta de serviço (código ${r.status}).`);
  const j = (await r.json()) as { access_token?: string; expires_in?: number };
  if (!j.access_token) throw new ErroDoGoogle("O Google não devolveu o token de acesso.");
  guardado = { escopo, token: j.access_token, expira: agora + (j.expires_in ?? 3600) };
  return j.access_token;
}

/** Só para os testes: esquece o token guardado. */
export function esquecerTokenDoGoogle() {
  guardado = null;
}
