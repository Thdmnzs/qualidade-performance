-- =====================================================================
-- Visão geral do colaborador: indicadores e nota de qualidade.
--
-- Regras (01/10/2026):
--   * O colaborador vê os resultados dos indicadores a partir da PUBLICAÇÃO
--     da quinzena (como as avaliações), para poder contestá-los. Antes, só no
--     fechamento. A elegibilidade continua só no fechamento (é o resultado final).
--   * Nota de qualidade da quinzena = média das notas das avaliações
--     (excluídas não entram; ajustadas entram com a nota nova).
--   * Média de qualidade do time = média das notas de cada pessoa (cada uma
--     pesa igual), e só aparece com pelo menos 3 pessoas avaliadas: com 2, a
--     própria nota e a média revelariam a nota exata do colega.
-- =====================================================================

-- ---------- 1. Resultados visíveis a partir da publicação ----------
drop policy "results_self_read_after_close" on public.results;
create policy "results_self_read_published" on public.results for select to authenticated
  using (public.is_admin(auth.uid())
         or (employee_id = public.current_employee_id() and public.quinzena_publicada(fortnight_id)));

-- As médias e metas do time seguem a mesma regra (antes, visíveis a qualquer
-- momento, inclusive em quinzenas ainda abertas).
drop policy "team_metrics_read_all" on public.team_metrics;
create policy "team_metrics_read_published" on public.team_metrics for select to authenticated
  using (public.is_admin(auth.uid()) or public.quinzena_publicada(fortnight_id));

-- ---------- 2. Nota de qualidade da quinzena ----------
create or replace function public.qualidade_da_quinzena(_fortnight_id uuid)
returns table (minha_nota numeric, minhas_avaliacoes int, media_time numeric, pessoas_avaliadas int)
language sql stable security definer set search_path = public as $$
  with por_pessoa as (
    select ev.employee_id, avg(ev.nota) as media, count(*)::int as n
      from public.evaluations ev
     where ev.fortnight_id = _fortnight_id and not ev.anulada
     group by ev.employee_id
  ),
  do_time as (
    select avg(media) as media, count(*)::int as pessoas from por_pessoa
  )
  select round(p.media, 2),
         coalesce(p.n, 0),
         case when t.pessoas >= 3 then round(t.media, 2) end,
         coalesce(t.pessoas, 0)
    from do_time t
    left join por_pessoa p on p.employee_id = public.current_employee_id()
   -- Só depois da publicação (o ADM vê sempre).
   where public.is_admin(auth.uid()) or public.quinzena_publicada(_fortnight_id)
$$;

revoke all on function public.qualidade_da_quinzena(uuid) from public, anon;
grant execute on function public.qualidade_da_quinzena(uuid) to authenticated;
