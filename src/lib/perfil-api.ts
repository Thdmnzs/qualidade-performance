/** O Meu perfil (21/10/2026): a camada do banco do "Sobre mim", do humor e das funcionalidades. */
import { supabase } from "@/integrations/supabase/client";
import type { RegistroDoHumor } from "@/lib/humor";

const falhar = (e: { message: string } | null) => {
  if (e) throw new Error(e.message);
};
/** As funcionalidades que se ligam e desligam: { gamificacao: false }. */
export async function lerFuncionalidades(): Promise<Record<string, boolean>> {
  const { data, error } = await supabase.rpc("funcionalidades_ativas");
  falhar(error);
  return (data ?? {}) as Record<string, boolean>;
}
export async function lerMeusNucleos(): Promise<string[]> {
  const { data, error } = await supabase.rpc("meus_nucleos");
  falhar(error);
  return (data ?? []) as string[];
}
export type MeuHorario = {
  entrada: number | null;
  saida: number | null;
  pausa: number | null;
  fds_dias: number[] | null;
  fds_entrada: number | null;
  fds_saida: number | null;
  fds_pausa: number | null;
};
export async function lerMeuHorario(): Promise<MeuHorario | null> {
  const { data, error } = await supabase.rpc("meu_horario");
  falhar(error);
  return (data ?? null) as MeuHorario | null;
}
/** A folga fixa da pessoa (os dias, de 0, a segunda, a 6, o domingo), pela mesma leitura da escala. */
export async function lerMinhaFolgaFixa(employeeId: string): Promise<number[]> {
  const { lerFolgasFixas } = await import("@/lib/trocas-api");
  return (await lerFolgasFixas()).find((p) => p.employee_id === employeeId)?.dias ?? [];
}
export async function registrarHumor(nivel: number, comentario: string) {
  const { error } = await supabase.rpc("registrar_humor", {
    _nivel: nivel,
    _comentario: comentario,
  });
  falhar(error);
}
export async function lerMeusHumores(
  dias: number,
): Promise<(RegistroDoHumor & { comentario: string | null })[]> {
  const { data, error } = await supabase.rpc("meus_humores", { _dias: dias });
  falhar(error);
  return (data ?? []) as (RegistroDoHumor & { comentario: string | null })[];
}
export type HumorDaPessoa = {
  employee_id: string;
  hoje: number | null;
  comentario_de_hoje: string | null;
  ultimos: RegistroDoHumor[];
};
/** Só o ADM: o humor de hoje e os 14 dias de cada pessoa ativa. */
export async function lerHumorDoTime(): Promise<Map<string, HumorDaPessoa>> {
  const { data, error } = await supabase.rpc("humor_do_time");
  falhar(error);
  return new Map(((data ?? []) as HumorDaPessoa[]).map((h) => [h.employee_id, h]));
}
