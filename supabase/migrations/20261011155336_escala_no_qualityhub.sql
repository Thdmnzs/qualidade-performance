-- =====================================================================
-- A escala e as férias no QualityHUB (10/10/2026). A planilha sai: o ADM monta a
-- semana (rascunho → publicada) e as férias pela tela, e o time vê pela aba Escala.
--
--   * escala_siglas: as atividades (a sigla, a cor, o significado e como contam).
--   * escala_semanas: a segunda-feira da semana, em rascunho ou publicada.
--   * escala_linhas: um dia de uma pessoa, na ORDEM livre, com as 16 horas (6h às 21h).
--   * ferias_dias e feriados: o calendário do ano (os feriados, marcados pela supervisão).
-- Ninguém grava direto: só pelas funções, que conferem o ADM. As leituras também são
-- por funções (o colaborador não lê o cadastro dos colegas, mas vê o nome na escala).
-- As mudanças numa semana publicada, nas férias e nos feriados vão para a auditoria.
-- =====================================================================

-- ---------- As tabelas ----------
create table public.escala_siglas (
  id uuid primary key default gen_random_uuid(),
  sigla text not null check (length(btrim(sigla)) between 1 and 10),
  cor text not null check (cor ~ '^#[0-9A-Fa-f]{6}$'),
  significado text not null check (length(btrim(significado)) between 1 and 40),
  conta_como_trabalho boolean not null default true,
  em_atendimento boolean not null default false,
  faixa boolean not null default false,
  ordem integer not null default 100,
  criada_em timestamptz not null default now()
);
create unique index escala_siglas_sigla_unica on public.escala_siglas (lower(btrim(sigla)));

create table public.escala_semanas (
  id uuid primary key default gen_random_uuid(),
  inicio date not null unique check (extract(isodow from inicio) = 1), -- sempre uma segunda-feira
  situacao text not null default 'rascunho' check (situacao in ('rascunho', 'publicada')),
  publicada_em timestamptz,
  publicada_por uuid references public.employees (id) on delete set null,
  atualizada_em timestamptz not null default now()
);

create table public.escala_linhas (
  id uuid primary key default gen_random_uuid(),
  semana_id uuid not null references public.escala_semanas (id) on delete cascade,
  dia smallint not null check (dia between 0 and 6), -- 0 = segunda ... 6 = domingo
  employee_id uuid not null references public.employees (id) on delete cascade,
  ordem smallint not null,
  horas uuid[] not null check (array_length(horas, 1) = 16), -- das 6h às 21h; cada uma, uma sigla ou nada
  unique (semana_id, dia, employee_id)
);
create index escala_linhas_semana on public.escala_linhas (semana_id, dia, ordem);

create table public.ferias_dias (
  data date not null,
  employee_id uuid not null references public.employees (id) on delete cascade,
  criado_em timestamptz not null default now(),
  primary key (data, employee_id)
);
create table public.feriados (
  data date primary key,
  criado_em timestamptz not null default now()
);

-- ---------- As siglas de hoje (as cores da planilha) ----------
insert into public.escala_siglas (sigla, cor, significado, conta_como_trabalho, em_atendimento, faixa, ordem) values
  ('i', '#C9DAF8', 'Intercom (atendimento)', true, true, false, 1),
  ('P', '#D9D9D9', 'Pausa', false, false, false, 2),
  ('rede', '#D5A6BD', 'Rede', true, false, false, 3),
  ('cx', '#FFF2CC', 'CX (demandas dos supervisores)', true, false, false, 4),
  ('cxtech', '#6AA84F', 'CX Tech', true, false, false, 5),
  ('auto', '#6AA84F', 'Automação', true, false, false, 6),
  ('quali', '#1C5BD9', 'Qualidade', true, false, false, 7),
  ('log', '#F6B26B', 'Logística', true, false, false, 8),
  ('F&R', '#FFFF00', 'Fraude e Risco', true, false, false, 9),
  ('cob B2B', '#F4CCCC', 'Cobrança B2B', true, false, false, 10),
  ('mensal', '#00FF00', 'Reunião mensal de alinhamento', true, false, false, 11),
  ('1:1', '#D9EAD3', 'Feedback individual com o supervisor', true, false, false, 12),
  ('folga', '#FF9900', 'Folga', false, false, true, 90),
  ('férias', '#FF9900', 'Férias', false, false, true, 91),
  ('off', '#E06666', 'Ausente', false, false, false, 92);

-- ---------- Quem lê: os membros (e as semanas em rascunho, só o ADM) ----------
alter table public.escala_siglas enable row level security;
alter table public.escala_semanas enable row level security;
alter table public.escala_linhas enable row level security;
alter table public.ferias_dias enable row level security;
alter table public.feriados enable row level security;

create policy escala_siglas_leitura on public.escala_siglas for select using (public.eh_membro());
create policy escala_semanas_leitura on public.escala_semanas for select
  using (public.eh_membro() and (situacao = 'publicada' or public.is_admin(auth.uid())));
create policy escala_linhas_leitura on public.escala_linhas for select
  using (exists (select 1 from public.escala_semanas s where s.id = semana_id
                  and public.eh_membro() and (s.situacao = 'publicada' or public.is_admin(auth.uid()))));
create policy ferias_dias_leitura on public.ferias_dias for select using (public.eh_membro());
create policy feriados_leitura on public.feriados for select using (public.eh_membro());

revoke all on public.escala_siglas, public.escala_semanas, public.escala_linhas, public.ferias_dias, public.feriados from anon, authenticated;
grant select on public.escala_siglas, public.escala_semanas, public.escala_linhas, public.ferias_dias, public.feriados to authenticated;

-- ---------- O ADM, e o registro na auditoria ----------
create or replace function public._exigir_adm_da_escala()
returns uuid
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'Apenas o ADM monta a escala e as férias.' using errcode = '42501';
  end if;
  return public.current_employee_id();
end; $$;

create or replace function public._auditar_escala(_acao text, _registro uuid, _antes jsonb, _depois jsonb)
returns void
language sql security definer set search_path = public, pg_temp as $$
  insert into public.audit_logs (usuario_id, usuario_nome, acao, entidade, registro_id, valor_anterior, valor_novo)
  values (auth.uid(), (select nome from public.employees where user_id = auth.uid() limit 1),
          _acao, 'escala', _registro, _antes, _depois)
$$;

-- ---------- Montar a semana ----------
create or replace function public._semana_da_escala(_inicio date)
returns public.escala_semanas
language plpgsql security definer set search_path = public, pg_temp as $$
declare _s public.escala_semanas%rowtype;
begin
  if _inicio is null or extract(isodow from _inicio) <> 1 then
    raise exception 'A semana começa sempre numa segunda-feira.' using errcode = 'P0001';
  end if;
  insert into public.escala_semanas (inicio) values (_inicio) on conflict (inicio) do nothing;
  select * into _s from public.escala_semanas where inicio = _inicio for update;
  return _s;
end; $$;

-- As linhas de um dia, como a tela as manda: [{ "employee_id": ..., "horas": [sigla_id | null] x16 }]
create or replace function public._linhas_do_dia(_semana uuid, _dia int)
returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object('employee_id', l.employee_id, 'horas', to_jsonb(l.horas)) order by l.ordem), '[]'::jsonb)
    from public.escala_linhas l where l.semana_id = _semana and l.dia = _dia
$$;

create or replace function public._gravar_dia(_s public.escala_semanas, _dia int, _linhas jsonb)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  _antes jsonb;
  _l jsonb;
  _i int := 0;
  _horas uuid[];
  _emp uuid;
begin
  if _dia is null or _dia not between 0 and 6 then
    raise exception 'O dia precisa ser de 0 (segunda) a 6 (domingo).' using errcode = 'P0001';
  end if;
  if jsonb_typeof(coalesce(_linhas, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(_linhas, '[]'::jsonb)) > 80 then
    raise exception 'As linhas do dia estão num formato inválido.' using errcode = 'P0001';
  end if;
  _antes := public._linhas_do_dia(_s.id, _dia);
  delete from public.escala_linhas where semana_id = _s.id and dia = _dia;
  for _l in select * from jsonb_array_elements(coalesce(_linhas, '[]'::jsonb)) loop
    _emp := (_l ->> 'employee_id')::uuid;
    if not exists (select 1 from public.employees e where e.id = _emp and e.status = 'ativo') then
      raise exception 'Uma das pessoas da escala não é um cadastro ativo.' using errcode = 'P0001';
    end if;
    if jsonb_typeof(_l -> 'horas') <> 'array' or jsonb_array_length(_l -> 'horas') <> 16 then
      raise exception 'Cada pessoa precisa ter as 16 horas do dia (das 6h às 21h).' using errcode = 'P0001';
    end if;
    select array_agg(case when h = 'null'::jsonb then null else (h #>> '{}')::uuid end order by n)
      into _horas from jsonb_array_elements(_l -> 'horas') with ordinality as x(h, n);
    if exists (select 1 from unnest(_horas) h where h is not null and not exists (select 1 from public.escala_siglas s where s.id = h)) then
      raise exception 'Uma das atividades não existe nas siglas da escala.' using errcode = 'P0001';
    end if;
    begin
      insert into public.escala_linhas (semana_id, dia, employee_id, ordem, horas) values (_s.id, _dia, _emp, _i, _horas);
    exception when unique_violation then
      raise exception 'A mesma pessoa aparece duas vezes no dia.' using errcode = 'P0001';
    end;
    _i := _i + 1;
  end loop;
  update public.escala_semanas set atualizada_em = now() where id = _s.id;
  -- Depois de publicada, cada mudança vai para o histórico.
  if _s.situacao = 'publicada' and _antes is distinct from public._linhas_do_dia(_s.id, _dia) then
    perform public._auditar_escala('escala_mudar_dia', _s.id,
      jsonb_build_object('inicio', _s.inicio, 'dia', _dia, 'linhas', _antes),
      jsonb_build_object('inicio', _s.inicio, 'dia', _dia, 'linhas', public._linhas_do_dia(_s.id, _dia)));
  end if;
end; $$;

create or replace function public.salvar_dia_da_escala(_inicio date, _dia int, _linhas jsonb)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public._exigir_adm_da_escala();
  perform public._gravar_dia(public._semana_da_escala(_inicio), _dia, _linhas);
end; $$;

-- A semana inteira de uma vez (copiar a semana, copiar um dia, apagar tudo): por inteiro, ou nada.
-- _dias: { "0": [...linhas], "3": [...] } (só os dias que mudam)
create or replace function public.salvar_semana_da_escala(_inicio date, _dias jsonb)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare _s public.escala_semanas%rowtype; _k text;
begin
  perform public._exigir_adm_da_escala();
  if jsonb_typeof(coalesce(_dias, '{}'::jsonb)) <> 'object' then
    raise exception 'Os dias da semana estão num formato inválido.' using errcode = 'P0001';
  end if;
  _s := public._semana_da_escala(_inicio);
  for _k in select jsonb_object_keys(coalesce(_dias, '{}'::jsonb)) loop
    if _k !~ '^[0-6]$' then raise exception 'O dia precisa ser de 0 (segunda) a 6 (domingo).' using errcode = 'P0001'; end if;
    perform public._gravar_dia(_s, _k::int, _dias -> _k);
  end loop;
end; $$;

create or replace function public.publicar_semana_da_escala(_inicio date)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare _eu uuid; _s public.escala_semanas%rowtype;
begin
  _eu := public._exigir_adm_da_escala();
  select * into _s from public.escala_semanas where inicio = _inicio for update;
  if not found or not exists (select 1 from public.escala_linhas where semana_id = _s.id) then
    raise exception 'A semana está vazia: monte a escala antes de publicar.' using errcode = 'P0001';
  end if;
  if _s.situacao = 'publicada' then return; end if;
  update public.escala_semanas set situacao = 'publicada', publicada_em = now(), publicada_por = _eu, atualizada_em = now() where id = _s.id;
  perform public._auditar_escala('escala_publicar', _s.id, null, jsonb_build_object('inicio', _s.inicio));
end; $$;

create or replace function public.criar_sigla_da_escala(_sigla text, _cor text, _significado text)
returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare _id uuid;
begin
  perform public._exigir_adm_da_escala();
  if exists (select 1 from public.escala_siglas where lower(btrim(sigla)) = lower(btrim(_sigla))) then
    raise exception 'A sigla "%" já existe: escolha ela na lista.', btrim(_sigla) using errcode = 'P0001';
  end if;
  begin
    insert into public.escala_siglas (sigla, cor, significado, ordem) values (btrim(_sigla), upper(_cor), btrim(_significado), 50) returning id into _id;
  exception when check_violation then
    raise exception 'Confira a sigla (até 10 letras), o significado (até 40) e a cor.' using errcode = 'P0001';
  end;
  perform public._auditar_escala('escala_criar_sigla', _id, null, jsonb_build_object('sigla', btrim(_sigla), 'significado', btrim(_significado), 'cor', upper(_cor)));
  return _id;
end; $$;

-- ---------- As férias e os feriados (valem na hora) ----------
create or replace function public.definir_ferias(_employee_id uuid, _datas date[], _de_ferias boolean)
returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare _n int;
begin
  perform public._exigir_adm_da_escala();
  if not exists (select 1 from public.employees where id = _employee_id and status = 'ativo') then
    raise exception 'A pessoa precisa ser um cadastro ativo.' using errcode = 'P0001';
  end if;
  if coalesce(array_length(_datas, 1), 0) = 0 or array_length(_datas, 1) > 366 then
    raise exception 'Escolha de 1 a 366 dias.' using errcode = 'P0001';
  end if;
  if _de_ferias then
    insert into public.ferias_dias (data, employee_id) select distinct d, _employee_id from unnest(_datas) d on conflict do nothing;
  else
    delete from public.ferias_dias where employee_id = _employee_id and data = any (_datas);
  end if;
  get diagnostics _n = row_count;
  if _n > 0 then
    perform public._auditar_escala(case when _de_ferias then 'ferias_marcar' else 'ferias_tirar' end, _employee_id, null,
      jsonb_build_object('datas', (select jsonb_agg(d order by d) from (select distinct unnest(_datas) d) x)));
  end if;
  return _n;
end; $$;

create or replace function public.definir_feriado(_data date, _feriado boolean)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare _n int;
begin
  perform public._exigir_adm_da_escala();
  if _feriado then insert into public.feriados (data) values (_data) on conflict do nothing;
  else delete from public.feriados where data = _data; end if;
  get diagnostics _n = row_count;
  if _n > 0 then
    perform public._auditar_escala(case when _feriado then 'feriado_marcar' else 'feriado_tirar' end, null, null, jsonb_build_object('data', _data));
  end if;
end; $$;

-- ---------- As leituras (o nome dos colegas, sem abrir o cadastro deles) ----------
create or replace function public.escala_da_semana(_inicio date)
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare _s public.escala_semanas%rowtype; _adm boolean := public.is_admin(auth.uid());
begin
  if not public.eh_membro() then
    raise exception 'Seu acesso não está vinculado a um colaborador ativo.' using errcode = '42501';
  end if;
  select * into _s from public.escala_semanas where inicio = _inicio;
  if not found or (_s.situacao <> 'publicada' and not _adm) then
    return jsonb_build_object('inicio', _inicio, 'situacao', null, 'linhas', '[]'::jsonb,
      'feriados', (select coalesce(jsonb_agg(f.data order by f.data), '[]'::jsonb) from public.feriados f where f.data between _inicio and _inicio + 6));
  end if;
  return jsonb_build_object(
    'inicio', _s.inicio, 'situacao', _s.situacao, 'publicada_em', _s.publicada_em, 'atualizada_em', _s.atualizada_em,
    'eu', public.current_employee_id(),
    'feriados', (select coalesce(jsonb_agg(f.data order by f.data), '[]'::jsonb) from public.feriados f where f.data between _s.inicio and _s.inicio + 6),
    'linhas', (select coalesce(jsonb_agg(jsonb_build_object('dia', l.dia, 'ordem', l.ordem, 'employee_id', l.employee_id, 'nome', e.nome, 'horas', to_jsonb(l.horas)) order by l.dia, l.ordem), '[]'::jsonb)
                 from public.escala_linhas l join public.employees e on e.id = l.employee_id where l.semana_id = _s.id));
end; $$;

create or replace function public.semanas_da_escala()
returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select case when not public.eh_membro() then '[]'::jsonb else
    coalesce((select jsonb_agg(jsonb_build_object('inicio', s.inicio, 'situacao', s.situacao) order by s.inicio desc)
                from public.escala_semanas s where s.situacao = 'publicada' or public.is_admin(auth.uid())), '[]'::jsonb) end
$$;

create or replace function public.ferias_do_ano(_ano int)
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.eh_membro() then
    raise exception 'Seu acesso não está vinculado a um colaborador ativo.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'ano', _ano, 'eu', public.current_employee_id(),
    'feriados', (select coalesce(jsonb_agg(f.data order by f.data), '[]'::jsonb) from public.feriados f where extract(year from f.data) = _ano),
    'ferias', (select coalesce(jsonb_agg(jsonb_build_object('data', d.data, 'employee_id', d.employee_id, 'nome', e.nome) order by d.data, e.nome), '[]'::jsonb)
                 from public.ferias_dias d join public.employees e on e.id = d.employee_id where extract(year from d.data) = _ano));
end; $$;

-- ---------- Quem chama o quê ----------
revoke all on function public._exigir_adm_da_escala(), public._auditar_escala(text, uuid, jsonb, jsonb), public._semana_da_escala(date),
  public._linhas_do_dia(uuid, int), public._gravar_dia(public.escala_semanas, int, jsonb) from public, anon, authenticated;
revoke all on function public.salvar_dia_da_escala(date, int, jsonb), public.salvar_semana_da_escala(date, jsonb), public.publicar_semana_da_escala(date),
  public.criar_sigla_da_escala(text, text, text), public.definir_ferias(uuid, date[], boolean), public.definir_feriado(date, boolean),
  public.escala_da_semana(date), public.semanas_da_escala(), public.ferias_do_ano(int) from public, anon;
grant execute on function public.salvar_dia_da_escala(date, int, jsonb), public.salvar_semana_da_escala(date, jsonb), public.publicar_semana_da_escala(date),
  public.criar_sigla_da_escala(text, text, text), public.definir_ferias(uuid, date[], boolean), public.definir_feriado(date, boolean),
  public.escala_da_semana(date), public.semanas_da_escala(), public.ferias_do_ano(int) to authenticated;
-- A importação da planilha (uma vez só) roda no servidor, com a chave de serviço.
grant execute on function public.escala_da_semana(date), public.ferias_do_ano(int) to service_role;
