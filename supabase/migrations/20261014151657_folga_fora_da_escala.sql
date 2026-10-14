-- =====================================================================
-- Nos fins de semana e nos feriados, quem folga fica FORA da escala (14/10/2026).
--
--   * Num sábado, num domingo ou num feriado, uma linha que é só de folga não é gravada: a escala
--     desses dias mostra só quem trabalha. Vale para todos os caminhos (a montagem, a cópia de
--     semana, o botão das folgas e dos horários, e as trocas), porque a regra mora num gatilho.
--   * As férias e as ausências continuam aparecendo (não são folga).
--   * A leitura do dia (para as trocas), numa semana publicada: sem linha num fim de semana (sem
--     feriado), a pessoa está de FOLGA; num feriado, continua "fora" da escala do feriado.
--   * As semanas não publicadas perdem as linhas de folga nesses dias; as publicadas não mudam.
-- =====================================================================

-- O dia de uma semana é de fim de semana ou de feriado?
create or replace function public._dia_sem_folga_na_escala(_semana uuid, _dia int)
returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select _dia in (5, 6) or exists (select 1 from public.escala_semanas s join public.feriados f on f.data = s.inicio + _dia where s.id = _semana)
$$;

-- A linha é só de folga (tem a folga, e nada além dela)?
create or replace function public._linha_so_de_folga(_horas uuid[])
returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from unnest(_horas) h join public.escala_siglas g on g.id = h where lower(g.sigla) = 'folga')
     and not exists (select 1 from unnest(_horas) h join public.escala_siglas g on g.id = h where lower(g.sigla) <> 'folga')
$$;

create or replace function public._folga_fora_da_escala()
returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if public._dia_sem_folga_na_escala(new.semana_id, new.dia) and public._linha_so_de_folga(new.horas) then
    return null; -- a linha de folga não entra
  end if;
  return new;
end; $$;
create trigger folga_fora_da_escala before insert on public.escala_linhas for each row execute function public._folga_fora_da_escala();

-- A leitura do dia, para as trocas: sem linha num fim de semana (sem feriado) é folga.
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
    if _l is null then
      return case when _dia in (5, 6) and not exists (select 1 from public.feriados where data = _data) then 'folga' else 'fora' end;
    end if;
    return case when exists (select 1 from unnest(_l) h join public.escala_siglas g on g.id = h where g.conta_como_trabalho or lower(g.sigla) = 'p')
                then 'trabalha' else 'folga' end;
  end if;
  return case when exists (select 1 from public.folgas_fixas where employee_id = _emp and _dia = any (dias)) then 'folga' else 'trabalha' end;
end; $$;

-- A aplicação das trocas: numa troca de folgas que cai num fim de semana ou feriado, quem folga
-- naquele dia não tem linha (e isso não é "a semana ainda não montada"). Só esse trecho muda.
CREATE OR REPLACE FUNCTION public._aplicar_troca(_troca uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
  -- (14/10/2026: numa troca de folgas, num fim de semana ou feriado, não ter linha é estar de folga.)
  if exists (select 1 from _dias_da_troca x
              where not (_t.tipo = 'folgas' and public._dia_sem_folga_na_escala(_s.id, x.dia))
                and (public._linha_da_escala(_s.id, x.dia, _t.de_employee) is null
                     or (_t.tipo <> 'feriado' and public._linha_da_escala(_s.id, x.dia, _t.para_employee) is null))) then
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
end; $function$;

-- As semanas não publicadas perdem as linhas de folga nos fins de semana e nos feriados.
delete from public.escala_linhas l using public.escala_semanas s
 where s.id = l.semana_id and s.situacao <> 'publicada'
   and public._dia_sem_folga_na_escala(l.semana_id, l.dia) and public._linha_so_de_folga(l.horas);

revoke all on function public._dia_sem_folga_na_escala(uuid, int), public._linha_so_de_folga(uuid[]), public._folga_fora_da_escala() from public, anon, authenticated;
