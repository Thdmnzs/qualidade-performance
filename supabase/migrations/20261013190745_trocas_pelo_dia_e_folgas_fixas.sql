-- =====================================================================
-- As trocas pelo dia, e as folgas fixas (13/10/2026).
--
--   * A folga fixa de cada pessoa (os dias da semana): o time lê (o pedido de troca precisa),
--     e só o ADM muda (com o Histórico). Já vem com as folgas passadas pela supervisão.
--   * O pedido passa a ser pelo DIA (em qualquer semana): numa semana publicada, as regras
--     leem a escala; nas outras, a folga fixa.
--   * A troca de folgas: "um" dia (um par de dias) ou os "dois" (um par para cada folga).
--     Os pares ficam em dias[] (de dois em dois), e cada par é trocado com a regra de sempre.
--   * O feriado: só com a escala do feriado publicada (é uma escala diferenciada).
--   * A supervisão (o perfil ADM) não entra nas trocas.
--   * A aprovação: a qualquer momento. Com a escala da semana montada (publicada ou em rascunho),
--     a troca é aplicada na hora; senão, fica "a aplicar", e a montagem oferece aplicá-la.
--   * A função antiga de pedir (pela semana publicada) continua, para o site no ar não quebrar.
-- =====================================================================

-- ---------- As folgas fixas ----------
create table public.folgas_fixas (
  employee_id uuid primary key references public.employees (id) on delete cascade,
  dias smallint[] not null default '{}' check (dias <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[] and cardinality(dias) <= 4),
  atualizado_em timestamptz not null default now()
);
alter table public.folgas_fixas enable row level security;
create policy folgas_fixas_leitura on public.folgas_fixas for select using (public.eh_membro());
revoke all on public.folgas_fixas from anon, authenticated;
grant select on public.folgas_fixas to authenticated;

-- As folgas que a supervisão passou (seg = 0 ... dom = 6), para quem já está cadastrado (pelo
-- primeiro nome, e só quando ele é único no time).
insert into public.folgas_fixas (employee_id, dias)
select (select e.id from public.employees e where e.status = 'ativo' and lower(split_part(e.nome, ' ', 1)) = v.nome), v.dias::smallint[]
  from (values ('ruby', '{0,6}'), ('kaio', '{0,6}'), ('thiago', '{2,6}'), ('suelen', '{3,6}'), ('simone', '{1,2}'), ('luiz', '{4,5}'),
               ('virmaud', '{4,5}'), ('amanda', '{3,5}'), ('rachel', '{5,6}'), ('katia', '{5,6}'), ('fran', '{5,6}'), ('ardson', '{5,6}'),
               ('carol', '{5,6}'), ('vitor', '{5,6}')) v(nome, dias)
 where (select count(*) from public.employees e where e.status = 'ativo' and lower(split_part(e.nome, ' ', 1)) = v.nome) = 1
on conflict (employee_id) do nothing;

-- Quem é da supervisão (o perfil ADM) não entra nas trocas.
create or replace function public._eh_da_supervisao(_emp uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.employees e join public.user_roles ur on ur.user_id = e.user_id where e.id = _emp and ur.role = 'adm')
$$;

-- O time (para o pedido de troca e para a aba do ADM): o nome, a folga fixa e se é da supervisão.
create or replace function public.folgas_fixas_do_time()
returns table (employee_id uuid, nome text, dias smallint[], supervisao boolean)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.eh_membro() then
    raise exception 'Seu acesso não está vinculado a um colaborador ativo.' using errcode = '42501';
  end if;
  return query
    select e.id, e.nome, coalesce(f.dias, '{}'::smallint[]), public._eh_da_supervisao(e.id)
      from public.employees e left join public.folgas_fixas f on f.employee_id = e.id
     where e.status = 'ativo' order by e.nome;
end; $$;

-- O ADM muda a folga fixa de alguém (vai para o Histórico).
create or replace function public.definir_folga_fixa(_employee_id uuid, _dias int[])
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare _limpos smallint[] := (select coalesce(array_agg(distinct d order by d), '{}') from unnest(coalesce(_dias, '{}')) d);
begin
  perform public._exigir_adm_da_escala();
  if not exists (select 1 from public.employees where id = _employee_id and status = 'ativo') then
    raise exception 'Cadastro não encontrado.' using errcode = 'P0002';
  end if;
  if exists (select 1 from unnest(_limpos) d where d not between 0 and 6) then
    raise exception 'O dia precisa ser da semana.' using errcode = 'P0001';
  end if;
  if cardinality(_limpos) > 4 then
    raise exception 'São no máximo quatro folgas fixas por semana.' using errcode = 'P0001';
  end if;
  insert into public.folgas_fixas (employee_id, dias, atualizado_em) values (_employee_id, _limpos, now())
  on conflict (employee_id) do update set dias = excluded.dias, atualizado_em = now();
  perform public._auditar_escala('escala_folga_fixa', _employee_id, null,
    jsonb_build_object('colaborador', (select nome from public.employees where id = _employee_id), 'dias', to_jsonb(_limpos)));
end; $$;

-- ---------- As trocas: pela data, com os pares de folga e o "a aplicar" ----------
alter table public.trocas_de_escala
  add column inicio date,
  add column modo text check (modo is null or modo in ('um', 'dois')),
  add column aplicada boolean not null default false;
update public.trocas_de_escala t set inicio = s.inicio from public.escala_semanas s where s.id = t.semana_id;
update public.trocas_de_escala set aplicada = true where situacao = 'aprovada';
alter table public.trocas_de_escala alter column inicio set not null, alter column semana_id drop not null;
alter table public.trocas_de_escala drop constraint trocas_de_escala_dias_check;
alter table public.trocas_de_escala add constraint trocas_de_escala_dias_check check (cardinality(dias) between 1 and 4);
create index trocas_por_semana on public.trocas_de_escala (inicio);

-- A função antiga grava só a semana: o início vem dela.
create or replace function public._troca_com_inicio()
returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.inicio is null then new.inicio := (select inicio from public.escala_semanas where id = new.semana_id); end if;
  return new;
end; $$;
create trigger troca_com_inicio before insert on public.trocas_de_escala for each row execute function public._troca_com_inicio();

-- ---------- O que cada pessoa faz num dia ----------
create or replace function public._segunda_de(_d date)
returns date
language sql immutable set search_path = public, pg_temp as $$ select _d - (extract(isodow from _d)::int - 1) $$;

-- 'trabalha', 'folga' ou 'fora' (só numa semana publicada, para quem não está na escala do dia).
create or replace function public._estado_no_dia(_emp uuid, _data date)
returns text
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  _s public.escala_semanas%rowtype;
  _l uuid[];
  _dia int := extract(isodow from _data)::int - 1;
begin
  select * into _s from public.escala_semanas where inicio = public._segunda_de(_data);
  if found and _s.situacao = 'publicada' then
    _l := public._linha_da_escala(_s.id, _dia, _emp);
    if _l is null then return 'fora'; end if;
    return case when exists (select 1 from unnest(_l) h join public.escala_siglas g on g.id = h where g.conta_como_trabalho or lower(g.sigla) = 'p')
                then 'trabalha' else 'folga' end;
  end if;
  return case when exists (select 1 from public.folgas_fixas where employee_id = _emp and _dia = any (dias)) then 'folga' else 'trabalha' end;
end; $$;

-- ---------- Pedir pelo dia (o colaborador) ----------
create or replace function public.pedir_troca_no_dia(_data date, _tipo text, _com uuid, _modo text, _segundo date, _mensagem text)
returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  _eu uuid := public.current_employee_id();
  _hoje date := (now() at time zone 'America/Fortaleza')::date;
  _inicio date := public._segunda_de(_data);
  _s public.escala_semanas%rowtype;
  _publicada boolean;
  _msg text := nullif(btrim(coalesce(_mensagem, '')), '');
  _eu_e text; _ela_e text; _x date;
  _minhas date[] := '{}'; _delas date[] := '{}';
  _dias smallint[]; _i int; _id uuid;
begin
  if _eu is null then
    raise exception 'Seu acesso não está vinculado a um colaborador ativo.' using errcode = '42501';
  end if;
  if public._eh_da_supervisao(_eu) then
    raise exception 'A supervisão não entra nas trocas de escala.' using errcode = 'P0001';
  end if;
  if _com is null or _com = _eu then
    raise exception 'Escolha outra pessoa.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.employees where id = _com and status = 'ativo') then
    raise exception 'Essa pessoa não é um cadastro ativo.' using errcode = 'P0001';
  end if;
  if public._eh_da_supervisao(_com) then
    raise exception 'Essa pessoa é da supervisão: ela não entra nas trocas.' using errcode = 'P0001';
  end if;
  if _data is null or _data < _hoje then
    raise exception 'Escolha um dia a partir de hoje.' using errcode = 'P0001';
  end if;
  if _data > _hoje + 92 then
    raise exception 'Escolha um dia nos próximos três meses.' using errcode = 'P0001';
  end if;
  if length(coalesce(_msg, '')) > 300 then
    raise exception 'A mensagem pode ter até 300 caracteres.' using errcode = 'P0001';
  end if;
  select * into _s from public.escala_semanas where inicio = _inicio;
  _publicada := found and _s.situacao = 'publicada';
  _eu_e := public._estado_no_dia(_eu, _data);
  _ela_e := public._estado_no_dia(_com, _data);

  if _tipo = 'horarios' then
    if _eu_e <> 'trabalha' or _ela_e <> 'trabalha' then
      raise exception 'Para trocar os horários, as duas precisam trabalhar nesse dia.' using errcode = 'P0001';
    end if;
    _dias := array[extract(isodow from _data)::int - 1];
  elsif _tipo = 'folgas' then
    if not ((_eu_e = 'folga' and _ela_e = 'trabalha') or (_eu_e = 'trabalha' and _ela_e = 'folga')) then
      raise exception 'Para trocar as folgas, uma de vocês folga e a outra trabalha nesse dia.' using errcode = 'P0001';
    end if;
    if _modo = 'um' then
      if _segundo is null or public._segunda_de(_segundo) <> _inicio or _segundo = _data then
        raise exception 'Escolha o segundo dia, na mesma semana.' using errcode = 'P0001';
      end if;
      if _segundo < _hoje then
        raise exception 'Escolha dias a partir de hoje.' using errcode = 'P0001';
      end if;
      if public._estado_no_dia(_eu, _segundo) = _eu_e or public._estado_no_dia(_com, _segundo) = _ela_e
         or 'fora' in (public._estado_no_dia(_eu, _segundo), public._estado_no_dia(_com, _segundo)) then
        raise exception 'No segundo dia, a troca precisa voltar: quem folgou trabalha, e quem trabalhou folga.' using errcode = 'P0001';
      end if;
      _dias := array[extract(isodow from _data)::int - 1, extract(isodow from _segundo)::int - 1];
    elsif _modo = 'dois' then
      for _i in 0..6 loop
        _x := _inicio + _i;
        if public._estado_no_dia(_eu, _x) = 'folga' and public._estado_no_dia(_com, _x) = 'trabalha' then _minhas := _minhas || _x; end if;
        if public._estado_no_dia(_com, _x) = 'folga' and public._estado_no_dia(_eu, _x) = 'trabalha' then _delas := _delas || _x; end if;
      end loop;
      if cardinality(_minhas) = 0 or cardinality(_minhas) <> cardinality(_delas) then
        raise exception 'Nessa semana, as folgas de vocês não formam pares para trocar.' using errcode = 'P0001';
      end if;
      if exists (select 1 from unnest(_minhas || _delas) x where x < _hoje) then
        raise exception 'Todas as folgas trocadas precisam ser a partir de hoje.' using errcode = 'P0001';
      end if;
      _dias := '{}';
      for _i in 1..cardinality(_minhas) loop
        _dias := _dias || (extract(isodow from _minhas[_i])::int - 1)::smallint || (extract(isodow from _delas[_i])::int - 1)::smallint;
      end loop;
    else
      raise exception 'Escolha se é um dia de folga ou os dois.' using errcode = 'P0001';
    end if;
  elsif _tipo = 'feriado' then
    if not _publicada or not exists (select 1 from public.feriados where data = _data) then
      raise exception 'A troca de feriado vale só para um feriado com a escala publicada.' using errcode = 'P0001';
    end if;
    if _eu_e <> 'trabalha' then
      raise exception 'Você não está na escala desse feriado.' using errcode = 'P0001';
    end if;
    if _ela_e <> 'fora' then
      raise exception 'Essa pessoa já está na escala desse feriado.' using errcode = 'P0001';
    end if;
    _dias := array[extract(isodow from _data)::int - 1];
  else
    raise exception 'Escolha o tipo da troca.' using errcode = 'P0001';
  end if;

  -- Uma troca aguardando por pessoa e dia (o lock evita duas ao mesmo tempo).
  perform pg_advisory_xact_lock(hashtext('trocas:' || _inicio::text));
  if exists (select 1 from public.trocas_de_escala t
              where t.inicio = _inicio and t.situacao in ('aguardando_colega', 'aguardando_supervisao')
                and (t.de_employee in (_eu, _com) or t.para_employee in (_eu, _com)) and t.dias && _dias) then
    raise exception 'Já há uma troca aguardando nesse dia, com uma de vocês.' using errcode = 'P0001';
  end if;
  insert into public.trocas_de_escala (semana_id, inicio, tipo, modo, dias, de_employee, para_employee, mensagem)
  values (_s.id, _inicio, _tipo, case when _tipo = 'folgas' then _modo end, _dias, _eu, _com, _msg)
  returning id into _id;
  return _id;
end; $$;

-- ---------- Aplicar uma troca aprovada na escala (se a semana já estiver montada) ----------
create or replace function public._aplicar_troca(_troca uuid)
returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  _t public.trocas_de_escala%rowtype;
  _s public.escala_semanas%rowtype;
  _i int; _d int; _outro int; _a uuid[]; _b uuid[]; _ordem_a smallint; _ordem_b smallint;
begin
  select * into _t from public.trocas_de_escala where id = _troca for update;
  if not found or _t.situacao <> 'aprovada' or _t.aplicada then return false; end if;
  select * into _s from public.escala_semanas where inicio = _t.inicio for update;
  if not found then return false; end if;
  -- Os dias e o "outro" de cada um (nas folgas, o par; nos outros tipos, o próprio dia).
  drop table if exists _dias_da_troca;
  create temp table _dias_da_troca (dia int, outro int) on commit drop;
  if _t.tipo = 'folgas' then
    for _i in 1..cardinality(_t.dias) by 2 loop
      insert into _dias_da_troca values (_t.dias[_i], _t.dias[_i + 1]), (_t.dias[_i + 1], _t.dias[_i]);
    end loop;
  else
    insert into _dias_da_troca values (_t.dias[1], _t.dias[1]);
  end if;
  -- A escala precisa estar montada nesses dias (senão, a troca espera a montagem): quem pediu
  -- está em cada dia; a colega também (menos no feriado, em que ela entra no lugar).
  if exists (select 1 from _dias_da_troca x
              where public._linha_da_escala(_s.id, x.dia, _t.de_employee) is null
                 or (_t.tipo <> 'feriado' and public._linha_da_escala(_s.id, x.dia, _t.para_employee) is null)) then
    return false;
  end if;
  -- Calcula tudo ANTES de gravar (os dois dias de um par são lidos como estavam).
  drop table if exists _novas;
  create temp table _novas (dia int, emp uuid, horas uuid[], ordem smallint) on commit drop;
  for _d, _outro in select dia, outro from _dias_da_troca loop
    _a := public._redistribuir(public._linha_da_escala(_s.id, _d, _t.para_employee),
                               case when _t.tipo = 'feriado' then null else public._linha_da_escala(_s.id, _outro, _t.de_employee) end);
    _b := public._redistribuir(public._linha_da_escala(_s.id, _d, _t.de_employee),
                               case when _t.tipo = 'feriado' then null else public._linha_da_escala(_s.id, _outro, _t.para_employee) end);
    _ordem_a := (select ordem from public.escala_linhas where semana_id = _s.id and dia = _d and employee_id = _t.de_employee);
    _ordem_b := (select ordem from public.escala_linhas where semana_id = _s.id and dia = _d and employee_id = _t.para_employee);
    insert into _novas values (_d, _t.de_employee, _a, coalesce(_ordem_a, _ordem_b)), (_d, _t.para_employee, _b, coalesce(_ordem_b, _ordem_a));
  end loop;
  delete from public.escala_linhas l using _novas n where l.semana_id = _s.id and l.dia = n.dia and l.employee_id = n.emp;
  insert into public.escala_linhas (semana_id, dia, employee_id, ordem, horas)
    select _s.id, n.dia, n.emp, n.ordem, n.horas from _novas n where n.horas is not null;
  update public.escala_semanas set atualizada_em = now() where id = _s.id;
  update public.trocas_de_escala set aplicada = true, semana_id = _s.id where id = _troca;
  return true;
end; $$;

-- ---------- A supervisão: aprovar (a qualquer momento) ou recusar ----------
create or replace function public.decidir_troca(_troca uuid, _aprovar boolean, _motivo text)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  _eu uuid := public._exigir_adm_da_escala();
  _t public.trocas_de_escala%rowtype;
  _motivo_limpo text := nullif(btrim(coalesce(_motivo, '')), '');
  _aplicada boolean;
begin
  select * into _t from public.trocas_de_escala where id = _troca for update;
  if not found then
    raise exception 'Troca não encontrada.' using errcode = 'P0002';
  end if;
  if _t.situacao <> 'aguardando_supervisao' then
    raise exception 'Esta troca não está aguardando a supervisão.' using errcode = 'P0001';
  end if;
  if not _aprovar then
    if length(coalesce(_motivo_limpo, '')) < 10 or length(_motivo_limpo) > 300 then
      raise exception 'Escreva o motivo da recusa, de 10 a 300 caracteres.' using errcode = 'P0001';
    end if;
    update public.trocas_de_escala set situacao = 'recusada', motivo = _motivo_limpo, decidida_em = now(), decidida_por = _eu where id = _troca;
    perform public._auditar_escala('escala_troca_recusar', _t.semana_id, null, jsonb_build_object('de', (select nome from public.employees where id = _t.de_employee),
      'para', (select nome from public.employees where id = _t.para_employee), 'dias', to_jsonb(_t.dias), 'inicio', _t.inicio, 'tipo', _t.tipo));
    return;
  end if;
  perform 1 from public.employees where id in (_t.de_employee, _t.para_employee) and status = 'ativo' having count(*) = 2;
  if not found then
    raise exception 'Uma das pessoas não é mais um cadastro ativo.' using errcode = 'P0001';
  end if;
  update public.trocas_de_escala set situacao = 'aprovada', decidida_em = now(), decidida_por = _eu where id = _troca;
  _aplicada := public._aplicar_troca(_troca);
  perform public._auditar_escala('escala_troca_aprovar', _t.semana_id, null, jsonb_build_object('de', (select nome from public.employees where id = _t.de_employee),
    'para', (select nome from public.employees where id = _t.para_employee), 'dias', to_jsonb(_t.dias), 'inicio', _t.inicio, 'tipo', _t.tipo, 'aplicada', _aplicada));
end; $$;

-- A montagem: as trocas aprovadas da semana que ainda esperam ser aplicadas, e o "Aplicar".
create or replace function public.aplicar_trocas_da_semana(_inicio date)
returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare _t record; _n int := 0;
begin
  perform public._exigir_adm_da_escala();
  for _t in select id, de_employee, para_employee, dias, tipo from public.trocas_de_escala
             where inicio = _inicio and situacao = 'aprovada' and not aplicada order by decidida_em loop
    if public._aplicar_troca(_t.id) then
      _n := _n + 1;
      perform public._auditar_escala('escala_troca_aplicar', (select id from public.escala_semanas where inicio = _inicio), null,
        jsonb_build_object('de', (select nome from public.employees where id = _t.de_employee), 'para', (select nome from public.employees where id = _t.para_employee),
          'dias', to_jsonb(_t.dias), 'inicio', _inicio, 'tipo', _t.tipo));
    end if;
  end loop;
  return _n;
end; $$;

-- ---------- As leituras ----------
create or replace function public._troca_em_json(_t public.trocas_de_escala)
returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('id', _t.id, 'inicio', _t.inicio, 'tipo', _t.tipo, 'modo', _t.modo, 'dias', to_jsonb(_t.dias),
    'de', jsonb_build_object('id', _t.de_employee, 'nome', (select nome from public.employees where id = _t.de_employee)),
    'para', jsonb_build_object('id', _t.para_employee, 'nome', (select nome from public.employees where id = _t.para_employee)),
    'mensagem', _t.mensagem, 'situacao', _t.situacao, 'motivo', _t.motivo, 'aplicada', _t.aplicada,
    'criado_em', _t.criado_em, 'aceita_em', _t.aceita_em, 'decidida_em', _t.decidida_em)
$$;

-- O ADM: as que aguardam a supervisão, as aprovadas que ainda esperam a montagem, e as decididas nos últimos 30 dias.
create or replace function public.trocas_para_aprovar()
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public._exigir_adm_da_escala();
  return coalesce((select jsonb_agg(public._troca_em_json(t) order by t.situacao <> 'aguardando_supervisao', t.aceita_em) from public.trocas_de_escala t
                    where t.situacao = 'aguardando_supervisao'
                       or (t.situacao = 'aprovada' and not t.aplicada)
                       or (t.situacao in ('aprovada', 'recusada') and t.decidida_em > now() - interval '30 days')), '[]'::jsonb);
end; $$;

revoke all on function public._eh_da_supervisao(uuid), public._troca_com_inicio(), public._segunda_de(date), public._estado_no_dia(uuid, date),
  public._aplicar_troca(uuid) from public, anon, authenticated;
revoke all on function public.folgas_fixas_do_time(), public.definir_folga_fixa(uuid, int[]), public.pedir_troca_no_dia(date, text, uuid, text, date, text),
  public.aplicar_trocas_da_semana(date) from public, anon;
grant execute on function public.folgas_fixas_do_time(), public.definir_folga_fixa(uuid, int[]), public.pedir_troca_no_dia(date, text, uuid, text, date, text),
  public.aplicar_trocas_da_semana(date) to authenticated;
