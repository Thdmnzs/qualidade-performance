/**
 * Chamado pela tela logo depois de contestar ou de responder. Não devolve erro
 * para quem usa a dash: a contestação já foi gravada, e, se o Slack falhar, a
 * tarefa da manhã manda o aviso que faltou.
 */
import { limiteDeUso } from "@/integrations/supabase/limite-de-uso";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { enviarTokenDaSessao } from "@/integrations/supabase/token-middleware";

export const avisarContestacaoFn = createServerFn({ method: "POST" })
  .middleware([enviarTokenDaSessao, requireSupabaseAuth, limiteDeUso("aviso_slack", 120, 600)])
  .validator(z.object({ contestationId: z.string().uuid() }))
  .handler(async ({ data }) => {
    const { avisarContestacao } = await import("@/server/avisos-contestacao.server");
    try {
      await avisarContestacao(data.contestationId);
    } catch (e) {
      console.error("[avisos] erro ao avisar:", e instanceof Error ? e.message : e);
    }
    return { ok: true };
  });
