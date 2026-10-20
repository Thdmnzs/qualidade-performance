-- =====================================================================
-- As instabilidades (20/10/2026): o canal #instabilidade do Slack, na Visão geral, junto do mural.
--   * A tabela do mural passa a guardar os dois canais: a coluna "canal" (o #cx_mural ou o #instabilidade),
--     e a chave passa a ser o canal com a mensagem (o identificador do Slack só é único dentro do canal).
--   * As mensagens que já existem são do #cx_mural, e o padrão da coluna também é ele: assim, o código que está
--     no ar até o deploy (que ainda não conhece a coluna) continua gravando o mural sem erro.
-- =====================================================================
alter table public.mural_comunicados add column canal text not null default 'C02FDSRANCD';
alter table public.mural_comunicados drop constraint mural_comunicados_pkey;
alter table public.mural_comunicados add primary key (canal, ts);
drop index if exists public.mural_por_data;
create index mural_por_canal_e_data on public.mural_comunicados (canal, criado_em desc) where not apagado;
