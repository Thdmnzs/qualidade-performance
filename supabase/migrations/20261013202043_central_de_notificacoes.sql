-- =====================================================================
-- A central de notificações (13/10/2026).
--
--   * "Para fazer": CALCULADO na hora, das próprias tabelas (as trocas, as férias e as
--     contestações em aberto). Feita a ação, em qualquer tela, o item some sozinho.
--   * "Novidades": guardadas por pessoa, criadas por gatilhos no momento do acontecimento:
--     o resultado publicado (e as conquistas da quinzena), a contestação respondida, a escala
--     publicada, as férias decididas, as trocas (o aceite, a recusa da colega, a decisão e o
--     cancelamento), e os aniversários do dia.
--   * Uma por acontecimento: a "chave" é única por pessoa (republicar não repete o aviso).
--   * A notificação guarda o TIPO (e não um endereço): a tela decide para onde ir, pelo perfil.
--   * Cada pessoa vê só as dela. As novidades ficam 30 dias (a tarefa da manhã apaga as antigas).
-- =====================================================================
create table public.notificacoes (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees (id) on delete cascade,
  tipo text not null check (length(tipo) <= 40),
  titulo text not null check (length(titulo) <= 160),
  texto text check (texto is null or length(texto) <= 300),
  chave text not null check (length(chave) <= 200),
  criada_em timestamptz not null default now(),
  lida_em timestamptz,
  unique (employee_id, chave)
);
create index notificacoes_da_pessoa on public.notificacoes (employee_id, criada_em desc);
alter table public.notificacoes enable row level security;
create policy notificacoes_leitura on public.notificacoes for select using (employee_id = public.current_employee_id());
revoke all on public.notificacoes from anon, authenticated;
grant select on public.notificacoes to authenticated;

-- ---------- As peças ----------
create or replace function public._notificar(_emp uuid, _tipo text, _titulo text, _texto text, _chave text)
returns void
language sql security definer set search_path = public, pg_temp as $$
  insert into public.notificacoes (employee_id, tipo, titulo, texto, chave)
  select _emp, _tipo, left(_titulo, 160), left(_texto, 300), left(_chave, 200)
   where _emp is not null and exists (select 1 from public.employees where id = _emp and status = 'ativo')
  on conflict (employee_id, chave) do nothing
$$;
create or replace function public._primeiro_nome(_emp uuid)
returns text
language sql stable security definer set search_path = public, pg_temp as $$ select split_part(nome, ' ', 1) from public.employees where id = _emp $$;
create or replace function public._dd_mm(_d date)
returns text
language sql immutable set search_path = public, pg_temp as $$ select to_char(_d, 'DD/MM') $$;
-- Uma nota em português: "95", "100", ou "98,5" (com vírgula, só quando há decimal).
create or replace function public._nota_em_texto(_n numeric)
returns text
language sql immutable set search_path = public, pg_temp as $$
  select case when _n is null then null when _n = trunc(_n) then trunc(_n)::bigint::text else replace(round(_n, 1)::text, '.', ',') end
$$;
create or replace function public._nome_da_quinzena(_f public.fortnights)
returns text
language sql immutable set search_path = public, pg_temp as $$
  select case when _f.tipo::text = 'primeira' then '1ª' else '2ª' end || ' quinzena de '
         || (array['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'])[_f.mes]
$$;
-- As datas de uma troca ("21/10 e 22/10"), em ordem e sem repetir.
create or replace function public._datas_da_troca(_t public.trocas_de_escala)
returns text
language sql stable set search_path = public, pg_temp as $$
  select string_agg(public._dd_mm(d), ' e ' order by d) from (select distinct _t.inicio + x as d from unnest(_t.dias) x) y
$$;
create or replace function public._descricao_da_troca(_t public.trocas_de_escala)
returns text
language sql stable set search_path = public, pg_temp as $$
  select case _t.tipo when 'horarios' then 'Os horários de ' when 'folgas' then 'As folgas de ' else 'O feriado de ' end || public._datas_da_troca(_t)
$$;

-- ---------- Os gatilhos ----------
-- O resultado publicado: para quem foi avaliado na quinzena (e as conquistas dela).
create or replace function public._notificar_resultado()
returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare _e record;
begin
  if old.publicado_em is null and new.publicado_em is not null then
    for _e in select distinct ev.employee_id from public.evaluations ev where ev.fortnight_id = new.id and not ev.anulada loop
      perform public._notificar(_e.employee_id, 'resultado', 'O resultado da ' || public._nome_da_quinzena(new) || ' saiu', 'Veja as suas avaliações.', 'resultado:' || new.id);
    end loop;
    for _e in select g.employee_id, g.conquista, g.xp, c.nome from public.conquistas_ganhas g join public.conquistas c on c.numero = g.conquista where g.fortnight_id = new.id loop
      perform public._notificar(_e.employee_id, 'conquista', 'Nova conquista: ' || _e.nome, '+' || _e.xp || ' XP', 'conquista:' || _e.conquista || ':' || new.id);
    end loop;
  end if;
  return new;
end; $$;
create trigger notificar_resultado after update of publicado_em on public.fortnights for each row execute function public._notificar_resultado();

-- Uma conquista ganha (ou recalculada) numa quinzena JÁ publicada (a chave não repete).
create or replace function public._notificar_conquista()
returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if exists (select 1 from public.fortnights where id = new.fortnight_id and publicado_em is not null) then
    perform public._notificar(new.employee_id, 'conquista', 'Nova conquista: ' || (select nome from public.conquistas where numero = new.conquista),
      '+' || new.xp || ' XP', 'conquista:' || new.conquista || ':' || new.fortnight_id);
  end if;
  return new;
end; $$;
create trigger notificar_conquista after insert on public.conquistas_ganhas for each row execute function public._notificar_conquista();

-- A contestação respondida: para quem contestou.
create or replace function public._notificar_contestacao()
returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if old.status::text in ('aberta', 'em_analise') and new.status::text in ('respondida', 'deferida', 'indeferida') then
    perform public._notificar(new.employee_id, 'contestacao', 'A sua contestação foi respondida',
      case new.status::text
        when 'deferida' then 'Deferida' || coalesce(': a nota passou de ' || public._nota_em_texto(new.nota_anterior) || ' para ' || public._nota_em_texto(new.nota_nova), '')
        when 'indeferida' then 'Indeferida: a nota continua a mesma'
        else 'Veja a resposta.' end,
      'contestacao:' || new.id);
  end if;
  return new;
end; $$;
create trigger notificar_contestacao after update of status on public.contestations for each row execute function public._notificar_contestacao();

-- As férias decididas: para quem pediu.
create or replace function public._notificar_ferias()
returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if old.situacao = 'aguardando' and new.situacao in ('aprovado', 'recusado') then
    perform public._notificar(new.employee_id, 'ferias',
      'O seu pedido de férias foi ' || case when new.situacao = 'aprovado' then 'aprovado' else 'recusado' end,
      'De ' || public._dd_mm(new.de) || ' a ' || public._dd_mm(new.ate) || coalesce(case when new.situacao = 'recusado' then ' · ' || new.motivo end, ''),
      'ferias:' || new.id);
  end if;
  return new;
end; $$;
create trigger notificar_ferias after update of situacao on public.ferias_pedidos for each row execute function public._notificar_ferias();

-- A escala publicada: para quem está nela.
create or replace function public._notificar_escala()
returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare _e record;
begin
  if old.situacao <> 'publicada' and new.situacao = 'publicada' then
    for _e in select distinct employee_id from public.escala_linhas where semana_id = new.id loop
      perform public._notificar(_e.employee_id, 'escala', 'A escala de ' || public._dd_mm(new.inicio) || ' a ' || public._dd_mm(new.inicio + 6) || ' foi publicada',
        'Veja os seus horários da semana.', 'escala:' || new.id || ':' || coalesce(new.publicada_em, now())::text);
    end loop;
  end if;
  return new;
end; $$;
create trigger notificar_escala after update of situacao on public.escala_semanas for each row execute function public._notificar_escala();

-- As trocas: o aceite e a recusa da colega (para quem pediu), a decisão (para as duas) e o cancelamento (para a colega).
create or replace function public._notificar_troca()
returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  _o text := public._descricao_da_troca(new);
  -- Lido AGORA (o gatilho roda no fim da operação): na aprovação, a troca é aplicada depois de mudar de situação.
  _aplicada boolean := (select aplicada from public.trocas_de_escala where id = new.id);
begin
  if old.situacao = new.situacao then return new; end if;
  if new.situacao = 'aguardando_supervisao' then
    perform public._notificar(new.de_employee, 'troca', public._primeiro_nome(new.para_employee) || ' aceitou a troca', _o || '. Agora é com a supervisão.', 'troca:' || new.id || ':aceita');
  elsif new.situacao = 'recusada_colega' then
    perform public._notificar(new.de_employee, 'troca', public._primeiro_nome(new.para_employee) || ' recusou a troca', _o || '.', 'troca:' || new.id || ':recusada_colega');
  elsif new.situacao in ('aprovada', 'recusada') then
    perform public._notificar(x.emp, 'troca',
      'A troca com ' || public._primeiro_nome(x.outra) || ' foi ' || case when new.situacao = 'aprovada' then 'aprovada' else 'recusada' end,
      _o || '. ' || case when new.situacao = 'recusada' then coalesce('Motivo: ' || new.motivo, '')
                         when _aplicada then 'A escala já mudou.' else 'Entra na escala quando a semana for montada.' end,
      'troca:' || new.id || ':' || new.situacao)
      from (values (new.de_employee, new.para_employee), (new.para_employee, new.de_employee)) x(emp, outra);
  elsif new.situacao = 'cancelada' and old.situacao in ('aguardando_colega', 'aguardando_supervisao') then
    perform public._notificar(new.para_employee, 'troca', public._primeiro_nome(new.de_employee) || ' cancelou o pedido de troca', _o || '.', 'troca:' || new.id || ':cancelada');
  end if;
  return new;
end; $$;
-- No FIM da operação (deferido): assim, a aprovação já está aplicada (ou não) quando o aviso é escrito.
create constraint trigger notificar_troca after update of situacao on public.trocas_de_escala
  deferrable initially deferred for each row execute function public._notificar_troca();

-- ---------- A leitura (para fazer + novidades) ----------
create or replace function public.minhas_notificacoes()
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  _eu uuid := public.current_employee_id();
  _adm boolean := public.is_admin(auth.uid());
  _hoje date := (now() at time zone 'America/Fortaleza')::date;
  _a record;
  _pendencias jsonb;
begin
  if _eu is null then
    raise exception 'Seu acesso não está vinculado a um colaborador ativo.' using errcode = '42501';
  end if;
  -- Os aniversários de hoje viram novidade (uma vez por pessoa e dia), para quem não é o aniversariante.
  for _a in select employee_id, nome from public.aniversariantes_de_hoje() where not sou_eu loop
    perform public._notificar(_eu, 'aniversario', 'Hoje é o aniversário de ' || split_part(_a.nome, ' ', 1), 'Deixe um recado na Visão geral.', 'aniversario:' || _a.employee_id || ':' || _hoje);
  end loop;
  _pendencias := coalesce((
    select jsonb_agg(p order by p->>'quando') from (
      -- As trocas que esperam o MEU aceite.
      select jsonb_build_object('tipo', 'troca_para_voce', 'id', t.id, 'quando', t.criado_em,
               'titulo', public._primeiro_nome(t.de_employee) || ' pediu uma troca com você', 'texto', public._descricao_da_troca(t)) as p
        from public.trocas_de_escala t where t.para_employee = _eu and t.situacao = 'aguardando_colega'
      union all
      -- O ADM: as trocas e as férias que esperam a decisão.
      select jsonb_build_object('tipo', 'troca_para_aprovar', 'id', t.id, 'quando', t.aceita_em,
               'titulo', 'Troca para aprovar: ' || public._primeiro_nome(t.de_employee) || ' ⇄ ' || public._primeiro_nome(t.para_employee),
               'texto', public._descricao_da_troca(t) || ' · já aceita por ' || public._primeiro_nome(t.para_employee))
        from public.trocas_de_escala t where _adm and t.situacao = 'aguardando_supervisao'
      union all
      select jsonb_build_object('tipo', 'ferias_para_decidir', 'id', f.id, 'quando', f.criado_em,
               'titulo', 'Pedido de férias de ' || public._primeiro_nome(f.employee_id), 'texto', 'De ' || public._dd_mm(f.de) || ' a ' || public._dd_mm(f.ate))
        from public.ferias_pedidos f where _adm and f.situacao = 'aguardando'
      union all
      -- As contestações em aberto, para quem pode respondê-las (o ADM, e o avaliador de quem contestou).
      select jsonb_build_object('tipo', 'contestacao_para_responder', 'id', c.id, 'quando', c.created_at,
               'titulo', 'Contestação de ' || public._primeiro_nome(c.employee_id) || ' para responder',
               'texto', coalesce('O prazo vence em ' || to_char(c.responder_ate at time zone 'America/Fortaleza', 'DD/MM, "às" HH24"h"MI'), 'Aguardando a resposta'))
        from public.contestations c
       where c.status::text in ('aberta', 'em_analise') and c.employee_id <> _eu and (_adm or public.pode_atuar_sobre(auth.uid(), c.employee_id))
    ) x), '[]'::jsonb);
  return jsonb_build_object(
    'pendencias', _pendencias,
    'novidades', coalesce((select jsonb_agg(jsonb_build_object('id', n.id, 'tipo', n.tipo, 'titulo', n.titulo, 'texto', n.texto, 'quando', n.criada_em, 'lida', n.lida_em is not null) order by n.criada_em desc)
                             from (select * from public.notificacoes where employee_id = _eu and criada_em > now() - interval '30 days' order by criada_em desc limit 50) n), '[]'::jsonb));
end; $$;

-- Marcar como lidas (as escolhidas, ou todas com null).
create or replace function public.marcar_notificacoes_lidas(_ids uuid[])
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if public.current_employee_id() is null then
    raise exception 'Seu acesso não está vinculado a um colaborador ativo.' using errcode = '42501';
  end if;
  update public.notificacoes set lida_em = now()
   where employee_id = public.current_employee_id() and lida_em is null and (_ids is null or id = any (_ids));
end; $$;

-- A tarefa da manhã: apagar as novidades com mais de 30 dias.
create or replace function public.limpar_notificacoes_antigas()
returns int
language sql security definer set search_path = public, pg_temp as $$
  with apagadas as (delete from public.notificacoes where criada_em < now() - interval '30 days' returning 1) select count(*)::int from apagadas
$$;

revoke all on function public._notificar(uuid, text, text, text, text), public._primeiro_nome(uuid), public._dd_mm(date), public._nome_da_quinzena(public.fortnights), public._nota_em_texto(numeric),
  public._datas_da_troca(public.trocas_de_escala), public._descricao_da_troca(public.trocas_de_escala), public._notificar_resultado(), public._notificar_conquista(),
  public._notificar_contestacao(), public._notificar_ferias(), public._notificar_escala(), public._notificar_troca(), public.limpar_notificacoes_antigas()
  from public, anon, authenticated;
grant execute on function public.limpar_notificacoes_antigas() to service_role;
revoke all on function public.minhas_notificacoes(), public.marcar_notificacoes_lidas(uuid[]) from public, anon;
grant execute on function public.minhas_notificacoes(), public.marcar_notificacoes_lidas(uuid[]) to authenticated;
