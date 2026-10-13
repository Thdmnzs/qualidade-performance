-- =====================================================================
-- As trocas de escala (12/10/2026).
--
--   * Um colaborador pede; a colega aceita (ou recusa); a supervisão (o ADM) aprova ou recusa.
--   * Os tipos: os horários de um dia, as folgas (dois dias da mesma semana) e sair da escala
--     num feriado (quem está fora entra no lugar).
--   * O que se troca é o HORÁRIO: a janela e a pausa vêm da outra pessoa; as reuniões ficam na
--     mesma hora; as atividades da pessoa (o N2) vão junto. A MESMA regra da tela (src/lib/trocas.ts).
--   * Só semanas publicadas, a partir de hoje. Uma troca aguardando por pessoa e dia.
--   * Aprovar aplica a troca na escala publicada, e vai para o Histórico.
--   * slack_ts: a marca da mensagem no Slack (a parte 2: a Central de Turnos responde na conversa).
-- =====================================================================
create table public.trocas_de_escala (
  id uuid primary key default gen_random_uuid(),
  semana_id uuid not null references public.escala_semanas (id) on delete cascade,
  tipo text not null check (tipo in ('horarios', 'folgas', 'feriado')),
  dias smallint[] not null check (cardinality(dias) between 1 and 2),
  de_employee uuid not null references public.employees (id) on delete cascade,
  para_employee uuid not null references public.employees (id) on delete cascade,
  mensagem text check (mensagem is null or length(mensagem) <= 300),
  situacao text not null default 'aguardando_colega'
    check (situacao in ('aguardando_colega', 'aguardando_supervisao', 'aprovada', 'recusada_colega', 'recusada', 'cancelada')),
  motivo text check (motivo is null or length(motivo) <= 300),
  criado_em timestamptz not null default now(),
  aceita_em timestamptz,
  decidida_em timestamptz,
  decidida_por uuid references public.employees (id) on delete set null,
  slack_ts text,
  check (de_employee <> para_employee)
);
create index trocas_aguardando on public.trocas_de_escala (situacao) where situacao in ('aguardando_colega', 'aguardando_supervisao');
alter table public.trocas_de_escala enable row level security;
create policy trocas_leitura on public.trocas_de_escala for select
  using (de_employee = public.current_employee_id() or para_employee = public.current_employee_id() or public.is_admin(auth.uid()));
revoke all on public.trocas_de_escala from anon, authenticated;
grant select on public.trocas_de_escala to authenticated;

-- ---------- A regra do como fica (a mesma da tela) ----------
create or replace function public._redistribuir(_janela uuid[], _atividades uuid[])
returns uuid[]
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  _pausa uuid := (select id from public.escala_siglas where lower(sigla) = 'p' limit 1);
  _atend uuid := (select id from public.escala_siglas where em_atendimento order by ordem limit 1);
  _reunioes uuid[] := coalesce((select array_agg(id) from public.escala_siglas where lower(sigla) in ('mensal', '1:1')), '{}');
  _trabalho uuid[] := coalesce((select array_agg(id) from public.escala_siglas where conta_como_trabalho), '{}');
  _horas uuid[] := array_fill(null::uuid, array[16]);
  _livres int[] := '{}';
  _fluxo uuid[] := '{}';
  _k int; _h uuid; _i int; _pos int;
begin
  if _janela is null then return null; end if;
  -- Um dia sem trabalho (a folga, as férias) vai como está.
  if not exists (select 1 from unnest(_janela) h where h = any (_trabalho) or h = _pausa) then return _janela; end if;
  for _k in 1..16 loop
    if _janela[_k] = _pausa then _horas[_k] := _pausa; end if;
  end loop;
  if _atividades is not null and exists (select 1 from unnest(_atividades) h where h = any (_trabalho) or h = _pausa) then
    -- As reuniões: na mesma hora, se couberem no horário novo.
    for _k in 1..16 loop
      _h := _atividades[_k];
      if _h is not null and _h = any (_reunioes) and _janela[_k] is not null and _horas[_k] is null then _horas[_k] := _h; end if;
    end loop;
    -- As atividades da pessoa, na ordem (sem a pausa e as reuniões).
    for _k in 1..16 loop
      _h := _atividades[_k];
      if _h is not null and _h <> coalesce(_pausa, '00000000-0000-0000-0000-000000000000') and not (_h = any (_reunioes)) and _h = any (_trabalho) then
        _fluxo := _fluxo || _h;
      end if;
    end loop;
  end if;
  for _k in 1..16 loop
    if _janela[_k] is not null and _horas[_k] is null then _livres := _livres || _k; end if;
  end loop;
  -- Faltando horas: sai primeiro o atendimento (do fim); depois, o que não couber.
  while coalesce(cardinality(_fluxo), 0) > coalesce(cardinality(_livres), 0) and _atend = any (_fluxo) loop
    _pos := (select max(o) from unnest(_fluxo) with ordinality x(h, o) where h = _atend);
    _fluxo := _fluxo[1:_pos - 1] || _fluxo[_pos + 1:];
  end loop;
  if coalesce(cardinality(_fluxo), 0) > coalesce(cardinality(_livres), 0) then _fluxo := _fluxo[1:cardinality(_livres)]; end if;
  -- Sobrando horas: viram atendimento.
  while coalesce(cardinality(_fluxo), 0) < coalesce(cardinality(_livres), 0) and _atend is not null loop _fluxo := _fluxo || _atend; end loop;
  for _i in 1..coalesce(cardinality(_livres), 0) loop _horas[_livres[_i]] := _fluxo[_i]; end loop;
  return _horas;
end; $$;

create or replace function public._linha_da_escala(_semana uuid, _dia int, _emp uuid)
returns uuid[]
language sql stable security definer set search_path = public, pg_temp as $$
  select horas from public.escala_linhas where semana_id = _semana and dia = _dia and employee_id = _emp
$$;

-- ---------- Pedir (o colaborador) ----------
create or replace function public.pedir_troca(_inicio date, _tipo text, _dias int[], _com uuid, _mensagem text)
returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  _eu uuid := public.current_employee_id();
  _s public.escala_semanas%rowtype;
  _hoje date := (now() at time zone 'America/Fortaleza')::date;
  _d int; _id uuid;
  _msg text := nullif(btrim(coalesce(_mensagem, '')), '');
  _eu_esta boolean; _ela_esta boolean;
begin
  if _eu is null then
    raise exception 'Seu acesso não está vinculado a um colaborador ativo.' using errcode = '42501';
  end if;
  if _com is null or _com = _eu then
    raise exception 'Escolha outra pessoa.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.employees where id = _com and status = 'ativo') then
    raise exception 'Essa pessoa não é um cadastro ativo.' using errcode = 'P0001';
  end if;
  if _tipo not in ('horarios', 'folgas', 'feriado') then
    raise exception 'Escolha o tipo da troca.' using errcode = 'P0001';
  end if;
  if (_tipo = 'folgas' and (cardinality(_dias) <> 2 or _dias[1] = _dias[2])) or (_tipo <> 'folgas' and cardinality(_dias) <> 1) then
    raise exception '%', case when _tipo = 'folgas' then 'Escolha dois dias diferentes.' else 'Escolha o dia.' end using errcode = 'P0001';
  end if;
  if exists (select 1 from unnest(_dias) d where d not between 0 and 6) then
    raise exception 'O dia precisa ser da semana.' using errcode = 'P0001';
  end if;
  select * into _s from public.escala_semanas where inicio = _inicio;
  if not found or _s.situacao <> 'publicada' then
    raise exception 'A troca vale só para as semanas já publicadas.' using errcode = 'P0001';
  end if;
  if exists (select 1 from unnest(_dias) d where _s.inicio + d < _hoje) then
    raise exception 'Escolha dias a partir de hoje.' using errcode = 'P0001';
  end if;
  if length(coalesce(_msg, '')) > 300 then
    raise exception 'A mensagem pode ter até 300 caracteres.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from unnest(_dias) d where public._linha_da_escala(_s.id, d, _eu) is not null or public._linha_da_escala(_s.id, d, _com) is not null) then
    raise exception 'Nenhum dos dois está na escala nesse dia.' using errcode = 'P0001';
  end if;
  if _tipo = 'feriado' then
    _eu_esta := public._linha_da_escala(_s.id, _dias[1], _eu) is not null;
    _ela_esta := public._linha_da_escala(_s.id, _dias[1], _com) is not null;
    if not _eu_esta then raise exception 'Você não está na escala desse dia.' using errcode = 'P0001'; end if;
    if _ela_esta then raise exception 'Essa pessoa já está na escala desse dia: use “Trocar os horários”.' using errcode = 'P0001'; end if;
  end if;
  -- Uma troca aguardando por pessoa e dia (o lock evita duas ao mesmo tempo).
  perform pg_advisory_xact_lock(hashtext('trocas:' || _s.id::text));
  if exists (select 1 from public.trocas_de_escala t
              where t.semana_id = _s.id and t.situacao in ('aguardando_colega', 'aguardando_supervisao')
                and (t.de_employee in (_eu, _com) or t.para_employee in (_eu, _com))
                and t.dias && _dias::smallint[]) then
    raise exception 'Já há uma troca aguardando nesse dia, com uma de vocês.' using errcode = 'P0001';
  end if;
  insert into public.trocas_de_escala (semana_id, tipo, dias, de_employee, para_employee, mensagem)
  values (_s.id, _tipo, _dias::smallint[], _eu, _com, _msg) returning id into _id;
  return _id;
end; $$;

-- ---------- A colega: aceitar ou recusar ----------
create or replace function public.responder_troca(_troca uuid, _aceitar boolean)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare _t public.trocas_de_escala%rowtype;
begin
  select * into _t from public.trocas_de_escala where id = _troca for update;
  if not found or _t.para_employee is distinct from public.current_employee_id() then
    raise exception 'Troca não encontrada.' using errcode = 'P0002';
  end if;
  if _t.situacao <> 'aguardando_colega' then
    raise exception 'Esta troca já foi respondida (ou cancelada).' using errcode = 'P0001';
  end if;
  update public.trocas_de_escala
     set situacao = case when _aceitar then 'aguardando_supervisao' else 'recusada_colega' end,
         aceita_em = case when _aceitar then now() end, decidida_em = case when _aceitar then null else now() end
   where id = _troca;
end; $$;

-- ---------- Quem pediu: cancelar (enquanto a supervisão não decidiu) ----------
create or replace function public.cancelar_troca(_troca uuid)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare _t public.trocas_de_escala%rowtype;
begin
  select * into _t from public.trocas_de_escala where id = _troca for update;
  if not found or _t.de_employee is distinct from public.current_employee_id() then
    raise exception 'Troca não encontrada.' using errcode = 'P0002';
  end if;
  if _t.situacao not in ('aguardando_colega', 'aguardando_supervisao') then
    raise exception 'Só uma troca que ainda aguarda pode ser cancelada.' using errcode = 'P0001';
  end if;
  update public.trocas_de_escala set situacao = 'cancelada', decidida_em = now() where id = _troca;
end; $$;

-- ---------- A supervisão: aprovar (aplica na escala) ou recusar ----------
create or replace function public.decidir_troca(_troca uuid, _aprovar boolean, _motivo text)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  _eu uuid := public._exigir_adm_da_escala();
  _t public.trocas_de_escala%rowtype;
  _s public.escala_semanas%rowtype;
  _d int; _outro int; _a uuid[]; _b uuid[]; _ordem_a smallint; _ordem_b smallint;
  _motivo_limpo text := nullif(btrim(coalesce(_motivo, '')), '');
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
      'para', (select nome from public.employees where id = _t.para_employee), 'dias', to_jsonb(_t.dias), 'inicio', (select inicio from public.escala_semanas where id = _t.semana_id)));
    return;
  end if;
  select * into _s from public.escala_semanas where id = _t.semana_id for update;
  if _s.situacao <> 'publicada' then
    raise exception 'A semana não está mais publicada.' using errcode = 'P0001';
  end if;
  perform 1 from public.employees where id in (_t.de_employee, _t.para_employee) and status = 'ativo' having count(*) = 2;
  if not found then
    raise exception 'Uma das pessoas não é mais um cadastro ativo.' using errcode = 'P0001';
  end if;
  -- Calcula tudo ANTES de gravar (a troca de folgas lê os dois dias como estavam).
  drop table if exists _novas; -- duas aprovações na mesma conexão não podem esbarrar na tabela da anterior
  create temp table _novas (dia int, emp uuid, horas uuid[], ordem smallint) on commit drop;
  foreach _d in array _t.dias loop
    _outro := case when _t.tipo = 'folgas' then (select x from unnest(_t.dias) x where x <> _d limit 1) else _d end;
    _a := public._redistribuir(public._linha_da_escala(_s.id, _d, _t.para_employee),
                               case when _t.tipo = 'feriado' then null else public._linha_da_escala(_s.id, _outro, _t.de_employee) end);
    _b := public._redistribuir(public._linha_da_escala(_s.id, _d, _t.de_employee),
                               case when _t.tipo = 'feriado' then null else public._linha_da_escala(_s.id, _outro, _t.para_employee) end);
    _ordem_a := (select ordem from public.escala_linhas where semana_id = _s.id and dia = _d and employee_id = _t.de_employee);
    _ordem_b := (select ordem from public.escala_linhas where semana_id = _s.id and dia = _d and employee_id = _t.para_employee);
    -- Cada um na posição em que estava; quem entra, na posição de quem saiu.
    insert into _novas values (_d, _t.de_employee, _a, coalesce(_ordem_a, _ordem_b)), (_d, _t.para_employee, _b, coalesce(_ordem_b, _ordem_a));
  end loop;
  delete from public.escala_linhas l using _novas n where l.semana_id = _s.id and l.dia = n.dia and l.employee_id = n.emp;
  insert into public.escala_linhas (semana_id, dia, employee_id, ordem, horas)
    select _s.id, n.dia, n.emp, n.ordem, n.horas from _novas n where n.horas is not null;
  update public.escala_semanas set atualizada_em = now() where id = _s.id;
  update public.trocas_de_escala set situacao = 'aprovada', decidida_em = now(), decidida_por = _eu where id = _troca;
  perform public._auditar_escala('escala_troca_aprovar', _s.id, null, jsonb_build_object('de', (select nome from public.employees where id = _t.de_employee),
    'para', (select nome from public.employees where id = _t.para_employee), 'dias', to_jsonb(_t.dias), 'inicio', _s.inicio, 'tipo', _t.tipo));
end; $$;

-- ---------- As leituras ----------
create or replace function public._troca_em_json(_t public.trocas_de_escala)
returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('id', _t.id, 'inicio', s.inicio, 'tipo', _t.tipo, 'dias', to_jsonb(_t.dias),
    'de', jsonb_build_object('id', _t.de_employee, 'nome', (select nome from public.employees where id = _t.de_employee)),
    'para', jsonb_build_object('id', _t.para_employee, 'nome', (select nome from public.employees where id = _t.para_employee)),
    'mensagem', _t.mensagem, 'situacao', _t.situacao, 'motivo', _t.motivo,
    'criado_em', _t.criado_em, 'aceita_em', _t.aceita_em, 'decidida_em', _t.decidida_em)
  from public.escala_semanas s where s.id = _t.semana_id
$$;

-- O colaborador: as trocas em que ele está (as que aguardam, e as dos últimos 60 dias).
create or replace function public.minhas_trocas()
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare _eu uuid := public.current_employee_id();
begin
  if _eu is null then
    raise exception 'Seu acesso não está vinculado a um colaborador ativo.' using errcode = '42501';
  end if;
  return coalesce((select jsonb_agg(public._troca_em_json(t) order by t.criado_em desc) from public.trocas_de_escala t
                    where (t.de_employee = _eu or t.para_employee = _eu)
                      and (t.situacao in ('aguardando_colega', 'aguardando_supervisao') or t.criado_em > now() - interval '60 days')), '[]'::jsonb);
end; $$;

-- O ADM: as que aguardam a supervisão, e as decididas nos últimos 30 dias.
create or replace function public.trocas_para_aprovar()
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public._exigir_adm_da_escala();
  return coalesce((select jsonb_agg(public._troca_em_json(t) order by t.situacao <> 'aguardando_supervisao', t.aceita_em) from public.trocas_de_escala t
                    where t.situacao = 'aguardando_supervisao'
                       or (t.situacao in ('aprovada', 'recusada') and t.decidida_em > now() - interval '30 days')), '[]'::jsonb);
end; $$;

revoke all on function public._redistribuir(uuid[], uuid[]), public._linha_da_escala(uuid, int, uuid), public._troca_em_json(public.trocas_de_escala)
  from public, anon, authenticated;
revoke all on function public.pedir_troca(date, text, int[], uuid, text), public.responder_troca(uuid, boolean), public.cancelar_troca(uuid),
  public.decidir_troca(uuid, boolean, text), public.minhas_trocas(), public.trocas_para_aprovar() from public, anon;
grant execute on function public.pedir_troca(date, text, int[], uuid, text), public.responder_troca(uuid, boolean), public.cancelar_troca(uuid),
  public.decidir_troca(uuid, boolean, text), public.minhas_trocas(), public.trocas_para_aprovar() to authenticated;
