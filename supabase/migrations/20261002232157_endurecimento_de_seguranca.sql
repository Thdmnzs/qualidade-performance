-- =====================================================================
-- Endurecimento de segurança (revisão de 02/10/2026).
-- Referências: ISO/IEC 27002:2022 (5.15 controle de acesso, 8.2 acesso
-- privilegiado, 8.9 configuração, 8.15 registros de log), OWASP (controle
-- de acesso e configuração insegura), LGPD art. 46 (medidas de segurança).
--
-- Nenhuma regra de negócio muda. Só permissões e configuração.
-- =====================================================================

-- ---------- 1. O visitante (sem login) não tem permissão em nenhuma tabela ----------
-- Hoje o RLS já o barra (testado: todas as leituras voltam vazias). Isto é a
-- segunda camada: se um dia uma regra for criada sem "to authenticated", ou o
-- RLS de uma tabela for desligado por engano, o visitante continua sem acesso.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
-- Tabelas e sequências futuras também nascem sem permissão para o visitante.
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke execute on functions from anon;

-- ---------- 2. Auditoria somente leitura para todos os papéis externos ----------
-- Antes, um ADM podia INSERIR registros pelo navegador (forjar a auditoria).
-- Agora só as funções do banco, com regras escritas e testadas, escrevem nela
-- (inclusive a exclusão definitiva, que remove o que é sobre a pessoa, pela LGPD).
drop policy if exists "audit_admin_insert" on public.audit_logs;
revoke insert, update, delete, truncate on public.audit_logs from anon, authenticated, service_role;

-- ---------- 3. Funções que não precisam ser chamadas de fora ----------
-- rls_auto_enable: gatilho que LIGA o RLS em toda tabela nova (uma proteção; continua
-- ativo). Como é função de gatilho, nem pode ser chamada pela API; a permissão sai
-- para não restar dúvida.
-- Ela existe só em produção (criada fora das migrations), por isso a condição.
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke all on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end $$;
-- Não usadas por nenhuma regra de acesso nem pela tela.
revoke all on function public.has_role(uuid, public.app_role) from public, anon, authenticated;
revoke all on function public.sorteio_em_aberto(public.sorteios_contato) from public, anon, authenticated;

-- ---------- 4. Caminho de busca fixo nas funções apontadas pelo verificador ----------
-- Sem isso, quem pudesse criar objetos em outro esquema poderia "disfarçar" uma
-- tabela ou função usada por elas.
alter function public.desconto_do_criterio(numeric, numeric, text) set search_path = public, pg_temp;
alter function public.hoje_fortaleza() set search_path = public, pg_temp;
alter function public.fim_do_prazo_util(date, int) set search_path = public, pg_temp;
alter function public.fim_do_dia_fortaleza(date) set search_path = public, pg_temp;
alter function public.datas_da_quinzena(int, int, public.fortnight_type) set search_path = public, pg_temp;
alter function public.inicio_da_quinzena(int, int, public.fortnight_type) set search_path = public, pg_temp;
alter function public.fim_da_quinzena(int, int, public.fortnight_type) set search_path = public, pg_temp;
