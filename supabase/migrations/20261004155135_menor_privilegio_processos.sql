-- =====================================================================
-- Menor privilégio para o servidor na base de processos.
-- O Supabase concede automaticamente TODAS as permissões à chave de serviço
-- em toda tabela nova. Aqui ficam só as necessárias:
--   * processos: ler e atualizar a classificação (código, status de revisão).
--   * processos_versoes: só ler. Versões nascem apenas pela função
--     registrar_versao_processo (que garante "versão nova só quando o texto muda").
--   * processos_sincronizacoes: ler, criar e atualizar; o histórico não se apaga.
-- =====================================================================
revoke insert, delete, truncate on public.processos from service_role;
revoke insert, update, delete, truncate on public.processos_versoes from service_role;
revoke delete, truncate on public.processos_sincronizacoes from service_role;
