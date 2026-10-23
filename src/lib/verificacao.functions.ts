/** A verificação em duas etapas (21/10/2026): as funções do servidor (com o login e os limites de uso). */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  requireSupabaseAuth,
  requireSupabaseAuthSemOCodigo,
} from "@/integrations/supabase/auth-middleware";
import { limiteDeUso, limiteDeUsoSemOCodigo } from "@/integrations/supabase/limite-de-uso";
import { enviarTokenDaSessao } from "@/integrations/supabase/token-middleware";

const autenticado = [enviarTokenDaSessao, requireSupabaseAuth] as const;
async function comErrosSeguros<T>(operacao: () => Promise<T>): Promise<T> {
  const { ErroDaVerificacao } = await import("@/server/verificacao.server");
  try {
    return await operacao();
  } catch (e) {
    if (e instanceof ErroDaVerificacao) throw new Error(e.message);
    console.error("[verificação]", e instanceof Error ? e.message : e);
    throw new Error("Não foi possível concluir agora. Tente de novo.");
  }
}

export const gerarCodigosDeRecuperacaoFn = createServerFn({ method: "POST" })
  .middleware([...autenticado, limiteDeUso("codigos_de_recuperacao", 5, 3600)])
  .handler(async ({ context }) =>
    comErrosSeguros(async () => {
      const { gerarCodigosDeRecuperacao } = await import("@/server/verificacao.server");
      return gerarCodigosDeRecuperacao({
        userId: context.userId,
        aal: (context.claims as { aal?: unknown }).aal,
      });
    }),
  );

// Até 5 tentativas a cada 15 minutos (contra quem tente adivinhar um código).
// A única função do servidor que aceita uma sessão SEM o código do celular (é para quem perdeu o celular).
export const usarCodigoDeRecuperacaoFn = createServerFn({ method: "POST" })
  .middleware([
    enviarTokenDaSessao,
    requireSupabaseAuthSemOCodigo,
    limiteDeUsoSemOCodigo("usar_codigo_de_recuperacao", 5, 900),
  ])
  .validator(z.object({ codigo: z.string().min(1).max(20) }))
  .handler(async ({ data, context }) =>
    comErrosSeguros(async () => {
      const { usarCodigoDeRecuperacao } = await import("@/server/verificacao.server");
      return usarCodigoDeRecuperacao({ userId: context.userId, codigo: data.codigo });
    }),
  );

export const desligarVerificacaoFn = createServerFn({ method: "POST" })
  .middleware([...autenticado, limiteDeUso("desligar_verificacao", 10, 3600)])
  .validator(z.object({ employeeId: z.string().uuid(), senha: z.string().min(1).max(200) }))
  .handler(async ({ data, context }) =>
    comErrosSeguros(async () => {
      const { desligarVerificacao } = await import("@/server/verificacao.server");
      const c = context.claims as { aal?: unknown; email?: string };
      return desligarVerificacao({
        admId: context.userId,
        admEmail: c.email,
        aal: c.aal,
        senha: data.senha,
        employeeId: data.employeeId,
      });
    }),
  );

export const verificacaoDoTimeFn = createServerFn({ method: "POST" })
  .middleware([...autenticado, limiteDeUso("verificacao_do_time", 120, 600)])
  .handler(async ({ context }) =>
    comErrosSeguros(async () => {
      const { verificacaoDoTime } = await import("@/server/verificacao.server");
      return verificacaoDoTime(context.userId);
    }),
  );
