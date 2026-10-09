-- =====================================================================
-- Endurecimento (revisão de segurança de 09/10/2026).
--
--   * "Ser membro" (um cadastro de colaborador ATIVO) passa a ser exigido nas
--     leituras que antes valiam para qualquer pessoa logada: as configurações,
--     o CSAT do time, os critérios da ficha, as quinzenas, a lista dos
--     indicadores, o catálogo de conquistas e as FOTOS de perfil. Uma conta
--     criada por fora (se a criação pública de contas estiver aberta) ou a de
--     alguém desligado não lê mais nada.
--   * As funções de gatilho deixam de poder ser chamadas pela API (elas
--     continuam disparando normalmente: o banco não confere essa permissão
--     quando um gatilho dispara).
-- =====================================================================
create or replace function public.eh_membro()
returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select public.current_employee_id() is not null
$$;
revoke all on function public.eh_membro() from public, anon;
grant execute on function public.eh_membro() to authenticated;

alter policy settings_read_all on public.business_settings using (public.eh_membro());
alter policy csat_read_all on public.csat_reports using (public.eh_membro());
alter policy criteria_read_all on public.evaluation_criteria using (public.eh_membro());
alter policy fortnights_read_all on public.fortnights using (public.eh_membro());
alter policy indicators_read_all on public.indicators using (public.eh_membro());

-- O catálogo: membro (e a FLUKER, só para quem a ganhou, como antes); o ADM vê tudo.
alter policy conquistas_leitura on public.conquistas
  using ((numero <> 62 and public.eh_membro())
         or public.is_admin(auth.uid())
         or exists (select 1 from public.conquistas_ganhas g
                     where g.conquista = 62 and g.employee_id = public.current_employee_id()));

-- As fotos de perfil: só os membros (antes, qualquer pessoa logada).
alter policy avatares_ver on storage.objects using (bucket_id = 'avatares' and public.eh_membro());

-- As funções de gatilho: fora da API.
do $$
declare f regprocedure;
begin
  for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.prorettype = 'trigger'::regtype loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
end $$;
