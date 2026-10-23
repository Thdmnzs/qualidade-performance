/**
 * O usuário logado, para a guarda das telas (23/10/2026). A guarda rodava o `getUser()` a CADA clique no menu, e ele
 * vai ao servidor de login pela internet: a tela nova só aparecia depois da resposta, e ficava sempre um clique
 * atrasada. Agora a sessão é lida no próprio navegador (instantâneo), e o servidor de login confere no máximo uma
 * vez a cada 5 minutos (ou quando a pessoa muda).
 *
 * Isto NÃO protege os dados: quem protege é o banco e o servidor, que conferem a sessão (e o código do celular)
 * em cada pedido. A guarda das telas só decide para onde mandar a pessoa.
 */
import type { User } from "@supabase/supabase-js";

import { supabase } from "@/integrations/supabase/client";

export const INTERVALO_DA_CONFERENCIA_MS = 5 * 60_000;
let conferido: { userId: string; em: number } | null = null;

export async function usuarioLogado(agora = Date.now()): Promise<User | null> {
  const { data } = await supabase.auth.getSession();
  const daSessao = data.session?.user ?? null;
  if (!daSessao) {
    conferido = null;
    return null;
  }
  if (
    conferido &&
    conferido.userId === daSessao.id &&
    agora - conferido.em < INTERVALO_DA_CONFERENCIA_MS
  )
    return daSessao;
  const { data: doServidor, error } = await supabase.auth.getUser();
  if (error || !doServidor.user) {
    conferido = null;
    return null;
  }
  conferido = { userId: doServidor.user.id, em: agora };
  return doServidor.user;
}

/** Para os testes, e para quando a sessão acaba. */
export function esquecerAConferencia() {
  conferido = null;
}
