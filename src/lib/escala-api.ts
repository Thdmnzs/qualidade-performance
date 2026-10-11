/**
 * O que a tela da escala pede ao banco (11/10/2026). As funções do banco conferem o
 * ADM (para montar) e o membro (para ver); a tela só traduz as respostas.
 */
import { supabase } from "@/integrations/supabase/client";
import type { DiasDaSemana, Horas, Sigla } from "@/lib/escala";

const falhar = (e: { message: string } | null) => {
  if (e) throw new Error(e.message);
};

export async function lerSiglas(): Promise<Sigla[]> {
  const { data, error } = await supabase
    .from("escala_siglas")
    .select("*")
    .order("ordem")
    .order("sigla");
  falhar(error);
  return (data ?? []) as Sigla[];
}

export type Semana = {
  inicio: string;
  situacao: "rascunho" | "publicada" | null;
  publicada_em: string | null;
  eu: string | null;
  feriados: string[];
  dias: DiasDaSemana;
};
type Resposta = {
  inicio: string;
  situacao: Semana["situacao"];
  publicada_em?: string | null;
  eu?: string | null;
  feriados?: string[];
  linhas?: { dia: number; ordem: number; employee_id: string; nome: string; horas: Horas }[];
};
export async function lerSemana(inicio: string): Promise<Semana> {
  const { data, error } = await supabase.rpc("escala_da_semana", { _inicio: inicio });
  falhar(error);
  const r = data as unknown as Resposta;
  const dias: DiasDaSemana = Array.from({ length: 7 }, () => []);
  for (const l of r.linhas ?? [])
    dias[l.dia]!.push({ employee_id: l.employee_id, nome: l.nome, horas: l.horas });
  return {
    inicio: r.inicio,
    situacao: r.situacao,
    publicada_em: r.publicada_em ?? null,
    eu: r.eu ?? null,
    feriados: r.feriados ?? [],
    dias,
  };
}

export async function lerSemanas(): Promise<
  { inicio: string; situacao: "rascunho" | "publicada" }[]
> {
  const { data, error } = await supabase.rpc("semanas_da_escala");
  falhar(error);
  return (data as unknown as { inicio: string; situacao: "rascunho" | "publicada" }[]) ?? [];
}

export type FeriasDoAno = {
  ano: number;
  eu: string | null;
  feriados: Set<string>;
  porDia: Map<string, { employee_id: string; nome: string }[]>;
};
export async function lerFerias(ano: number): Promise<FeriasDoAno> {
  const { data, error } = await supabase.rpc("ferias_do_ano", { _ano: ano });
  falhar(error);
  const r = data as unknown as {
    ano: number;
    eu: string | null;
    feriados: string[];
    ferias: { data: string; employee_id: string; nome: string }[];
  };
  const porDia = new Map<string, { employee_id: string; nome: string }[]>();
  for (const f of r.ferias ?? [])
    porDia.set(f.data, [
      ...(porDia.get(f.data) ?? []),
      { employee_id: f.employee_id, nome: f.nome },
    ]);
  return { ano: r.ano, eu: r.eu, feriados: new Set(r.feriados ?? []), porDia };
}

const paraBanco = (linhas: DiasDaSemana[number]) =>
  linhas.map((l) => ({ employee_id: l.employee_id, horas: l.horas }));
export async function salvarDia(inicio: string, dia: number, linhas: DiasDaSemana[number]) {
  const { error } = await supabase.rpc("salvar_dia_da_escala", {
    _inicio: inicio,
    _dia: dia,
    _linhas: paraBanco(linhas),
  });
  falhar(error);
}
/** Vários dias de uma vez (copiar, apagar): por inteiro, ou nada. */
export async function salvarDias(inicio: string, dias: Record<number, DiasDaSemana[number]>) {
  const corpo = Object.fromEntries(Object.entries(dias).map(([d, l]) => [d, paraBanco(l)]));
  const { error } = await supabase.rpc("salvar_semana_da_escala", {
    _inicio: inicio,
    _dias: corpo,
  });
  falhar(error);
}
export async function publicarSemana(inicio: string) {
  const { error } = await supabase.rpc("publicar_semana_da_escala", { _inicio: inicio });
  falhar(error);
}
export async function criarSigla(sigla: string, cor: string, significado: string): Promise<string> {
  const { data, error } = await supabase.rpc("criar_sigla_da_escala", {
    _sigla: sigla,
    _cor: cor,
    _significado: significado,
  });
  falhar(error);
  return data as string;
}
export async function definirFerias(employeeId: string, datas: string[], deFerias: boolean) {
  const { error } = await supabase.rpc("definir_ferias", {
    _employee_id: employeeId,
    _datas: datas,
    _de_ferias: deFerias,
  });
  falhar(error);
}
export async function definirFeriado(data: string, feriado: boolean) {
  const { error } = await supabase.rpc("definir_feriado", { _data: data, _feriado: feriado });
  falhar(error);
}
