-- =====================================================================
-- Os pedidos de férias (11/10/2026): o colaborador pede, pelo calendário de férias,
-- e o ADM aprova (o pedido vira férias, na hora) ou recusa (com um motivo, que a
-- pessoa vê). As regras ficam aqui, e não só na tela: valem por qualquer caminho.
--
--   * Só dias a partir de amanhã (no fuso de Fortaleza); sem limite de dias.
--   * Sem dois pedidos aguardando nos mesmos dias; sem pedir dias já de férias.
--   * O colaborador vê só os próprios pedidos; o ADM vê todos.
--   * Cancelar: só o próprio pedido, e só enquanto aguarda.
-- Os pedidos, os cancelamentos e as decisões vão para o histórico.
-- =====================================================================
create table public.ferias_pedidos (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees (id) on delete cascade,
  de date not null,
  ate date not null,
  observacao text check (observacao is null or length(observacao) <= 300),
  situacao text not null default 'aguardando' check (situacao in ('aguardando', 'aprovado', 'recusado', 'cancelado')),
  motivo text check (motivo is null or length(motivo) <= 300),
  criado_em timestamptz not null default now(),
  decidido_em timestamptz,
  decidido_por uuid references public.employees (id) on delete set null,
  check (ate >= de and ate - de < 366)
);
create index ferias_pedidos_pessoa on public.ferias_pedidos (employee_id, situacao);
create index ferias_pedidos_aguardando on public.ferias_pedidos (situacao) where situacao = 'aguardando';

alter table public.ferias_pedidos enable row level security;
create policy ferias_pedidos_leitura on public.ferias_pedidos for select
  using (public.eh_membro() and (employee_id = public.current_employee_id() or public.is_admin(auth.uid())));
revoke all on public.ferias_pedidos from anon, authenticated;
grant select on public.ferias_pedidos to authenticated;

-- ---------- Pedir (o colaborador, para si mesmo) ----------
create or replace function public.pedir_ferias(_de date, _ate date, _observacao text)
returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  _eu uuid := public.current_employee_id();
  _amanha date := (now() at time zone 'America/Fortaleza')::date + 1;
  _id uuid;
  _obs text := nullif(btrim(coalesce(_observacao, '')), '');
begin
  if _eu is null then
    raise exception 'Seu acesso não está vinculado a um colaborador ativo.' using errcode = '42501';
  end if;
  if _de is null or _ate is null or _ate < _de then
    raise exception 'A data final precisa ser depois da inicial.' using errcode = 'P0001';
  end if;
  if _de < _amanha then
    raise exception 'Escolha dias a partir de amanhã.' using errcode = 'P0001';
  end if;
  if _ate - _de >= 366 then
    raise exception 'Um pedido pode ter no máximo 366 dias.' using errcode = 'P0001';
  end if;
  if length(coalesce(_obs, '')) > 300 then
    raise exception 'A observação pode ter até 300 caracteres.' using errcode = 'P0001';
  end if;
  -- Um pedido de cada vez, por pessoa (o lock evita dois pedidos iguais ao mesmo tempo).
  perform pg_advisory_xact_lock(hashtext('ferias_pedidos:' || _eu::text));
  if exists (select 1 from public.ferias_pedidos p where p.employee_id = _eu and p.situacao = 'aguardando'
              and p.de <= _ate and p.ate >= _de) then
    raise exception 'Você já tem um pedido aguardando nesses dias.' using errcode = 'P0001';
  end if;
  if (select count(*) from public.ferias_dias f where f.employee_id = _eu and f.data between _de and _ate) = (_ate - _de + 1) then
    raise exception 'Você já está de férias nesses dias.' using errcode = 'P0001';
  end if;
  insert into public.ferias_pedidos (employee_id, de, ate, observacao) values (_eu, _de, _ate, _obs) returning id into _id;
  perform public._auditar_escala('ferias_pedir', _eu, null,
    jsonb_build_object('de', _de, 'ate', _ate, 'colaborador', (select nome from public.employees where id = _eu)));
  return _id;
end; $$;

-- ---------- Cancelar (o próprio pedido, enquanto aguarda) ----------
create or replace function public.cancelar_pedido_de_ferias(_pedido uuid)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare _p public.ferias_pedidos%rowtype;
begin
  select * into _p from public.ferias_pedidos where id = _pedido for update;
  if not found or _p.employee_id is distinct from public.current_employee_id() then
    raise exception 'Pedido não encontrado.' using errcode = 'P0002';
  end if;
  if _p.situacao <> 'aguardando' then
    raise exception 'Só um pedido que ainda aguarda pode ser cancelado.' using errcode = 'P0001';
  end if;
  update public.ferias_pedidos set situacao = 'cancelado', decidido_em = now() where id = _pedido;
  perform public._auditar_escala('ferias_cancelar_pedido', _p.employee_id, null,
    jsonb_build_object('de', _p.de, 'ate', _p.ate, 'colaborador', (select nome from public.employees where id = _p.employee_id)));
end; $$;

-- ---------- Decidir (o ADM): aprovar vira férias, na hora; recusar pede um motivo ----------
create or replace function public.decidir_pedido_de_ferias(_pedido uuid, _aprovar boolean, _motivo text)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  _eu uuid := public._exigir_adm_da_escala();
  _p public.ferias_pedidos%rowtype;
  _motivo_limpo text := nullif(btrim(coalesce(_motivo, '')), '');
begin
  select * into _p from public.ferias_pedidos where id = _pedido for update;
  if not found then
    raise exception 'Pedido não encontrado.' using errcode = 'P0002';
  end if;
  if _p.situacao <> 'aguardando' then
    raise exception 'Este pedido já foi decidido (ou cancelado).' using errcode = 'P0001';
  end if;
  if _aprovar then
    if not exists (select 1 from public.employees where id = _p.employee_id and status = 'ativo') then
      raise exception 'A pessoa não é mais um cadastro ativo.' using errcode = 'P0001';
    end if;
    insert into public.ferias_dias (data, employee_id)
      select d::date, _p.employee_id from generate_series(_p.de, _p.ate, interval '1 day') d
      on conflict do nothing;
    update public.ferias_pedidos set situacao = 'aprovado', decidido_em = now(), decidido_por = _eu where id = _pedido;
  else
    if length(coalesce(_motivo_limpo, '')) < 10 then
      raise exception 'Escreva o motivo da recusa, com pelo menos 10 caracteres.' using errcode = 'P0001';
    end if;
    if length(_motivo_limpo) > 300 then
      raise exception 'O motivo pode ter até 300 caracteres.' using errcode = 'P0001';
    end if;
    update public.ferias_pedidos set situacao = 'recusado', motivo = _motivo_limpo, decidido_em = now(), decidido_por = _eu where id = _pedido;
  end if;
  perform public._auditar_escala(case when _aprovar then 'ferias_aprovar' else 'ferias_recusar' end, _p.employee_id, null,
    jsonb_build_object('de', _p.de, 'ate', _p.ate, 'motivo', _motivo_limpo, 'colaborador', (select nome from public.employees where id = _p.employee_id)));
end; $$;

-- ---------- Ler: o colaborador, os próprios; o ADM, todos (com o nome) ----------
create or replace function public.pedidos_de_ferias()
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare _eu uuid := public.current_employee_id(); _adm boolean := public.is_admin(auth.uid());
begin
  if _eu is null then
    raise exception 'Seu acesso não está vinculado a um colaborador ativo.' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', p.id, 'employee_id', p.employee_id, 'nome', e.nome, 'de', p.de, 'ate', p.ate,
                                        'observacao', p.observacao, 'situacao', p.situacao, 'motivo', p.motivo,
                                        'criado_em', p.criado_em, 'decidido_em', p.decidido_em)
                     order by p.criado_em desc)
      from public.ferias_pedidos p join public.employees e on e.id = p.employee_id
     where (p.employee_id = _eu or _adm)
       -- para o ADM, os aguardando e os decididos nos últimos 60 dias (a lista não cresce para sempre)
       and (not _adm or p.employee_id = _eu or p.situacao = 'aguardando' or p.decidido_em > now() - interval '60 days')
  ), '[]'::jsonb);
end; $$;

revoke all on function public.pedir_ferias(date, date, text), public.cancelar_pedido_de_ferias(uuid),
  public.decidir_pedido_de_ferias(uuid, boolean, text), public.pedidos_de_ferias() from public, anon;
grant execute on function public.pedir_ferias(date, date, text), public.cancelar_pedido_de_ferias(uuid),
  public.decidir_pedido_de_ferias(uuid, boolean, text), public.pedidos_de_ferias() to authenticated;
