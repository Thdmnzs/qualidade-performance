-- =====================================================================
-- A limpeza geral (13/10/2026): o que ficou do modelo inicial e ninguém usa.
--
--   * notifications: a fila de envio de notificações do modelo inicial, nunca ligada (vazia, e
--     nada depende dela). A central de notificações usa a tabela "notificacoes".
--
-- (inicio_da_quinzena e fim_da_quinzena FICAM: a regra fortnights_datas_corretas as usa para
-- garantir que toda quinzena tenha as datas certas.)
-- =====================================================================
drop table if exists public.notifications;
