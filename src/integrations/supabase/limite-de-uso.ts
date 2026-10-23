/**
 * O limite de uso das funções do servidor (13/10/2026), como uma etapa da cadeia, logo depois
 * do login (para saber QUEM chama). Cada função declara o próprio limite numa linha:
 *
 *   .middleware([...autenticado, limiteDeUso("pre_avaliacao", 30, 3600)])
 *
 * A contagem é por pessoa e por ação, no banco (a Vercel roda várias cópias do servidor).
 */
import { createMiddleware } from "@tanstack/react-start";

import { requireSupabaseAuth, requireSupabaseAuthSemOCodigo } from "./auth-middleware";

export const MUITAS_TENTATIVAS =
  "Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente de novo.";

export function limiteDeUso(acao: string, maximo: number, janelaEmSegundos: number) {
  return createMiddleware({ type: "function" })
    .middleware([requireSupabaseAuth])
    .server(async ({ next, context }) => {
      // Importado AQUI dentro, para a chave de serviço nunca ir para o pacote do navegador.
      const { consumirLimite } = await import("@/server/limite-de-uso.server");
      if (!(await consumirLimite(`${acao}:${context.userId}`, maximo, janelaEmSegundos)))
        throw new Error(MUITAS_TENTATIVAS);
      return next();
    });
}

/**
 * O limite de uso para a recuperação pelo código (23/10/2026): a conferência de login de DENTRO dele também não
 * exige o código do celular (é para quem perdeu o celular). Antes, o limite usava a versão que exige o código, e a
 * recuperação era sempre recusada com "Confirme o código do celular para continuar".
 */
export function limiteDeUsoSemOCodigo(acao: string, maximo: number, janelaEmSegundos: number) {
  return createMiddleware({ type: "function" })
    .middleware([requireSupabaseAuthSemOCodigo])
    .server(async ({ next, context }) => {
      // Importado AQUI dentro, para a chave de serviço nunca ir para o pacote do navegador.
      const { consumirLimite } = await import("@/server/limite-de-uso.server");
      if (!(await consumirLimite(`${acao}:${context.userId}`, maximo, janelaEmSegundos)))
        throw new Error(MUITAS_TENTATIVAS);
      return next();
    });
}
