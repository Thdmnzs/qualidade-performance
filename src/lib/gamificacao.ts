/**
 * Gamificação da qualidade: regras de EXIBIÇÃO. O cálculo das conquistas e do
 * XP acontece no banco, no fechamento da quinzena.
 */
export type Dimensao = "sinal" | "velocidade" | "conexao" | "rede" | "evolucao" | "ranking";
/** A "dimensão" da FLUKER, que não pertence a nenhuma das seis (08/10/2026). */
export type DimensaoDoBanco = Dimensao | "suprema";

export const DIMENSOES: Record<Dimensao, { nome: string; icone: string; tema: string }> = {
  sinal: { nome: "Sinal", icone: "📶", tema: "Qualidade" },
  velocidade: { nome: "Velocidade", icone: "⚡", tema: "Produtividade e SLA" },
  conexao: { nome: "Conexão", icone: "🤝", tema: "Experiência do time" },
  rede: { nome: "Rede", icone: "🛰️", tema: "Consistência" },
  evolucao: { nome: "Evolução", icone: "🚀", tema: "Jornada" },
  ranking: { nome: "Ranking", icone: "🏆", tema: "Pódio da quinzena" },
};

/** Por que uma conquista ainda não é calculada (as de qualidade já são). */
export const MOTIVO_EM_BREVE: Record<Dimensao, string> = {
  sinal: "Em breve.",
  velocidade: "Em breve: depende da importação dos indicadores.",
  conexao: "Em breve: depende do CSAT do time.",
  rede: "Em breve: depende da importação dos indicadores.",
  evolucao: "Em breve: depende da importação dos indicadores.",
  ranking: "Em breve: depende do Ranking.",
};

/**
 * Raridade pela escala do PDF (150 e 250 XP, do Ranking, ficam na faixa de baixo).
 * Desde 08/10/2026, acima da Mítica: a Ultra épica (as Centrais de Comando, 700 XP)
 * e a Suprema (a FLUKER, 1.500 XP).
 */
export function raridade(xp: number): { nome: string; cor: string; texto: string } {
  // "cor": borda e fundo; "texto": o rótulo, num tom escuro legível sobre o branco.
  if (xp >= 1500) return { nome: "Suprema", cor: "#e8c547", texto: "#7a5d00" };
  if (xp >= 700) return { nome: "Ultra épica", cor: "#0ef500", texto: "#13a403" };
  if (xp >= 500) return { nome: "Mítica", cor: "#ff6fb5", texto: "#b0236a" };
  if (xp >= 350) return { nome: "Lendária", cor: "#ffb224", texto: "#8a5300" };
  if (xp >= 200) return { nome: "Épica", cor: "#a78bfa", texto: "#6b3fcc" };
  if (xp >= 100) return { nome: "Rara", cor: "#5b78e6", texto: "#3450c2" };
  return { nome: "Comum", cor: "#8e9fbd", texto: "#56657f" };
}

/** O XP de cada nível (08/10/2026): o mesmo para todos, para o ritmo ser sempre igual. */
export const XP_POR_NIVEL = 1000;

/**
 * Nível pelo XP acumulado, sem teto: cada nível, 1.000 XP.
 * Nível 2 aos 1.000, nível 3 aos 2.000, nível 13 aos 12.000...
 */
export function nivelDe(xp: number): {
  nivel: number;
  inicio: number;
  proximo: number;
  progresso: number;
} {
  const total = Math.max(0, Math.floor(xp));
  const nivel = Math.floor(total / XP_POR_NIVEL) + 1;
  const inicio = (nivel - 1) * XP_POR_NIVEL;
  return {
    nivel,
    inicio,
    proximo: inicio + XP_POR_NIVEL,
    progresso: (total - inicio) / XP_POR_NIVEL,
  };
}

// ---------- As Centrais de Comando e a FLUKER (08/10/2026) ----------
export const FLUKER = 62;
export const CENTRAIS = [56, 57, 58, 59, 60, 61];
export const ESTAGIOS_DA_QUALIDADE: Record<number, { estagio: string; quinzenas: number }> = {
  53: { estagio: "estágio 1 de 3", quinzenas: 1 },
  54: { estagio: "estágio 2 de 3", quinzenas: 5 },
  55: { estagio: "estágio 3 de 3", quinzenas: 10 },
};
/** A descrição da FLUKER: a única parte dela que aparece para quem ainda não a ganhou. */
export const DESCRICAO_DA_FLUKER =
  "Desbloqueie todas as conquistas ativas, ao menos uma vez. Depois de ganha, ela é sua para sempre, mesmo que surjam conquistas novas.";

type ConquistaDoCatalogo = { numero: number; dimensao: string; ativa: boolean };

/** O progresso de uma Central: quantas das outras conquistas da dimensão já foram ganhas. */
export function progressoDaCentral(
  central: ConquistaDoCatalogo,
  catalogo: ConquistaDoCatalogo[],
  ganhas: Set<number>,
): { ganhas: number; total: number; ativas: number } {
  const outras = catalogo.filter(
    (c) => c.dimensao === central.dimensao && c.numero !== central.numero,
  );
  return {
    ganhas: outras.filter((c) => ganhas.has(c.numero)).length,
    total: outras.length,
    ativas: outras.filter((c) => c.ativa).length,
  };
}

/** O aviso de subida de nível aparece só quando o nível passou do último visto (e não na primeira visita). */
export function subiuDeNivel(nivelAtual: number, ultimoVisto: number | null): boolean {
  return ultimoVisto !== null && nivelAtual > ultimoVisto;
}

/** Bônus de sequência aplicado (para o histórico): 2ª +10%, 3ª +20%, 4ª em diante +25%. */
export function textoDoBonus(sequencia: number): string | null {
  if (sequencia <= 1) return null;
  const pct = sequencia === 2 ? 10 : sequencia === 3 ? 20 : 25;
  return `${sequencia}ª seguida, bônus de +${pct}%`;
}
