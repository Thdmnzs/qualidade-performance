/** O que os dados pessoais pedem ao banco (12/10/2026). O banco confere tudo, e decide quem vê. */
import { supabase } from "@/integrations/supabase/client";
import { soDigitos, type Ficha } from "@/lib/dados-pessoais";

const falhar = (e: { message: string } | null) => {
  if (e) throw new Error(e.message);
};
const campos = (f: Ficha) => ({
  _dia: f.aniversario_dia,
  _mes: f.aniversario_mes,
  _cep: soDigitos(f.cep),
  _rua: f.rua ?? "",
  _numero: f.numero ?? "",
  _complemento: f.complemento ?? "",
  _bairro: f.bairro ?? "",
  _cidade: f.cidade ?? "",
  _uf: f.uf ?? "",
  _contato_nome: f.contato_nome ?? "",
  _contato_parentesco: f.contato_parentesco ?? "",
  _contato_telefone: soDigitos(f.contato_telefone),
});

export async function lerMeusDados(): Promise<Ficha> {
  const { data, error } = await supabase.rpc("meus_dados_pessoais");
  falhar(error);
  return data as unknown as Ficha;
}
export async function salvarMeusDados(f: Ficha) {
  const { error } = await supabase.rpc("salvar_meus_dados_pessoais", {
    ...campos(f),
    _visivel: f.aniversario_visivel,
    _tema: f.aniversario_tema,
  });
  falhar(error);
  await salvarContatosExtras(null, f);
}
/** Os contatos de emergência a mais (23/10/2026): os da própria pessoa (null), ou os de outra (o ADM). */
async function salvarContatosExtras(employeeId: string | null, f: Ficha) {
  const contatos = (f.contatos_extras ?? []).map((c) => ({
    nome: c.nome,
    parentesco: c.parentesco,
    telefone: soDigitos(c.telefone),
  }));
  const { error } = await supabase.rpc("salvar_contatos_extras", {
    _employee_id: employeeId as string,
    _contatos: contatos,
  });
  falhar(error);
}
/** O ADM: a ficha de uma pessoa. */
export async function lerDadosDe(employeeId: string): Promise<Ficha> {
  const { data, error } = await supabase.rpc("dados_pessoais_de", { _employee_id: employeeId });
  falhar(error);
  return data as unknown as Ficha;
}
/** O ADM: corrigir (o "mostrar para o time" e o tema continuam da pessoa). */
export async function corrigirDadosDe(employeeId: string, f: Ficha) {
  const { error } = await supabase.rpc("corrigir_dados_pessoais", {
    _employee_id: employeeId,
    ...campos(f),
  });
  falhar(error);
  await salvarContatosExtras(employeeId, f);
}
/** O ADM: o que falta na ficha de cada pessoa (sem os dados). */
export async function lerSituacaoDosDados(): Promise<Map<string, string[]>> {
  const { data, error } = await supabase.rpc("situacao_dos_dados_pessoais");
  falhar(error);
  return new Map(
    ((data ?? []) as { employee_id: string; falta: string[] }[]).map((x) => [
      x.employee_id,
      x.falta ?? [],
    ]),
  );
}
