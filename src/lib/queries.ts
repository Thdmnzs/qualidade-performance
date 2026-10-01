import { supabase } from "@/integrations/supabase/client";

export async function fetchQuinzenaAtual() {
  const { data, error } = await supabase
    .from("fortnights")
    .select("*")
    .order("data_inicio", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function fetchQuinzenas() {
  const { data, error } = await supabase
    .from("fortnights")
    .select("*")
    .order("data_inicio", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function fetchIndicadores() {
  const { data, error } = await supabase.from("indicators").select("*").order("nome");
  if (error) throw error;
  return data ?? [];
}

export async function fetchResultados(fortnightId: string, employeeId?: string) {
  let query = supabase.from("results").select("*").eq("fortnight_id", fortnightId);
  if (employeeId) query = query.eq("employee_id", employeeId);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function fetchMediasTime(fortnightId: string) {
  const { data, error } = await supabase
    .from("team_metrics")
    .select("*")
    .eq("fortnight_id", fortnightId);
  if (error) throw error;
  return data ?? [];
}

export async function fetchElegibilidade(fortnightId: string, employeeId: string) {
  const { data, error } = await supabase
    .from("bonus_eligibility")
    .select("*")
    .eq("fortnight_id", fortnightId)
    .eq("employee_id", employeeId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function fetchRanking(fortnightId: string) {
  const { data, error } = await supabase
    .from("rankings")
    .select("*, employees(nome, foto_url)")
    .eq("fortnight_id", fortnightId)
    .order("posicao");
  if (error) throw error;
  return data ?? [];
}

export async function fetchPremios() {
  const { data, error } = await supabase.from("bonus_prizes").select("*").order("posicao");
  if (error) throw error;
  return data ?? [];
}

export async function fetchContestacoes(employeeId?: string) {
  let query = supabase
    .from("contestations")
    // Colunas explícitas: quem respondeu (responsavel_id) é oculto do navegador,
    // e pedir "*" faria o banco recusar a consulta inteira.
    .select(
      "id, employee_id, fortnight_id, evaluation_id, assunto, descricao, status, resolucao, respondida_em, responder_ate, created_at, nota_anterior, nota_nova, alteracoes, employees(nome)",
    )
    .order("created_at", { ascending: false });
  if (employeeId) query = query.eq("employee_id", employeeId);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

/** Colaboradores com o perfil efetivo (de user_roles). Retorna vazio para quem não é gestão. */
export async function fetchColaboradores() {
  const { data, error } = await supabase.rpc("listar_colaboradores");
  if (error) throw error;
  return data ?? [];
}

/**
 * Avaliações para avaliadores e ADM, já com "Avaliado por" e "pode_excluir".
 * O banco devolve só o que o usuário pode ver, e nunca as excluídas.
 * (A leitura direta da tabela não traz mais quem avaliou: essa coluna é
 * escondida do navegador para o colaborador nunca saber quem o avaliou.)
 */
export async function fetchAvaliacoesGestao(fortnightId?: string) {
  const { data, error } = await supabase.rpc(
    "listar_avaliacoes_gestao",
    fortnightId ? { _fortnight_id: fortnightId } : {},
  );
  if (error) throw error;
  return data ?? [];
}

/** Quem o usuário logado pode avaliar: ADM vê colaboradores e avaliadores; avaliador, só colaboradores. */
export async function fetchAvaliaveis() {
  const { data, error } = await supabase.rpc("listar_avaliaveis");
  if (error) throw error;
  return data ?? [];
}
