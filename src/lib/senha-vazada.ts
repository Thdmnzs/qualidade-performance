/**
 * A conferência de senhas vazadas (09/10/2026), pelo Pwned Passwords (Have I Been
 * Pwned), gratuito e sem chave. A SENHA NUNCA SAI DO NAVEGADOR:
 *   1. o navegador calcula o SHA-1 da senha (o "código", que não volta a ser a senha);
 *   2. manda só os 5 primeiros caracteres ao servidor do QualityHUB, que pergunta ao
 *      serviço e devolve os códigos de senhas vazadas que começam com eles;
 *   3. o próprio navegador confere se o código completo está na lista.
 * Puro (sem rede), para ser testado à parte.
 */
export type SituacaoDaSenha = "conferindo" | "segura" | "vazada" | "indisponivel";

/** O código (SHA-1, em maiúsculas) da senha, dividido em prefixo (5) e sufixo (35). */
export async function prefixoESufixo(senha: string): Promise<{ prefixo: string; sufixo: string }> {
  const dados = new TextEncoder().encode(senha);
  const resumo = await crypto.subtle.digest("SHA-1", dados);
  const hex = [...new Uint8Array(resumo)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
  return { prefixo: hex.slice(0, 5), sufixo: hex.slice(5) };
}

/**
 * A resposta do serviço: uma linha por código, "SUFIXO:VEZES". As linhas com 0 vezes
 * são enchimento (o "Add-Padding", que esconde o tamanho da resposta) e não contam.
 */
export function apareceEmVazamentos(sufixo: string, resposta: string): boolean {
  const alvo = sufixo.toUpperCase();
  return resposta.split(/\r?\n/).some((linha) => {
    const [s, vezes] = linha.trim().split(":");
    return s?.toUpperCase() === alvo && Number(vezes) > 0;
  });
}

/** O prefixo é só hexadecimal, com 5 caracteres (o servidor não aceita outra coisa). */
export const PREFIXO_VALIDO = /^[0-9A-F]{5}$/;

export const TEXTO_DA_SITUACAO: Record<SituacaoDaSenha, string> = {
  conferindo: "Conferindo se a senha já apareceu em vazamentos...",
  segura: "Não aparece em vazamentos conhecidos",
  vazada: "Esta senha já apareceu em vazamentos de dados: escolha outra",
  indisponivel: "Não foi possível conferir os vazamentos agora (você pode salvar mesmo assim)",
};
