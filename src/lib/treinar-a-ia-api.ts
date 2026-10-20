/** Treinar a IA no banco (20/10/2026): o ADM e os avaliadores (o banco confere). */
import { supabase } from "@/integrations/supabase/client";
import type { AvaliacaoParaExemplo, Concordancia, Motivo, Orientacao } from "@/lib/treinar-a-ia";

const falhar = (e: { message: string } | null) => {
  if (e) throw new Error(e.message);
};
export async function lerOrientacoes(): Promise<Orientacao[]> {
  const { data, error } = await supabase.rpc("orientacoes_para_treinar");
  falhar(error);
  return (data ?? []) as unknown as Orientacao[];
}
export async function lerVersoes(criterioId: string) {
  const { data, error } = await supabase.rpc("versoes_da_orientacao", {
    _criterion_id: criterioId,
  });
  falhar(error);
  return (data ?? []) as unknown as {
    sim: string | null;
    medio: string | null;
    nao: string | null;
    exemplo: string | null;
    autor: string | null;
    em: string;
  }[];
}
export async function salvarOrientacao(
  criterioId: string,
  o: { sim: string; medio: string; nao: string; exemplo: string },
) {
  const { error } = await supabase.rpc("salvar_orientacao", {
    _criterion_id: criterioId,
    _sim: o.sim,
    _medio: o.medio,
    _nao: o.nao,
    _exemplo: o.exemplo,
  });
  falhar(error);
}
export async function lerConcordancia(de: string, ate: string): Promise<Concordancia> {
  const { data, error } = await supabase.rpc("concordancia_da_ia", { _de: de, _ate: ate });
  falhar(error);
  return data as unknown as Concordancia;
}
export async function lerAvaliacoesParaExemplos(): Promise<AvaliacaoParaExemplo[]> {
  const { data, error } = await supabase.rpc("avaliacoes_para_exemplos", { _limite: 80 });
  falhar(error);
  return (data ?? []) as unknown as AvaliacaoParaExemplo[];
}
export async function marcarExemplar(avaliacaoId: string, exemplar: boolean) {
  const { error } = await supabase.rpc("marcar_exemplar", {
    _evaluation_id: avaliacaoId,
    _exemplar: exemplar,
  });
  falhar(error);
}
export async function registrarMotivos(
  avaliacaoId: string,
  motivos: { criterio_id: string; motivo: Motivo }[],
) {
  if (!motivos.length) return;
  const { error } = await supabase.rpc("registrar_motivos_das_mudancas", {
    _evaluation_id: avaliacaoId,
    _motivos: motivos,
  });
  falhar(error);
}
