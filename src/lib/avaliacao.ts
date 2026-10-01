/**
 * Regras da ficha de avaliação usadas pela TELA.
 *
 * A nota oficial é calculada pelo banco (função registrar_avaliacao). Esta é
 * a mesma fórmula, usada só para a prévia enquanto o avaliador preenche.
 * Os testes em __tests__/avaliacao.test.ts usam os mesmos casos dos testes
 * de SQL, para as duas implementações não divergirem.
 */
export type Resposta = "sim" | "medio" | "nao";

export type CriterioDaFicha = {
  id: string;
  ordem: number;
  peso: number;
  peso_medio: number | null;
  permite_medio: boolean;
};

/** Quantidade prevista por quinzena (especificação, seção 11): 6 interações e 4 tickets N2. */
export const AVALIACOES_PREVISTAS = { interacao: 6, ticket_n2: 4 } as const;
export type TipoAvaliacao = keyof typeof AVALIACOES_PREVISTAS;

export const ROTULO_TIPO: Record<TipoAvaliacao, string> = {
  interacao: "Interação",
  ticket_n2: "Ticket N2",
};

export function descontoDe(criterio: CriterioDaFicha, resposta: Resposta | undefined): number {
  if (resposta === "nao") return Number(criterio.peso);
  if (resposta === "medio") return Number(criterio.peso_medio ?? 0);
  return 0;
}

/** Nota = 100 − soma dos descontos, nunca negativa. */
export function calcularNota(
  criterios: CriterioDaFicha[],
  respostas: Record<string, Resposta | undefined>,
): number {
  const descontos = criterios.reduce((soma, c) => soma + descontoDe(c, respostas[c.id]), 0);
  return Math.max(0, 100 - descontos);
}

/**
 * Aviso (não bloqueio) quando o colaborador já atingiu o previsto para o tipo.
 * Regra de negócio (30/09/2026): avisar, mas permitir.
 */
export function avisoDeQuantidade(tipo: TipoAvaliacao, jaRegistradas: number): string | null {
  const previsto = AVALIACOES_PREVISTAS[tipo];
  if (jaRegistradas < previsto) return null;
  return (
    `Este colaborador já tem ${jaRegistradas} avaliações de ${ROTULO_TIPO[tipo]} nesta quinzena ` +
    `(o previsto são ${previsto}).`
  );
}

export type AvaliacaoDaGestao = {
  id: string;
  employee_id: string;
  colaborador: string;
  fortnight_id: string;
  tipo: TipoAvaliacao;
  assunto: string | null;
  data_contato: string | null;
  nota: number | null;
  created_at: string;
  avaliado_por: string;
  pode_excluir: boolean;
};

export type BlocoDoColaborador<T extends AvaliacaoDaGestao = AvaliacaoDaGestao> = {
  employeeId: string;
  colaborador: string;
  avaliacoes: T[];
};

/** Um bloco por colaborador, em ordem alfabética, cada um com as avaliações mais recentes primeiro. */
export function agruparPorColaborador<T extends AvaliacaoDaGestao>(
  avaliacoes: T[],
): BlocoDoColaborador<T>[] {
  const blocos = new Map<string, BlocoDoColaborador<T>>();
  for (const a of avaliacoes) {
    const bloco = blocos.get(a.employee_id) ?? {
      employeeId: a.employee_id,
      colaborador: a.colaborador,
      avaliacoes: [],
    };
    bloco.avaliacoes.push(a);
    blocos.set(a.employee_id, bloco);
  }
  return [...blocos.values()]
    .map((b) => ({
      ...b,
      avaliacoes: [...b.avaliacoes].sort((x, y) => y.created_at.localeCompare(x.created_at)),
    }))
    .sort((a, b) => a.colaborador.localeCompare(b.colaborador, "pt-BR"));
}

export function contarPorTipo(
  avaliacoes: Pick<AvaliacaoDaGestao, "tipo">[],
): Record<TipoAvaliacao, number> {
  return {
    interacao: avaliacoes.filter((a) => a.tipo === "interacao").length,
    ticket_n2: avaliacoes.filter((a) => a.tipo === "ticket_n2").length,
  };
}

/** Quem avaliou, sem repetição e em ordem alfabética (resumo no cabeçalho do bloco). */
export function avaliadoresDe(avaliacoes: Pick<AvaliacaoDaGestao, "avaliado_por">[]): string[] {
  return [...new Set(avaliacoes.map((a) => a.avaliado_por))].sort((a, b) =>
    a.localeCompare(b, "pt-BR"),
  );
}

/** Motivo de exclusão: mesma regra do banco (pelo menos 5 caracteres úteis). */
export const MOTIVO_MINIMO = 5;
export const motivoValido = (motivo: string) => motivo.trim().length >= MOTIVO_MINIMO;

/** Apontada = pelo menos um critério com desconto ("Não" ou "Médio"). */
export function avaliacaoApontada(itens: { resposta: string }[]): boolean {
  return itens.some((i) => i.resposta !== "sim");
}

export type FiltroApontada = "todas" | "sim" | "nao";

/** Filtros de "Minhas avaliações": quinzena (ou todas) e apontada (sim, não ou todas). */
export function filtrarMinhasAvaliacoes<T extends { fortnight_id: string; apontada: boolean }>(
  avaliacoes: T[],
  filtro: { quinzena: string | "todas"; apontada: FiltroApontada },
): T[] {
  return avaliacoes.filter(
    (a) =>
      (filtro.quinzena === "todas" || a.fortnight_id === filtro.quinzena) &&
      (filtro.apontada === "todas" || a.apontada === (filtro.apontada === "sim")),
  );
}

/** Motivo da contestação: mesma regra do banco (10 a 2000 caracteres úteis). */
export const MOTIVO_CONTESTACAO_MINIMO = 10;
export const motivoContestacaoValido = (motivo: string) => {
  const n = motivo.trim().length;
  return n >= MOTIVO_CONTESTACAO_MINIMO && n <= 2000;
};

/** Contestação ainda em andamento: impede abrir outra para a mesma avaliação. */
export const contestacaoEmAndamento = (status: string | undefined) =>
  status === "aberta" || status === "em_analise";

/** Um critério alterado ao aceitar uma contestação (guardado no banco em contestations.alteracoes). */
export type AlteracaoDeCriterio = {
  ordem: number;
  descricao: string;
  antes: { resposta: Resposta; desconto: number; observacao: string | null };
  depois: { resposta: Resposta; desconto: number; observacao: string | null };
};

export const ROTULO_RESPOSTA: Record<Resposta, string> = { sim: "Sim", medio: "Médio", nao: "Não" };

/** Lê com segurança o JSON de alterações vindo do banco. */
export function lerAlteracoes(json: unknown): AlteracaoDeCriterio[] {
  return Array.isArray(json) ? (json as AlteracaoDeCriterio[]) : [];
}

/**
 * Mesma regra do banco para aceitar: pelo menos um critério com a RESPOSTA
 * diferente (mudar só o texto da justificativa não conta).
 */
export function criteriosAlterados(
  atual: Record<string, Resposta | undefined>,
  novo: Record<string, Resposta | undefined>,
): string[] {
  return Object.keys(atual).filter((id) => atual[id] !== novo[id]);
}

/** Resposta do avaliador à contestação: mesma regra do banco (10 a 2000 caracteres úteis). */
export const respostaDaContestacaoValida = (texto: string) => {
  const n = texto.trim().length;
  return n >= 10 && n <= 2000;
};
