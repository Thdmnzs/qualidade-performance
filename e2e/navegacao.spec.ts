import { expect, test } from "@playwright/test";

import { entrar } from "./ajudantes";

// O problema do vídeo de 23/10/2026: o endereço mudava, mas a tela ficava presa na anterior, um clique atrasada.
const MENU: [string, RegExp][] = [
  ["Avaliações", /\/admin\/avaliacoes/],
  ["Indicadores", /\/admin\/indicadores/],
  ["Escala", /\/escala/],
  ["Ranking", /\/ranking/],
  ["Histórico", /\/admin\/historico/],
  ["Colaboradores", /\/admin\/colaboradores/],
  ["Visão geral", /\/admin\/?$/],
];

test("o menu: cada clique troca a tela, na hora", async ({ page }) => {
  await entrar(page);
  const titulo = page.locator("main h1").first();
  for (const [item, endereco] of MENU) {
    const antes = (await titulo.textContent())?.trim();
    await page.getByRole("link", { name: item, exact: true }).first().click();
    await expect(page, `o endereço de ${item}`).toHaveURL(endereco);
    // A tela nova aparece em até 3 segundos (e não fica a anterior, com o endereço novo).
    await expect(titulo, `a tela de ${item} apareceu`).not.toHaveText(antes ?? "", {
      timeout: 3_000,
    });
  }
});
