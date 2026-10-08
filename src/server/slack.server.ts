/**
 * Postar no Slack (08/10/2026), como o robô "Radar da Qualidade", no canal de qualidade.
 * O token do robô (SLACK_BOT_TOKEN, começa com xoxb-) e o canal
 * (SLACK_CANAL_QUALIDADE, um ID como C0123ABCD) ficam só no servidor.
 * Sem eles, nada é postado, e o sistema funciona normalmente.
 */
export class ErroDoSlack extends Error {}

export const slackConfigurado = () =>
  !!process.env["SLACK_BOT_TOKEN"] && !!process.env["SLACK_CANAL_QUALIDADE"];

/** Posta e devolve o "ts" da mensagem (a identificação dela no Slack). */
export async function postarNoSlack(p: {
  texto: string;
  naConversaDe?: string | null;
  tambemNoCanal?: boolean;
}): Promise<string> {
  const r = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env["SLACK_BOT_TOKEN"] ?? ""}`,
      "content-type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({
      channel: process.env["SLACK_CANAL_QUALIDADE"],
      text: p.texto,
      mrkdwn: true,
      unfurl_links: false, // sem pré-visualização do link do QualityHUB
      unfurl_media: false,
      ...(p.naConversaDe ? { thread_ts: p.naConversaDe, reply_broadcast: !!p.tambemNoCanal } : {}),
    }),
  });
  // O Slack responde 200 mesmo nos erros, com "ok": false e o motivo.
  const j = (await r.json().catch(() => ({}))) as { ok?: boolean; ts?: string; error?: string };
  if (!r.ok || !j.ok || !j.ts)
    throw new ErroDoSlack(`O Slack recusou a mensagem (${j.error ?? `código ${r.status}`}).`);
  return j.ts;
}
