-- =====================================================================
-- Avisos das contestações no Slack (08/10/2026): o robô "quality eyes" posta
-- no canal de qualidade quando uma contestação é ABERTA, LEMBRA no dia do prazo
-- (às 8h, se ainda sem resposta) e avisa quando ela é RESPONDIDA, na conversa
-- (thread) do aviso de abertura.
--
--   * Nenhum aviso sai duas vezes: o servidor RESERVA o aviso antes de postar
--     (uma operação que só uma tentativa consegue); se o Slack falhar, a reserva
--     é desfeita, e a tarefa da manhã tenta de novo.
--   * As contestações que já existem são marcadas como avisadas (sem enxurrada
--     de avisos no primeiro dia).
--   * Só o servidor chama as funções. O motivo escrito pelo colaborador nunca
--     sai do banco por elas.
-- =====================================================================
alter table public.contestations
  add column slack_ts text,
  add column slack_abertura_em timestamptz,
  add column slack_lembrete_em timestamptz,
  add column slack_resposta_em timestamptz;

update public.contestations
   set slack_abertura_em = now(), slack_lembrete_em = now(),
       slack_resposta_em = case when status in ('deferida', 'indeferida') then now() end;

-- ---------- O que o aviso precisa (sem o texto da contestação) ----------
create or replace function public.dados_do_aviso_de_contestacao(_id uuid)
returns table (id uuid, status text, colaborador text, tipo text, assunto text, data_contato date,
               avaliador text, responder_ate timestamptz, respondida_em timestamptz, respondeu text,
               nota_anterior numeric, nota_nova numeric, slack_ts text,
               slack_abertura_em timestamptz, slack_lembrete_em timestamptz, slack_resposta_em timestamptz)
language sql stable security definer set search_path = public, pg_temp as $$
  select c.id, c.status::text, e.nome, ev.tipo::text, coalesce(ev.assunto, c.assunto), ev.data_contato,
         (select a.nome from public.employees a where a.user_id = ev.avaliador_id limit 1),
         c.responder_ate, c.respondida_em,
         (select r.nome from public.employees r where r.user_id = c.responsavel_id limit 1),
         c.nota_anterior, c.nota_nova, c.slack_ts,
         c.slack_abertura_em, c.slack_lembrete_em, c.slack_resposta_em
    from public.contestations c
    join public.employees e on e.id = c.employee_id
    left join public.evaluations ev on ev.id = c.evaluation_id
   where c.id = _id
$$;

-- ---------- Reservar, desfazer e guardar ----------
-- Reserva o aviso (abertura, lembrete ou resposta): verdadeiro só para a PRIMEIRA tentativa.
create or replace function public.reservar_aviso_slack(_id uuid, _evento text)
returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare _ok boolean := false;
begin
  if _evento = 'abertura' then
    update public.contestations set slack_abertura_em = now() where id = _id and slack_abertura_em is null returning true into _ok;
  elsif _evento = 'lembrete' then
    update public.contestations set slack_lembrete_em = now()
     where id = _id and slack_lembrete_em is null and status in ('aberta', 'em_analise') returning true into _ok;
  elsif _evento = 'resposta' then
    update public.contestations set slack_resposta_em = now()
     where id = _id and slack_resposta_em is null and status in ('deferida', 'indeferida') returning true into _ok;
  else
    raise exception 'Evento de aviso desconhecido: %', _evento using errcode = 'P0001';
  end if;
  return coalesce(_ok, false);
end; $$;

-- Desfaz a reserva (o Slack falhou): a tarefa da manhã tenta de novo.
create or replace function public.desfazer_aviso_slack(_id uuid, _evento text)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if _evento = 'abertura' then update public.contestations set slack_abertura_em = null where id = _id;
  elsif _evento = 'lembrete' then update public.contestations set slack_lembrete_em = null where id = _id;
  elsif _evento = 'resposta' then update public.contestations set slack_resposta_em = null where id = _id;
  end if;
end; $$;

-- Guarda a mensagem de abertura no Slack (o lembrete e a resposta saem na conversa dela).
create or replace function public.guardar_mensagem_slack(_id uuid, _ts text)
returns void
language sql security definer set search_path = public, pg_temp as $$
  update public.contestations set slack_ts = _ts where id = _id and slack_ts is null
$$;

-- ---------- O que a tarefa da manhã precisa fazer ----------
-- Abertura que não saiu; lembrete do dia do prazo (ainda sem resposta); resposta que não saiu.
create or replace function public.avisos_slack_pendentes()
returns table (id uuid, evento text)
language sql stable security definer set search_path = public, pg_temp as $$
  select c.id, 'abertura' from public.contestations c where c.slack_abertura_em is null
  union all
  select c.id, 'lembrete' from public.contestations c
   where c.slack_lembrete_em is null and c.status in ('aberta', 'em_analise')
     and c.responder_ate is not null
     and (c.responder_ate at time zone 'America/Fortaleza')::date = (now() at time zone 'America/Fortaleza')::date
     and now() < c.responder_ate
  union all
  select c.id, 'resposta' from public.contestations c
   where c.slack_resposta_em is null and c.status in ('deferida', 'indeferida')
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.dados_do_aviso_de_contestacao(uuid)', 'public.reservar_aviso_slack(uuid, text)',
    'public.desfazer_aviso_slack(uuid, text)', 'public.guardar_mensagem_slack(uuid, text)',
    'public.avisos_slack_pendentes()'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
