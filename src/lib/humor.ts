/** O termômetro do humor (21/10/2026): os níveis e o aviso "abaixo do habitual". Puro, para testes. */
export const NIVEIS_DO_HUMOR = [
  { nivel: 1, emoji: "😞", nome: "muito mal", cor: "#FDE4E2" },
  { nivel: 2, emoji: "😕", nome: "mal", cor: "#FDE9DC" },
  { nivel: 3, emoji: "😐", nome: "mais ou menos", cor: "#FFF1C2" },
  { nivel: 4, emoji: "🙂", nome: "bem", cor: "#E7F5EC" },
  { nivel: 5, emoji: "😄", nome: "muito bem", cor: "#BFE6C6" },
] as const;
export const nivelDoHumor = (n: number | null | undefined) =>
  NIVEIS_DO_HUMOR.find((x) => x.nivel === n) ?? null;
export type RegistroDoHumor = { dia: string; nivel: number };

/**
 * "Abaixo do habitual": a média dos últimos 3 registros está pelo menos 0,75 ponto abaixo da média dos 14 dias.
 * Só com 5 registros ou mais (com poucos, um dia ruim não diz nada).
 */
export function abaixoDoHabitual(registros: RegistroDoHumor[]): boolean {
  if (registros.length < 5) return false;
  const ordenados = [...registros].sort((a, b) => a.dia.localeCompare(b.dia));
  const media = (xs: RegistroDoHumor[]) => xs.reduce((s, x) => s + x.nivel, 0) / xs.length;
  return media(ordenados.slice(-3)) <= media(ordenados) - 0.75;
}

/** Os últimos `n` dias (do mais antigo ao de hoje), com o registro de cada um, ou null. */
export function diasComHumor(
  hoje: string,
  n: number,
  registros: RegistroDoHumor[],
): { dia: string; nivel: number | null }[] {
  const porDia = new Map(registros.map((r) => [r.dia, r.nivel]));
  return Array.from({ length: n }, (_, k) => {
    const d = new Date(`${hoje}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - (n - 1 - k));
    const dia = d.toISOString().slice(0, 10);
    return { dia, nivel: porDia.get(dia) ?? null };
  });
}
