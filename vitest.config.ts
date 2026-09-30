import { defineConfig } from "vitest/config";

// Configuração só para testes: sem os plugins do app (TanStack Start, Nitro),
// que sobem servidores desnecessários para testar funções puras.
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
