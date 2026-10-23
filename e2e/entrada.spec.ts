import { expect, test } from "@playwright/test";

import { entrar } from "./ajudantes";

test("a entrada: a senha, o código do celular, e a gestão", async ({ page }) => {
  await entrar(page);
  await expect(page).toHaveURL(/\/admin/);
  await expect(page.getByRole("navigation").first()).toBeVisible();
});

test("sem a sessão, a área logada manda para a entrada", async ({ page }) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/auth/, { timeout: 15_000 });
});
