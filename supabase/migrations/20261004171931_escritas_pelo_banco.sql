-- =====================================================================
-- Revisão de segurança do banco (05/10/2026): escritas diretas do navegador.
--
-- Achados:
--   * 12 tabelas (herdadas do Lovable) aceitavam INSERT/UPDATE/DELETE direto do
--     navegador do ADM, sem regra de negócio nem auditoria: resultados oficiais,
--     médias do time, elegibilidade, ranking, critérios da ficha, metas... Nenhuma
--     tela usa essas escritas.
--   * contestation_messages: o colaborador podia gravar mensagem com QUALQUER
--     autor_id (se passar por outra pessoa). Nenhuma tela usa a tabela.
--   * quiz_results: o avaliador gravava direto, informando ele mesmo o
--     "registrado_por" (aceitava qualquer pessoa), em qualquer quinzena
--     (inclusive fechada, mudando a elegibilidade oficial) e sem auditoria.
--
-- Correção: o navegador só LÊ essas tabelas. O quiz passa pela função
-- registrar_quiz (confere quem chama, a quinzena e registra na auditoria).
-- As regras de leitura não mudam. ISO/IEC 27002:2022 5.15, 8.3 e 8.15.
-- =====================================================================

-- ---------- 1. O navegador não grava mais direto nessas tabelas ----------
revoke insert, update, delete, truncate on
  public.bonus_eligibility, public.bonus_prizes, public.business_settings, public.contestation_messages,
  public.csat_reports, public.data_imports, public.evaluation_criteria, public.indicators,
  public.notifications, public.rankings, public.results, public.team_metrics, public.quiz_results
from authenticated;

-- ---------- 2. Quiz: só pela função ----------
create or replace function public.registrar_quiz(_employee_id uuid, _fortnight_id uuid, _entregue boolean)
returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  _eu uuid := auth.uid();
  _status text;
  _anterior boolean;
  _id uuid;
begin
  if _eu is null or not (public.is_admin(_eu) or public.pode_atuar_sobre(_eu, _employee_id)) then
    raise exception 'Você não pode registrar o quiz deste colaborador.' using errcode = '42501';
  end if;
  select status into _status from public.fortnights where id = _fortnight_id;
  if _status is null then
    raise exception 'Quinzena não encontrada.' using errcode = 'P0002';
  end if;
  if _status = 'fechada' then
    raise exception 'A quinzena já foi fechada: o quiz não pode mais ser alterado.' using errcode = 'P0001';
  end if;

  select entregue into _anterior from public.quiz_results where employee_id = _employee_id and fortnight_id = _fortnight_id;

  insert into public.quiz_results (employee_id, fortnight_id, entregue, registrado_por, updated_at)
  values (_employee_id, _fortnight_id, coalesce(_entregue, false), _eu, now())
  on conflict (employee_id, fortnight_id) do update
     set entregue = excluded.entregue, registrado_por = _eu, updated_at = now()
  returning id into _id;

  insert into public.audit_logs (usuario_id, usuario_nome, acao, entidade, registro_id, valor_anterior, valor_novo)
  values (_eu, (select nome from public.employees where user_id = _eu limit 1), 'registrar_quiz', 'quiz_results', _id,
          case when _anterior is null then null else jsonb_build_object('entregue', _anterior) end,
          jsonb_build_object('entregue', coalesce(_entregue, false),
                             'colaborador', (select nome from public.employees where id = _employee_id)));
  return coalesce(_entregue, false);
end; $$;

revoke all on function public.registrar_quiz(uuid, uuid, boolean) from public, anon;
grant execute on function public.registrar_quiz(uuid, uuid, boolean) to authenticated;
