-- =====================================================================
-- O resultado na publicação, e o fechamento pela planilha (16/10/2026).
--
--   * O fechamento (a elegibilidade, o ranking e o bônus) lia a produtividade, os SLA e as horas da
--     tabela antiga dos ARQUIVOS (que ninguém mais preenche): com a planilha, todo o time sairia "não
--     elegível". Agora ele lê os dados da PLANILHA, pela mesma conta da tela do colaborador (as somas;
--     o SLA, a média dos dias). A qualidade, o quiz, as regras e o desempate não mudam.
--   * O colaborador lê o PRÓPRIO resultado de uma quinzena publicada: o oficial (depois do fechamento)
--     ou a prévia (a mesma conta do fechamento), enquanto a quinzena está em contestação.
-- =====================================================================
create or replace function public.calcular_classificacao(_fortnight_id uuid)
 returns table(employee_id uuid, nome text, elegivel boolean, motivos text[], posicao integer, qualidade numeric, produtividade numeric, sla_chat numeric, sla_email numeric, horas_semanais numeric, quiz_entregue boolean)
 language sql stable security definer set search_path = public, pg_temp
as $function$
  with q as (select * from public.fortnights where id = _fortnight_id),
  regras as (
    select coalesce((valor -> 'produtividade' ->> 'meta')::numeric, 6) as prod_min,
           coalesce((valor -> 'horas_online' ->> 'meta')::numeric, 20) as horas_min
      from public.business_settings where chave = 'metas_indicadores'
  ),
  -- Participa quem está ativo, não é ADM e tem algum dado na quinzena (as avaliações ou a planilha).
  pessoas as (
    select e.id, e.nome from public.employees e
     where e.status = 'ativo'
       and public.perfil_do_usuario(e.user_id) is distinct from 'adm'
       and (exists (select 1 from public.evaluations ev
                     where ev.employee_id = e.id and ev.fortnight_id = _fortnight_id and not ev.anulada)
            or exists (select 1 from public.indicadores_diarios d, q
                        where d.employee_id = e.id and d.dia between q.data_inicio and q.data_fim))
  ),
  dados as (
    select p.id, p.nome,
           (select avg(ev.nota) from public.evaluations ev
             where ev.employee_id = p.id and ev.fortnight_id = _fortnight_id and not ev.anulada and ev.nota is not null) as qualidade,
           -- Os indicadores da planilha, na quinzena (a mesma conta da tela do colaborador). O SLA em minutos.
           ci.produtividade,
           round(ci.sla_chat_s / 60.0, 2) as sla_chat,
           round(ci.sla_email_s / 60.0, 2) as sla_email,
           ci.horas_semanais,
           coalesce((select qr.entregue from public.quiz_results qr where qr.employee_id = p.id and qr.fortnight_id = _fortnight_id), false) as quiz
      from pessoas p cross join q
      cross join lateral public.calcular_indicadores_periodo(p.id, q.data_inicio, q.data_fim) ci
  ),
  avaliado as (
    select d.*,
           array_remove(array[
             case when d.qualidade is null then 'Sem avaliações de qualidade na quinzena'
                  when d.qualidade < 91 then 'Qualidade abaixo do mínimo (' || replace(round(d.qualidade, 1)::text, '.', ',') || ')' end,
             case when d.produtividade is null then 'Sem dados de produtividade na quinzena (a planilha)'
                  when d.produtividade < r.prod_min then 'Produtividade abaixo do mínimo (' || replace(round(d.produtividade, 1)::text, '.', ',') || ' tickets/h)' end,
             case when d.horas_semanais is null then 'Sem dados de horas na quinzena (a planilha)'
                  when d.horas_semanais < r.horas_min then 'Horas online abaixo do mínimo (' || replace(round(d.horas_semanais, 1)::text, '.', ',') || ' h/semana)' end,
             case when not d.quiz then 'Quiz não entregue' end
           ], null) as motivos
      from dados d cross join regras r
  )
  select a.id, a.nome, cardinality(a.motivos) = 0, a.motivos,
         -- rank(): empate total divide a posição (1, 2, 2, 4...). Só entre quem concorre.
         case when cardinality(a.motivos) = 0 then
           (rank() over (partition by cardinality(a.motivos) = 0
                         order by a.qualidade desc, a.produtividade desc, a.sla_chat asc nulls last, a.sla_email asc nulls last))::int
         end,
         round(a.qualidade, 2), a.produtividade, a.sla_chat, a.sla_email, round(a.horas_semanais, 2), a.quiz
    from avaliado a
   order by 5 nulls last, a.nome
$function$;

-- O resultado do colaborador numa quinzena publicada: o oficial (fechada) ou a prévia (em contestação).
create or replace function public.meu_resultado_da_quinzena(_fortnight_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  _eu uuid := public.current_employee_id();
  _q public.fortnights%rowtype;
  _ci record;
  _oficial public.bonus_eligibility%rowtype;
  _previa record;
begin
  if _eu is null then raise exception 'Cadastro não encontrado.' using errcode = '42501'; end if;
  select * into _q from public.fortnights where id = _fortnight_id;
  if not found or _q.status not in ('em_contestacao', 'pronta_para_fechamento', 'fechada') then
    return null; -- antes da publicação, nada
  end if;
  select * into _ci from public.calcular_indicadores_periodo(_eu, _q.data_inicio, _q.data_fim);
  select * into _oficial from public.bonus_eligibility where fortnight_id = _fortnight_id and employee_id = _eu;
  if found then
    return jsonb_build_object('oficial', true, 'elegivel', _oficial.elegivel, 'motivos', _oficial.motivos,
      'produtividade', _oficial.criterios->'produtividade', 'sla_chat', _oficial.criterios->'sla_chat', 'sla_email', _oficial.criterios->'sla_email',
      'horas_semanais', _oficial.criterios->'horas_semanais', 'quiz', _oficial.criterios->'quiz_entregue', 'csat_time', _ci.csat_time);
  end if;
  select * into _previa from public.calcular_classificacao(_fortnight_id) c where c.employee_id = _eu;
  return jsonb_build_object('oficial', false, 'elegivel', _previa.elegivel, 'motivos', to_jsonb(coalesce(_previa.motivos, '{}'::text[])),
    'produtividade', coalesce(_previa.produtividade, _ci.produtividade), 'sla_chat', coalesce(_previa.sla_chat, round(_ci.sla_chat_s / 60.0, 2)),
    'sla_email', coalesce(_previa.sla_email, round(_ci.sla_email_s / 60.0, 2)), 'horas_semanais', coalesce(_previa.horas_semanais, _ci.horas_semanais),
    'quiz', _previa.quiz_entregue, 'csat_time', _ci.csat_time);
end; $$;

revoke all on function public.meu_resultado_da_quinzena(uuid) from public, anon;
grant execute on function public.meu_resultado_da_quinzena(uuid) to authenticated;
