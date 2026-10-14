-- =====================================================================
-- O horário dos fins de semana (14/10/2026).
--
--   * Opcional: um horário diferente para o sábado, o domingo ou os dois (por exemplo, quem entra às
--     13h na semana e às 6h no sábado). Com as mesmas regras do horário da semana.
--   * O botão "Atribuir folgas e horários" usa o horário do dia: nos dias escolhidos, o do fim de
--     semana; nos outros, o da semana. E a ordem da escala segue o horário de cada dia.
--   * A função de salvar ganha uma versão nova (com o fim de semana). A antiga continua, para o site
--     no ar não quebrar até o push (ela grava só o horário da semana, sem apagar o do fim de semana).
-- =====================================================================
alter table public.horarios_de_trabalho
  add column fds_dias smallint[],
  add column fds_entrada smallint,
  add column fds_saida smallint,
  add column fds_pausa smallint,
  add constraint horario_do_fim_de_semana check (
    (fds_dias is null and fds_entrada is null and fds_saida is null and fds_pausa is null)
    -- (todos preenchidos, explicitamente: numa regra, uma comparação com um valor vazio dá
    -- "desconhecido", e o banco aceita o "desconhecido")
    or (fds_dias is not null and fds_entrada is not null and fds_saida is not null and fds_pausa is not null
        and cardinality(fds_dias) between 1 and 2 and fds_dias <@ array[5, 6]::smallint[]
        and fds_entrada >= 6 and fds_saida <= 22 and fds_saida > fds_entrada and fds_saida - fds_entrada <= 10
        and fds_pausa > fds_entrada and fds_pausa < fds_saida - 1)
  );

-- Os horários do time, agora com o fim de semana.
drop function if exists public.horarios_de_trabalho();
create or replace function public.horarios_de_trabalho()
returns table (employee_id uuid, entrada smallint, saida smallint, pausa smallint,
               fds_dias smallint[], fds_entrada smallint, fds_saida smallint, fds_pausa smallint)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public._exigir_adm_da_escala();
  return query select h.employee_id, h.entrada, h.saida, h.pausa, h.fds_dias, h.fds_entrada, h.fds_saida, h.fds_pausa
                 from public.horarios_de_trabalho h join public.employees e on e.id = h.employee_id where e.status = 'ativo';
end; $$;

-- As regras de um horário (a mesma mensagem para a semana e o fim de semana).
create or replace function public._conferir_horario(_entrada int, _saida int, _pausa int, _quando text)
returns void
language plpgsql immutable set search_path = public, pg_temp as $$
begin
  if _entrada is null or _saida is null or _pausa is null then
    raise exception 'Preencha a entrada, a saída e a pausa%.', _quando using errcode = 'P0001';
  end if;
  if _entrada < 6 or _saida > 22 then
    raise exception 'O horário% precisa caber na escala, das 6h às 22h.', _quando using errcode = 'P0001';
  end if;
  if _saida <= _entrada then
    raise exception 'A saída% precisa ser depois da entrada.', _quando using errcode = 'P0001';
  end if;
  if _saida - _entrada > 10 then
    raise exception 'A jornada% pode ter até 10 horas.', _quando using errcode = 'P0001';
  end if;
  if _pausa <= _entrada or _pausa >= _saida - 1 then
    raise exception 'A pausa% precisa ficar dentro do horário, nem na primeira nem na última hora.', _quando using errcode = 'P0001';
  end if;
end; $$;

-- O ADM define o horário da semana e, se quiser, o do fim de semana (ou apaga tudo, com a entrada vazia).
create or replace function public.definir_horario_de_trabalho(_employee_id uuid, _entrada int, _saida int, _pausa int,
  _fds_dias int[], _fds_entrada int, _fds_saida int, _fds_pausa int)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare _dias smallint[] := (select array_agg(distinct d order by d) from unnest(coalesce(_fds_dias, '{}')) d);
begin
  perform public._exigir_adm_da_escala();
  if not exists (select 1 from public.employees where id = _employee_id and status = 'ativo') then
    raise exception 'Cadastro não encontrado.' using errcode = 'P0002';
  end if;
  if _entrada is null then
    delete from public.horarios_de_trabalho where employee_id = _employee_id;
  else
    perform public._conferir_horario(_entrada, _saida, _pausa, '');
    if _dias is not null then
      if exists (select 1 from unnest(_dias) d where d not in (5, 6)) then
        raise exception 'O horário do fim de semana vale só para o sábado e o domingo.' using errcode = 'P0001';
      end if;
      perform public._conferir_horario(_fds_entrada, _fds_saida, _fds_pausa, ' do fim de semana');
    end if;
    insert into public.horarios_de_trabalho (employee_id, entrada, saida, pausa, fds_dias, fds_entrada, fds_saida, fds_pausa, atualizado_em)
    values (_employee_id, _entrada, _saida, _pausa, _dias,
            case when _dias is not null then _fds_entrada end, case when _dias is not null then _fds_saida end, case when _dias is not null then _fds_pausa end, now())
    on conflict (employee_id) do update set entrada = excluded.entrada, saida = excluded.saida, pausa = excluded.pausa,
      fds_dias = excluded.fds_dias, fds_entrada = excluded.fds_entrada, fds_saida = excluded.fds_saida, fds_pausa = excluded.fds_pausa, atualizado_em = now();
  end if;
  perform public._auditar_escala('escala_horario_de_trabalho', _employee_id, null,
    jsonb_build_object('colaborador', (select nome from public.employees where id = _employee_id), 'entrada', _entrada, 'saida', _saida, 'pausa', _pausa,
      'fds_dias', to_jsonb(_dias), 'fds_entrada', case when _dias is not null then _fds_entrada end,
      'fds_saida', case when _dias is not null then _fds_saida end, 'fds_pausa', case when _dias is not null then _fds_pausa end));
end; $$;

revoke all on function public._conferir_horario(int, int, int, text) from public, anon, authenticated;
revoke all on function public.horarios_de_trabalho(), public.definir_horario_de_trabalho(uuid, int, int, int, int[], int, int, int) from public, anon;
grant execute on function public.horarios_de_trabalho(), public.definir_horario_de_trabalho(uuid, int, int, int, int[], int, int, int) to authenticated;
