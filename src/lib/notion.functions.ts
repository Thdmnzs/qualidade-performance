/**
 * Server functions da sincronização com o Notion. O corpo de `.handler()` roda
 * só no servidor; o token do Notion nunca chega ao navegador.
 */
import { limiteDeUso } from "@/integrations/supabase/limite-de-uso";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { enviarTokenDaSessao } from "@/integrations/supabase/token-middleware";

const autenticado = [enviarTokenDaSessao, requireSupabaseAuth] as const;

const comErroDoNotion = async <T>(fn: () => Promise<T>): Promise<T> => {
  const { ErroDoNotion } = await import("@/server/notion.server");
  try {
    return await fn();
  } catch (erro) {
    if (erro instanceof ErroDoNotion) throw new Error(erro.message);
    console.error("[notion] erro inesperado:", erro);
    throw new Error("Erro inesperado ao falar com o Notion. Tente novamente.");
  }
};

export const testarNotionFn = createServerFn({ method: "POST" })
  .middleware([...autenticado, limiteDeUso("testar_notion", 20, 3600)])
  .handler(async ({ context }) =>
    comErroDoNotion(async () =>
      (await import("@/server/notion.server")).testarNotion(context.userId),
    ),
  );

export const iniciarSincronizacaoFn = createServerFn({ method: "POST" })
  .middleware([...autenticado, limiteDeUso("sincronizar_notion", 10, 3600)])
  .handler(async ({ context }) =>
    comErroDoNotion(async () =>
      (await import("@/server/notion.server")).iniciarSincronizacao(context.userId),
    ),
  );

export const continuarSincronizacaoFn = createServerFn({ method: "POST" })
  .middleware([...autenticado, limiteDeUso("sincronizar_notion_lote", 300, 3600)])
  .validator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data, context }) =>
    comErroDoNotion(async () =>
      (await import("@/server/notion.server")).continuarSincronizacao(context.userId, data.id),
    ),
  );
