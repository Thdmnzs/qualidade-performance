/**
 * Ciclo da quinzena na TELA. As mesmas regras são garantidas pelo banco
 * (alterar_ciclo_quinzena, contestar_avaliacao e o gatilho das contestações);
 * aqui elas só decidem o que mostrar e quais botões habilitar.
 *
 * Regras de 01/10/2026: publicar -> 2 dias úteis para contestar (conta o dia
 * da publicação, até 23h59); responder em 1 dia útil (vencido = atrasada);
 * fechar só depois do prazo e sem pendências.
 */
export type StatusQuinzena =
  "aberta" | "em_analise" | "em_contestacao" | "pronta_para_fechamento" | "fechada";

export const ROTULO_STATUS_QUINZENA: Record<StatusQuinzena, string> = {
  aberta: "Aberta",
  em_analise: "Em análise",
  em_contestacao: "Em contestação",
  pronta_para_fechamento: "Pronta para fechamento",
  fechada: "Fechada",
};

type QuinzenaComPrazo = { status: string; prazo_contestacao_ate: string | null };

/** Avaliações só são registradas e excluídas com a quinzena aberta. */
export const aceitaAvaliacoes = (q: { status: string }) =>
  q.status === "aberta" || q.status === "em_analise";

/** O colaborador vê as próprias avaliações a partir da publicação. */
export const publicada = (q: { status: string }) =>
  q.status === "em_contestacao" || q.status === "pronta_para_fechamento" || q.status === "fechada";

export function prazoDeContestacaoAberto(q: QuinzenaComPrazo, agora: Date = new Date()): boolean {
  return (
    q.status === "em_contestacao" &&
    !!q.prazo_contestacao_ate &&
    agora <= new Date(q.prazo_contestacao_ate)
  );
}

/** Pendente e com o prazo de resposta vencido. */
export function contestacaoAtrasada(
  c: { status: string; responder_ate: string | null },
  agora: Date = new Date(),
): boolean {
  const pendente = c.status === "aberta" || c.status === "em_analise";
  return pendente && !!c.responder_ate && agora > new Date(c.responder_ate);
}

export type SituacaoDoFechamento = { podeFechar: boolean; motivo: string | null };

export function situacaoDoFechamento(
  q: QuinzenaComPrazo,
  pendentes: number,
  agora: Date = new Date(),
): SituacaoDoFechamento {
  if (q.status !== "em_contestacao")
    return { podeFechar: false, motivo: "A quinzena precisa estar em contestação." };
  if (prazoDeContestacaoAberto(q, agora)) {
    return { podeFechar: false, motivo: "O prazo de contestação ainda não terminou." };
  }
  if (pendentes > 0) {
    return {
      podeFechar: false,
      motivo: `${pendentes} ${pendentes === 1 ? "contestação pendente" : "contestações pendentes"}.`,
    };
  }
  return { podeFechar: true, motivo: null };
}
