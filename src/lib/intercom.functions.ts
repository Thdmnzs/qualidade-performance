/**
 * Server functions da integração com o Intercom. O corpo de `.handler()` roda
 * só no servidor; o token nunca chega ao navegador.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { enviarTokenDaSessao } from "@/integrations/supabase/token-middleware";

const autenticado = [enviarTokenDaSessao, requireSupabaseAuth] as const;

export const verificarIntercomFn = createServerFn({ method: "POST" })
  .middleware([...autenticado])
  .handler(async ({ context }) => {
    const { verificarIntercom, ErroDoIntercom } = await import("@/server/intercom.server");
    try {
      return await verificarIntercom(context.userId);
    } catch (erro) {
      if (erro instanceof ErroDoIntercom) throw new Error(erro.message);
      console.error("[intercom] erro inesperado:", erro);
      throw new Error("Erro inesperado ao verificar o Intercom. Tente novamente.");
    }
  });

const deErroDoIntercom = async <T>(fn: () => Promise<T>): Promise<T> => {
  const { ErroDoIntercom } = await import("@/server/intercom.server");
  try {
    return await fn();
  } catch (erro) {
    if (erro instanceof ErroDoIntercom) throw new Error(erro.message);
    console.error("[intercom] erro inesperado:", erro);
    throw new Error("Erro inesperado ao falar com o Intercom. Tente novamente.");
  }
};

export const sortearContatoFn = createServerFn({ method: "POST" })
  .middleware([...autenticado])
  .validator(z.object({ employeeId: z.string().uuid(), fortnightId: z.string().uuid() }))
  .handler(async ({ data, context }) =>
    deErroDoIntercom(async () => {
      const { sortearContato } = await import("@/server/intercom.server");
      return sortearContato({ ...data, chamadorId: context.userId });
    }),
  );

export const buscarContatoFn = createServerFn({ method: "POST" })
  .middleware([...autenticado])
  .validator(z.object({ employeeId: z.string().uuid(), referencia: z.string().min(1).max(500) }))
  .handler(async ({ data, context }) =>
    deErroDoIntercom(async () => {
      const { buscarContato } = await import("@/server/intercom.server");
      return buscarContato({ ...data, chamadorId: context.userId });
    }),
  );

export const descartarContatoFn = createServerFn({ method: "POST" })
  .middleware([...autenticado])
  .validator(z.object({ sorteioId: z.string().uuid(), motivo: z.string().min(1).max(500) }))
  .handler(async ({ data, context }) =>
    deErroDoIntercom(async () => {
      const { descartarContato } = await import("@/server/intercom.server");
      await descartarContato({ ...data, chamadorId: context.userId });
      return { ok: true };
    }),
  );
