-- =====================================================================
-- Elegibilidade, ranking e pódio (06/10/2026).
--
-- Regras (especificação + decisões de 06/10/2026):
--   * Concorre quem cumpre TODOS os requisitos: qualidade >= 91; produtividade
--     >= meta (mínimo fixo de 6 tickets/h, das metas registradas); horas logadas
--     com média semanal >= meta (20 h/semana); quiz entregue. Quem falha em mais
--     de um requisito leva TODOS os motivos.
--   * Ordem: maior qualidade; maior produtividade; melhor SLA de chat; melhor
--     SLA de e-mail. Empate em tudo: dividem a posição (sem outro critério).
--   * Provisório enquanto a quinzena não fecha (calculado na hora). No
--     FECHAMENTO, grava a foto oficial: a elegibilidade de cada um (motivos,
--     valores usados, versão das regras) e o Top 3. Reabrir apaga a foto.
--   * Quem vê: ADM e avaliadores, a classificação completa (com valores);
--     todos, o PÓDIO (posição, nome, badges, sem valores), a partir da
--     publicação da quinzena.
--   * Fotos de perfil: legíveis por todos os usuários logados (aparecem no pódio).
-- =====================================================================

-- ---------- 1. Tabelas (vindas do Lovable) ajustadas ----------
-- O ranking aceitava só um "2º lugar" por quinzena; com empate, dois dividem a posição.
alter table public.rankings drop constraint if exists rankings_fortnight_id_posicao_key;
alter table public.rankings add constraint rankings_pessoa_por_quinzena unique (fortnight_id, employee_id);
-- A elegibilidade guarda também os valores usados e a posição (a foto oficial completa).
alter table public.bonus_eligibility
  add column if not exists criterios jsonb not null default '{}'::jsonb,
  add column if not exists posicao int;
-- Só as funções do banco gravam nelas (menor privilégio, também para a chave de serviço).
revoke insert, update, delete, truncate on public.bonus_eligibility, public.rankings from service_role;

-- ---------- 2. O cálculo (uso interno) ----------
create or replace function public.calcular_classificacao(_fortnight_id uuid)
returns table (employee_id uuid, nome text, elegivel boolean, motivos text[], posicao int,
               qualidade numeric, produtividade numeric, sla_chat numeric, sla_email numeric,
               horas_semanais numeric, quiz_entregue boolean)
language sql stable security definer set search_path = public, pg_temp as $$
  with q as (select * from public.fortnights where id = _fortnight_id),
  regras as (
    select coalesce((valor -> 'produtividade' ->> 'meta')::numeric, 6) as prod_min,
           coalesce((valor -> 'horas_online' ->> 'meta')::numeric, 20) as horas_min
      from public.business_settings where chave = 'metas_indicadores'
  ),
  -- Participa quem está ativo, não é ADM e tem algum dado na quinzena.
  pessoas as (
    select e.id, e.nome from public.employees e
     where e.status = 'ativo'
       and public.perfil_do_usuario(e.user_id) is distinct from 'adm'
       and (exists (select 1 from public.evaluations ev
                     where ev.employee_id = e.id and ev.fortnight_id = _fortnight_id and not ev.anulada)
            or exists (select 1 from public.results r where r.employee_id = e.id and r.fortnight_id = _fortnight_id))
  ),
  dados as (
    select p.id, p.nome,
           (select avg(ev.nota) from public.evaluations ev
             where ev.employee_id = p.id and ev.fortnight_id = _fortnight_id and not ev.anulada and ev.nota is not null) as qualidade,
           (select r.valor from public.results r where r.employee_id = p.id and r.fortnight_id = _fortnight_id and r.indicador = 'produtividade') as produtividade,
           (select r.valor from public.results r where r.employee_id = p.id and r.fortnight_id = _fortnight_id and r.indicador = 'sla_chat') as sla_chat,
           (select r.valor from public.results r where r.employee_id = p.id and r.fortnight_id = _fortnight_id and r.indicador = 'sla_email') as sla_email,
           -- A mesma regra da tela: média semanal = total / (dias corridos / 7).
           (select r.valor from public.results r where r.employee_id = p.id and r.fortnight_id = _fortnight_id and r.indicador = 'horas_online')
             / (((select data_fim - data_inicio from q) + 1) / 7.0) as horas_semanais,
           coalesce((select qr.entregue from public.quiz_results qr where qr.employee_id = p.id and qr.fortnight_id = _fortnight_id), false) as quiz
      from pessoas p
  ),
  avaliado as (
    select d.*,
           array_remove(array[
             case when d.qualidade is null then 'Sem avaliações de qualidade na quinzena'
                  when d.qualidade < 91 then 'Qualidade abaixo do mínimo (' || replace(round(d.qualidade, 1)::text, '.', ',') || ')' end,
             case when d.produtividade is null then 'Produtividade ainda não importada'
                  when d.produtividade < r.prod_min then 'Produtividade abaixo do mínimo (' || replace(round(d.produtividade, 1)::text, '.', ',') || ' tickets/h)' end,
             case when d.horas_semanais is null then 'Horas logadas ainda não importadas'
                  when d.horas_semanais < r.horas_min then 'Horas logadas abaixo do mínimo (' || replace(round(d.horas_semanais, 1)::text, '.', ',') || ' h/semana)' end,
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
$$;
revoke all on function public.calcular_classificacao(uuid) from public, anon, authenticated;

-- ---------- 3. Classificação completa: ADM e avaliadores ----------
create or replace function public.classificacao_da_quinzena(_fortnight_id uuid)
returns table (employee_id uuid, nome text, elegivel boolean, motivos text[], posicao int,
               qualidade numeric, produtividade numeric, sla_chat numeric, sla_email numeric,
               horas_semanais numeric, quiz_entregue boolean, oficial boolean)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null or not (public.is_admin(auth.uid()) or public.is_avaliador(auth.uid())) then
    raise exception 'Apenas ADM e avaliadores veem a classificação completa.' using errcode = '42501';
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
end; $$;
revoke all on function public.classificacao_da_quinzena(uuid) from public, anon;
grant execute on function public.classificacao_da_quinzena(uuid) to authenticated;

-- ---------- 4. Pódio: todos, a partir da publicação (sem valores) ----------
create or replace function public.podio_da_quinzena(_fortnight_id uuid)
returns table (posicao int, employee_id uuid, nome text, destaques int[], oficial boolean)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then
    raise exception 'Faça login para ver o pódio.' using errcode = '42501';
  end if;
  -- ADM e avaliadores veem o pódio provisório antes da publicação; os demais, só depois.
  if not (public.is_admin(auth.uid()) or public.is_avaliador(auth.uid()))
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
end; $$;
revoke all on function public.podio_da_quinzena(uuid) from public, anon;
grant execute on function public.podio_da_quinzena(uuid) to authenticated;

-- ---------- 5. Fechamento: grava a foto oficial; reabrir apaga ----------
create or replace function public.registrar_resultado_oficial(_fortnight_id uuid)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  delete from public.rankings where fortnight_id = _fortnight_id;
  delete from public.bonus_eligibility where fortnight_id = _fortnight_id;
  insert into public.bonus_eligibility
    (employee_id, fortnight_id, elegivel, motivos, versao_regras, calculado_em, criterios, posicao)
  select c.employee_id, _fortnight_id, c.elegivel, to_jsonb(c.motivos),
         'v1 (06/10/2026): qualidade >= 91; produtividade >= meta; horas >= meta semanal; quiz entregue',
         now(),
         jsonb_build_object('qualidade', c.qualidade, 'produtividade', c.produtividade, 'sla_chat', c.sla_chat,
                            'sla_email', c.sla_email, 'horas_semanais', c.horas_semanais, 'quiz_entregue', c.quiz_entregue),
         c.posicao
    from public.calcular_classificacao(_fortnight_id) c;
  insert into public.rankings (fortnight_id, employee_id, posicao, criterios)
  select _fortnight_id, c.employee_id, c.posicao,
         jsonb_build_object('qualidade', c.qualidade, 'produtividade', c.produtividade,
                            'sla_chat', c.sla_chat, 'sla_email', c.sla_email)
    from public.calcular_classificacao(_fortnight_id) c
   where c.posicao <= 3;
end; $$;
revoke all on function public.registrar_resultado_oficial(uuid) from public, anon, authenticated;

create or replace function public.resultado_oficial_ao_mudar_quinzena()
returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.status = 'fechada' and old.status is distinct from 'fechada' then
    perform public.registrar_resultado_oficial(new.id);
  elsif old.status = 'fechada' and new.status <> 'fechada' then
    delete from public.rankings where fortnight_id = new.id;
    delete from public.bonus_eligibility where fortnight_id = new.id;
  end if;
  return new;
end; $$;
revoke all on function public.resultado_oficial_ao_mudar_quinzena() from public, anon, authenticated;

create trigger resultado_oficial_quinzena
  after update of status on public.fortnights
  for each row execute function public.resultado_oficial_ao_mudar_quinzena();

-- ---------- 6. Fotos: legíveis por todos os usuários logados (aparecem no pódio) ----------
drop policy if exists "avatares_ver" on storage.objects;
create policy "avatares_ver" on storage.objects for select to authenticated
  using (bucket_id = 'avatares');


-- Sem cálculo retroativo: a quinzena já fechada (1ª de setembro) não tem indicadores
-- importados, e todos sairiam "não elegíveis" por falta de dados. Vale a partir do
-- próximo fechamento.
