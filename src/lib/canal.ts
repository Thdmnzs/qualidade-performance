/**
 * O canal de atendimento de uma conversa do Intercom (07/10/2026), como os
 * ícones do Intercom: o app, o WhatsApp, o e-mail ou o site.
 *
 *   - WhatsApp e e-mail: pelo tipo da origem da conversa.
 *   - Site: o chat (Messenger) COM o endereço da página onde a conversa começou.
 *   - App: o chat SEM endereço de página (o app da Fluke não tem página).
 *   - Um canal que não está previsto aparece com o nome técnico (nunca um rótulo errado).
 * Puro (sem rede), para ser testado à parte.
 */
export type TipoDeCanal = "app" | "whatsapp" | "email" | "site" | "ticket" | "outro";
export type Canal = { tipo: TipoDeCanal; rotulo: string };
export type OrigemDaConversa = { type?: string | null; url?: string | null } | null | undefined;

const OUTROS: Record<string, string> = {
  sms: "SMS",
  phone_call: "Ligação",
  phone_switch: "Ligação",
  instagram: "Instagram",
  facebook: "Facebook",
  twitter: "X (Twitter)",
};

export function canalDaConversa(origem: OrigemDaConversa): Canal {
  const tipo = (origem?.type ?? "").toLowerCase();
  if (tipo === "whatsapp") return { tipo: "whatsapp", rotulo: "WhatsApp" };
  if (tipo === "email") return { tipo: "email", rotulo: "E-mail" };
  if (tipo === "conversation") {
    return /^https?:\/\//i.test(origem?.url ?? "")
      ? { tipo: "site", rotulo: "Site" }
      : { tipo: "app", rotulo: "App" };
  }
  if (OUTROS[tipo]) return { tipo: "outro", rotulo: OUTROS[tipo]! };
  return { tipo: "outro", rotulo: tipo || "canal não informado" };
}
