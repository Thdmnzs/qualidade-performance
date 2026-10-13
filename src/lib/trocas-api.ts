/** As trocas de escala (12/10/2026): o que a tela pede ao banco. O banco confere quem pode o quê. */
import { supabase } from "@/integrations/supabase/client";
import type { TipoDeTroca } from "@/lib/trocas";

const falhar = (e: { message: string } | null) => {
  if (e) throw new Error(e.message);
};
export type SituacaoDaTroca =
  | "aguardando_colega"
  | "aguardando_supervisao"
  | "aprovada"
  | "recusada_colega"
  | "recusada"
  | "cancelada";
export type Troca = {
  id: string;
  inicio: string;
  tipo: TipoDeTroca;
  dias: number[];
  de: { id: string; nome: string };
  para: { id: string; nome: string };
  mensagem: string | null;
  situacao: SituacaoDaTroca;
  motivo: string | null;
  criado_em: string;
  aceita_em: string | null;
  decidida_em: string | null;
};
export async function lerMinhasTrocas(): Promise<Troca[]> {
  const { data, error } = await supabase.rpc("minhas_trocas");
  falhar(error);
  return (data as unknown as Troca[]) ?? [];
}
export async function lerTrocasParaAprovar(): Promise<Troca[]> {
  const { data, error } = await supabase.rpc("trocas_para_aprovar");
  falhar(error);
  return (data as unknown as Troca[]) ?? [];
}
export async function pedirTroca(
  inicio: string,
  tipo: TipoDeTroca,
  dias: number[],
  com: string,
  mensagem: string,
) {
  const { error } = await supabase.rpc("pedir_troca", {
    _inicio: inicio,
    _tipo: tipo,
    _dias: dias,
    _com: com,
    _mensagem: mensagem,
  });
  falhar(error);
}
export async function responderTroca(id: string, aceitar: boolean) {
  const { error } = await supabase.rpc("responder_troca", { _troca: id, _aceitar: aceitar });
  falhar(error);
}
export async function cancelarTroca(id: string) {
  const { error } = await supabase.rpc("cancelar_troca", { _troca: id });
  falhar(error);
}
export async function decidirTroca(id: string, aprovar: boolean, motivo: string | null) {
  const { error } = await supabase.rpc("decidir_troca", {
    _troca: id,
    _aprovar: aprovar,
    _motivo: motivo ?? "",
  });
  falhar(error);
}
