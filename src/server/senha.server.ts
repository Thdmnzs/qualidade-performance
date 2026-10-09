/**
 * O intermediário da conferência de senhas vazadas (09/10/2026): recebe só os 5
 * primeiros caracteres do código da senha (nunca a senha), pergunta ao Pwned
 * Passwords e devolve a lista. Assim, a política de conteúdo do site continua
 * fechada, e o serviço só vê o servidor (e não o endereço de cada pessoa).
 */
import { PREFIXO_VALIDO } from "@/lib/senha-vazada";

export class ErroDaConferencia extends Error {}

export async function consultarPrefixo(prefixo: string): Promise<string> {
  if (!PREFIXO_VALIDO.test(prefixo)) throw new ErroDaConferencia("Prefixo inválido.");
  let r: Response;
  try {
    r = await fetch(`https://api.pwnedpasswords.com/range/${prefixo}`, {
      headers: { "Add-Padding": "true", "User-Agent": "QualityHUB" }, // o enchimento esconde o tamanho
      signal: AbortSignal.timeout(4000),
    });
  } catch {
    throw new ErroDaConferencia("O serviço de conferência não respondeu.");
  }
  if (!r.ok) throw new ErroDaConferencia(`O serviço de conferência respondeu ${r.status}.`);
  const texto = await r.text();
  if (texto.length > 200_000) throw new ErroDaConferencia("Resposta inesperada do serviço.");
  return texto;
}
