/**
 * Ponte entre a tela e a pré-avaliação no servidor. A chave da API nunca chega
 * ao navegador. A pré-avaliação nunca quebra a ficha: a ponte devolve sempre um
 * estado ("pronta", "indisponivel" ou "falhou"), com um motivo legível.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { enviarTokenDaSessao } from "@/integrations/supabase/token-middleware";

const autenticado = [enviarTokenDaSessao, requireSupabaseAuth] as const;

export const preAvaliarFn = createServerFn({ method: "POST" })
  .middleware([...autenticado])
  .validator(
    z.object({
      employeeId: z.string().uuid(),
      fortnightId: z.string().uuid(),
      conversaId: z.string().regex(/^\d{1,30}$/),
      tipo: z.enum(["interacao", "ticket_n2"]).optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    const { preAvaliar, ErroDaPreAvaliacao } = await import("@/server/pre-avaliacao.server");
    const { ErroDoIntercom } = await import("@/server/intercom.server");
    try {
      return await preAvaliar({ ...data, chamadorId: context.userId });
    } catch (erro) {
      if (erro instanceof ErroDaPreAvaliacao || erro instanceof ErroDoIntercom) {
        return { estado: "falhou" as const, motivo: erro.message };
      }
      console.error("[pre-avaliacao] erro inesperado:", erro);
      return { estado: "falhou" as const, motivo: "Erro inesperado na pré-avaliação." };
    }
  });
