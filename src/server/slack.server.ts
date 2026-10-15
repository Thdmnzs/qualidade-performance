/**
 * Postar no Slack (08/10/2026), como o robô "Radar da Qualidade", no canal de qualidade.
 * O token do robô (SLACK_BOT_TOKEN, começa com xoxb-) e o canal
 * (SLACK_CANAL_QUALIDADE, um ID como C0123ABCD) ficam só no servidor.
 * Sem eles, nada é postado, e o sistema funciona normalmente.
 */
export class ErroDoSlack extends Error {}

export const slackConfigurado = () =>
  !!process.env["SLACK_BOT_TOKEN"] && !!process.env["SLACK_CANAL_QUALIDADE"];

/**
 * Qual robô posta, e onde. O padrão é o Radar da Qualidade (no canal de qualidade).
 * A Central de Turnos (13/10/2026) tem o próprio token e o próprio canal (o de escala).
 */
export type Robo = { token: string | undefined; canal: string | undefined };
const RADAR = (): Robo => ({
  token: process.env["SLACK_BOT_TOKEN"],
  canal: process.env["SLACK_CANAL_QUALIDADE"],
});
export const CENTRAL_DE_TURNOS = (): Robo => ({
  token: process.env["SLACK_TURNOS_TOKEN"],
  canal: process.env["SLACK_CANAL_ESCALA"],
});
export const centralDeTurnosConfigurada = () =>
  !!CENTRAL_DE_TURNOS().token && !!CENTRAL_DE_TURNOS().canal;

/** Posta e devolve o "ts" da mensagem (a identificação dela no Slack). */
export async function postarNoSlack(p: {
  texto: string;
  naConversaDe?: string | null;
  tambemNoCanal?: boolean;
  robo?: Robo;
}): Promise<string> {
  const robo = p.robo ?? RADAR();
  const r = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      authorization: `Bearer ${robo.token ?? ""}`,
      "content-type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({
      channel: robo.canal,
      text: p.texto,
      mrkdwn: true,
      unfurl_links: false, // sem pré-visualização do link do CX Hub
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
