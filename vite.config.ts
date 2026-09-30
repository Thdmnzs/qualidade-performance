import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { nitro } from "nitro/vite";

// Ordem importa: tanstackStart precisa vir antes do plugin do React.
export default defineConfig({
  server: { port: 3000 },
  plugins: [
    tsConfigPaths(),
    tanstackStart({
      // Usa src/server.ts (tratamento de erros de SSR) como entrada do servidor.
      server: { entry: "server" },
    }),
    // Gera a saída no formato da Vercel (.vercel/output), com SSR em Vercel Functions.
    nitro({ preset: "vercel" }),
    viteReact(),
    tailwindcss(),
  ],
});
