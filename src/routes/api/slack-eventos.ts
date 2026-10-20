/**
 * Os avisos do Slack (20/10/2026): o Slack chama este endereço a cada mudança no #cx_mural. Conferido pela
 * assinatura secreta (SLACK_SIGNING_SECRET); sem ela, ou com ela errada, responde 401 e não faz nada.
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/slack-eventos")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { assinaturaValida, tratarEvento } = await import("@/server/slack-mural.server");
        const corpo = await request.text();
        const segredo = process.env["SLACK_SIGNING_SECRET"] ?? "";
        if (
          !assinaturaValida({
            corpo,
            momento: request.headers.get("x-slack-request-timestamp"),
            assinatura: request.headers.get("x-slack-signature"),
            segredo,
          })
        )
          return new Response("assinatura inválida", { status: 401 });
        let dados: {
          type?: string;
          challenge?: string;
          event?: Parameters<typeof tratarEvento>[0];
        };
        try {
          dados = JSON.parse(corpo);
        } catch {
          return new Response("corpo inválido", { status: 400 });
        }
        // A verificação do endereço, na configuração do aplicativo no Slack.
        if (dados.type === "url_verification") return Response.json({ challenge: dados.challenge });
        if (dados.type === "event_callback" && dados.event) {
          try {
            await tratarEvento(dados.event);
          } catch (e) {
            console.error("[mural] o aviso do Slack falhou:", e instanceof Error ? e.message : e);
          }
        }
        return new Response("ok"); // sempre 200 para um aviso válido (o Slack repetiria um erro à toa)
      },
    },
  },
});
