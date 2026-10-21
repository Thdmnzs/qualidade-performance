/**
 * O aviso da Central de Turnos, chamado pela tela logo depois de aceitar, decidir ou cancelar
 * uma troca. O servidor relê tudo do banco (a tela só diz QUAL troca), e só posta o que falta.
 */
import { limiteDeUso } from "@/integrations/supabase/limite-de-uso";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { enviarTokenDaSessao } from "@/integrations/supabase/token-middleware";

export const avisarTrocaFn = createServerFn({ method: "POST" })
  .middleware([enviarTokenDaSessao, requireSupabaseAuth, limiteDeUso("aviso_slack", 120, 600)])
  .validator(z.object({ trocaId: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const { avisarTroca, podeAvisarTroca } = await import("@/server/central-de-turnos.server");
    // Só uma das pessoas da troca, ou um ADM (21/10/2026, a revisão de segurança).
    if (!(await podeAvisarTroca(data.trocaId, context.userId))) return { ok: false };
    try {
      await avisarTroca(data.trocaId);
    } catch (e) {
      // O aviso nunca atrapalha a troca: se falhar, a tarefa da manhã tenta de novo.
      console.error("[central de turnos] erro:", e instanceof Error ? e.message : e);
    }
    return { ok: true };
  });
