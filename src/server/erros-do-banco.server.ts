/**
 * A mensagem de um erro do banco que pode ir para a tela (09/10/2026). Passam só
 * as mensagens das REGRAS (as que as funções do banco escrevem para o usuário,
 * com os códigos P0001, P0002 e 42501). Qualquer outro erro (uma coluna, uma
 * restrição, uma falha de conexão) vira uma mensagem genérica, e o detalhe fica
 * só no registro do servidor: ele ajudaria um atacante, e não o usuário.
 */
const CODIGOS_DE_REGRA = new Set(["P0001", "P0002", "42501"]);
export const MENSAGEM_GENERICA = "Não foi possível concluir a operação. Tente novamente.";

export function mensagemSegura(
  erro: { code?: string | null; message?: string | null } | null | undefined,
  contexto: string,
  generica: string = MENSAGEM_GENERICA,
): string {
  if (erro?.code && CODIGOS_DE_REGRA.has(erro.code) && erro.message) return erro.message;
  console.error(`[${contexto}] erro do banco:`, erro);
  return generica;
}
