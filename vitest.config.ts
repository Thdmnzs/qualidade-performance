import { defineConfig } from "vitest/config";

// Configuração só para testes: sem os plugins do app (TanStack Start, Nitro),
// que sobem servidores desnecessários para testar funções puras.
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    // Os testes de componentes (.test.tsx) escolhem o ambiente do navegador no próprio arquivo.
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    environment: "node",
  },
});
