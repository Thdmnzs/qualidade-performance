/** "Ler agora": o ADM pede a leitura da planilha dos indicadores fora do horário das 8h (15/10/2026). */
import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { limiteDeUso } from "@/integrations/supabase/limite-de-uso";
import { enviarTokenDaSessao } from "@/integrations/supabase/token-middleware";

export const lerPlanilhaAgoraFn = createServerFn({ method: "POST" })
  .middleware([enviarTokenDaSessao, requireSupabaseAuth, limiteDeUso("ler_planilha", 10, 3600)])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: adm } = await supabaseAdmin.rpc("is_admin", { _user_id: context.userId });
    if (!adm) throw new Error("Apenas o ADM pede a leitura da planilha.");
    const { lerPlanilhaDosIndicadores } = await import("@/server/planilha-indicadores.server");
    return lerPlanilhaDosIndicadores("manual");
  });
