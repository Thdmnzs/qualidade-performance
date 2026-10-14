-- =====================================================================
-- A ordem dos processos (14/10/2026): a posição de cada processo na Flukepédia, para a tela de
-- Processos mostrar cada base na ordem da página do Notion (as categorias e as subcategorias como
-- lá). A sincronização grava a posição; os processos ainda não sincronizados ficam sem ela (no fim).
-- =====================================================================
alter table public.processos add column ordem int;
create index processos_por_ordem on public.processos (base, ordem);
