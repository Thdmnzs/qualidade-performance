/** O mural do CX (20/10/2026): a releitura do canal, quando a Visão geral abre (só o membro do time). */
import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { limiteDeUso } from "@/integrations/supabase/limite-de-uso";
import { enviarTokenDaSessao } from "@/integrations/supabase/token-middleware";

export const atualizarMuralFn = createServerFn({ method: "POST" })
  .middleware([enviarTokenDaSessao, requireSupabaseAuth, limiteDeUso("mural", 30, 600)])
  .handler(async () => {
    const { lerMuralSePreciso } = await import("@/server/slack-mural.server");
    try {
      return { leu: await lerMuralSePreciso(5) };
    } catch (e) {
      console.error("[mural] a releitura do canal falhou:", e instanceof Error ? e.message : e);
      return { leu: false }; // o mural continua com o que já tem
    }
  });
