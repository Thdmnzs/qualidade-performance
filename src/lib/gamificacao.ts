/**
 * Gamificação da qualidade: regras de EXIBIÇÃO. O cálculo das conquistas e do
 * XP acontece no banco, no fechamento da quinzena.
 */
export type Dimensao = "sinal" | "velocidade" | "conexao" | "rede" | "evolucao" | "ranking";

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

/** Raridade pela escala do PDF (150 e 250 XP, do Ranking, ficam na faixa de baixo). */
export function raridade(xp: number): { nome: string; cor: string } {
  if (xp >= 500) return { nome: "Mítica", cor: "#ff6fb5" };
  if (xp >= 350) return { nome: "Lendária", cor: "#ffb224" };
  if (xp >= 200) return { nome: "Épica", cor: "#a78bfa" };
  if (xp >= 100) return { nome: "Rara", cor: "#5b78e6" };
  return { nome: "Comum", cor: "#8e9fbd" };
}

/**
 * Nível pelo XP acumulado, sem teto: subir do nível n para o n+1 custa 500 × n XP.
 * Nível 2 aos 500, nível 3 aos 1.500, nível 4 aos 3.000, nível 5 aos 5.000...
 */
export function nivelDe(xp: number): {
  nivel: number;
  inicio: number;
  proximo: number;
  progresso: number;
} {
  let nivel = 1;
  let inicio = 0;
  while (xp >= inicio + 500 * nivel) {
    inicio += 500 * nivel;
    nivel += 1;
  }
  const proximo = inicio + 500 * nivel;
  return { nivel, inicio, proximo, progresso: (xp - inicio) / (proximo - inicio) };
}

/** Bônus de sequência aplicado (para o histórico): 2ª +10%, 3ª +20%, 4ª em diante +25%. */
export function textoDoBonus(sequencia: number): string | null {
  if (sequencia <= 1) return null;
  const pct = sequencia === 2 ? 10 : sequencia === 3 ? 20 : 25;
  return `${sequencia}ª seguida, bônus de +${pct}%`;
}
