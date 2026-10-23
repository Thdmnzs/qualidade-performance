import { expect, test } from "@playwright/test";

import { apagarDaTela, entrar, SENHAS } from "./ajudantes";

// O problema de 22/10/2026: a troca de senha falhava para quem tem a verificação em duas etapas.
async function trocar(page: import("@playwright/test").Page, atual: string, nova: string) {
  await page.getByRole("button", { name: /Menu do usuário/ }).click();
  await page.getByRole("menuitem", { name: "Alterar a senha" }).click();
  await page.getByLabel("Senha atual").fill(atual);
  await page.getByLabel("Nova senha", { exact: true }).fill(nova);
  await page.getByLabel("Confirme a nova senha").fill(nova);
  await page.getByRole("button", { name: "Alterar senha" }).click();
  await apagarDaTela(
    page,
    { label: "Senha atual" },
    { label: "Nova senha" },
    { label: "Confirme a nova senha" },
  );
  await expect(page.getByText(/Senha alterada/)).toBeVisible({ timeout: 20_000 });
}

test("a troca de senha (com a verificação em duas etapas), e a volta", async ({ page }) => {
  const atual = await entrar(page);
  const [a, b] = SENHAS();
  const nova = atual === a ? b : a;
  await trocar(page, atual, nova);
  // Confere que a senha nova vale (sai e entra), e volta para a de antes (a conta fica como estava).
  await page.context().clearCookies();
  await page.evaluate(() => localStorage.clear());
  expect(await entrar(page)).toBe(nova);
  await trocar(page, nova, atual);
});
