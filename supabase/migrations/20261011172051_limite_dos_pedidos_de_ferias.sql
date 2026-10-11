-- =====================================================================
-- O limite dos pedidos de férias (11/10/2026): até o fim do segundo ano seguinte
-- (em 2026, até 31/12/2028), o mesmo que a tela de férias mostra. A regra fica
-- no banco, como as outras do pedido: vale por qualquer caminho. Só esta função muda.
-- =====================================================================
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
  -- Até o fim do segundo ano seguinte (em 2026, até 31/12/2028): o que a tela de férias mostra.
  if _ate > make_date(extract(year from _amanha - 1)::int + 2, 12, 31) then
    raise exception 'Você pode pedir férias até 31/12/%.', extract(year from _amanha - 1)::int + 2 using errcode = 'P0001';
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
