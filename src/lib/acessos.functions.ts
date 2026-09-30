/**
 * Server functions de gestão de acesso.
 *
 * Do ponto de vista da tela, são funções assíncronas comuns. Por baixo, o
 * TanStack Start transforma cada chamada numa requisição ao servidor: o corpo
 * de `.handler()` NUNCA vai para o navegador.
 *
 * A lógica com a chave de serviço fica em `src/server/acessos.server.ts` e é
 * importada DENTRO do handler, como recomenda o client.server.ts, para não
 * arrastar nada dela para o bundle do navegador.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { enviarTokenDaSessao } from "@/integrations/supabase/token-middleware";

const autenticado = [enviarTokenDaSessao, requireSupabaseAuth] as const;

const perfilSchema = z.enum(["colaborador", "gestor", "adm"]);

/**
 * Mensagens de ErroDeAcesso são seguras e vão para a tela; qualquer outro erro
 * é registrado no log do servidor e substituído por uma mensagem genérica.
 */
async function comErrosSeguros<T>(operacao: () => Promise<T>): Promise<T> {
  const { ErroDeAcesso } = await import("@/server/acessos.server");
  try {
    return await operacao();
  } catch (erro) {
    if (erro instanceof ErroDeAcesso) throw new Error(erro.message);
    console.error("[acessos] erro inesperado:", erro);
    throw new Error("Erro inesperado no servidor. Tente novamente.");
  }
}

export const criarAcessoFn = createServerFn({ method: "POST" })
  .middleware([...autenticado])
  .validator(z.object({ employeeId: z.string().uuid(), perfil: perfilSchema }))
  .handler(async ({ data, context }) =>
    comErrosSeguros(async () => {
      const { criarAcesso } = await import("@/server/acessos.server");
      return criarAcesso({ ...data, chamadorId: context.userId });
    }),
  );

export const gerarLinkDeSenhaFn = createServerFn({ method: "POST" })
  .middleware([...autenticado])
  .validator(z.object({ employeeId: z.string().uuid() }))
  .handler(async ({ data, context }) =>
    comErrosSeguros(async () => {
      const { gerarLinkDeSenha } = await import("@/server/acessos.server");
      return gerarLinkDeSenha({ ...data, chamadorId: context.userId });
    }),
  );

export const alterarStatusFn = createServerFn({ method: "POST" })
  .middleware([...autenticado])
  .validator(z.object({ employeeId: z.string().uuid(), ativo: z.boolean() }))
  .handler(async ({ data, context }) =>
    comErrosSeguros(async () => {
      const { alterarStatus } = await import("@/server/acessos.server");
      await alterarStatus({ ...data, chamadorId: context.userId });
      return { ok: true };
    }),
  );
