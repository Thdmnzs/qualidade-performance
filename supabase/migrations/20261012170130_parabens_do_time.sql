-- =====================================================================
-- Os parabéns do time (12/10/2026).
--
--   * Um recado por ano, de cada pessoa para cada aniversariante (de 2 a 200 caracteres).
--   * Só quem mandou e quem recebeu leem o recado (nem os colegas, nem o ADM).
--   * Só se manda para quem faz aniversário HOJE e escolheu mostrar para o time.
--   * O aniversariante pode ocultar (apagar) um recado que não quiser guardar.
--   * Os recados ficam guardados, só para o aniversariante.
-- =====================================================================
create table public.parabens (
  id uuid primary key default gen_random_uuid(),
  aniversariante uuid not null references public.employees (id) on delete cascade,
  autor uuid not null references public.employees (id) on delete cascade,
  ano smallint not null,
  texto text not null check (length(btrim(texto)) between 2 and 200),
  criado_em timestamptz not null default now(),
  unique (aniversariante, autor, ano),
  check (aniversariante <> autor)
);
create index parabens_do_aniversariante on public.parabens (aniversariante, ano);
alter table public.parabens enable row level security;
create policy parabens_leitura on public.parabens for select
  using (autor = public.current_employee_id() or aniversariante = public.current_employee_id());
revoke all on public.parabens from anon, authenticated;
grant select on public.parabens to authenticated;

-- Faz aniversário hoje E mostra para o time (o que vale para os colegas).
create or replace function public._aniversario_visivel_hoje(_emp uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select p.aniversario_visivel and public._faz_aniversario_hoje(p.aniversario_dia, p.aniversario_mes)
                     from public.perfis_colaborador p where p.employee_id = _emp), false)
$$;

-- ---------- Os aniversariantes de hoje (e se eu já dei os parabéns) ----------
create or replace function public.aniversariantes_de_hoje()
returns table (employee_id uuid, nome text, sou_eu boolean, ja_dei boolean)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare _eu uuid := public.current_employee_id();
begin
  if _eu is null then
    raise exception 'Seu acesso não está vinculado a um colaborador ativo.' using errcode = '42501';
  end if;
  return query
    select e.id, e.nome, e.id = _eu,
           exists (select 1 from public.parabens x where x.aniversariante = e.id and x.autor = _eu
                    and x.ano = extract(year from now() at time zone 'America/Fortaleza'))
      from public.employees e
     where e.status = 'ativo' and public._aniversario_visivel_hoje(e.id)
     order by e.nome;
end; $$;

-- ---------- Os próximos (nos próximos dias, sem hoje) ----------
create or replace function public.proximos_aniversarios(_dias int)
returns table (employee_id uuid, nome text, dia smallint, mes smallint, data date)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare _hoje date := (now() at time zone 'America/Fortaleza')::date;
begin
  if public.current_employee_id() is null then
    raise exception 'Seu acesso não está vinculado a um colaborador ativo.' using errcode = '42501';
  end if;
  return query
    select e.id, e.nome, p.aniversario_dia, p.aniversario_mes, d::date
      from public.employees e
      join public.perfis_colaborador p on p.employee_id = e.id
      cross join generate_series(_hoje + 1, _hoje + least(greatest(coalesce(_dias, 7), 1), 31), interval '1 day') d
     where e.status = 'ativo' and p.aniversario_visivel and p.aniversario_dia is not null
       and extract(day from d) = p.aniversario_dia and extract(month from d) = p.aniversario_mes
     order by d, e.nome;
end; $$;

-- ---------- Dar os parabéns ----------
create or replace function public.dar_parabens(_aniversariante uuid, _texto text)
returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  _eu uuid := public.current_employee_id();
  _t text := btrim(coalesce(_texto, ''));
  _id uuid;
begin
  if _eu is null then
    raise exception 'Seu acesso não está vinculado a um colaborador ativo.' using errcode = '42501';
  end if;
  if _aniversariante = _eu then
    raise exception 'Você não pode dar os parabéns a si mesmo.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.employees where id = _aniversariante and status = 'ativo')
     or not public._aniversario_visivel_hoje(_aniversariante) then
    raise exception 'Hoje não é o aniversário dessa pessoa.' using errcode = 'P0001';
  end if;
  if length(_t) < 2 or length(_t) > 200 then
    raise exception 'O recado precisa ter de 2 a 200 caracteres.' using errcode = 'P0001';
  end if;
  begin
    insert into public.parabens (aniversariante, autor, ano, texto)
    values (_aniversariante, _eu, extract(year from now() at time zone 'America/Fortaleza'), _t)
    returning id into _id;
  exception when unique_violation then
    raise exception 'Você já deu os parabéns a essa pessoa neste ano.' using errcode = 'P0001';
  end;
  return _id;
end; $$;

-- ---------- Os meus recados (do ano, guardados) ----------
create or replace function public.meus_parabens()
returns table (id uuid, autor text, texto text, criado_em timestamptz)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare _eu uuid := public.current_employee_id();
begin
  if _eu is null then
    raise exception 'Seu acesso não está vinculado a um colaborador ativo.' using errcode = '42501';
  end if;
  return query
    select x.id, e.nome, x.texto, x.criado_em
      from public.parabens x join public.employees e on e.id = x.autor
     where x.aniversariante = _eu and x.ano = extract(year from now() at time zone 'America/Fortaleza')
     order by x.criado_em;
end; $$;

-- ---------- Ocultar (o aniversariante tira um recado do mural) ----------
create or replace function public.ocultar_parabens(_id uuid)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  delete from public.parabens where id = _id and aniversariante = public.current_employee_id();
  if not found then
    raise exception 'Recado não encontrado.' using errcode = 'P0002';
  end if;
end; $$;

revoke all on function public._aniversario_visivel_hoje(uuid) from public, anon, authenticated;
revoke all on function public.aniversariantes_de_hoje(), public.proximos_aniversarios(int), public.dar_parabens(uuid, text),
  public.meus_parabens(), public.ocultar_parabens(uuid) from public, anon;
grant execute on function public.aniversariantes_de_hoje(), public.proximos_aniversarios(int), public.dar_parabens(uuid, text),
  public.meus_parabens(), public.ocultar_parabens(uuid) to authenticated;
