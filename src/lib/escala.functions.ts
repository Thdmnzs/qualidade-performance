/** O botão "Ler a escala agora", só para o ADM (a função do banco confere de novo). */
import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { enviarTokenDaSessao } from "@/integrations/supabase/token-middleware";

const autenticado = [enviarTokenDaSessao, requireSupabaseAuth] as const;

export const lerEscalaFn = createServerFn({ method: "POST" })
  .middleware([...autenticado])
  .handler(async ({ context }) => {
    const { lerEscalaDoGoogle, ErroDaEscala } = await import("@/server/escala.server");
    const { ErroDoGoogle } = await import("@/server/google.server");
    try {
      return await lerEscalaDoGoogle({ origem: "manual", chamadorId: context.userId });
    } catch (erro) {
      if (erro instanceof ErroDaEscala || erro instanceof ErroDoGoogle)
        throw new Error(erro.message);
      console.error("[escala] erro inesperado:", erro);
      throw new Error("Erro inesperado ao ler a escala.");
    }
  });
