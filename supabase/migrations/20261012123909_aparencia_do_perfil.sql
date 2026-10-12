-- =====================================================================
-- A aparência do perfil (11/10/2026): a capa, a moldura e as temporadas.
--
--   * O registro do perfil guarda a capa e a moldura escolhidas, e as duas chaves
--     da temporada ("usar a capa da temporada" e "usar a moldura da temporada").
--   * As regras de desbloqueio ficam AQUI (o nível, as conquistas, o pódio e o mês
--     das temporadas, no fuso de Fortaleza): a função que salva as confere, então
--     ninguém usa uma capa bloqueada nem fora da temporada, por qualquer caminho.
--   * O Ranking lê a moldura do time por uma função (o registro do perfil continua
--     visível só para a própria pessoa e o ADM).
--   * O progresso das conquistas ganha as quinzenas avaliadas (para o "Quase lá").
--
-- O catálogo (os nomes e as artes) fica na tela; aqui ficam só os códigos e as regras.
-- As temporadas têm meses fixos: fev (carnaval), jun (junina), set (cliente),
-- out (bruxas e rosa), nov (azul e black), dez (fimdeano).
-- =====================================================================
alter table public.perfis_colaborador
  add column capa text not null default 'sinal' check (length(capa) <= 30),
  add column moldura text not null default 'nenhuma' check (length(moldura) <= 30),
  add column capa_da_temporada boolean not null default true,
  add column moldura_da_temporada boolean not null default true,
  add column capa_temporada_preferida text check (capa_temporada_preferida is null or length(capa_temporada_preferida) <= 30);

-- ---------- O mês das temporadas (fixo), e o que é de cada uma ----------
create or replace function public._mes_da_temporada(_id text)
returns int
language sql immutable set search_path = public, pg_temp as $$
  select case _id
    when 'carnaval' then 2 when 'junina' then 6 when 'cliente' then 9
    when 'bruxas' then 10 when 'rosa' then 10
    when 'azul' then 11 when 'black' then 11
    when 'fimdeano' then 12 else null end
$$;
-- Só a Noite das Bruxas tem moldura própria, por enquanto.
create or replace function public._moldura_da_temporada(_mes int)
returns text
language sql immutable set search_path = public, pg_temp as $$
  select case _mes when 10 then 'bruxas' else null end
$$;
create or replace function public._mes_atual()
returns int
language sql stable set search_path = public, pg_temp as $$
  select extract(month from (now() at time zone 'America/Fortaleza'))::int
$$;

-- ---------- O nível (1.000 XP por nível, como a tela) ----------
create or replace function public._nivel_de(_emp uuid)
returns int
language sql stable security definer set search_path = public, pg_temp as $$
  select 1 + (coalesce((select sum(g.xp) from public.conquistas_ganhas g where g.employee_id = _emp), 0) / 1000)::int
$$;

-- ---------- As regras de desbloqueio (o código da capa ou da moldura) ----------
create or replace function public._aparencia_liberada(_emp uuid, _tipo text, _id text)
returns boolean
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  _nivel int := public._nivel_de(_emp);
  _ganhou_fluker boolean := exists (select 1 from public.conquistas_ganhas where employee_id = _emp and conquista = 62);
begin
  if _tipo = 'capa' then
    return case _id
      when 'sinal' then true when 'ondas' then true when 'brilho' then true when 'faixas' then true when 'aurora' then true
      when 'pilula' then _nivel >= 3 when 'fibra' then _nivel >= 5 when 'torre' then _nivel >= 10
      when 'aparelhos' then _nivel >= 15 when 'chip' then _nivel >= 20
      when 'podio' then exists (select 1 from public.rankings r where r.employee_id = _emp and r.posicao <= 3)
      when 'fluker' then _ganhou_fluker
      else coalesce(public._mes_da_temporada(_id) = public._mes_atual(), false) -- uma sazonal: só no mês dela
    end;
  elsif _tipo = 'moldura' then
    return case _id
      when 'nenhuma' then true when 'verde' then _nivel >= 2 when 'prata' then _nivel >= 5 when 'ouro' then _nivel >= 10
      when 'lendaria' then exists (select 1 from public.conquistas_ganhas g join public.conquistas c on c.numero = g.conquista
                                    where g.employee_id = _emp and c.xp >= 350)
      when 'fluker' then _ganhou_fluker
      else false
    end;
  end if;
  return false;
end; $$;

-- ---------- Salvar a aparência (a própria pessoa) ----------
create or replace function public.definir_aparencia(_capa text, _moldura text, _capa_da_temporada boolean, _moldura_da_temporada boolean, _capa_temporada_preferida text)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare _emp uuid := public.current_employee_id();
begin
  if _emp is null then
    raise exception 'Apenas colaboradores com cadastro ativo têm perfil.' using errcode = '42501';
  end if;
  if public._mes_da_temporada(_capa) is not null or not public._aparencia_liberada(_emp, 'capa', _capa) then
    raise exception 'Essa capa ainda não está liberada para você.' using errcode = 'P0001';
  end if;
  if not public._aparencia_liberada(_emp, 'moldura', _moldura) then
    raise exception 'Essa moldura ainda não está liberada para você.' using errcode = 'P0001';
  end if;
  if _capa_temporada_preferida is not null and coalesce(public._mes_da_temporada(_capa_temporada_preferida), 0) <> public._mes_atual() then
    raise exception 'Essa capa da temporada não está disponível agora.' using errcode = 'P0001';
  end if;
  insert into public.perfis_colaborador (employee_id, capa, moldura, capa_da_temporada, moldura_da_temporada, capa_temporada_preferida, atualizado_em)
  values (_emp, _capa, _moldura, coalesce(_capa_da_temporada, true), coalesce(_moldura_da_temporada, true), _capa_temporada_preferida, now())
  on conflict (employee_id) do update set
    capa = excluded.capa, moldura = excluded.moldura, capa_da_temporada = excluded.capa_da_temporada,
    moldura_da_temporada = excluded.moldura_da_temporada, capa_temporada_preferida = excluded.capa_temporada_preferida, atualizado_em = now();
end; $$;

-- ---------- O que pode ser usado agora (para a tela marcar o que está liberado) ----------
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
    'capas_liberadas', (select jsonb_agg(c) from unnest(array['sinal','ondas','brilho','faixas','aurora','pilula','fibra','torre','aparelhos','chip','podio','fluker',
                                                         'carnaval','junina','cliente','bruxas','rosa','azul','black','fimdeano']) c
                         where public._aparencia_liberada(_emp, 'capa', c)),
    'molduras_liberadas', (select jsonb_agg(m) from unnest(array['nenhuma','verde','prata','ouro','lendaria','fluker']) m
                            where public._aparencia_liberada(_emp, 'moldura', m)));
end; $$;

-- ---------- A moldura do time, para o Ranking (a que está valendo agora) ----------
create or replace function public.molduras_do_time(_pessoas uuid[])
returns table (employee_id uuid, moldura text)
language sql stable security definer set search_path = public, pg_temp as $$
  select e.id,
         case when coalesce(p.moldura_da_temporada, true) and public._moldura_da_temporada(public._mes_atual()) is not null
              then public._moldura_da_temporada(public._mes_atual())
              else coalesce(p.moldura, 'nenhuma') end
    from public.employees e left join public.perfis_colaborador p on p.employee_id = e.id
   where public.eh_membro() and e.id = any (coalesce(_pessoas, '{}')) and cardinality(coalesce(_pessoas, '{}')) <= 100
$$;

-- ---------- O progresso das conquistas: + as quinzenas avaliadas ("Quase lá") ----------
drop function public.meu_progresso_de_conquistas();
create function public.meu_progresso_de_conquistas()
returns table (quinzenas_com_100 integer, quinzenas_avaliadas integer)
language sql stable security definer set search_path = public, pg_temp as $$
  with q as (
    select f.id, avg(ev.nota) as media from public.fortnights f
      join public.evaluations ev on ev.fortnight_id = f.id and not ev.anulada and ev.nota is not null
     where f.status = 'fechada' and ev.employee_id = public.current_employee_id()
     group by f.id)
  select (count(*) filter (where media >= 100))::int, count(*)::int from q
$$;

revoke all on function public._mes_da_temporada(text), public._moldura_da_temporada(int), public._mes_atual(), public._nivel_de(uuid),
  public._aparencia_liberada(uuid, text, text) from public, anon, authenticated;
revoke all on function public.definir_aparencia(text, text, boolean, boolean, text), public.minha_aparencia(),
  public.molduras_do_time(uuid[]), public.meu_progresso_de_conquistas() from public, anon;
grant execute on function public.definir_aparencia(text, text, boolean, boolean, text), public.minha_aparencia(),
  public.molduras_do_time(uuid[]), public.meu_progresso_de_conquistas() to authenticated;
