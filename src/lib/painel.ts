/**
 * Os cálculos do Painel (07/10/2026), no formato do relatório "Qualidade e
 * Treinamento" do Looker Studio. Puros (sem rede), para serem testados à parte.
 *
 *   - Acerto: só o "Sim" é acerto. O "Médio" entra nos erros como "parcial".
 *   - Erros: TODOS os critérios que não foram "Sim" contam (uma avaliação com
 *     dois erros conta nos dois). Não há "erro principal".
 *   - A quinzena que não está fechada é "parcial".
 */
export type Resposta = "sim" | "medio" | "nao";
export type ItemDoPainel = { ordem: number; resposta: Resposta; observacao: string | null };
export type AvaliacaoDoPainel = {
  evaluation_id: string;
  quinzena_inicio: string;
  quinzena_status: string;
  employee_id: string;
  nome: string;
  turno: string | null;
  data_contato: string | null;
  nota: number;
  comentarios: string | null;
  itens: ItemDoPainel[];
};
export type MetricaDoPainel = {
  quinzena_inicio: string;
  quinzena_status: string;
  employee_id: string;
  nome: string;
  turno: string | null;
  produtividade: number | null;
  qualidade: number | null;
  sla_chat: number | null;
  sla_email: number | null;
  csat: number | null;
  horas_semanais: number | null;
  quiz_entregue: boolean | null;
  elegivel: boolean | null;
  posicao: number | null;
  premio: number | null;
};

/** O tipo de erro de cada critério da ficha (pela ordem). */
export const TIPO_DE_ERRO: Record<number, string> = {
  1: "LGPD",
  2: "Empatia",
  3: "Estrutura",
  4: "Macro",
  5: "Verificação",
  6: "Histórico",
  7: "Diagnóstico",
  8: "Informação",
  9: "Processo",
  10: "Observações internas",
  11: "Prazos",
  12: "Encaminhamento",
  13: "Encerramento",
  14: "Tagueamento",
};

const media = (v: (number | null | undefined)[]) => {
  const n = v.filter((x): x is number => typeof x === "number" && Number.isFinite(x));
  return n.length ? n.reduce((s, x) => s + x, 0) / n.length : null;
};

/** "2026-10 · Q1", como no relatório; "(parcial)" se a quinzena não está fechada. */
export function rotuloDaQuinzena(inicio: string, status?: string): string {
  const q = Number(inicio.slice(8, 10)) <= 15 ? 1 : 2;
  return `${inicio.slice(0, 7)} · Q${q}${status && status !== "fechada" ? " (parcial)" : ""}`;
}

/** As quinzenas presentes, em ordem, com o rótulo. */
export function quinzenas(linhas: { quinzena_inicio: string; quinzena_status: string }[]) {
  const vistas = new Map<string, string>();
  for (const l of linhas) vistas.set(l.quinzena_inicio, l.quinzena_status);
  return [...vistas.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([inicio, status]) => ({ inicio, rotulo: rotuloDaQuinzena(inicio, status) }));
}

const pct = (sim: number, total: number) => (total ? Math.round((sim / total) * 1000) / 10 : null);

/** Índice de acerto de um critério num conjunto de avaliações (só o "Sim" é acerto). */
export function acerto(avs: AvaliacaoDoPainel[], ordem: number): number | null {
  const respostas = avs.flatMap((a) => a.itens.filter((i) => i.ordem === ordem));
  return pct(respostas.filter((i) => i.resposta === "sim").length, respostas.length);
}

/** Uma linha por quinzena, uma coluna por critério (o gráfico de barras agrupadas). */
export function acertoPorQuinzena(avs: AvaliacaoDoPainel[], ordens: number[]) {
  return quinzenas(avs).map((q) => {
    const daQ = avs.filter((a) => a.quinzena_inicio === q.inicio);
    return {
      quinzena: q.rotulo,
      ...Object.fromEntries(ordens.map((o) => [`c${o}`, acerto(daQ, o)])),
    };
  });
}

/** A evolução individual de um critério: uma linha por quinzena, uma coluna por pessoa. */
export function evolucaoIndividual(avs: AvaliacaoDoPainel[], ordem: number) {
  const pessoas = [...new Set(avs.map((a) => a.nome))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const dados = quinzenas(avs).map((q) => ({
    quinzena: q.rotulo,
    ...Object.fromEntries(
      pessoas.map((p) => [
        p,
        acerto(
          avs.filter((a) => a.quinzena_inicio === q.inicio && a.nome === p),
          ordem,
        ),
      ]),
    ),
  }));
  return { pessoas, dados };
}

/** Os erros de uma avaliação: todo critério que não foi "Sim". */
export function errosDaAvaliacao(a: AvaliacaoDoPainel) {
  return a.itens
    .filter((i) => i.resposta !== "sim")
    .map((i) => ({
      tipo: TIPO_DE_ERRO[i.ordem] ?? `Critério ${i.ordem}`,
      parcial: i.resposta === "medio",
      observacao: i.observacao,
    }));
}

/** Os erros por tipo: cada "Não" e cada "Médio" (parcial) contam. */
export function errosPorTipo(avs: AvaliacaoDoPainel[]) {
  const cont = new Map<string, { nao: number; parcial: number }>();
  for (const e of avs.flatMap(errosDaAvaliacao)) {
    const c = cont.get(e.tipo) ?? { nao: 0, parcial: 0 };
    if (e.parcial) c.parcial++;
    else c.nao++;
    cont.set(e.tipo, c);
  }
  return [...cont.entries()]
    .map(([tipo, c]) => ({ tipo, ...c, total: c.nao + c.parcial }))
    .sort((a, b) => b.total - a.total || a.tipo.localeCompare(b.tipo, "pt-BR"));
}

/** Os números do topo da aba Avaliações. */
export function resumoDaQualidade(avs: AvaliacaoDoPainel[]) {
  const erros = errosPorTipo(avs);
  return {
    total: avs.length,
    media: media(avs.map((a) => a.nota)),
    com100: avs.filter((a) => a.nota === 100).length,
    abaixoDoMinimo: avs.filter((a) => a.nota < 91).length,
    maisComum: erros[0] ? { tipo: erros[0].tipo, vezes: erros[0].total } : null,
  };
}

/** A nota média de cada pessoa, da maior para a menor. */
export function notaPorPessoa(avs: AvaliacaoDoPainel[]) {
  const pessoas = [...new Set(avs.map((a) => a.nome))];
  return pessoas
    .map((nome) => ({ nome, media: media(avs.filter((a) => a.nome === nome).map((a) => a.nota))! }))
    .sort((a, b) => b.media - a.media);
}

/** As avaliações com desconto mais recentes, com todos os erros. */
export function comDesconto(avs: AvaliacaoDoPainel[], quantas = 8) {
  return avs
    .filter((a) => a.itens.some((i) => i.resposta !== "sim"))
    .sort((a, b) => ((a.data_contato ?? "") < (b.data_contato ?? "") ? 1 : -1))
    .slice(0, quantas)
    .map((a) => ({ ...a, erros: errosDaAvaliacao(a) }));
}

/** A média de um indicador por quinzena (os gráficos de evolução). */
export function mediaPorQuinzena(
  ms: MetricaDoPainel[],
  campo: "produtividade" | "qualidade" | "sla_chat" | "sla_email" | "csat",
) {
  return quinzenas(ms).map((q) => ({
    quinzena: q.rotulo,
    valor: media(ms.filter((m) => m.quinzena_inicio === q.inicio).map((m) => m[campo])),
  }));
}

/** Os cinco números do topo da aba Métricas. */
export function resumoDasMetricas(ms: MetricaDoPainel[]) {
  return {
    produtividade: media(ms.map((m) => m.produtividade)),
    qualidade: media(ms.map((m) => m.qualidade)),
    sla_chat: media(ms.map((m) => m.sla_chat)),
    sla_email: media(ms.map((m) => m.sla_email)),
    csat: media(ms.map((m) => m.csat)),
  };
}
