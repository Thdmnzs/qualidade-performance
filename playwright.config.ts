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
    trace: "retain-on-failure", // numa falha, a gravação passo a passo (para ver o que aconteceu)
    screenshot: "only-on-failure",
    locale: "pt-BR",
    timezoneId: "America/Fortaleza",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
