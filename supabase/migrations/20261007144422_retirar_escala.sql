-- =====================================================================
-- Retira a leitura da escala (07/10/2026): a aba "Avaliadores" fica só com o
-- TEMPO DEDICADO (o ritmo medido, o tempo médio e os descartes).
--
--   * Saem: as horas de quali, o registro das leituras (só havia uma tentativa,
--     sem a conta do Google configurada) e as funções da leitura.
--   * Ficam: as aberturas de contato e a medição do tempo dedicado.
--   * O cálculo é recriado sem a coluna das horas de quali (o tipo de retorno muda).
-- =====================================================================
drop function if exists public.registrar_leitura_escala(uuid, text, jsonb, date[], int, text);
drop function if exists public.primeiro_nome_normalizado(text);
drop table if exists public.horas_quali;
drop table if exists public.leituras_escala;

drop function public.produtividade_avaliadores(date, date);
create function public.produtividade_avaliadores(_de date, _ate date)
returns table (avaliador_user_id uuid, nome text, avaliacoes int, contadas int, minutos numeric, descartes int)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null or not public.is_admin(auth.uid()) then
    raise exception 'Apenas o ADM vê a produtividade dos avaliadores.' using errcode = '42501';
  end if;
  if _de is null or _ate is null or _de > _ate then
    raise exception 'Escolha um período válido.' using errcode = 'P0001';
  end if;
  if _ate - _de + 1 > 92 then
    raise exception 'Escolha um período de até 92 dias.' using errcode = 'P0001';
  end if;
  return query
  with avs as (
    select ev.avaliador_id as uid, ev.created_at,
           (regexp_match(ev.link_conversa, '([0-9]{1,30})[^0-9]*$'))[1] as conversa, ev.employee_id
      from public.evaluations ev
     where ev.avaliador_id is not null and not ev.anulada
       and (ev.created_at at time zone 'America/Fortaleza')::date between _de and _ate
  ),
  tempos as (
    select a.uid,
           extract(epoch from a.created_at - least(
             (select min(ab.aberto_em) from public.aberturas_contato ab
               where ab.avaliador_user_id = a.uid and ab.employee_id = a.employee_id and ab.conversa_id = a.conversa
                 and ab.aberto_em <= a.created_at),
             (select min(s.criado_em) from public.sorteios_contato s
               where s.sorteado_por = a.uid and s.employee_id = a.employee_id and s.conversa_id = a.conversa
                 and s.criado_em <= a.created_at))) / 60.0 as min
      from avs a
  ),
  ritmo as (
    select uid, count(*)::int as avaliacoes,
           count(*) filter (where min > 0 and min <= 60)::int as contadas,
           coalesce(sum(min) filter (where min > 0 and min <= 60), 0) as minutos
      from tempos group by uid
  ),
  descartes as (
    select s.sorteado_por as uid, count(*)::int as n from public.sorteios_contato s
     where s.descartado_em is not null and (s.descartado_em at time zone 'America/Fortaleza')::date between _de and _ate
     group by s.sorteado_por
  )
  select r.uid, coalesce((select e.nome from public.employees e where e.user_id = r.uid limit 1), 'Avaliador removido'),
         r.avaliacoes, r.contadas, round(r.minutos, 1), coalesce(d.n, 0)
    from ritmo r
    left join descartes d on d.uid = r.uid
   order by 2;
end; $$;
revoke all on function public.produtividade_avaliadores(date, date) from public, anon;
grant execute on function public.produtividade_avaliadores(date, date) to authenticated;
