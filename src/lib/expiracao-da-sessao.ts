/**
 * O prazo da sessão (09/10/2026): 30 minutos sem uso, e no máximo 9 horas desde
 * o login. O Supabase só oferece isso no plano Pro, então o CX Hub confere por
 * conta própria. O "uso" vale em QUALQUER aba (o registro é compartilhado).
 */
export const INATIVIDADE_MS = 30 * 60_000;
export const LIMITE_MS = 9 * 60 * 60_000;
export const AVISO_MS = 60_000;

export type MotivoDoFim = "inatividade" | "limite";
export type SituacaoDaSessao =
  | { estado: "ativa" }
  | { estado: "aviso"; motivo: MotivoDoFim; restanteMs: number }
  | { estado: "expirada"; motivo: MotivoDoFim };

export type RegistroDaSessao = { inicio: number; atividade: number };

/** Puro: dado o registro e a hora atual, a sessão está ativa, em aviso ou expirada. */
export function situacaoDaSessao(
  agora: number,
  registro: RegistroDaSessao | null,
): SituacaoDaSessao {
  if (!registro) return { estado: "ativa" }; // sem registro: ele começa agora (quem chama registra)
  const fimDoLimite = registro.inicio + LIMITE_MS;
  const fimDaInatividade = registro.atividade + INATIVIDADE_MS;
  if (agora >= fimDoLimite) return { estado: "expirada", motivo: "limite" };
  if (agora >= fimDaInatividade) return { estado: "expirada", motivo: "inatividade" };
  const restaLimite = fimDoLimite - agora;
  const restaInatividade = fimDaInatividade - agora;
  const resta = Math.min(restaLimite, restaInatividade);
  if (resta <= AVISO_MS)
    return {
      estado: "aviso",
      motivo: restaLimite <= restaInatividade ? "limite" : "inatividade",
      restanteMs: resta,
    };
  return { estado: "ativa" };
}

export const MENSAGEM_DO_FIM: Record<MotivoDoFim, string> = {
  inatividade: "Sua sessão foi encerrada depois de 30 minutos sem uso. Entre novamente.",
  limite: "Sua sessão atingiu o limite de 9 horas e foi encerrada. Entre novamente.",
};

// ---------- O registro, no armazenamento do navegador (compartilhado entre as abas) ----------
const chave = (userId: string) => `qh:sessao:${userId}`;

export function lerRegistro(userId: string): RegistroDaSessao | null {
  try {
    const bruto = window.localStorage.getItem(chave(userId));
    if (!bruto) return null;
    const r = JSON.parse(bruto) as Partial<RegistroDaSessao>;
    return typeof r.inicio === "number" && typeof r.atividade === "number"
      ? { inicio: r.inicio, atividade: r.atividade }
      : null;
  } catch {
    return null;
  }
}

/** Registra um uso (e o início, se a sessão ainda não tinha registro). */
export function registrarAtividade(userId: string, agora: number): void {
  try {
    const r = lerRegistro(userId);
    window.localStorage.setItem(
      chave(userId),
      JSON.stringify({ inicio: r?.inicio ?? agora, atividade: agora }),
    );
  } catch {
    // sem acesso ao armazenamento: o prazo não é conferido, e nada quebra
  }
}

/** Apaga os registros (ao sair, ou quando a sessão expira): o próximo login recomeça as 9 horas. */
export function apagarRegistros(): void {
  try {
    for (const k of Object.keys(window.localStorage))
      if (k.startsWith("qh:sessao:")) window.localStorage.removeItem(k);
  } catch {
    // ignorado
  }
}
