-- =====================================================================
-- Sincronização da base de processos com o Notion.
--
-- Uma execução por clique em "Sincronizar processos". O servidor monta a FILA
-- (a partir dos Índices Mestres B2C e B2B, mais o Guia de Clientes Atritados)
-- e processa em lotes; se a tela for fechada, a execução continua de onde parou.
-- Só o servidor grava (chave de serviço); só o ADM lê.
-- =====================================================================

create table public.processos_sincronizacoes (
  id uuid primary key default gen_random_uuid(),
  iniciada_em timestamptz not null default now(),
  iniciada_por uuid references auth.users(id) on delete set null,
  concluida_em timestamptz,
  status text not null default 'em_andamento' check (status in ('em_andamento', 'concluida', 'falhou')),
  total int not null default 0,
  processados int not null default 0,
  novos int not null default 0,
  alterados int not null default 0,
  sem_mudanca int not null default 0,
  -- Itens ainda por processar (código, título, página, base, categoria, revisão...).
  fila jsonb not null default '[]'::jsonb,
  -- Por base, quantos processos o Índice listou (o teste de conexão também usa).
  resumo jsonb,
  erros jsonb not null default '[]'::jsonb
);

-- No máximo uma execução em andamento por vez.
create unique index processos_sincronizacoes_uma_em_andamento
  on public.processos_sincronizacoes ((true)) where status = 'em_andamento';

alter table public.processos_sincronizacoes enable row level security;
revoke all on public.processos_sincronizacoes from anon, authenticated;
grant select on public.processos_sincronizacoes to authenticated;
create policy "processos_sincronizacoes_admin_read" on public.processos_sincronizacoes
  for select to authenticated using (public.is_admin(auth.uid()));

-- O que o servidor (chave de serviço) pode fazer, declarado aqui em vez de
-- depender das permissões automáticas da plataforma: ler e gravar as execuções,
-- e atualizar os dados de classificação dos processos (código, status de revisão).
-- Apagar, não.
grant select, insert, update on public.processos_sincronizacoes to service_role;
grant select, update on public.processos to service_role;

-- Processos que saíram do Índice deixam de valer (o histórico fica).
create or replace function public.desativar_processos_ausentes(_bases text[], _presentes text[])
returns int
language sql security definer set search_path = public as $$
  with x as (
    update public.processos set ativo = false
     where base = any(_bases) and ativo and not (notion_page_id = any(_presentes))
    returning 1
  )
  select count(*)::int from x
$$;
revoke all on function public.desativar_processos_ausentes(text[], text[]) from public, anon, authenticated;
grant execute on function public.desativar_processos_ausentes(text[], text[]) to service_role;

-- Os dois processos do piloto foram gravados com o identificador sem hífens;
-- a API do Notion devolve com hífens. Padroniza tudo SEM hífens.
update public.processos set notion_page_id = replace(notion_page_id, '-', '') where notion_page_id like '%-%';
