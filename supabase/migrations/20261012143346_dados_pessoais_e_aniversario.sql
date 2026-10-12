-- =====================================================================
-- Os dados pessoais e o aniversário (12/10/2026).
--
--   * O aniversário (o dia, o mês, o "mostrar para o time" e o "tema de festa") fica no
--     registro do perfil (visível só para a pessoa e o ADM). Para o time, sai só o fato de
--     "hoje é o aniversário", e só se a pessoa escolheu mostrar.
--   * O endereço e o contato de emergência ficam numa tabela SEPARADA, que só a pessoa e o
--     ADM leem (os avaliadores, não). Os números são guardados só com os dígitos.
--   * O ADM vê e corrige. A correção vai para o Histórico com os NOMES das partes
--     alteradas, e não com os valores (o endereço de ninguém vai parar no Histórico).
--   * Quem nasceu em 29/02 é festejado em 28/02 nos anos que não são bissextos.
-- =====================================================================
alter table public.perfis_colaborador
  add column aniversario_dia smallint check (aniversario_dia between 1 and 31),
  add column aniversario_mes smallint check (aniversario_mes between 1 and 12),
  add column aniversario_visivel boolean not null default true,
  add column aniversario_tema boolean not null default true,
  add constraint aniversario_completo check ((aniversario_dia is null) = (aniversario_mes is null)),
  add constraint aniversario_existe check (aniversario_dia is null or make_date(2024, aniversario_mes, aniversario_dia) is not null);

create table public.dados_pessoais (
  employee_id uuid primary key references public.employees (id) on delete cascade,
  cep text check (cep is null or cep ~ '^[0-9]{8}$'),
  rua text check (rua is null or length(rua) <= 120),
  numero text check (numero is null or length(numero) <= 10),
  complemento text check (complemento is null or length(complemento) <= 60),
  bairro text check (bairro is null or length(bairro) <= 60),
  cidade text check (cidade is null or length(cidade) <= 60),
  uf text check (uf is null or uf in ('AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO')),
  contato_nome text check (contato_nome is null or length(contato_nome) <= 80),
  contato_parentesco text check (contato_parentesco is null or length(contato_parentesco) <= 30),
  contato_telefone text check (contato_telefone is null or contato_telefone ~ '^[0-9]{10,11}$'),
  atualizado_em timestamptz not null default now(),
  corrigido_pela_adm boolean not null default false
);
alter table public.dados_pessoais enable row level security;
create policy dados_pessoais_leitura on public.dados_pessoais for select
  using (employee_id = public.current_employee_id() or public.is_admin(auth.uid()));
revoke all on public.dados_pessoais from anon, authenticated;
grant select on public.dados_pessoais to authenticated;

-- ---------- As conferências (as mesmas da tela) ----------
create or replace function public._limpar(_t text)
returns text
language sql immutable set search_path = public, pg_temp as $$ select nullif(btrim(coalesce(_t, '')), '') $$;
create or replace function public._so_digitos(_t text)
returns text
language sql immutable set search_path = public, pg_temp as $$ select nullif(regexp_replace(coalesce(_t, ''), '[^0-9]', '', 'g'), '') $$;

create or replace function public._conferir_dados_pessoais(_dia int, _mes int, _cep text, _uf text, _contato_nome text, _contato_telefone text)
returns void
language plpgsql immutable set search_path = public, pg_temp as $$
begin
  if (_dia is null) <> (_mes is null) then
    raise exception 'Escolha o dia e o mês do aniversário.' using errcode = 'P0001';
  end if;
  if _dia is not null and (_mes not between 1 and 12 or _dia not between 1 and 31
                           or extract(month from make_date(2024, _mes, 1) + (_dia - 1)) <> _mes) then
    raise exception 'Esse dia não existe nesse mês.' using errcode = 'P0001';
  end if;
  if _cep is not null and _cep !~ '^[0-9]{8}$' then
    raise exception 'O CEP precisa ter 8 números.' using errcode = 'P0001';
  end if;
  if _contato_telefone is not null and _contato_telefone !~ '^[0-9]{10,11}$' then
    raise exception 'O telefone precisa ter o DDD e o número.' using errcode = 'P0001';
  end if;
  if _contato_telefone is not null and _contato_nome is null then
    raise exception 'Escreva o nome do contato de emergência.' using errcode = 'P0001';
  end if;
  if _uf is not null and _uf not in ('AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO') then
    raise exception 'Escolha uma UF da lista.' using errcode = 'P0001';
  end if;
end; $$;

-- O endereço e o contato, na mesma forma para a pessoa e para o ADM.
create or replace function public._ficha_de(_emp uuid)
returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'nome', e.nome,
    'aniversario_dia', p.aniversario_dia, 'aniversario_mes', p.aniversario_mes,
    'aniversario_visivel', coalesce(p.aniversario_visivel, true), 'aniversario_tema', coalesce(p.aniversario_tema, true),
    'cep', d.cep, 'rua', d.rua, 'numero', d.numero, 'complemento', d.complemento, 'bairro', d.bairro, 'cidade', d.cidade, 'uf', d.uf,
    'contato_nome', d.contato_nome, 'contato_parentesco', d.contato_parentesco, 'contato_telefone', d.contato_telefone,
    'atualizado_em', d.atualizado_em, 'corrigido_pela_adm', coalesce(d.corrigido_pela_adm, false))
  from public.employees e
  left join public.perfis_colaborador p on p.employee_id = e.id
  left join public.dados_pessoais d on d.employee_id = e.id
  where e.id = _emp
$$;

-- ---------- A pessoa: ver e salvar os próprios ----------
create or replace function public.meus_dados_pessoais()
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare _emp uuid := public.current_employee_id();
begin
  if _emp is null then
    raise exception 'Apenas colaboradores com cadastro ativo têm perfil.' using errcode = '42501';
  end if;
  return public._ficha_de(_emp);
end; $$;

create or replace function public._gravar_dados_pessoais(_emp uuid, _pela_adm boolean, _dia int, _mes int, _cep text, _rua text, _numero text, _complemento text,
  _bairro text, _cidade text, _uf text, _contato_nome text, _contato_parentesco text, _contato_telefone text)
returns text[]
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  _antes jsonb := public._ficha_de(_emp);
  _depois jsonb;
  _partes text[] := '{}';
  _c text := public._so_digitos(_cep);
  _t text := public._so_digitos(_contato_telefone);
  _n text := public._limpar(_contato_nome);
  _u text := upper(public._limpar(_uf));
begin
  perform public._conferir_dados_pessoais(_dia, _mes, _c, _u, _n, _t);
  begin
    insert into public.perfis_colaborador (employee_id, aniversario_dia, aniversario_mes, atualizado_em)
    values (_emp, _dia, _mes, now())
    on conflict (employee_id) do update set aniversario_dia = excluded.aniversario_dia, aniversario_mes = excluded.aniversario_mes, atualizado_em = now();
    insert into public.dados_pessoais (employee_id, cep, rua, numero, complemento, bairro, cidade, uf, contato_nome, contato_parentesco, contato_telefone, atualizado_em, corrigido_pela_adm)
    values (_emp, _c, public._limpar(_rua), public._limpar(_numero), public._limpar(_complemento), public._limpar(_bairro), public._limpar(_cidade), _u,
            _n, public._limpar(_contato_parentesco), _t, now(), _pela_adm)
    on conflict (employee_id) do update set
      cep = excluded.cep, rua = excluded.rua, numero = excluded.numero, complemento = excluded.complemento, bairro = excluded.bairro,
      cidade = excluded.cidade, uf = excluded.uf, contato_nome = excluded.contato_nome, contato_parentesco = excluded.contato_parentesco,
      contato_telefone = excluded.contato_telefone, atualizado_em = now(), corrigido_pela_adm = excluded.corrigido_pela_adm;
  exception when check_violation then
    raise exception 'Confira o tamanho dos campos: algum deles passou do limite.' using errcode = 'P0001';
  end;
  _depois := public._ficha_de(_emp);
  -- Quais PARTES mudaram (para o Histórico do ADM, sem os valores).
  -- O ::text faz o || acrescentar um ITEM à lista (sem ele, o texto seria lido como uma lista inteira).
  if (_antes->'aniversario_dia', _antes->'aniversario_mes') is distinct from (_depois->'aniversario_dia', _depois->'aniversario_mes') then _partes := _partes || 'o aniversário'::text; end if;
  if (select bool_or(_antes->k is distinct from _depois->k) from unnest(array['cep','rua','numero','complemento','bairro','cidade','uf']) k) then _partes := _partes || 'o endereço'::text; end if;
  if (select bool_or(_antes->k is distinct from _depois->k) from unnest(array['contato_nome','contato_parentesco','contato_telefone']) k) then _partes := _partes || 'o contato de emergência'::text; end if;
  return _partes;
end; $$;

create or replace function public.salvar_meus_dados_pessoais(_dia int, _mes int, _visivel boolean, _tema boolean, _cep text, _rua text, _numero text, _complemento text,
  _bairro text, _cidade text, _uf text, _contato_nome text, _contato_parentesco text, _contato_telefone text)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare _emp uuid := public.current_employee_id();
begin
  if _emp is null then
    raise exception 'Apenas colaboradores com cadastro ativo têm perfil.' using errcode = '42501';
  end if;
  perform public._gravar_dados_pessoais(_emp, false, _dia, _mes, _cep, _rua, _numero, _complemento, _bairro, _cidade, _uf, _contato_nome, _contato_parentesco, _contato_telefone);
  update public.perfis_colaborador set aniversario_visivel = coalesce(_visivel, true), aniversario_tema = coalesce(_tema, true) where employee_id = _emp;
end; $$;

-- ---------- O ADM: ver e corrigir (o "mostrar para o time" e o tema continuam da pessoa) ----------
create or replace function public.dados_pessoais_de(_employee_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'Apenas o ADM vê os dados pessoais do time.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.employees where id = _employee_id) then
    raise exception 'Cadastro não encontrado.' using errcode = 'P0002';
  end if;
  return public._ficha_de(_employee_id);
end; $$;

create or replace function public.corrigir_dados_pessoais(_employee_id uuid, _dia int, _mes int, _cep text, _rua text, _numero text, _complemento text,
  _bairro text, _cidade text, _uf text, _contato_nome text, _contato_parentesco text, _contato_telefone text)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare _partes text[];
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'Apenas o ADM corrige os dados pessoais do time.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.employees where id = _employee_id) then
    raise exception 'Cadastro não encontrado.' using errcode = 'P0002';
  end if;
  _partes := public._gravar_dados_pessoais(_employee_id, true, _dia, _mes, _cep, _rua, _numero, _complemento, _bairro, _cidade, _uf, _contato_nome, _contato_parentesco, _contato_telefone);
  if cardinality(_partes) > 0 then
    insert into public.audit_logs (usuario_id, usuario_nome, acao, entidade, registro_id, valor_anterior, valor_novo)
    values (auth.uid(), (select nome from public.employees where user_id = auth.uid() limit 1), 'dados_pessoais_corrigir', 'employees', _employee_id, null,
            jsonb_build_object('partes', to_jsonb(_partes), 'colaborador', (select nome from public.employees where id = _employee_id)));
  end if;
end; $$;

-- A lista do ADM: quem tem os dados completos, e o que falta (sem os dados).
create or replace function public.situacao_dos_dados_pessoais()
returns table (employee_id uuid, falta text[])
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'Apenas o ADM vê a situação dos dados pessoais.' using errcode = '42501';
  end if;
  return query
    select e.id, case when d.employee_id is null then array['tudo'] else array_remove(array[
      case when d.cep is null or d.rua is null or d.cidade is null then 'endereço' end,
      case when d.contato_telefone is null then 'contato de emergência' end], null) end
      from public.employees e left join public.dados_pessoais d on d.employee_id = e.id;
end; $$;

-- ---------- O aniversário de hoje (o dia, e se a pessoa quer o tema) ----------
create or replace function public._faz_aniversario_hoje(_dia int, _mes int)
returns boolean
language sql stable set search_path = public, pg_temp as $$
  select _dia is not null and (
    (extract(day from h) = _dia and extract(month from h) = _mes)
    -- 29/02, nos anos que não são bissextos: em 28/02
    or (_dia = 29 and _mes = 2 and extract(month from h) = 2 and extract(day from h) = 28
        and extract(month from (h + 1)) = 3))
  from (select (now() at time zone 'America/Fortaleza')::date as h) x
$$;

-- A aparência: + "hoje é o seu aniversário" (com o tema ligado).
create or replace function public.minha_aparencia()
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare _emp uuid := public.current_employee_id(); _p public.perfis_colaborador%rowtype;
begin
  if _emp is null then
    raise exception 'Apenas colaboradores com cadastro ativo têm perfil.' using errcode = '42501';
  end if;
  select * into _p from public.perfis_colaborador where employee_id = _emp;
  return jsonb_build_object(
    'capa', coalesce(_p.capa, 'sinal'), 'moldura', coalesce(_p.moldura, 'nenhuma'),
    'capa_da_temporada', coalesce(_p.capa_da_temporada, true), 'moldura_da_temporada', coalesce(_p.moldura_da_temporada, true),
    'capa_temporada_preferida', _p.capa_temporada_preferida,
    'mes', public._mes_atual(), 'nivel', public._nivel_de(_emp),
    'aniversario_hoje', coalesce(_p.aniversario_tema, true) and public._faz_aniversario_hoje(_p.aniversario_dia, _p.aniversario_mes),
    'capas_liberadas', (select jsonb_agg(c) from unnest(array['sinal','ondas','brilho','faixas','aurora','pilula','fibra','torre','aparelhos','chip','podio','fluker',
                                                         'carnaval','junina','cliente','bruxas','rosa','azul','black','fimdeano']) c
                         where public._aparencia_liberada(_emp, 'capa', c)),
    'molduras_liberadas', (select jsonb_agg(m) from unnest(array['nenhuma','verde','prata','ouro','lendaria','fluker']) m
                            where public._aparencia_liberada(_emp, 'moldura', m)));
end; $$;

-- A moldura do time: no aniversário (visível, com o tema), a de festa vem primeiro.
create or replace function public.molduras_do_time(_pessoas uuid[])
returns table (employee_id uuid, moldura text)
language sql stable security definer set search_path = public, pg_temp as $$
  select e.id,
         case when coalesce(p.aniversario_visivel, true) and coalesce(p.aniversario_tema, true)
                   and public._faz_aniversario_hoje(p.aniversario_dia, p.aniversario_mes) then 'festa'
              when coalesce(p.moldura_da_temporada, true) and public._moldura_da_temporada(public._mes_atual()) is not null
              then public._moldura_da_temporada(public._mes_atual())
              else coalesce(p.moldura, 'nenhuma') end
    from public.employees e left join public.perfis_colaborador p on p.employee_id = e.id
   where public.eh_membro() and e.id = any (coalesce(_pessoas, '{}')) and cardinality(coalesce(_pessoas, '{}')) <= 100
$$;

revoke all on function public._limpar(text), public._so_digitos(text), public._conferir_dados_pessoais(int, int, text, text, text, text), public._ficha_de(uuid),
  public._gravar_dados_pessoais(uuid, boolean, int, int, text, text, text, text, text, text, text, text, text, text), public._faz_aniversario_hoje(int, int)
  from public, anon, authenticated;
revoke all on function public.meus_dados_pessoais(), public.salvar_meus_dados_pessoais(int, int, boolean, boolean, text, text, text, text, text, text, text, text, text, text),
  public.dados_pessoais_de(uuid), public.corrigir_dados_pessoais(uuid, int, int, text, text, text, text, text, text, text, text, text, text),
  public.situacao_dos_dados_pessoais() from public, anon;
grant execute on function public.meus_dados_pessoais(), public.salvar_meus_dados_pessoais(int, int, boolean, boolean, text, text, text, text, text, text, text, text, text, text),
  public.dados_pessoais_de(uuid), public.corrigir_dados_pessoais(uuid, int, int, text, text, text, text, text, text, text, text, text, text),
  public.situacao_dos_dados_pessoais() to authenticated;
