/** A central de notificações: o que a tela pede ao banco (cada pessoa só lê as dela). */
import { supabase } from "@/integrations/supabase/client";
import type { Notificacoes } from "@/lib/notificacoes";

const falhar = (e: { message: string } | null) => {
  if (e) throw new Error(e.message);
};
export async function lerNotificacoes(): Promise<Notificacoes> {
  const { data, error } = await supabase.rpc("minhas_notificacoes");
  falhar(error);
  const n = (data ?? {}) as Partial<Notificacoes>;
  return { pendencias: n.pendencias ?? [], novidades: n.novidades ?? [] };
}
/** Marca como lidas as escolhidas (ou todas, sem a lista). */
export async function marcarComoLidas(ids?: string[]) {
  const { error } = await supabase.rpc("marcar_notificacoes_lidas", { _ids: ids ?? null });
  falhar(error);
}
