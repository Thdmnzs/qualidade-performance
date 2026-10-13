-- =====================================================================
-- O limite de uso das funções do servidor (13/10/2026): contra o abuso e os laços de chamadas.
--
--   * Um contador por pessoa e por ação, numa janela de tempo (a pré-avaliação por IA, o
--     Intercom, o Notion, os acessos, os avisos no Slack...). Passou do limite, a função recusa.
--   * No banco (e não na memória do servidor), porque a Vercel roda várias cópias do servidor ao
--     mesmo tempo: a contagem precisa ser uma só.
--   * Só o servidor (a chave de serviço) usa. A tarefa da manhã apaga as contagens velhas.
-- =====================================================================
create table public.limites_de_uso (
  chave text primary key check (length(chave) <= 200),
  inicio timestamptz not null default now(),
  contagem int not null default 0
);
alter table public.limites_de_uso enable row level security;
revoke all on public.limites_de_uso from anon, authenticated;

-- Conta mais um uso e diz se ainda está dentro do limite (de uma vez só, sem corrida).
create or replace function public.consumir_limite_de_uso(_chave text, _maximo int, _janela_em_segundos int)
returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare _c int;
begin
  insert into public.limites_de_uso as l (chave, inicio, contagem) values (left(_chave, 200), now(), 1)
  on conflict (chave) do update set
    inicio = case when l.inicio < now() - make_interval(secs => _janela_em_segundos) then now() else l.inicio end,
    contagem = case when l.inicio < now() - make_interval(secs => _janela_em_segundos) then 1 else l.contagem + 1 end
  returning contagem into _c;
  return _c <= _maximo;
end; $$;

-- A tarefa da manhã: as contagens com mais de um dia já não servem.
create or replace function public.limpar_limites_de_uso()
returns int
language sql security definer set search_path = public, pg_temp as $$
  with apagadas as (delete from public.limites_de_uso where inicio < now() - interval '1 day' returning 1) select count(*)::int from apagadas
$$;

revoke all on function public.consumir_limite_de_uso(text, int, int), public.limpar_limites_de_uso() from public, anon, authenticated;
grant execute on function public.consumir_limite_de_uso(text, int, int), public.limpar_limites_de_uso() to service_role;
