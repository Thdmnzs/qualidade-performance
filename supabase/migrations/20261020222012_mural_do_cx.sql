-- =====================================================================
-- O mural do CX (20/10/2026): os comunicados do canal #cx_mural do Slack, na Visão geral.
--
--   * Os comunicados (as mensagens do canal, com as respostas da conversa e a contagem do ✅) ficam
--     numa tabela que todo membro do time LÊ, e que só o servidor ESCREVE.
--   * O tempo real: o Slack avisa o servidor a cada mudança no canal, e o banco empurra a mudança para
--     quem está com a tela aberta (a publicação do Supabase Realtime, que respeita as regras de leitura).
--   * A rede de segurança: o servidor relê o canal quando a última leitura tem mais de 5 minutos (uma
--     leitura por vez: a "reserva" abaixo só deixa um servidor ler de cada vez).
-- =====================================================================
create table public.mural_comunicados (
  ts text primary key,                       -- o identificador da mensagem no Slack
  autor_nome text,
  texto text not null default '' check (length(texto) <= 40000),
  respostas jsonb not null default '[]',     -- [{ ts, autor_nome, texto }], já com as menções trocadas pelos nomes
  qtd_respostas int not null default 0,
  reacoes_ok int not null default 0,         -- quantas pessoas reagiram com ✅ (o "li")
  apagado boolean not null default false,
  criado_em timestamptz not null,            -- o momento da mensagem no Slack
  editado_em timestamptz,
  atualizado_em timestamptz not null default now()
);
create index mural_por_data on public.mural_comunicados (criado_em desc) where not apagado;
alter table public.mural_comunicados enable row level security;
revoke all on public.mural_comunicados from anon, authenticated;
grant select on public.mural_comunicados to authenticated;
create policy "o time le o mural" on public.mural_comunicados for select to authenticated using (public.eh_membro());

-- O estado da leitura do canal (uma linha só): quando foi a última, e a reserva de quem está lendo.
create table public.mural_estado (
  id int primary key default 1 check (id = 1),
  sincronizado_em timestamptz,
  lendo_desde timestamptz
);
insert into public.mural_estado (id) values (1);
alter table public.mural_estado enable row level security;
revoke all on public.mural_estado from anon, authenticated;

-- A reserva (só o servidor): true se a última leitura tem mais de _minutos E ninguém está lendo agora.
create or replace function public.reservar_leitura_do_mural(_minutos int)
returns boolean
language sql security definer set search_path = public, pg_temp as $$
  with r as (
    update public.mural_estado set lendo_desde = now()
     where id = 1
       and (sincronizado_em is null or sincronizado_em < now() - make_interval(mins => greatest(_minutos, 0)))
       and (lendo_desde is null or lendo_desde < now() - interval '2 minutes')
    returning 1)
  select exists (select 1 from r)
$$;
create or replace function public.concluir_leitura_do_mural()
returns void
language sql security definer set search_path = public, pg_temp as $$
  update public.mural_estado set sincronizado_em = now(), lendo_desde = null where id = 1
$$;
revoke all on function public.reservar_leitura_do_mural(int), public.concluir_leitura_do_mural() from public, anon, authenticated;
grant execute on function public.reservar_leitura_do_mural(int), public.concluir_leitura_do_mural() to service_role;

-- O tempo real: as mudanças da tabela vão para quem a está ouvindo (com as mesmas regras de leitura).
alter publication supabase_realtime add table public.mural_comunicados;
