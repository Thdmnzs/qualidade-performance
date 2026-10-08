/**
 * Tarefa agendada da Vercel (vercel.json): todo dia às 8h (11h UTC), os lembretes
 * do dia do prazo e os avisos de contestação que se perderam. Protegida pelo
 * segredo CRON_SECRET; sem ele, responde 401.
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/avisos-contestacoes")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { tarefaDosAvisos } = await import("@/server/avisos-contestacao.server");
        return tarefaDosAvisos(request);
      },
    },
  },
});
