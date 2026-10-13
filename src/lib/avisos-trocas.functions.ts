/**
 * O aviso da Central de Turnos, chamado pela tela logo depois de aceitar, decidir ou cancelar
 * uma troca. O servidor relê tudo do banco (a tela só diz QUAL troca), e só posta o que falta.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { enviarTokenDaSessao } from "@/integrations/supabase/token-middleware";

export const avisarTrocaFn = createServerFn({ method: "POST" })
  .middleware([enviarTokenDaSessao, requireSupabaseAuth])
  .validator(z.object({ trocaId: z.string().uuid() }))
  .handler(async ({ data }) => {
    const { avisarTroca } = await import("@/server/central-de-turnos.server");
    try {
      await avisarTroca(data.trocaId);
    } catch (e) {
      // O aviso nunca atrapalha a troca: se falhar, a tarefa da manhã tenta de novo.
      console.error("[central de turnos] erro:", e instanceof Error ? e.message : e);
    }
    return { ok: true };
  });
