/**
 * A ponte da conferência de senhas vazadas: só quem está logado (a tela de definir a
 * senha já tem a sessão do convite). Recebe só o prefixo de 5 caracteres.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { enviarTokenDaSessao } from "@/integrations/supabase/token-middleware";
import { PREFIXO_VALIDO } from "@/lib/senha-vazada";

export const conferirPrefixoDeSenhaFn = createServerFn({ method: "POST" })
  .middleware([enviarTokenDaSessao, requireSupabaseAuth])
  .validator(z.object({ prefixo: z.string().regex(PREFIXO_VALIDO) }))
  .handler(async ({ data }) => {
    const { consultarPrefixo } = await import("@/server/senha.server");
    try {
      return { resposta: await consultarPrefixo(data.prefixo) };
    } catch {
      return { resposta: null }; // fora do ar: a tela avisa, e a pessoa pode salvar mesmo assim
    }
  });
