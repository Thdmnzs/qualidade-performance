/** As trocas de escala (12/10/2026): o que a tela pede ao banco. O banco confere quem pode o quê. */
import { supabase } from "@/integrations/supabase/client";
import type { ModoDaFolga, TipoDeTroca } from "@/lib/trocas";

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
  modo: ModoDaFolga | null;
  /** Nas folgas, em pares (de dois em dois). */
  dias: number[];
  de: { id: string; nome: string };
  para: { id: string; nome: string };
  mensagem: string | null;
  situacao: SituacaoDaTroca;
  motivo: string | null;
  /** Aprovada, mas a semana ainda não foi montada: a troca entra ao montar. */
  aplicada: boolean;
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

/** O pedido pelo dia (13/10/2026): o banco confere pela escala publicada ou pela folga fixa. */
export async function pedirTrocaNoDia(
  data: string,
  tipo: TipoDeTroca,
  com: string,
  modo: ModoDaFolga | null,
  segundo: string | null,
  mensagem: string,
) {
  const { error } = await supabase.rpc("pedir_troca_no_dia", {
    _data: data,
    _tipo: tipo,
    _com: com,
    _modo: modo,
    _segundo: segundo,
    _mensagem: mensagem,
  });
  falhar(error);
}
export type PessoaDoTime = {
  employee_id: string;
  nome: string;
  dias: number[];
  supervisao: boolean;
};
export async function lerFolgasFixas(): Promise<PessoaDoTime[]> {
  const { data, error } = await supabase.rpc("folgas_fixas_do_time");
  falhar(error);
  return (data ?? []) as PessoaDoTime[];
}
export async function definirFolgaFixa(employeeId: string, dias: number[]) {
  const { error } = await supabase.rpc("definir_folga_fixa", {
    _employee_id: employeeId,
    _dias: dias,
  });
  falhar(error);
}
/** A montagem: aplica as trocas aprovadas da semana que esperavam a escala. Devolve quantas. */
export async function aplicarTrocasDaSemana(inicio: string): Promise<number> {
  const { data, error } = await supabase.rpc("aplicar_trocas_da_semana", { _inicio: inicio });
  falhar(error);
  return (data as number) ?? 0;
}
