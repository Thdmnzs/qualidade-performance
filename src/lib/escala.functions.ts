/** As pontes da escala: só quem está logado (e o servidor confere se é um membro ativo). */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { enviarTokenDaSessao } from "@/integrations/supabase/token-middleware";

async function comErroConhecido<T>(fn: () => Promise<T>): Promise<T> {
  const { ErroDaEscala } = await import("@/server/escala.server");
  const { ErroDoGoogle } = await import("@/server/google.server");
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ErroDaEscala || e instanceof ErroDoGoogle) throw new Error(e.message);
    console.error("[escala] erro inesperado:", e);
    throw new Error("Não foi possível ler a escala agora. Tente novamente.");
  }
}

export const escalaDaSemanaFn = createServerFn({ method: "POST" })
  .middleware([enviarTokenDaSessao, requireSupabaseAuth])
  .validator(z.object({ aba: z.string().max(80).optional(), forcar: z.boolean().optional() }))
  .handler(async ({ data, context }) =>
    comErroConhecido(async () => {
      const { lerEscalaDaSemana } = await import("@/server/escala.server");
      return lerEscalaDaSemana({ ...data, chamadorId: context.userId });
    }),
  );

export const feriasDoAnoFn = createServerFn({ method: "POST" })
  .middleware([enviarTokenDaSessao, requireSupabaseAuth])
  .validator(z.object({ forcar: z.boolean().optional() }))
  .handler(async ({ data, context }) =>
    comErroConhecido(async () => {
      const { lerFeriasDoAno } = await import("@/server/escala.server");
      return lerFeriasDoAno({ ...data, chamadorId: context.userId });
    }),
  );
