-- =====================================================================
-- Endurecimento de privilégios (defesa em profundidade).
--
-- Por padrão, o Supabase concede TRUNCATE, REFERENCES e TRIGGER aos papéis
-- anon e authenticated em toda tabela do schema public. Nenhum deles é
-- usado pela aplicação, e TRUNCATE não passa pelo RLS.
--
-- Hoje não são exploráveis (a API REST não executa esses comandos), mas
-- dependem dessa única barreira. Removê-los não muda nada no funcionamento.
-- =====================================================================

-- Tabelas existentes
revoke truncate, references, trigger on all tables in schema public from anon, authenticated;

-- Tabelas futuras criadas pelo papel postgres (dono das migrations)
alter default privileges for role postgres in schema public
  revoke truncate, references, trigger on tables from anon, authenticated;
