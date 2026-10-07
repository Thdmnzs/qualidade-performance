-- =====================================================================
-- Produtividade dos avaliadores (07/10/2026): aba "Avaliadores" do Histórico.
--
--   * Ritmo medido: o tempo de cada avaliação vai da PRIMEIRA abertura do
--     contato (sorteado ou colado) até o registro. Acima de 60 minutos, ou sem
--     abertura registrada, fica fora da conta. A hora da abertura vem do
--     servidor, nunca do navegador. Os sorteios antigos já têm a hora.
--   * Horas de quali: lidas da planilha da escala (cada célula "quali" = 1 hora),
--     pelo servidor, com uma conta de serviço do Google. Cada leitura SUBSTITUI
--     as horas dos dias lidos e fica registrada.
--   * Só o ADM vê. Nenhuma das tabelas guarda nada das conversas.
-- =====================================================================

-- ---------- Aberturas de contato ----------
create table public.aberturas_contato (
  id uuid primary key default gen_random_uuid(),
  avaliador_user_id uuid not null,
  employee_id uuid not null references public.employees(id) on delete cascade,
  conversa_id text not null check (conversa_id ~ '^[0-9]{1,30}$'),
  aberto_em timestamptz not null default now(),
  unique (avaliador_user_id, employee_id, conversa_id)
);
alter table public.aberturas_contato enable row level security;
revoke all on public.aberturas_contato from anon, authenticated, service_role;

create or replace function public.registrar_abertura_contato(_chamador uuid, _employee_id uuid, _conversa_id text)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if _chamador is null or not public.pode_atuar_sobre(_chamador, _employee_id) then
    raise exception 'Você não pode avaliar este colaborador.' using errcode = '42501';
  end if;
  -- Vale a PRIMEIRA abertura: abrir de novo não reinicia o relógio.
  insert into public.aberturas_contato (avaliador_user_id, employee_id, conversa_id)
  values (_chamador, _employee_id, _conversa_id)
  on conflict (avaliador_user_id, employee_id, conversa_id) do nothing;
end; $$;
revoke all on function public.registrar_abertura_contato(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.registrar_abertura_contato(uuid, uuid, text) to service_role;

-- ---------- Horas de quali (da escala) e o registro das leituras ----------
create table public.horas_quali (
  employee_id uuid not null references public.employees(id) on delete cascade,
  dia date not null,
  horas numeric not null check (horas >= 0 and horas <= 24),
  aba text,
  lido_em timestamptz not null default now(),
  primary key (employee_id, dia)
);
alter table public.horas_quali enable row level security;
create policy "horas_quali_ler" on public.horas_quali for select to authenticated using (public.is_admin(auth.uid()));
revoke all on public.horas_quali from anon, authenticated, service_role;
grant select on public.horas_quali to authenticated;

create table public.leituras_escala (
  id uuid primary key default gen_random_uuid(),
  lido_em timestamptz not null default now(),
  origem text not null check (origem in ('automatica', 'manual')),
  por_user_id uuid,
  abas int not null default 0,
  dias int not null default 0,
  nomes_nao_reconhecidos text[] not null default '{}',
  erro text
);
alter table public.leituras_escala enable row level security;
create policy "leituras_escala_ler" on public.leituras_escala for select to authenticated using (public.is_admin(auth.uid()));
revoke all on public.leituras_escala from anon, authenticated, service_role;
grant select on public.leituras_escala to authenticated;

-- Normaliza um nome para comparar: minúsculas, sem acento, só o primeiro nome.
create or replace function public.primeiro_nome_normalizado(_nome text)
returns text
language sql immutable set search_path = public, pg_temp as $$
  select split_part(btrim(translate(lower(coalesce(_nome, '')),
    'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc')), ' ', 1)
$$;

-- Grava uma leitura: _linhas = [{"nome": "Fran", "dia": "2026-10-07", "horas": 2}, ...];
-- _dias = todos os dias lidos (as horas desses dias são SUBSTITUÍDAS).
create or replace function public.registrar_leitura_escala(
  _chamador uuid, _origem text, _linhas jsonb, _dias date[], _abas int, _erro text)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  _nao text[] := '{}';
  _r record;
  _ids uuid[];
  _gravadas int := 0;
begin
  -- Leitura manual: só o ADM. A automática vem da tarefa agendada (sem chamador).
  if _origem = 'manual' and (_chamador is null or not public.is_admin(_chamador)) then
    raise exception 'Apenas o ADM pode ler a escala.' using errcode = '42501';
  end if;
  if _erro is null then
    delete from public.horas_quali where dia = any(coalesce(_dias, '{}'));
    for _r in select x ->> 'nome' as nome, (x ->> 'dia')::date as dia, (x ->> 'horas')::numeric as horas, x ->> 'aba' as aba
                from jsonb_array_elements(coalesce(_linhas, '[]'::jsonb)) x loop
      -- Só entre avaliadores ativos, pelo primeiro nome. Ambíguo ou sem par: não importa.
      select array_agg(e.id) into _ids from public.employees e
       where e.status = 'ativo' and public.perfil_do_usuario(e.user_id) = 'avaliador'
         and public.primeiro_nome_normalizado(e.nome) = public.primeiro_nome_normalizado(_r.nome);
      if coalesce(array_length(_ids, 1), 0) <> 1 then
        if not (_r.nome = any(_nao)) then _nao := _nao || _r.nome; end if;
        continue;
      end if;
      insert into public.horas_quali (employee_id, dia, horas, aba) values (_ids[1], _r.dia, _r.horas, _r.aba)
      on conflict (employee_id, dia) do update set horas = excluded.horas, aba = excluded.aba, lido_em = now();
      _gravadas := _gravadas + 1;
    end loop;
  end if;
  insert into public.leituras_escala (origem, por_user_id, abas, dias, nomes_nao_reconhecidos, erro)
  values (_origem, _chamador, coalesce(_abas, 0), coalesce(array_length(_dias, 1), 0), _nao, _erro);
  return jsonb_build_object('gravadas', _gravadas, 'nao_reconhecidos', to_jsonb(_nao));
end; $$;
revoke all on function public.registrar_leitura_escala(uuid, text, jsonb, date[], int, text) from public, anon, authenticated;
grant execute on function public.registrar_leitura_escala(uuid, text, jsonb, date[], int, text) to service_role;

-- ---------- O cálculo (só o ADM) ----------
create or replace function public.produtividade_avaliadores(_de date, _ate date)
returns table (avaliador_user_id uuid, nome text, avaliacoes int, contadas int, minutos numeric,
               descartes int, horas_quali numeric)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null or not public.is_admin(auth.uid()) then
    raise exception 'Apenas o ADM vê a produtividade dos avaliadores.' using errcode = '42501';
  end if;
  if _de is null or _ate is null or _de > _ate then
    raise exception 'Escolha um período válido.' using errcode = 'P0001';
  end if;
  if _ate - _de + 1 > 92 then
    raise exception 'Escolha um período de até 92 dias.' using errcode = 'P0001';
  end if;
  return query
  with avs as (
    select ev.avaliador_id as uid, ev.created_at,
           (regexp_match(ev.link_conversa, '([0-9]{1,30})[^0-9]*$'))[1] as conversa, ev.employee_id
      from public.evaluations ev
     where ev.avaliador_id is not null and not ev.anulada
       and (ev.created_at at time zone 'America/Fortaleza')::date between _de and _ate
  ),
  tempos as (
    select a.uid,
           extract(epoch from a.created_at - least(
             (select min(ab.aberto_em) from public.aberturas_contato ab
               where ab.avaliador_user_id = a.uid and ab.employee_id = a.employee_id and ab.conversa_id = a.conversa
                 and ab.aberto_em <= a.created_at),
             (select min(s.criado_em) from public.sorteios_contato s
               where s.sorteado_por = a.uid and s.employee_id = a.employee_id and s.conversa_id = a.conversa
                 and s.criado_em <= a.created_at))) / 60.0 as min
      from avs a
  ),
  ritmo as (
    select uid, count(*)::int as avaliacoes,
           count(*) filter (where min > 0 and min <= 60)::int as contadas,
           coalesce(sum(min) filter (where min > 0 and min <= 60), 0) as minutos
      from tempos group by uid
  ),
  descartes as (
    select s.sorteado_por as uid, count(*)::int as n from public.sorteios_contato s
     where s.descartado_em is not null and (s.descartado_em at time zone 'America/Fortaleza')::date between _de and _ate
     group by s.sorteado_por
  ),
  quali as (
    select e.user_id as uid, sum(h.horas) as horas from public.horas_quali h
      join public.employees e on e.id = h.employee_id
     where h.dia between _de and _ate and e.user_id is not null
     group by e.user_id
  ),
  pessoas as (select uid from ritmo union select uid from quali)
  select p.uid, coalesce((select e.nome from public.employees e where e.user_id = p.uid limit 1), 'Avaliador removido'),
         coalesce(r.avaliacoes, 0), coalesce(r.contadas, 0), round(coalesce(r.minutos, 0), 1),
         coalesce(d.n, 0), q.horas
    from pessoas p
    left join ritmo r on r.uid = p.uid
    left join descartes d on d.uid = p.uid
    left join quali q on q.uid = p.uid
   order by 2;
end; $$;
revoke all on function public.produtividade_avaliadores(date, date) from public, anon;
grant execute on function public.produtividade_avaliadores(date, date) to authenticated;
