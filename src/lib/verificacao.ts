/**
 * A verificação em duas etapas (21/10/2026): as regras puras (para testes).
 *   * Para onde mandar a pessoa, pelo nível de segurança da sessão (o "AAL" do Supabase): "aal1" é só a senha;
 *     "aal2", a senha e o código do aplicativo.
 *   * Os códigos de recuperação: 10, de 8 caracteres ("XXXX-XXXX"), num alfabeto sem os que se confundem.
 */
export type Nivel = { currentLevel: string | null; nextLevel: string | null };
export type Destino = "ok" | "cadastrar" | "verificar";

/**
 * "cadastrar": ainda não tem o aplicativo (é obrigatório para todos). "verificar": tem, mas ainda não digitou o
 * código nesta sessão. "ok": a sessão já está com o código.
 */
export function destinoDaVerificacao(n: Nivel | null | undefined): Destino {
  if (n?.currentLevel === "aal2") return "ok";
  return n?.nextLevel === "aal2" ? "verificar" : "cadastrar";
}

/** Sem o 0 e o O, o 1, o I e o L: um código anotado em papel não se confunde. 31 caracteres. */
export const ALFABETO = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const LIMITE = 256 - (256 % ALFABETO.length); // para todos os caracteres terem a mesma chance

/** Os 10 códigos, com uma fonte de bytes aleatórios seguros (o `crypto.getRandomValues`). */
export function gerarCodigos(aleatorio: (n: number) => Uint8Array, quantos = 10): string[] {
  const codigos = new Set<string>();
  while (codigos.size < quantos) {
    let c = "";
    while (c.length < 8)
      for (const b of aleatorio(16))
        if (b < LIMITE && c.length < 8) c += ALFABETO[b % ALFABETO.length];
    codigos.add(`${c.slice(0, 4)}-${c.slice(4)}`);
  }
  return [...codigos];
}

/** O código como a pessoa digitou ("r4tp 2wza") no formato dos códigos ("R4TP-2WZA"), ou null se não tem 8 caracteres. */
export function normalizarCodigo(t: string): string | null {
  const limpo = t.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return limpo.length === 8 ? `${limpo.slice(0, 4)}-${limpo.slice(4)}` : null;
}

/**
 * Trocar a senha pede o código do celular? (22/10/2026) Sim, quando a pessoa já tem o aplicativo cadastrado e a
 * sessão ainda não passou pelo código (o Supabase recusa a troca nesse caso). No primeiro acesso, não.
 */
export const precisaDoCodigoParaTrocarASenha = (n: Nivel | null | undefined) =>
  n?.currentLevel !== "aal2" && n?.nextLevel === "aal2";
