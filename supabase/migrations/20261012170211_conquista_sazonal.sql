-- =====================================================================
-- A conquista sazonal (12/10/2026).
--
--   * Uma dimensão nova no catálogo, "sazonal", com seis conquistas (uma por temporada):
--     o Carnaval (fev), a Festa Junina (jun), o Dia do Cliente (set), a Noite das Bruxas (out),
--     a Black Friday (nov) e o Fim de ano (dez). As solidárias (rosa e azul) são só capa.
--   * A regra: fechar TODAS as quinzenas avaliadas do mês com a qualidade em 95 ou mais.
--     Ganha no fechamento da 2ª quinzena do mês. 100 XP, uma vez por ano em cada temporada.
--   * NÃO contam para a FLUKER nem para as Centrais de Comando.
-- =====================================================================
alter table public.conquistas drop constraint conquistas_dimensao_check;
alter table public.conquistas add constraint conquistas_dimensao_check
  check (dimensao = any (array['sinal', 'velocidade', 'conexao', 'rede', 'evolucao', 'ranking', 'suprema', 'sazonal']));

insert into public.conquistas (numero, dimensao, nome, condicao, xp, unica, ativa) values
  (101, 'sazonal', 'Carnaval', 'Fechar todas as quinzenas avaliadas de fevereiro com a qualidade em 95 ou mais.', 100, false, true),
  (102, 'sazonal', 'Festa Junina', 'Fechar todas as quinzenas avaliadas de junho com a qualidade em 95 ou mais.', 100, false, true),
  (103, 'sazonal', 'Dia do Cliente', 'Fechar todas as quinzenas avaliadas de setembro com a qualidade em 95 ou mais.', 100, false, true),
  (104, 'sazonal', 'Noite das Bruxas', 'Fechar todas as quinzenas avaliadas de outubro com a qualidade em 95 ou mais.', 100, false, true),
  (105, 'sazonal', 'Black Friday', 'Fechar todas as quinzenas avaliadas de novembro com a qualidade em 95 ou mais.', 100, false, true),
  (106, 'sazonal', 'Fim de ano', 'Fechar todas as quinzenas avaliadas de dezembro com a qualidade em 95 ou mais.', 100, false, true);

update public.conquistas set condicao = 'Desbloquear todas as conquistas ativas (fora as sazonais), ao menos uma vez.' where numero = 62;

-- O mês de cada temporada com conquista.
create or replace function public._conquista_sazonal_do_mes(_mes int)
returns int
language sql immutable set search_path = public, pg_temp as $$
  select case _mes when 2 then 101 when 6 then 102 when 9 then 103 when 10 then 104 when 11 then 105 when 12 then 106 else null end
$$;
revoke all on function public._conquista_sazonal_do_mes(int) from public, anon, authenticated;

-- O fechamento da quinzena: a FLUKER sem as sazonais, e a conquista sazonal no fim.
create or replace function public.calcular_conquistas_da_quinzena(_fortnight_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  _q public.fortnights%rowtype;
  _e record;
  _ids uuid[]; _notas numeric[]; _menores numeric[];
  _n int; _atual numeric;
  _seq91 int; _seq98 int; _melhora int; _total91 int; _total100 int; _i int;
  _ganhas int[];
  _c int; _cat public.conquistas%rowtype;
  _anterior public.conquistas_ganhas%rowtype; _sequencia int; _mult numeric;
  _inseridas int := 0;
begin
  select * into _q from public.fortnights where id = _fortnight_id;
  if not found or _q.status <> 'fechada' then
    return 0;
  end if;

  -- Idempotente: recalcular a mesma quinzena substitui o que havia.
  delete from public.conquistas_ganhas where fortnight_id = _fortnight_id;

  for _e in
    select distinct ev.employee_id from public.evaluations ev
     where ev.fortnight_id = _fortnight_id and not ev.anulada and ev.nota is not null
  loop
    -- Jornada da pessoa: quinzenas FECHADAS até esta em que ela teve avaliação, em ordem.
    select array_agg(id order by data_inicio), array_agg(nota order by data_inicio), array_agg(menor order by data_inicio)
      into _ids, _notas, _menores
      from (select f.id, f.data_inicio, avg(ev.nota) as nota, min(ev.nota) as menor
              from public.fortnights f
              join public.evaluations ev on ev.fortnight_id = f.id and ev.employee_id = _e.employee_id
                                         and not ev.anulada and ev.nota is not null
             where f.status = 'fechada' and f.data_inicio <= _q.data_inicio
             group by f.id, f.data_inicio) j;
    _n := array_length(_ids, 1);
    _atual := _notas[_n];

    -- Sequências a partir do fim (a quinzena atual).
    _seq91 := 0; _i := _n; while _i >= 1 and _notas[_i] >= 91 loop _seq91 := _seq91 + 1; _i := _i - 1; end loop;
    _seq98 := 0; _i := _n; while _i >= 1 and _notas[_i] >= 98 loop _seq98 := _seq98 + 1; _i := _i - 1; end loop;
    _melhora := 0; _i := _n; while _i >= 2 and _notas[_i] > _notas[_i - 1] loop _melhora := _melhora + 1; _i := _i - 1; end loop;
    select count(*) into _total91 from unnest(_notas) x where x >= 91;
    -- Quinzenas com a qualidade em 100 (desde 08/10/2026: os três estágios da qualidade perfeita).
    select count(*) into _total100 from unnest(_notas) x where x >= 100;

    _ganhas := '{}';
    if _n = 1 then _ganhas := _ganhas || array[1, 35]; end if;                         -- primeira quinzena
    if _atual >= 91 then _ganhas := _ganhas || 2; end if;                              -- Sinal Estável
    if _atual >= 95 then _ganhas := _ganhas || 3; end if;                              -- Sinal Forte
    if _atual >= 98 then _ganhas := _ganhas || 4; end if;                              -- Sinal Máximo
    if _seq91 > 0 and _seq91 % 3 = 0 then _ganhas := _ganhas || 5; end if;             -- Torre (blocos de 3)
    if _menores[_n] >= 91 then _ganhas := _ganhas || 6; end if;                        -- Sem Interferência
    if _atual >= 91 and _total91 % 5 = 0 then _ganhas := _ganhas || 7; end if;         -- Cobertura Nacional (a cada 5)
    if _seq98 > 0 and _seq98 % 2 = 0 then _ganhas := _ganhas || 8; end if;             -- Fibra Óptica (blocos de 2)
    if _n % 5 = 0 and (select avg(x) from unnest(_notas[_n - 4:_n]) x) >= 97 then     -- Sinal de Ouro (a cada 5)
      _ganhas := _ganhas || 9;
    end if;
    if _atual >= 91 and _total91 % 10 = 0 then _ganhas := _ganhas || 10; end if;       -- Antena Mestre (a cada 10)
    if _melhora > 0 and _melhora % 2 = 0 then _ganhas := _ganhas || 30; end if;        -- Manutenção Preventiva
    if _n = 3 then _ganhas := _ganhas || 36; end if;                                    -- Linha Ativada
    if _n = 10 then _ganhas := _ganhas || 42; end if;                                   -- Explorador de Rede
    if _atual >= 100 then _ganhas := _ganhas || 53; end if;                             -- Conexão Perfeita (1 quinzena)
    if _atual >= 100 and _total100 >= 5 then _ganhas := _ganhas || 54; end if;          -- Alta Frequência (5)
    if _atual >= 100 and _total100 >= 10 then _ganhas := _ganhas || 55; end if;         -- Roaming Internacional (10)

    foreach _c in array _ganhas loop
      select * into _cat from public.conquistas where numero = _c;
      -- Únicas: só se nunca foi ganha antes.
      if _cat.unica and exists (select 1 from public.conquistas_ganhas g
                                 where g.employee_id = _e.employee_id and g.conquista = _c) then
        continue;
      end if;
      -- Bônus de sequência: ganha também na quinzena anterior da pessoa?
      _sequencia := 1;
      if _n >= 2 then
        select * into _anterior from public.conquistas_ganhas g
         where g.employee_id = _e.employee_id and g.conquista = _c and g.fortnight_id = _ids[_n - 1];
        if found then _sequencia := _anterior.sequencia + 1; end if;
      end if;
      _mult := case _sequencia when 1 then 1 when 2 then 1.10 when 3 then 1.20 else 1.25 end;
      insert into public.conquistas_ganhas (employee_id, conquista, fortnight_id, xp, sequencia)
      values (_e.employee_id, _c, _fortnight_id, round(_cat.xp * _mult)::int, _sequencia);
      _inseridas := _inseridas + 1;
    end loop;

    -- As Centrais de Comando (ultra épicas): todas as outras conquistas da dimensão, ao menos uma
    -- vez. Só as disponíveis (a dimensão toda ativa). Depois, a FLUKER (suprema): todas as ativas,
    -- FORA as sazonais (desde 12/10/2026: perder uma temporada não atrasa a FLUKER de ninguém).
    for _cat in
      select * from public.conquistas c
       where c.ativa and (c.numero between 56 and 61 or c.numero = 62)
       order by c.numero  -- as Centrais antes da FLUKER (ela depende delas)
    loop
      continue when exists (select 1 from public.conquistas_ganhas g
                             where g.employee_id = _e.employee_id and g.conquista = _cat.numero);
      continue when exists (
        select 1 from public.conquistas o
         where o.numero <> _cat.numero
           and (case when _cat.numero = 62 then o.ativa and o.dimensao <> 'sazonal' else o.dimensao = _cat.dimensao end)
           and not exists (select 1 from public.conquistas_ganhas g
                            where g.employee_id = _e.employee_id and g.conquista = o.numero));
      insert into public.conquistas_ganhas (employee_id, conquista, fortnight_id, xp, sequencia)
      values (_e.employee_id, _cat.numero, _fortnight_id, _cat.xp, 1);
      _inseridas := _inseridas + 1;
    end loop;
  end loop;

  -- A conquista sazonal (desde 12/10/2026): no fechamento da 2ª quinzena de um mês com temporada.
  -- Todas as quinzenas AVALIADAS do mês (as que a pessoa não teve avaliação, como nas férias, não
  -- contam) com a qualidade em 95 ou mais. Uma por ano em cada temporada; 100 XP; sem o bônus de
  -- sequência. Inclui quem foi avaliado só na 1ª quinzena do mês.
  _c := public._conquista_sazonal_do_mes(_q.mes);
  if _q.tipo = 'segunda' and _c is not null then
    select * into _cat from public.conquistas where numero = _c;
    if found and _cat.ativa then
      for _e in
        select x.employee_id from (
          select ev.employee_id, f.id, avg(ev.nota) as media
            from public.fortnights f
            join public.evaluations ev on ev.fortnight_id = f.id and not ev.anulada and ev.nota is not null
           where f.ano = _q.ano and f.mes = _q.mes and f.status = 'fechada'
           group by ev.employee_id, f.id) x
         group by x.employee_id
        having min(x.media) >= 95
      loop
        continue when exists (select 1 from public.conquistas_ganhas g join public.fortnights f2 on f2.id = g.fortnight_id
                               where g.employee_id = _e.employee_id and g.conquista = _c and f2.ano = _q.ano);
        insert into public.conquistas_ganhas (employee_id, conquista, fortnight_id, xp, sequencia)
        values (_e.employee_id, _c, _fortnight_id, _cat.xp, 1);
        _inseridas := _inseridas + 1;
      end loop;
    end if;
  end if;
  return _inseridas;
end; $function$;
