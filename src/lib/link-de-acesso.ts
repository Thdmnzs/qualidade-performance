/**
 * Links de convite e de nova senha (07/10/2026).
 *
 * O link antigo do Supabase era gasto no PRIMEIRO acesso, e os robôs de
 * pré-visualização (Slack, WhatsApp, Teams, filtros de e-mail) o abriam antes da
 * pessoa. Agora o link leva à página /definir-senha com o código no FRAGMENTO
 * (depois do "#"), e o código só é usado quando a pessoa clica em "Continuar":
 *   - o fragmento nunca sai do navegador (não vai ao servidor nem aos registros);
 *   - os robôs abrem a página, mas não clicam em botões.
 */
export type TipoDoLink = "invite" | "recovery";

export function montarLinkDeAcesso(base: string, codigo: string, tipo: TipoDoLink): string {
  const f = new URLSearchParams({ token_hash: codigo, type: tipo });
  return `${base}#${f.toString()}`;
}

/** O código e o tipo vindos do fragmento, ou null (link antigo, ou nada). */
export function lerCodigoDoLink(fragmento: string): { codigo: string; tipo: TipoDoLink } | null {
  const f = new URLSearchParams(fragmento.replace(/^#/, ""));
  const codigo = f.get("token_hash");
  const tipo = f.get("type");
  if (!codigo || !/^[A-Za-z0-9_-]{10,200}$/.test(codigo)) return null;
  if (tipo !== "invite" && tipo !== "recovery") return null;
  return { codigo, tipo };
}
