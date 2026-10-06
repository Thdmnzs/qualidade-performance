-- =====================================================================
-- Auditoria na tela (05/10/2026): consulta para a aba "Auditoria" do Histórico.
--
--   * Só LÊ. Roda com a permissão de quem chama (security invoker): a
--     auditoria continua visível só para o ADM (regra de acesso da tabela).
--   * Filtros no banco (período, ações, quem fez, busca), para valerem sobre
--     TODA a auditoria, e não só sobre o que já está na tela. Carrega em partes.
--   * "alvo": o nome de quem foi afetado (quinzena ou colaborador), porque
--     várias ações guardam só o identificador do registro.
--   * A busca trata o texto digitado como TEXTO: % e _ não viram curingas.
-- =====================================================================
create or replace function public.listar_auditoria(
  _dias int default 30,
  _acoes text[] default null,
  _quem text default null,
  _busca text default null,
  _limite int default 50,
  _deslocamento int default 0)
returns table (id uuid, criado_em timestamptz, quem text, acao text, entidade text, alvo text,
               valor_anterior jsonb, valor_novo jsonb, total bigint)
language sql stable security invoker set search_path = public, pg_temp as $$
  with base as (
    select a.*,
           coalesce(
             case a.entidade
               when 'fortnights' then (
                 select case f.tipo when 'primeira' then '1ª' else '2ª' end || ' quinzena de '
                        || (array['janeiro','fevereiro','março','abril','maio','junho','julho','agosto',
                                  'setembro','outubro','novembro','dezembro'])[f.mes] || '/' || f.ano
                   from public.fortnights f where f.id = a.registro_id)
               when 'employees' then (select e.nome from public.employees e where e.id = a.registro_id)
               when 'evaluations' then (
                 select e.nome from public.evaluations ev join public.employees e on e.id = ev.employee_id
                  where ev.id = a.registro_id)
               when 'contestations' then (
                 select e.nome from public.contestations c
                   join public.evaluations ev on ev.id = c.evaluation_id
                   join public.employees e on e.id = ev.employee_id
                  where c.id = a.registro_id)
               when 'sorteios_contato' then (
                 select e.nome from public.sorteios_contato s join public.employees e on e.id = s.employee_id
                  where s.id = a.registro_id)
               when 'quiz_results' then (
                 select e.nome from public.quiz_results q join public.employees e on e.id = q.employee_id
                  where q.id = a.registro_id)
             end,
             a.valor_novo ->> 'colaborador') as alvo
      from public.audit_logs a
     where (_dias is null or a.created_at >= now() - make_interval(days => _dias))
       and (_acoes is null or a.acao = any(_acoes))
       and (_quem is null or a.usuario_nome = _quem)
  )
  select b.id, b.created_at, coalesce(b.usuario_nome, 'Sistema'), b.acao, b.entidade, b.alvo,
         b.valor_anterior, b.valor_novo, count(*) over ()
    from base b
   where nullif(btrim(coalesce(_busca, '')), '') is null
      or concat_ws(' ', b.usuario_nome, b.alvo, b.valor_anterior::text, b.valor_novo::text)
         ilike '%' || replace(replace(replace(btrim(_busca), '\', '\\'), '%', '\%'), '_', '\_') || '%'
   order by b.created_at desc
   limit least(greatest(coalesce(_limite, 50), 1), 200)
  offset greatest(coalesce(_deslocamento, 0), 0)
$$;

revoke all on function public.listar_auditoria(int, text[], text, text, int, int) from public, anon;
grant execute on function public.listar_auditoria(int, text[], text, text, int, int) to authenticated;
