/**
 * Tarefa agendada da Vercel (vercel.json): todo dia às 10h (13h UTC), a leitura da planilha dos indicadores
 * (23/10/2026). Só com o segredo CRON_SECRET; sem ele, responde 401.
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/ler-planilha")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { tarefaDaPlanilha } = await import("@/server/planilha-indicadores.server");
        return tarefaDaPlanilha(request);
      },
    },
  },
});
