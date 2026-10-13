-- =====================================================================
-- Os avisos das trocas no Slack, pela Central de Turnos (13/10/2026).
--
--   * O aviso: quando a colega aceita (a troca já combinada), no canal de escala.
--   * O fim: a aprovação, a recusa (sem o motivo) ou o cancelamento, na conversa do aviso.
--   * Nada antes do aceite chega ao canal (o pedido, a recusa da colega, o cancelamento antes).
--   * Nenhum aviso sai duas vezes: cada um é RESERVADO aqui antes de ser postado; se o Slack
--     falhar, a reserva é desfeita, e a tarefa da manhã tenta de novo.
--   * Tudo aqui é só para o servidor (a chave de serviço): nem o navegador chama.
-- =====================================================================
alter table public.trocas_de_escala
  add column slack_aviso_em timestamptz,
  add column slack_fim_em timestamptz;

-- O horário de uma pessoa num dia de uma semana publicada ("13h às 22h"), ou nada.
create or replace function public._horario_no_dia(_semana uuid, _dia int, _emp uuid)
returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select case when min(o) is null then null else (5 + min(o)) || 'h às ' || (6 + max(o)) || 'h' end
    from unnest(public._linha_da_escala(_semana, _dia, _emp)) with ordinality x(h, o)
    join public.escala_siglas g on g.id = x.h
   where g.conta_como_trabalho or lower(g.sigla) = 'p'
$$;

-- Os dados de um aviso: as pessoas, a troca, como fica, quem decidiu e a marca da mensagem.
create or replace function public.dados_do_aviso_de_troca(_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  _t public.trocas_de_escala%rowtype;
  _s public.escala_semanas%rowtype;
  _datas date[];
  _publicada boolean;
begin
  select * into _t from public.trocas_de_escala where id = _id;
  if not found then return null; end if;
  select * into _s from public.escala_semanas where inicio = _t.inicio;
  _publicada := found and _s.situacao = 'publicada';
  _datas := (select array_agg(distinct _t.inicio + d order by _t.inicio + d) from unnest(_t.dias) d);
  return jsonb_build_object(
    'id', _t.id, 'tipo', _t.tipo, 'modo', _t.modo, 'situacao', _t.situacao, 'aplicada', _t.aplicada,
    'de', (select nome from public.employees where id = _t.de_employee),
    'para', (select nome from public.employees where id = _t.para_employee),
    'datas', to_jsonb(_datas),
    -- Nas folgas: os dias em que cada uma folgava (antes da troca), entre os dias da troca.
    'folgas_de', to_jsonb((select coalesce(array_agg(x order by x), '{}') from unnest(_datas) x
                            where _t.tipo = 'folgas' and public._estado_no_dia(_t.de_employee, x) = 'folga')),
    'folgas_para', to_jsonb((select coalesce(array_agg(x order by x), '{}') from unnest(_datas) x
                              where _t.tipo = 'folgas' and public._estado_no_dia(_t.para_employee, x) = 'folga')),
    -- Nos horários, numa semana publicada: o horário de cada uma (antes da troca).
    'horario_de', case when _t.tipo = 'horarios' and _publicada then public._horario_no_dia(_s.id, _t.dias[1], _t.de_employee) end,
    'horario_para', case when _t.tipo = 'horarios' and _publicada then public._horario_no_dia(_s.id, _t.dias[1], _t.para_employee) end,
    'decidida_por', (select nome from public.employees where id = _t.decidida_por),
    'slack_ts', _t.slack_ts, 'slack_aviso_em', _t.slack_aviso_em, 'slack_fim_em', _t.slack_fim_em);
end; $$;

-- Reservar um aviso ('aviso' ou 'fim'): devolve se ESTA tentativa ficou com ele.
create or replace function public.reservar_aviso_de_troca(_id uuid, _evento text)
returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if _evento = 'aviso' then
    update public.trocas_de_escala set slack_aviso_em = now()
     where id = _id and slack_aviso_em is null and aceita_em is not null and situacao <> 'recusada_colega';
  elsif _evento = 'fim' then
    update public.trocas_de_escala set slack_fim_em = now()
     where id = _id and slack_fim_em is null and slack_ts is not null and situacao in ('aprovada', 'recusada', 'cancelada');
  else
    return false;
  end if;
  return found;
end; $$;
create or replace function public.desfazer_aviso_de_troca(_id uuid, _evento text)
returns void
language sql security definer set search_path = public, pg_temp as $$
  update public.trocas_de_escala
     set slack_aviso_em = case when _evento = 'aviso' then null else slack_aviso_em end,
         slack_fim_em = case when _evento = 'fim' then null else slack_fim_em end
   where id = _id
$$;
create or replace function public.guardar_mensagem_da_troca(_id uuid, _ts text)
returns void
language sql security definer set search_path = public, pg_temp as $$
  update public.trocas_de_escala set slack_ts = _ts where id = _id
$$;

-- A fila da tarefa da manhã: os avisos que se perderam (dos últimos 30 dias).
create or replace function public.avisos_de_troca_pendentes()
returns table (id uuid, evento text)
language sql stable security definer set search_path = public, pg_temp as $$
  select t.id, 'aviso' from public.trocas_de_escala t
   where t.slack_aviso_em is null and t.aceita_em is not null and t.situacao <> 'recusada_colega' and t.aceita_em > now() - interval '30 days'
  union all
  select t.id, 'fim' from public.trocas_de_escala t
   where t.slack_fim_em is null and t.slack_ts is not null and t.situacao in ('aprovada', 'recusada', 'cancelada') and t.decidida_em > now() - interval '30 days'
$$;

revoke all on function public._horario_no_dia(uuid, int, uuid), public.dados_do_aviso_de_troca(uuid), public.reservar_aviso_de_troca(uuid, text),
  public.desfazer_aviso_de_troca(uuid, text), public.guardar_mensagem_da_troca(uuid, text), public.avisos_de_troca_pendentes()
  from public, anon, authenticated;
grant execute on function public.dados_do_aviso_de_troca(uuid), public.reservar_aviso_de_troca(uuid, text), public.desfazer_aviso_de_troca(uuid, text),
  public.guardar_mensagem_da_troca(uuid, text), public.avisos_de_troca_pendentes() to service_role;
