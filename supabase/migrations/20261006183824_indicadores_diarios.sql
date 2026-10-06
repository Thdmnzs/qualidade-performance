-- =====================================================================
-- Indicadores diários (06/10/2026): a aba "Indicadores" do colaborador.
--
--   * Uma linha por pessoa por dia, com os DADOS BRUTOS do dia (e não as taxas
--     prontas), para que qualquer período seja calculado do jeito certo:
--       produtividade = (atribuições automáticas - autoatribuições) / horas ativas
--       CSAT          = positivas / total
--     A média das taxas diárias daria um número errado.
--   * SLA: o percentil 90 do DIA (em segundos). Percentis de dias diferentes não
--     se combinam; num período de vários dias, mostra-se a média dos dias
--     (decisão de 06/10/2026). O SLA oficial da quinzena vem do relatório dela.
--   * Quem lê: cada colaborador, as próprias linhas; o ADM, todas. Ninguém grava
--     pelo navegador: a importação (a construir) grava pelo servidor.
--   * O cálculo é feito no banco: o CSAT do TIME precisa dos dados de todos, mas
--     sai só o número agregado. A qualidade usa só avaliações de quinzenas
--     PUBLICADAS (nunca uma nota antes do prazo de contestação).
-- =====================================================================

create table public.indicadores_diarios (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  dia date not null,
  conversas_atribuidas numeric,   -- atribuições automáticas (total)
  autoatribuicoes numeric,        -- autoatribuições
  tempo_ativo_min numeric,        -- tempo ativo, em minutos
  sla_chat_s numeric,             -- 90º percentil do tempo de resposta no chat, no dia (segundos)
  sla_email_s numeric,            -- 90º percentil do tempo de resposta no e-mail, no dia (segundos)
  csat_positivas int,
  csat_total int,
  horas_logadas_min numeric,      -- a origem ainda será definida
  importacao_id uuid references public.data_imports(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (employee_id, dia),
  check (conversas_atribuidas is null or conversas_atribuidas >= 0),
  check (autoatribuicoes is null or autoatribuicoes >= 0),
  check (tempo_ativo_min is null or tempo_ativo_min >= 0),
  check (sla_chat_s is null or sla_chat_s >= 0),
  check (sla_email_s is null or sla_email_s >= 0),
  check (horas_logadas_min is null or horas_logadas_min >= 0),
  check (csat_total is null or csat_total >= 0),
  check (csat_positivas is null or (csat_positivas >= 0 and csat_positivas <= coalesce(csat_total, csat_positivas)))
);
create index on public.indicadores_diarios (dia);

alter table public.indicadores_diarios enable row level security;
create policy "diarios_ler" on public.indicadores_diarios for select to authenticated
  using (employee_id = public.current_employee_id() or public.is_admin(auth.uid()));
revoke all on public.indicadores_diarios from anon, authenticated;
grant select on public.indicadores_diarios to authenticated;

-- ---------- O cálculo de um período (uso interno) ----------
create or replace function public.calcular_indicadores_periodo(_employee_id uuid, _de date, _ate date)
returns table (de date, ate date, dias_com_dados int, qualidade numeric, avaliacoes int,
               produtividade numeric, sla_chat_s numeric, sla_email_s numeric,
               csat_meu numeric, csat_time numeric, horas_semanais numeric)
language sql stable security definer set search_path = public, pg_temp as $$
  with meus as (
    select * from public.indicadores_diarios d
     where d.employee_id = _employee_id and d.dia between _de and _ate
  ),
  -- CSAT de cada agente no período (ativos e não ADM), para a média do TIME.
  por_agente as (
    select d.employee_id, sum(d.csat_positivas)::numeric / nullif(sum(d.csat_total), 0) * 100 as csat
      from public.indicadores_diarios d join public.employees e on e.id = d.employee_id
     where d.dia between _de and _ate and e.status = 'ativo'
       and public.perfil_do_usuario(e.user_id) is distinct from 'adm'
     group by d.employee_id
    having sum(d.csat_total) > 0
  ),
  notas as (
    select ev.nota from public.evaluations ev
     where ev.employee_id = _employee_id and not ev.anulada and ev.nota is not null
       and ev.data_contato between _de and _ate
       and public.quinzena_publicada(ev.fortnight_id)
  )
  select _de, _ate,
         (select count(*)::int from meus),
         (select round(avg(nota), 2) from notas),
         (select count(*)::int from notas),
         (select round((sum(conversas_atribuidas) - coalesce(sum(autoatribuicoes), 0)) / nullif(sum(tempo_ativo_min) / 60.0, 0), 2)
            from meus where conversas_atribuidas is not null and tempo_ativo_min is not null),
         (select round(avg(sla_chat_s), 1) from meus),
         (select round(avg(sla_email_s), 1) from meus),
         (select round(sum(csat_positivas)::numeric / nullif(sum(csat_total), 0) * 100, 2) from meus),
         (select round(avg(csat), 2) from por_agente),
         -- Média semanal proporcional aos dias corridos do período.
         (select round(sum(horas_logadas_min) / 60.0 / ((_ate - _de + 1) / 7.0), 2) from meus where horas_logadas_min is not null)
$$;
revoke all on function public.calcular_indicadores_periodo(uuid, date, date) from public, anon, authenticated;

-- ---------- Os meus indicadores: um período escolhido ----------
create or replace function public.meus_indicadores(_de date, _ate date)
returns table (de date, ate date, dias_com_dados int, qualidade numeric, avaliacoes int,
               produtividade numeric, sla_chat_s numeric, sla_email_s numeric,
               csat_meu numeric, csat_time numeric, horas_semanais numeric)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare _eu uuid := public.current_employee_id();
begin
  if _eu is null then
    raise exception 'Cadastro não encontrado.' using errcode = '42501';
  end if;
  if _de is null or _ate is null then
    raise exception 'Informe as duas datas do período.' using errcode = 'P0001';
  end if;
  if _de > _ate then
    raise exception 'A data inicial é depois da final.' using errcode = 'P0001';
  end if;
  if _ate - _de + 1 > 92 then
    raise exception 'Escolha um período de até 92 dias.' using errcode = 'P0001';
  end if;
  return query select * from public.calcular_indicadores_periodo(_eu, _de, _ate);
end; $$;
revoke all on function public.meus_indicadores(date, date) from public, anon;
grant execute on function public.meus_indicadores(date, date) to authenticated;

-- ---------- Os meus indicadores: os últimos N dias COM DADOS ----------
create or replace function public.meus_indicadores_recentes(_dias int)
returns table (de date, ate date, dias_com_dados int, qualidade numeric, avaliacoes int,
               produtividade numeric, sla_chat_s numeric, sla_email_s numeric,
               csat_meu numeric, csat_time numeric, horas_semanais numeric)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare _eu uuid := public.current_employee_id(); _de date; _ate date;
begin
  if _eu is null then
    raise exception 'Cadastro não encontrado.' using errcode = '42501';
  end if;
  select min(dia), max(dia) into _de, _ate
    from (select d.dia from public.indicadores_diarios d where d.employee_id = _eu
           order by d.dia desc limit greatest(1, least(coalesce(_dias, 7), 31))) x;
  if _de is null then
    return; -- nenhum dia importado ainda
  end if;
  return query select * from public.calcular_indicadores_periodo(_eu, _de, _ate);
end; $$;
revoke all on function public.meus_indicadores_recentes(int) from public, anon;
grant execute on function public.meus_indicadores_recentes(int) to authenticated;
