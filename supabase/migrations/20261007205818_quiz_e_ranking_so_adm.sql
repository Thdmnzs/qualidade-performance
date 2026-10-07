-- =====================================================================
-- O quiz e o ranking só com o ADM (07/10/2026).
--
--   * O quiz: só o ADM registra (antes, também quem podia avaliar o colaborador).
--   * A classificação completa (quem concorre, quem fica de fora e o motivo):
--     só o ADM (antes, também os avaliadores).
--   * O pódio: só o ADM o vê antes da publicação. O avaliador passa a vê-lo como
--     o colaborador, depois da publicação (senão, ele saberia antes do time).
-- As três funções partiram das definições em produção (hashes conferidos);
-- muda só a checagem de permissão de cada uma.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.registrar_quiz(_employee_id uuid, _fortnight_id uuid, _entregue boolean)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  _eu uuid := auth.uid();
  _status text;
  _anterior boolean;
  _id uuid;
begin
  -- Desde 07/10/2026, só o ADM registra o quiz.
  if _eu is null or not public.is_admin(_eu) then
    raise exception 'Apenas o ADM registra o quiz.' using errcode = '42501';
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
end; $function$;

CREATE OR REPLACE FUNCTION public.classificacao_da_quinzena(_fortnight_id uuid)
 RETURNS TABLE(employee_id uuid, nome text, elegivel boolean, motivos text[], posicao integer, qualidade numeric, produtividade numeric, sla_chat numeric, sla_email numeric, horas_semanais numeric, quiz_entregue boolean, oficial boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  -- Desde 07/10/2026, só o ADM vê a classificação completa (quem fica de fora e o motivo).
  if auth.uid() is null or not public.is_admin(auth.uid()) then
    raise exception 'Apenas o ADM vê a classificação completa.' using errcode = '42501';
  end if;
  -- Quinzena fechada: a foto oficial. Senão: o cálculo provisório, na hora.
  if exists (select 1 from public.fortnights f where f.id = _fortnight_id and f.status = 'fechada')
     and exists (select 1 from public.bonus_eligibility b where b.fortnight_id = _fortnight_id) then
    return query
      select b.employee_id, e.nome, b.elegivel, array(select jsonb_array_elements_text(b.motivos)), b.posicao,
             (b.criterios ->> 'qualidade')::numeric, (b.criterios ->> 'produtividade')::numeric,
             (b.criterios ->> 'sla_chat')::numeric, (b.criterios ->> 'sla_email')::numeric,
             (b.criterios ->> 'horas_semanais')::numeric, (b.criterios ->> 'quiz_entregue')::boolean, true
        from public.bonus_eligibility b join public.employees e on e.id = b.employee_id
       where b.fortnight_id = _fortnight_id
       order by b.posicao nulls last, e.nome;
  else
    return query select c.*, false from public.calcular_classificacao(_fortnight_id) c;
  end if;
end; $function$;

CREATE OR REPLACE FUNCTION public.podio_da_quinzena(_fortnight_id uuid)
 RETURNS TABLE(posicao integer, employee_id uuid, nome text, destaques integer[], oficial boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if auth.uid() is null then
    raise exception 'Faça login para ver o pódio.' using errcode = '42501';
  end if;
  -- Desde 07/10/2026, só o ADM vê o pódio antes da publicação; o avaliador, como o colaborador.
  if not public.is_admin(auth.uid())
     and not (public.quinzena_publicada(_fortnight_id) and public.current_employee_id() is not null) then
    return;
  end if;
  if exists (select 1 from public.fortnights f where f.id = _fortnight_id and f.status = 'fechada')
     and exists (select 1 from public.rankings r where r.fortnight_id = _fortnight_id) then
    return query
      select r.posicao, r.employee_id, e.nome, coalesce(p.destaques, '{}'), true
        from public.rankings r
        join public.employees e on e.id = r.employee_id
        left join public.perfis_colaborador p on p.employee_id = r.employee_id
       where r.fortnight_id = _fortnight_id
       order by r.posicao, e.nome;
  else
    return query
      select c.posicao, c.employee_id, c.nome, coalesce(p.destaques, '{}'), false
        from public.calcular_classificacao(_fortnight_id) c
        left join public.perfis_colaborador p on p.employee_id = c.employee_id
       where c.posicao <= 3
       order by c.posicao, c.nome;
  end if;
end; $function$;
