import { createMiddleware } from "@tanstack/react-start";

import { supabase } from "./client";

/**
 * Roda NO NAVEGADOR, antes de cada chamada a uma server function que o use:
 * pega o token da sessão atual e o envia no cabeçalho Authorization.
 *
 * Do outro lado, `requireSupabaseAuth` (auth-middleware.ts) verifica esse token
 * no servidor. Um não funciona sem o outro: sempre use os dois juntos, nesta ordem.
 */
export const enviarTokenDaSessao = createMiddleware({ type: "function" }).client(
  async ({ next }) => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    return next({
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  },
);
