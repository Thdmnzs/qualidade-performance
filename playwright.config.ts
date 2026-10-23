/**
 * Os testes de ponta a ponta (23/10/2026): um navegador de verdade, no site de verdade (o endereço vem do
 * E2E_URL). Rodam no GitHub, depois de cada deploy (o .github/workflows/e2e.yml). A conta é a "Admin Teste".
 */
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  retries: 1, // uma segunda chance contra uma lentidão da rede (e não contra um erro de verdade)
  workers: 1, // um teste por vez: todos usam a mesma conta
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: process.env["E2E_URL"] ?? "https://qualidade-performance.vercel.app",
    // A gravação passo a passo fica DESLIGADA (23/10/2026): ela guarda o corpo dos pedidos, e o de login leva a senha.
    // O que o servidor de login respondeu vai para o registro do GitHub, sem os dados (o ouvirOServidorDeLogin).
    trace: "off",
    screenshot: "only-on-failure",
    locale: "pt-BR",
    timezoneId: "America/Fortaleza",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
