/** Os parabéns do time (12/10/2026). Só quem mandou e quem recebeu leem os recados (o banco garante). */
import { supabase } from "@/integrations/supabase/client";

const falhar = (e: { message: string } | null) => {
  if (e) throw new Error(e.message);
};
export type Aniversariante = {
  employee_id: string;
  nome: string;
  sou_eu: boolean;
  ja_dei: boolean;
};
export type ProximoAniversario = {
  employee_id: string;
  nome: string;
  dia: number;
  mes: number;
  data: string;
};
export type Recado = { id: string; autor: string; texto: string; criado_em: string };

export async function lerAniversariantesDeHoje(): Promise<Aniversariante[]> {
  const { data, error } = await supabase.rpc("aniversariantes_de_hoje");
  falhar(error);
  return (data ?? []) as Aniversariante[];
}
export async function lerProximosAniversarios(dias = 7): Promise<ProximoAniversario[]> {
  const { data, error } = await supabase.rpc("proximos_aniversarios", { _dias: dias });
  falhar(error);
  return (data ?? []) as ProximoAniversario[];
}
export async function darParabens(aniversariante: string, texto: string) {
  const { error } = await supabase.rpc("dar_parabens", {
    _aniversariante: aniversariante,
    _texto: texto,
  });
  falhar(error);
}
export async function lerMeusRecados(): Promise<Recado[]> {
  const { data, error } = await supabase.rpc("meus_parabens");
  falhar(error);
  return (data ?? []) as Recado[];
}
export async function ocultarRecado(id: string) {
  const { error } = await supabase.rpc("ocultar_parabens", { _id: id });
  falhar(error);
}
