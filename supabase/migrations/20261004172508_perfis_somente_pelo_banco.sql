-- =====================================================================
-- user_roles (quem é ADM, avaliador ou colaborador): segunda camada.
-- Hoje o RLS já barra qualquer escrita (só há regra de leitura), mas a tabela é
-- a mais sensível do sistema: quem grava nela vira ADM. Sem a permissão de
-- escrita, uma regra criada por engano no futuro não abre a escalada.
-- Perfis mudam só pela função definir_perfil (e pela exclusão definitiva).
-- =====================================================================
revoke insert, update, delete, truncate on public.user_roles from authenticated, anon, service_role;
