/**
 * A ponte da conferência de senhas vazadas: só quem está logado (a tela de definir a
 * senha já tem a sessão do convite). Recebe só o prefixo de 5 caracteres.
 */
import { limiteDeUso } from "@/integrations/supabase/limite-de-uso";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { enviarTokenDaSessao } from "@/integrations/supabase/token-middleware";
import { PREFIXO_VALIDO } from "@/lib/senha-vazada";

export const conferirPrefixoDeSenhaFn = createServerFn({ method: "POST" })
  .middleware([enviarTokenDaSessao, requireSupabaseAuth, limiteDeUso("conferir_senha", 30, 600)])
  .validator(z.object({ prefixo: z.string().regex(PREFIXO_VALIDO) }))
  .handler(async ({ data }) => {
    const { consultarPrefixo } = await import("@/server/senha.server");
    try {
      return { resposta: await consultarPrefixo(data.prefixo) };
    } catch {
      return { resposta: null }; // fora do ar: a tela avisa, e a pessoa pode salvar mesmo assim
    }
  });

/**
 * A troca de senha pela própria pessoa (16/10/2026): a senha atual e a nova, conferidas no servidor.
 * Até 5 tentativas a cada 15 minutos (para ninguém adivinhar a senha atual por tentativa e erro).
 */
export const alterarMinhaSenhaFn = createServerFn({ method: "POST" })
  .middleware([enviarTokenDaSessao, requireSupabaseAuth, limiteDeUso("alterar_senha", 5, 900)])
  .validator(z.object({ atual: z.string().min(1).max(200), nova: z.string().min(1).max(200) }))
  .handler(async ({ data, context }) => {
    const { alterarSenha, ErroDaTroca } = await import("@/server/alterar-senha.server");
    const { traduzirErroDaTroca } = await import("@/lib/senha");
    const email = (context.claims as { email?: string }).email;
    if (!email) return { ok: false as const, erro: "Sua sessão não tem um e-mail. Entre de novo." };
    try {
      await alterarSenha({
        userId: context.userId,
        email,
        atual: data.atual,
        nova: data.nova,
        token: context.token,
      });
      return { ok: true as const };
    } catch (e) {
      return {
        ok: false as const,
        erro: traduzirErroDaTroca(e instanceof ErroDaTroca ? e.codigo : undefined),
      };
    }
  });
