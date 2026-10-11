/**
 * Os pedidos de férias (11/10/2026): o texto do período, a contagem de dias e o
 * motivo que impede um pedido (o mesmo que o banco confere). Puro, para ser testado.
 */
import { avisosDoPedido, datasDoPeriodo, textoDoPeriodo, ultimoDiaDosPedidos } from "@/lib/escala";
import type { FeriasDoAno, PedidoDeFerias } from "@/lib/escala-api";

export const curta = (d: string) => `${Number(d.slice(8))}/${Number(d.slice(5, 7))}`;
export const periodoDoPedido = (p: { de: string; ate: string }) =>
  p.de.slice(0, 7) === p.ate.slice(0, 7) ? textoDoPeriodo(p) : `${curta(p.de)} a ${curta(p.ate)}`;
export const diasDoPedido = (p: { de: string; ate: string }) => datasDoPeriodo(p.de, p.ate).length;

/** O motivo que impede o pedido (o mesmo que o banco confere), ou nada. */
export function problemaDoPedido(
  datas: string[],
  dados: FeriasDoAno,
  pedidos: PedidoDeFerias[],
  pessoa: string | null,
): string | null {
  if (!datas.length) return null;
  const a = avisosDoPedido(datas, dados, pessoa);
  if (a.passado) return "Escolha dias a partir de amanhã.";
  const limite = ultimoDiaDosPedidos();
  if (datas[datas.length - 1]! > limite)
    return `Você pode pedir férias até ${limite.slice(8)}/${limite.slice(5, 7)}/${limite.slice(0, 4)}.`;
  const [de, ate] = [datas[0]!, datas[datas.length - 1]!];
  if (
    pedidos.some(
      (p) => p.employee_id === pessoa && p.situacao === "aguardando" && p.de <= ate && p.ate >= de,
    )
  )
    return "Você já tem um pedido aguardando nesses dias.";
  if (a.jaDeFerias) return "Você já está de férias nesses dias.";
  return null;
}
