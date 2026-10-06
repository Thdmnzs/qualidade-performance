/**
 * Histórico: regras do painel de sorteios descartados.
 */
export const LIMITE_DE_ALERTA_DE_DESCARTES = 0.3; // acima de 30%, vale olhar os motivos

export type Sorteio = { sorteado_por: string | null; descartado_em: string | null };

export type ResumoDoAvaliador = {
  avaliador: string;
  sorteados: number;
  descartados: number;
  proporcao: number;
  alerta: boolean;
};

/**
 * Por avaliador: quantos contatos sorteou, quantos descartou, e a proporção.
 * O alerta é só um sinal para olhar os motivos (nada é bloqueado).
 * Ordem: mais descartes primeiro.
 */
export function resumoDosSorteios(
  sorteios: Sorteio[],
  nomeDe: (userId: string | null) => string,
): ResumoDoAvaliador[] {
  const porQuem = new Map<string, { sorteados: number; descartados: number }>();
  for (const s of sorteios) {
    const nome = nomeDe(s.sorteado_por);
    const atual = porQuem.get(nome) ?? { sorteados: 0, descartados: 0 };
    atual.sorteados += 1;
    if (s.descartado_em) atual.descartados += 1;
    porQuem.set(nome, atual);
  }
  return [...porQuem.entries()]
    .map(([avaliador, c]) => {
      const proporcao = c.sorteados ? c.descartados / c.sorteados : 0;
      return { avaliador, ...c, proporcao, alerta: proporcao > LIMITE_DE_ALERTA_DE_DESCARTES };
    })
    .sort(
      (a, b) => b.descartados - a.descartados || a.avaliador.localeCompare(b.avaliador, "pt-BR"),
    );
}
