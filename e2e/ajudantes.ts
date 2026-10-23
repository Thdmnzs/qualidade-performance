/** As ajudas dos testes de ponta a ponta: os segredos (do GitHub), a entrada com o código do celular. */
import { expect, type Page } from "@playwright/test";

import { base32ParaBytes, codigoDoCelular } from "./codigo-do-celular";

export function segredo(nome: string): string {
  const v = process.env[nome];
  if (!v)
    throw new Error(
      `Falta o segredo ${nome} (no GitHub: Settings → Secrets and variables → Actions).`,
    );
  return v;
}
export const EMAIL = () => segredo("E2E_EMAIL");
/** A conta alterna entre duas senhas (o teste da troca de senha troca e destroca). */
export const SENHAS = () => [segredo("E2E_SENHA"), segredo("E2E_SENHA_2")] as const;

let ultimoCodigo = "";
/** O código do celular de agora. Um código já usado não vale de novo: espera o próximo (no máximo 30 s). */
export async function codigoNovo(): Promise<string> {
  const chave = base32ParaBytes(segredo("E2E_TOTP_SECRET"));
  for (;;) {
    const restante = 30_000 - (Date.now() % 30_000);
    const c = codigoDoCelular(chave);
    if (c !== ultimoCodigo && restante > 3_000) return (ultimoCodigo = c);
    await new Promise((r) => setTimeout(r, restante + 500));
  }
}

/** Entra no CX Hub (a senha e o código do celular). Devolve a senha que funcionou. */
export async function entrar(page: Page): Promise<string> {
  for (const senha of SENHAS()) {
    await page.goto("/auth");
    // A conta de teste é ADM, e o ADM entra pela aba "avaliador" (a "colaborador" vem marcada).
    await page.getByRole("tab", { name: "avaliador" }).click();
    await page.getByPlaceholder("seu@email.com").fill(EMAIL());
    await page.getByPlaceholder("Digite sua senha").fill(senha);
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    const resultado = await Promise.race([
      page.waitForURL(/\/verificar/, { timeout: 15_000 }).then(() => "codigo" as const),
      page
        .getByText(/incorret|inválid/i)
        .first()
        .waitFor({ timeout: 15_000 })
        .then(() => "senha errada" as const),
      page
        .getByText(/entra pela aba/i)
        .first()
        .waitFor({ timeout: 15_000 })
        .then(() => "aba errada" as const),
    ]).catch(() => "nada" as const);
    if (resultado === "senha errada") continue;
    expect(resultado, "a conta de teste entrou pela aba errada do login").not.toBe("aba errada");
    expect(resultado, "depois da senha, o CX Hub pede o código do celular").toBe("codigo");
    await page.getByLabel("O código de 6 dígitos").fill(await codigoNovo());
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await page.waitForURL((u) => !/\/(auth|verificar)/.test(u.pathname), { timeout: 20_000 });
    return senha;
  }
  throw new Error("Nenhuma das duas senhas da conta de teste funcionou.");
}
