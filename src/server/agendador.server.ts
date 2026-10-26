/**
 * O pedido veio do agendador da Vercel? (23/10/2026) A Vercel manda a senha CRON_SECRET no cabeçalho, e ela é
 * comparada sem vazar pelo tempo de resposta. Usado pelas tarefas agendadas (a da manhã e a da planilha).
 */
import { timingSafeEqual } from "node:crypto";

export function pedidoDoAgendador(request: Request): boolean {
  const segredo = process.env["CRON_SECRET"];
  const recebido = request.headers.get("authorization") ?? "";
  const esperado = `Bearer ${segredo ?? ""}`;
  return (
    !!segredo &&
    recebido.length === esperado.length &&
    timingSafeEqual(Buffer.from(recebido), Buffer.from(esperado))
  );
}
