-- =====================================================================
-- O Meu perfil (21/10/2026): a gamificação em espera, o "Sobre mim" e o termômetro do humor.
-- =====================================================================

-- ---------- As funcionalidades que se ligam e desligam (sem mudar o código) ----------
create table public.funcionalidades (
  chave text primary key check (chave ~ '^[a-z_]{1,40}$'),
  ativa boolean not null,
  atualizada_em timestamptz not null default now()
);
alter table public.funcionalidades enable row level security;
revoke all on public.funcionalidades from anon, authenticated;
create policy "exige a verificação" on public.funcionalidades as restrictive for all to authenticated using (public._sessao_verificada()) with check (public._sessao_verificada());
insert into public.funcionalidades (chave, ativa) values ('gamificacao', false);

create or replace function public.gamificacao_ativa()
returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select ativa from public.funcionalidades where chave = 'gamificacao'), false)
$$;
-- O que a tela precisa saber (o time lê; só o ADM muda).
create or replace function public.funcionalidades_ativas()
returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select case when public.eh_membro() then coalesce((select jsonb_object_agg(chave, ativa) from public.funcionalidades), '{}') else '{}' end
$$;
create or replace function public.definir_funcionalidade(_chave text, _ativa boolean)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.is_admin(auth.uid()) then raise exception 'Apenas administradores.' using errcode = '42501'; end if;
  update public.funcionalidades set ativa = _ativa, atualizada_em = now() where chave = _chave;
  if not found then raise exception 'Funcionalidade desconhecida.' using errcode = 'P0002'; end if;
  insert into public.audit_logs (usuario_id, usuario_nome, acao, entidade, valor_novo)
  values (auth.uid(), (select nome from public.employees where user_id = auth.uid() limit 1), 'funcionalidade', 'funcionalidades', jsonb_build_object('chave', _chave, 'ativa', _ativa));
end; $$;

-- ---------- A gamificação em espera: as regras originais ficam guardadas, e a chave decide ----------
alter function public.calcular_conquistas_da_quinzena(uuid) rename to _calcular_conquistas_completo;
create or replace function public.calcular_conquistas_da_quinzena(_fortnight_id uuid)
returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.gamificacao_ativa() then return 0; end if; -- em espera: nenhuma conquista é calculada
  return public._calcular_conquistas_completo(_fortnight_id);
end; $$;
revoke all on function public.calcular_conquistas_da_quinzena(uuid), public._calcular_conquistas_completo(uuid) from public, anon, authenticated;
grant execute on function public.calcular_conquistas_da_quinzena(uuid), public._calcular_conquistas_completo(uuid) to service_role;

alter function public._aparencia_liberada(uuid, text, text) rename to _aparencia_liberada_completa;
create or replace function public._aparencia_liberada(_emp uuid, _tipo text, _id text)
returns boolean
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  -- Em espera: só as opções livres (as capas sinal, ondas, brilho, faixas e aurora; a moldura nenhuma).
  if not public.gamificacao_ativa() then
    return (_tipo = 'capa' and _id in ('sinal', 'ondas', 'brilho', 'faixas', 'aurora')) or (_tipo = 'moldura' and _id = 'nenhuma');
  end if;
  return public._aparencia_liberada_completa(_emp, _tipo, _id);
end; $$;

alter function public._moldura_da_temporada(integer) rename to _moldura_da_temporada_completa;
create or replace function public._moldura_da_temporada(_mes integer)
returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select case when public.gamificacao_ativa() then public._moldura_da_temporada_completa(_mes) end
$$;
alter function public._mes_da_temporada(text) rename to _mes_da_temporada_completa;
create or replace function public._mes_da_temporada(_id text)
returns integer
language sql stable security definer set search_path = public, pg_temp as $$
  select case when public.gamificacao_ativa() then public._mes_da_temporada_completa(_id) end
$$;
revoke all on function public._aparencia_liberada(uuid, text, text), public._aparencia_liberada_completa(uuid, text, text),
  public._moldura_da_temporada(integer), public._moldura_da_temporada_completa(integer),
  public._mes_da_temporada(text), public._mes_da_temporada_completa(text) from public, anon;
grant execute on function public._aparencia_liberada(uuid, text, text), public._moldura_da_temporada(integer), public._mes_da_temporada(text) to authenticated, service_role;

-- ---------- O "Sobre mim": os núcleos e o horário da PRÓPRIA pessoa ----------
create or replace function public.meus_nucleos()
returns text[]
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(array_agg(nucleo order by nucleo), '{}') from public.nucleos_das_pessoas where employee_id = public.current_employee_id()
$$;
create or replace function public.meu_horario()
returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select to_jsonb(h) - 'employee_id' - 'atualizado_em' from public.horarios_de_trabalho h where h.employee_id = public.current_employee_id()
$$;

-- ---------- O termômetro do humor: uma marca por dia (de 1, muito mal, a 5, muito bem) ----------
-- Só a pessoa e o ADM veem (os avaliadores não). Fica 90 dias, e depois é apagado. Não vai para o Histórico.
create table public.humores (
  employee_id uuid not null references public.employees (id) on delete cascade,
  dia date not null,
  nivel smallint not null check (nivel between 1 and 5),
  comentario text check (comentario is null or length(comentario) <= 280),
  atualizado_em timestamptz not null default now(),
  primary key (employee_id, dia)
);
alter table public.humores enable row level security;
revoke all on public.humores from anon, authenticated;
create policy "exige a verificação" on public.humores as restrictive for all to authenticated using (public._sessao_verificada()) with check (public._sessao_verificada());

create or replace function public._hoje()
returns date
language sql stable set search_path = public, pg_temp as $$ select (now() at time zone 'America/Fortaleza')::date $$;

create or replace function public.registrar_humor(_nivel integer, _comentario text)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare _eu uuid := public.current_employee_id(); _texto text := nullif(btrim(coalesce(_comentario, '')), '');
begin
  if _eu is null then raise exception 'Apenas quem é do time.' using errcode = '42501'; end if;
  if _nivel is null or _nivel not between 1 and 5 then raise exception 'Escolha como você está, de 1 a 5.' using errcode = 'P0001'; end if;
  if length(_texto) > 280 then raise exception 'O comentário tem no máximo 280 caracteres.' using errcode = 'P0001'; end if;
  insert into public.humores (employee_id, dia, nivel, comentario) values (_eu, public._hoje(), _nivel, _texto)
  on conflict (employee_id, dia) do update set nivel = excluded.nivel, comentario = excluded.comentario, atualizado_em = now();
  delete from public.humores where employee_id = _eu and dia < public._hoje() - 90; -- os 90 dias
end; $$;

-- Os meus últimos dias (só os meus).
create or replace function public.meus_humores(_dias integer)
returns table (dia date, nivel smallint, comentario text)
language sql stable security definer set search_path = public, pg_temp as $$
  select dia, nivel, comentario from public.humores
   where employee_id = public.current_employee_id() and dia > public._hoje() - least(greatest(coalesce(_dias, 7), 1), 90)
   order by dia
$$;

-- O ADM: o humor de hoje (com o comentário) e os últimos 14 dias de cada pessoa ativa.
create or replace function public.humor_do_time()
returns table (employee_id uuid, hoje smallint, comentario_de_hoje text, ultimos jsonb)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.is_admin(auth.uid()) then raise exception 'Apenas administradores.' using errcode = '42501'; end if;
  return query
  select e.id,
         (select h.nivel from public.humores h where h.employee_id = e.id and h.dia = public._hoje()),
         (select h.comentario from public.humores h where h.employee_id = e.id and h.dia = public._hoje()),
         coalesce((select jsonb_agg(jsonb_build_object('dia', h.dia, 'nivel', h.nivel) order by h.dia)
                     from public.humores h where h.employee_id = e.id and h.dia > public._hoje() - 14), '[]')
    from public.employees e where e.status = 'ativo';
end; $$;

-- A limpeza dos 90 dias de todos (a tarefa da manhã).
create or replace function public.apagar_humores_antigos()
returns integer
language sql security definer set search_path = public, pg_temp as $$
  with d as (delete from public.humores where dia < public._hoje() - 90 returning 1) select count(*)::int from d
$$;

revoke all on function public.funcionalidades_ativas(), public.definir_funcionalidade(text, boolean), public.meus_nucleos(), public.meu_horario(),
  public.registrar_humor(integer, text), public.meus_humores(integer), public.humor_do_time(), public.gamificacao_ativa() from public, anon;
grant execute on function public.funcionalidades_ativas(), public.definir_funcionalidade(text, boolean), public.meus_nucleos(), public.meu_horario(),
  public.registrar_humor(integer, text), public.meus_humores(integer), public.humor_do_time(), public.gamificacao_ativa() to authenticated;
revoke all on function public.apagar_humores_antigos() from public, anon, authenticated;
grant execute on function public.apagar_humores_antigos() to service_role;
