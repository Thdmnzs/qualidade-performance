-- =====================================================================
-- O horário de trabalho de cada pessoa (13/10/2026).
--
--   * A entrada, a saída e a hora da pausa, um horário só para todos os dias de trabalho.
--   * O ADM preenche na ficha (Colaboradores), e o botão "Atribuir folgas e horários" da montagem
--     usa o horário nos dias de trabalho vazios da semana.
--   * Guardado À PARTE dos dados pessoais: o endereço e o contato de emergência são sensíveis; o
--     horário não é, e a escala precisa lê-lo.
--   * As horas são as da escala (as células vão das 6h às 21h): a saída vai até as 22h.
-- =====================================================================
create table public.horarios_de_trabalho (
  employee_id uuid primary key references public.employees (id) on delete cascade,
  entrada smallint not null check (entrada between 6 and 21),
  saida smallint not null check (saida between 7 and 22),
  pausa smallint not null,
  atualizado_em timestamptz not null default now(),
  constraint horario_coerente check (
    saida > entrada and saida - entrada <= 10       -- até 10 horas
    and pausa > entrada and pausa < saida - 1        -- a pausa dentro, nem na 1ª nem na última hora
  )
);
alter table public.horarios_de_trabalho enable row level security;
create policy horarios_leitura_adm on public.horarios_de_trabalho for select using (public.is_admin(auth.uid()));
revoke all on public.horarios_de_trabalho from anon, authenticated;
grant select on public.horarios_de_trabalho to authenticated;

-- Os horários do time (o ADM, para a montagem e a ficha).
create or replace function public.horarios_de_trabalho()
returns table (employee_id uuid, entrada smallint, saida smallint, pausa smallint)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public._exigir_adm_da_escala();
  return query select h.employee_id, h.entrada, h.saida, h.pausa
                 from public.horarios_de_trabalho h join public.employees e on e.id = h.employee_id where e.status = 'ativo';
end; $$;

-- O ADM define (ou apaga, com a entrada vazia) o horário de alguém. Vai para o Histórico.
create or replace function public.definir_horario_de_trabalho(_employee_id uuid, _entrada int, _saida int, _pausa int)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public._exigir_adm_da_escala();
  if not exists (select 1 from public.employees where id = _employee_id and status = 'ativo') then
    raise exception 'Cadastro não encontrado.' using errcode = 'P0002';
  end if;
  if _entrada is null then
    delete from public.horarios_de_trabalho where employee_id = _employee_id;
  else
    if _saida is null or _pausa is null then
      raise exception 'Preencha a entrada, a saída e a pausa.' using errcode = 'P0001';
    end if;
    if _entrada < 6 or _saida > 22 then
      raise exception 'O horário precisa caber na escala, das 6h às 22h.' using errcode = 'P0001';
    end if;
    if _saida <= _entrada then
      raise exception 'A saída precisa ser depois da entrada.' using errcode = 'P0001';
    end if;
    if _saida - _entrada > 10 then
      raise exception 'A jornada pode ter até 10 horas.' using errcode = 'P0001';
    end if;
    if _pausa <= _entrada or _pausa >= _saida - 1 then
      raise exception 'A pausa precisa ficar dentro do horário, nem na primeira nem na última hora.' using errcode = 'P0001';
    end if;
    insert into public.horarios_de_trabalho (employee_id, entrada, saida, pausa, atualizado_em) values (_employee_id, _entrada, _saida, _pausa, now())
    on conflict (employee_id) do update set entrada = excluded.entrada, saida = excluded.saida, pausa = excluded.pausa, atualizado_em = now();
  end if;
  perform public._auditar_escala('escala_horario_de_trabalho', _employee_id, null,
    jsonb_build_object('colaborador', (select nome from public.employees where id = _employee_id), 'entrada', _entrada, 'saida', _saida, 'pausa', _pausa));
end; $$;

revoke all on function public.horarios_de_trabalho(), public.definir_horario_de_trabalho(uuid, int, int, int) from public, anon;
grant execute on function public.horarios_de_trabalho(), public.definir_horario_de_trabalho(uuid, int, int, int) to authenticated;
