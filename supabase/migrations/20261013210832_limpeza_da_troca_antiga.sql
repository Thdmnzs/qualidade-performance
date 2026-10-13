-- =====================================================================
-- A limpeza (13/10/2026): o pedido de troca antigo (pela semana publicada) sai.
--
--   * A tela usa só o pedido pelo dia (pedir_troca_no_dia) desde a entrega das folgas fixas.
--   * O gatilho que preenchia a data de início dos pedidos antigos também sai: o pedido novo
--     sempre grava a data.
-- =====================================================================
drop trigger if exists troca_com_inicio on public.trocas_de_escala;
drop function if exists public._troca_com_inicio();
drop function if exists public.pedir_troca(date, text, int[], uuid, text);
