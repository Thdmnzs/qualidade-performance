-- =====================================================================
-- O novo Meu perfil (08/10/2026): as conquistas novas e a FLUKER.
--
--   * Os três estágios da qualidade perfeita (a qualidade da QUINZENA em 100):
--     Conexão Perfeita (1 vez), Alta Frequência (5) e Roaming Internacional (10).
--   * As seis Centrais de Comando (ultra épicas, 700 XP): todas as outras
--     conquistas da dimensão. Só ficam disponíveis com a dimensão toda ativa
--     (hoje, só a do Sinal); a disponibilidade se atualiza sozinha.
--   * A FLUKER (suprema, 1.500 XP): todas as conquistas ativas. Fica OCULTA
--     para quem ainda não a ganhou: nem o nome sai do banco para essa pessoa.
--   * A curva de níveis (1.000 XP por nível) fica na aplicação; o banco só soma o XP.
-- A função do cálculo partiu da definição em produção (hash conferido).
-- =====================================================================
alter table public.conquistas drop constraint if exists conquistas_dimensao_check;
alter table public.conquistas add constraint conquistas_dimensao_check
  check (dimensao in ('sinal', 'velocidade', 'conexao', 'rede', 'evolucao', 'ranking', 'suprema'));

insert into public.conquistas (numero, dimensao, nome, condicao, xp, unica, ativa) values
  (53, 'sinal', 'Conexão Perfeita', 'Fechar 1 quinzena com a qualidade em 100.', 200, true, true),
  (54, 'sinal', 'Alta Frequência', 'Fechar 5 quinzenas com a qualidade em 100.', 350, true, true),
  (55, 'sinal', 'Roaming Internacional', 'Fechar 10 quinzenas com a qualidade em 100.', 500, true, true),
  (56, 'sinal', 'Central de Comando — Sinal', 'Desbloquear todas as conquistas de Qualidade.', 700, true, false),
  (57, 'velocidade', 'Central de Comando — Velocidade', 'Desbloquear todas as conquistas de Produtividade e SLA.', 700, true, false),
  (58, 'conexao', 'Central de Comando — Conexão', 'Desbloquear todas as conquistas de Experiência do time.', 700, true, false),
  (59, 'rede', 'Central de Comando — Rede', 'Desbloquear todas as conquistas de Consistência.', 700, true, false),
  (60, 'evolucao', 'Central de Comando — Evolução', 'Desbloquear todas as conquistas da Jornada.', 700, true, false),
  (61, 'ranking', 'Central de Comando — Ranking', 'Desbloquear todas as conquistas do Pódio da quinzena.', 700, true, false),
  (62, 'suprema', 'FLUKER', 'Desbloquear todas as conquistas ativas, ao menos uma vez.', 1500, true, true);

-- ---------- A disponibilidade das Centrais: a dimensão toda ativa ----------
create or replace function public.sincronizar_centrais()
returns void
language sql security definer set search_path = public, pg_temp as $$
  update public.conquistas c
     set ativa = not exists (select 1 from public.conquistas o
                              where o.dimensao = c.dimensao and o.numero <> c.numero and not o.ativa)
   where c.numero between 56 and 61
$$;
revoke all on function public.sincronizar_centrais() from public, anon, authenticated;

create or replace function public.centrais_ao_mudar_conquistas()
returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if pg_trigger_depth() > 1 then return null; end if;  -- a própria atualização das Centrais
  perform public.sincronizar_centrais();
  return null;
end; $$;
create trigger trg_centrais_ao_mudar_conquistas
  after insert or update of ativa on public.conquistas
  for each statement execute function public.centrais_ao_mudar_conquistas();

select public.sincronizar_centrais();

-- ---------- A FLUKER oculta: o nome só sai para quem a ganhou (e para o ADM) ----------
drop policy if exists conquistas_leitura on public.conquistas;
create policy conquistas_leitura on public.conquistas for select
  using (numero <> 62
         or public.is_admin(auth.uid())
         or exists (select 1 from public.conquistas_ganhas g
                     where g.conquista = 62 and g.employee_id = public.current_employee_id()));

-- ---------- O progresso das conquistas de contagem (o próprio colaborador) ----------
create or replace function public.meu_progresso_de_conquistas()
returns table (quinzenas_com_100 int)
language sql stable security definer set search_path = public, pg_temp as $$
  select count(*)::int from (
    select f.id from public.fortnights f
      join public.evaluations ev on ev.fortnight_id = f.id and not ev.anulada and ev.nota is not null
     where f.status = 'fechada' and ev.employee_id = public.current_employee_id()
     group by f.id
    having avg(ev.nota) >= 100) q
$$;
revoke all on function public.meu_progresso_de_conquistas() from public, anon;
grant execute on function public.meu_progresso_de_conquistas() to authenticated;

CREATE OR REPLACE FUNCTION public.calcular_conquistas_da_quinzena(_fortnight_id uuid)
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
    -- vez. Só as disponíveis (a dimensão toda ativa). Depois, a FLUKER (suprema): todas as ativas.
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
           and (case when _cat.numero = 62 then o.ativa else o.dimensao = _cat.dimensao end)
           and not exists (select 1 from public.conquistas_ganhas g
                            where g.employee_id = _e.employee_id and g.conquista = o.numero));
      insert into public.conquistas_ganhas (employee_id, conquista, fortnight_id, xp, sequencia)
      values (_e.employee_id, _cat.numero, _fortnight_id, _cat.xp, 1);
      _inseridas := _inseridas + 1;
    end loop;
  end loop;
  return _inseridas;
end; $function$;
