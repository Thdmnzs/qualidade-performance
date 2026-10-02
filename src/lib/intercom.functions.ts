/**
 * Server functions da integração com o Intercom. O corpo de `.handler()` roda
 * só no servidor; o token nunca chega ao navegador.
 */
import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { enviarTokenDaSessao } from "@/integrations/supabase/token-middleware";

const autenticado = [enviarTokenDaSessao, requireSupabaseAuth] as const;

export const verificarIntercomFn = createServerFn({ method: "POST" })
  .middleware([...autenticado])
  .handler(async ({ context }) => {
    const { verificarIntercom, ErroDoIntercom } = await import("@/server/intercom.server");
    try {
      return await verificarIntercom(context.userId);
    } catch (erro) {
      if (erro instanceof ErroDoIntercom) throw new Error(erro.message);
      console.error("[intercom] erro inesperado:", erro);
      throw new Error("Erro inesperado ao verificar o Intercom. Tente novamente.");
    }
  });
