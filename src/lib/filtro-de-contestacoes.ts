/**
 * O filtro de "Minhas contestações" (07/10/2026): a busca pelo texto e a situação.
 * Puro, para ser testado à parte.
 */
export type SituacaoDoFiltro = "" | "em_analise" | "deferida" | "indeferida";

type ContestacaoFiltravel = {
  assunto: string | null;
  descricao: string | null;
  resolucao: string | null;
  status: string;
};

const normalizar = (s: string | null | undefined) =>
  (s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

/** "Em análise" inclui as recém-abertas (ainda sem ninguém analisando). */
const EM_ANALISE = new Set(["aberta", "em_analise"]);

export function filtrarContestacoes<T extends ContestacaoFiltravel>(
  lista: T[],
  busca: string,
  situacao: SituacaoDoFiltro,
): T[] {
  const termo = normalizar(busca.trim());
  return lista.filter((c) => {
    const situacaoOk =
      !situacao || (situacao === "em_analise" ? EM_ANALISE.has(c.status) : c.status === situacao);
    const buscaOk =
      !termo || normalizar([c.assunto, c.descricao, c.resolucao].join(" ")).includes(termo);
    return situacaoOk && buscaOk;
  });
}
