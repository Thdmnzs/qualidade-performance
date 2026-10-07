/**
 * Tarefa agendada da Vercel (vercel.json): lê a escala todo dia às 7h (10h UTC).
 * Protegida pelo segredo CRON_SECRET; sem ele, responde 401.
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/escala-diaria")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { tarefaDiariaDaEscala } = await import("@/server/escala.server");
        return tarefaDiariaDaEscala(request);
      },
    },
  },
});
