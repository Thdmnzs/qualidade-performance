/** O acesso rápido no banco (14/10/2026): ler (todos) e editar (o ADM). */
import { supabase } from "@/integrations/supabase/client";
import type { GrupoDeAtalhos } from "@/lib/acesso-rapido";

const falhar = (e: { message: string } | null) => {
  if (e) throw new Error(e.message);
};
export async function lerAcessoRapido(): Promise<GrupoDeAtalhos[]> {
  const { data, error } = await supabase.rpc("acesso_rapido");
  falhar(error);
  return (data ?? []) as GrupoDeAtalhos[];
}
export async function salvarGrupo(id: string | null, nome: string, icone: string) {
  const { data, error } = await supabase.rpc("salvar_grupo_de_atalhos", {
    _id: id,
    _nome: nome,
    _icone: icone,
  });
  falhar(error);
  return data as string;
}
export async function excluirGrupo(id: string) {
  const { error } = await supabase.rpc("excluir_grupo_de_atalhos", { _id: id });
  falhar(error);
}
export async function moverGrupo(id: string, direcao: -1 | 1) {
  const { error } = await supabase.rpc("mover_grupo_de_atalhos", { _id: id, _direcao: direcao });
  falhar(error);
}
export async function salvarAtalho(a: {
  id: string | null;
  grupoId: string;
  nome: string;
  url: string;
  sub: string;
  restrito: boolean;
}) {
  const { data, error } = await supabase.rpc("salvar_atalho", {
    _id: a.id,
    _grupo_id: a.grupoId,
    _nome: a.nome,
    _url: a.url,
    _sub: a.sub,
    _restrito: a.restrito,
  });
  falhar(error);
  return data as string;
}
export async function excluirAtalho(id: string) {
  const { error } = await supabase.rpc("excluir_atalho", { _id: id });
  falhar(error);
}
export async function moverAtalho(id: string, direcao: -1 | 1) {
  const { error } = await supabase.rpc("mover_atalho", { _id: id, _direcao: direcao });
  falhar(error);
}
