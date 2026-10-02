-- =====================================================================
-- Base de processos (etapa 1 da pré-avaliação por IA).
--
-- Cópia versionada das páginas do Notion: Flukepédia | B2C, Flukepédia |
-- B2B e Guia de Clientes Atritados. Cada pré-avaliação vai registrar qual
-- VERSÃO de cada processo usou: numa contestação, dá para saber com qual
-- regra o contato foi avaliado.
--
-- Uma função única grava, para os dois caminhos: a importação assistida
-- (piloto, feita pelo assistente) e a sincronização automática (com o token).
-- Ela só cria versão nova quando o texto muda.
-- =====================================================================

create table public.processos (
  id uuid primary key default gen_random_uuid(),
  notion_page_id text not null unique,
  base text not null check (base in ('B2C', 'B2B', 'Guia')),
  codigo text unique,                 -- ex.: B2C-CNT-INT-02 (pode não ter)
  titulo text not null,
  categoria text,
  subcategoria text,
  url text not null,
  revisado boolean not null default false,   -- já revisado a fundo pela Qualidade?
  ultima_revisao date,
  versao_atual int not null default 0,
  editado_no_notion timestamptz,
  sincronizado_em timestamptz,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.processos_versoes (
  id uuid primary key default gen_random_uuid(),
  processo_id uuid not null references public.processos(id) on delete cascade,
  versao int not null,
  conteudo text not null,
  hash text not null,
  editado_no_notion timestamptz,
  origem text not null check (origem in ('importacao_assistida', 'sincronizacao')),
  criado_em timestamptz not null default now(),
  unique (processo_id, versao)
);

-- ---------- Leitura: ADM e avaliadores (usam na pré-avaliação); escrita: só o servidor ----------
alter table public.processos enable row level security;
alter table public.processos_versoes enable row level security;
revoke all on public.processos, public.processos_versoes from anon, authenticated;
grant select on public.processos, public.processos_versoes to authenticated;

create policy "processos_gestao_read" on public.processos for select to authenticated
  using (public.is_admin(auth.uid()) or public.is_avaliador(auth.uid()));
create policy "processos_versoes_gestao_read" on public.processos_versoes for select to authenticated
  using (public.is_admin(auth.uid()) or public.is_avaliador(auth.uid()));

-- ---------- Gravar uma versão (só quando o texto muda) ----------
-- Retorna 'nova' (primeira versão), 'alterada' (versão nova) ou 'sem_mudanca'.
create or replace function public.registrar_versao_processo(
  _notion_page_id text, _base text, _codigo text, _titulo text, _categoria text, _subcategoria text,
  _url text, _revisado boolean, _ultima_revisao date, _editado_no_notion timestamptz,
  _conteudo text, _origem text)
returns text
language plpgsql security definer set search_path = public as $$
declare
  _hash text := md5(_conteudo);
  _proc public.processos%rowtype;
  _hash_atual text;
begin
  if nullif(btrim(_conteudo), '') is null then
    raise exception 'Conteúdo vazio para o processo %.', coalesce(_codigo, _titulo);
  end if;

  insert into public.processos (notion_page_id, base, codigo, titulo, categoria, subcategoria, url,
                                revisado, ultima_revisao, editado_no_notion, sincronizado_em, ativo)
  values (_notion_page_id, _base, nullif(btrim(_codigo), ''), _titulo, _categoria, _subcategoria, _url,
          coalesce(_revisado, false), _ultima_revisao, _editado_no_notion, now(), true)
  on conflict (notion_page_id) do update
     set base = excluded.base, codigo = excluded.codigo, titulo = excluded.titulo,
         categoria = excluded.categoria, subcategoria = excluded.subcategoria, url = excluded.url,
         revisado = excluded.revisado, ultima_revisao = excluded.ultima_revisao,
         editado_no_notion = excluded.editado_no_notion, sincronizado_em = now(), ativo = true
  returning * into _proc;

  select hash into _hash_atual from public.processos_versoes
   where processo_id = _proc.id and versao = _proc.versao_atual;

  if _hash_atual = _hash then
    return 'sem_mudanca';
  end if;

  insert into public.processos_versoes (processo_id, versao, conteudo, hash, editado_no_notion, origem)
  values (_proc.id, _proc.versao_atual + 1, _conteudo, _hash, _editado_no_notion, _origem);
  update public.processos set versao_atual = _proc.versao_atual + 1 where id = _proc.id;

  return case when _proc.versao_atual = 0 then 'nova' else 'alterada' end;
end; $$;

revoke all on function public.registrar_versao_processo(text, text, text, text, text, text, text, boolean, date, timestamptz, text, text)
  from public, anon, authenticated;
grant execute on function public.registrar_versao_processo(text, text, text, text, text, text, text, boolean, date, timestamptz, text, text)
  to service_role;
