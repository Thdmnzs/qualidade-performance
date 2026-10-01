-- =====================================================================
-- Etapa 4: ciclo da quinzena e prazos de contestação.
--
-- Regras de negócio (01/10/2026), substituindo os "6 dias" da especificação:
--   * Ciclo: aberta -> em_contestacao -> fechada, sempre pelo ADM, com auditoria.
--   * Publicar (ADM): o colaborador passa a ver as avaliações e pode contestar
--     por 2 DIAS ÚTEIS, contando o dia da publicação, até as 23h59 (Fortaleza).
--   * Responder: 1 dia útil, até as 23h59 do dia útil SEGUINTE ao recebimento.
--     Vencido, a contestação aparece como atrasada e continua respondível.
--   * Fechar (ADM): só depois do prazo de contestação e sem pendências.
--   * Reabrir (ADM): com motivo e auditoria; volta para "aberta".
--   * Dia útil = segunda a sexta (feriados não são considerados nesta versão).
--   * Avaliações só são registradas e excluídas com a quinzena aberta; depois,
--     só são corrigidas aceitando uma contestação.
-- =====================================================================

-- ---------- 1. Colunas ----------
alter table public.fortnights add column publicado_em timestamptz;
alter table public.contestations add column responder_ate timestamptz;
grant select (responder_ate) on public.contestations to authenticated;

-- ---------- 2. Calendário ----------
-- Último dia de um prazo de _dias úteis, contando _inicio se ele for útil.
create or replace function public.fim_do_prazo_util(_inicio date, _dias int)
returns date language plpgsql immutable as $$
declare
  _d date := _inicio;
  _contados int := 0;
begin
  if _dias < 1 then
    raise exception 'O prazo deve ter pelo menos 1 dia útil.';
  end if;
  loop
    if extract(isodow from _d) < 6 then          -- 1 = segunda ... 5 = sexta
      _contados := _contados + 1;
      if _contados = _dias then
        return _d;
      end if;
    end if;
    _d := _d + 1;
  end loop;
end; $$;

-- 23:59:59 (último instante) de uma data, no fuso de Fortaleza.
create or replace function public.fim_do_dia_fortaleza(_d date)
returns timestamptz language sql immutable as $$
  select ((_d + 1)::timestamp at time zone 'America/Fortaleza') - interval '1 microsecond'
$$;

create or replace function public.hoje_fortaleza()
returns date language sql stable as $$
  select (now() at time zone 'America/Fortaleza')::date
$$;

-- ---------- 3. Estado da quinzena ----------
create or replace function public.quinzena_aceita_avaliacoes(_fortnight_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.fortnights where id = _fortnight_id and status in ('aberta', 'em_analise'))
$$;

-- Publicada = o colaborador já vê as próprias avaliações.
create or replace function public.quinzena_publicada(_fortnight_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.fortnights
                  where id = _fortnight_id and status in ('em_contestacao', 'pronta_para_fechamento', 'fechada'))
$$;

create or replace function public.prazo_contestacao_aberto(_fortnight_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.fortnights
                  where id = _fortnight_id and status = 'em_contestacao' and now() <= prazo_contestacao_ate)
$$;

revoke all on function public.fim_do_prazo_util(date, int) from public, anon, authenticated;
revoke all on function public.fim_do_dia_fortaleza(date) from public, anon, authenticated;
revoke all on function public.hoje_fortaleza() from public, anon, authenticated;
revoke all on function public.quinzena_aceita_avaliacoes(uuid) from public, anon, authenticated;
revoke all on function public.prazo_contestacao_aberto(uuid) from public, anon, authenticated;
revoke all on function public.quinzena_publicada(uuid) from public, anon;
-- Usada nas policies, que rodam com as permissões de quem lê.
grant execute on function public.quinzena_publicada(uuid) to authenticated;

-- ---------- 4. O colaborador vê as próprias avaliações a partir da publicação ----------
drop policy "evaluations_self_read_after_close" on public.evaluations;
create policy "evaluations_self_read_published" on public.evaluations for select to authenticated
  using (public.is_admin(auth.uid())
         or (employee_id = public.current_employee_id()
             and public.quinzena_publicada(fortnight_id)
             and not anulada));

drop policy "eval_items_read" on public.evaluation_items;
create policy "eval_items_read" on public.evaluation_items for select to authenticated
  using (public.is_admin(auth.uid())
         or exists (select 1 from public.evaluations e
                     where e.id = evaluation_items.evaluation_id
                       and e.employee_id = public.current_employee_id()
                       and public.quinzena_publicada(e.fortnight_id)
                       and not e.anulada));

-- ---------- 5. Toda contestação: dentro do prazo, e com prazo de resposta ----------
-- Vale para os dois caminhos (contestar uma avaliação e a contestação geral).
create or replace function public.preparar_nova_contestacao()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.prazo_contestacao_aberto(new.fortnight_id) then
    raise exception 'O prazo para contestar esta quinzena não está aberto. Contestações são aceitas da publicação até as 23h59 do 2º dia útil.'
      using errcode = 'P0001';
  end if;
  -- 1 dia útil, contado a partir do dia seguinte ao recebimento.
  new.responder_ate := public.fim_do_dia_fortaleza(public.fim_do_prazo_util(public.hoje_fortaleza() + 1, 1));
  return new;
end; $$;

revoke all on function public.preparar_nova_contestacao() from public, anon, authenticated;

create trigger trg_preparar_nova_contestacao
  before insert on public.contestations
  for each row execute function public.preparar_nova_contestacao();

-- Contestações existentes ganham o prazo de resposta calculado da mesma forma.
update public.contestations
   set responder_ate = public.fim_do_dia_fortaleza(
         public.fim_do_prazo_util((created_at at time zone 'America/Fortaleza')::date + 1, 1))
 where responder_ate is null;

-- ---------- 6. Funções que mudam de regra ----------
create or replace function public.registrar_avaliacao(
  _employee_id uuid,
  _fortnight_id uuid,
  _tipo public.evaluation_type,
  _assunto text,
  _data_contato date,
  _link_conversa text,
  _comentarios text,
  _respostas jsonb
)
returns table (evaluation_id uuid, nota numeric, total_interacao bigint, total_ticket_n2 bigint)
language plpgsql security definer set search_path = public as $$
declare
  _avaliador uuid := auth.uid();
  _emp public.employees%rowtype;
  _status_quinzena public.fortnight_status;
  _versao int;
  _assunto_limpo text := nullif(btrim(_assunto), '');
  _link_limpo text := nullif(btrim(_link_conversa), '');
  _hoje date := (now() at time zone 'America/Fortaleza')::date;
  _problema text;
  _nota numeric;
  _id uuid;
  _restricao text;
begin
  if _avaliador is null or not (public.is_admin(_avaliador) or public.is_avaliador(_avaliador)) then
    raise exception 'Apenas avaliadores e administradores ativos podem registrar avaliações.'
      using errcode = '42501';
  end if;

  -- Quinzena
  select status into _status_quinzena from public.fortnights where id = _fortnight_id;
  if not found then
    raise exception 'Quinzena não encontrada.' using errcode = 'P0002';
  end if;
  if _status_quinzena not in ('aberta', 'em_analise') then
    raise exception 'Esta quinzena não está mais aberta para avaliações (já foi publicada para contestação ou fechada).'
      using errcode = 'P0001';
  end if;

  -- Colaborador avaliado
  select * into _emp from public.employees where id = _employee_id;
  if not found then
    raise exception 'Colaborador não encontrado.' using errcode = 'P0002';
  end if;
  if _emp.status <> 'ativo' then
    raise exception 'Não é possível avaliar um colaborador inativo.' using errcode = 'P0001';
  end if;
  -- Quem avalia quem. Mensagens específicas; pode_atuar_sobre() é a trava final.
  if _emp.user_id is not distinct from _avaliador then
    raise exception 'Você não pode avaliar a si mesmo.' using errcode = '42501';
  end if;
  if public.perfil_do_usuario(_emp.user_id) = 'adm' then
    raise exception 'O perfil ADM não recebe avaliação de qualidade.' using errcode = 'P0001';
  end if;
  if public.perfil_do_usuario(_emp.user_id) = 'avaliador' and not public.is_admin(_avaliador) then
    raise exception 'Avaliadores só podem ser avaliados por um ADM.' using errcode = '42501';
  end if;
  if not public.pode_atuar_sobre(_avaliador, _employee_id) then
    raise exception 'Você não tem permissão para avaliar este colaborador.' using errcode = '42501';
  end if;

  -- Assunto e data do contato (obrigatórios)
  if _assunto_limpo is null then
    raise exception 'Informe o assunto do contato.' using errcode = 'P0001';
  end if;
  if length(_assunto_limpo) > 200 then
    raise exception 'O assunto deve ter no máximo 200 caracteres.' using errcode = 'P0001';
  end if;
  if _data_contato is null then
    raise exception 'Informe a data do contato.' using errcode = 'P0001';
  end if;
  if _data_contato > _hoje then
    raise exception 'A data do contato não pode ser futura.' using errcode = 'P0001';
  end if;

  -- Link
  if _link_limpo is not null and _link_limpo !~* '^https?://' then
    raise exception 'O link da conversa deve começar com http:// ou https://.' using errcode = 'P0001';
  end if;

  -- Ficha vigente: a maior versão com critérios ativos.
  select max(versao) into _versao from public.evaluation_criteria where ativo;
  if _versao is null then
    raise exception 'Nenhuma ficha de avaliação ativa.' using errcode = 'P0001';
  end if;

  if _respostas is null or jsonb_typeof(_respostas) <> 'array' then
    raise exception 'As respostas devem ser uma lista.' using errcode = 'P0001';
  end if;

  -- Validação compartilhada com o ajuste por contestação.
  _problema := public.problema_nas_respostas(_respostas, _versao);

  if _problema is not null then
    raise exception '%', _problema using errcode = 'P0001';
  end if;

  _nota := public.nota_das_respostas(_respostas);

  begin
    insert into public.evaluations
      (employee_id, fortnight_id, tipo, assunto, data_contato, link_conversa, comentarios,
       versao_ficha, nota, avaliador_id)
    values
      (_employee_id, _fortnight_id, _tipo, _assunto_limpo, _data_contato, _link_limpo,
       nullif(btrim(_comentarios), ''), _versao, _nota, _avaliador)
    returning id into _id;
  exception when unique_violation then
    -- Identifica QUAL proteção barrou, para a mensagem ser útil.
    get stacked diagnostics _restricao = constraint_name;
    if _restricao = 'uq_eval_link_conversa' then
      raise exception 'Esta conversa já foi avaliada para este colaborador nesta quinzena.'
        using errcode = 'P0001';
    end if;
    raise;
  end;

  insert into public.evaluation_items (evaluation_id, criterion_id, resposta, desconto, observacao)
  select _id,
         c.id,
         x ->> 'resposta',
         public.desconto_do_criterio(c.peso, c.peso_medio, x ->> 'resposta'),
         case when x ->> 'resposta' = 'nao' then nullif(btrim(x ->> 'observacao'), '') end
    from jsonb_array_elements(_respostas) x
    join public.evaluation_criteria c on c.id = (x ->> 'criterio_id')::uuid;

  insert into public.audit_logs (usuario_id, usuario_nome, acao, entidade, registro_id, valor_novo)
  values (_avaliador,
          (select nome from public.employees where user_id = _avaliador limit 1),
          'registrar_avaliacao', 'evaluations', _id,
          jsonb_build_object('colaborador', _emp.nome, 'tipo', _tipo, 'assunto', _assunto_limpo,
                             'data_contato', _data_contato, 'nota', _nota, 'versao_ficha', _versao));

  return query
    select _id, _nota,
           count(*) filter (where e.tipo = 'interacao'),
           count(*) filter (where e.tipo = 'ticket_n2')
      from public.evaluations e
     where e.employee_id = _employee_id and e.fortnight_id = _fortnight_id and not e.anulada;
end; $$;

create or replace function public.excluir_avaliacao(_evaluation_id uuid, _motivo text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  _chamador uuid := auth.uid();
  _ev public.evaluations%rowtype;
  _motivo_limpo text := nullif(btrim(_motivo), '');
begin
  if _chamador is null or not (public.is_admin(_chamador) or public.is_avaliador(_chamador)) then
    raise exception 'Apenas avaliadores e administradores ativos podem excluir avaliações.'
      using errcode = '42501';
  end if;

  select * into _ev from public.evaluations where id = _evaluation_id for update;
  if not found then
    raise exception 'Avaliação não encontrada.' using errcode = 'P0002';
  end if;
  if _ev.anulada then
    raise exception 'Esta avaliação já foi excluída.' using errcode = 'P0001';
  end if;
  if not public.is_admin(_chamador) and _ev.avaliador_id is distinct from _chamador then
    raise exception 'Só quem fez a avaliação, ou um ADM, pode excluí-la.' using errcode = '42501';
  end if;
  if not public.quinzena_aceita_avaliacoes(_ev.fortnight_id) then
    raise exception 'Esta quinzena não está mais aberta; a avaliação não pode ser excluída (para corrigir, use a contestação).'
      using errcode = 'P0001';
  end if;
  if _motivo_limpo is null or length(_motivo_limpo) < 5 then
    raise exception 'Informe o motivo da exclusão (pelo menos 5 caracteres).' using errcode = 'P0001';
  end if;

  update public.evaluations
     set anulada = true, anulada_em = now(), anulada_por = _chamador, motivo_anulacao = _motivo_limpo
   where id = _evaluation_id;

  insert into public.audit_logs (usuario_id, usuario_nome, acao, entidade, registro_id, valor_anterior, valor_novo)
  values (_chamador,
          (select nome from public.employees where user_id = _chamador limit 1),
          'excluir_avaliacao', 'evaluations', _evaluation_id,
          jsonb_build_object('colaborador', (select nome from public.employees where id = _ev.employee_id),
                             'tipo', _ev.tipo, 'assunto', _ev.assunto, 'data_contato', _ev.data_contato,
                             'nota', _ev.nota),
          jsonb_build_object('motivo', _motivo_limpo));
end; $$;

create or replace function public.listar_avaliacoes_gestao(_fortnight_id uuid default null)
returns table (
  id uuid,
  employee_id uuid,
  colaborador text,
  fortnight_id uuid,
  tipo public.evaluation_type,
  assunto text,
  data_contato date,
  link_conversa text,
  nota numeric,
  created_at timestamptz,
  avaliado_por text,
  pode_excluir boolean
)
language sql stable security definer set search_path = public as $$
  select ev.id, ev.employee_id, emp.nome, ev.fortnight_id, ev.tipo, ev.assunto, ev.data_contato,
         ev.link_conversa, ev.nota, ev.created_at,
         coalesce(av.nome, 'Avaliador removido'),
         public.quinzena_aceita_avaliacoes(ev.fortnight_id)
           and (public.is_admin(auth.uid()) or ev.avaliador_id = auth.uid())
    from public.evaluations ev
    join public.employees emp on emp.id = ev.employee_id
    left join public.employees av on av.user_id = ev.avaliador_id
   where not ev.anulada
     and public.pode_atuar_sobre(auth.uid(), ev.employee_id)
     and (_fortnight_id is null or ev.fortnight_id = _fortnight_id)
   order by emp.nome, ev.created_at desc
$$;

create or replace function public.contestar_avaliacao(_evaluation_id uuid, _descricao text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  _eu uuid := public.current_employee_id();
  _ev public.evaluations%rowtype;
  _descricao_limpa text := nullif(btrim(_descricao), '');
  _id uuid;
begin
  if _eu is null then
    raise exception 'Apenas colaboradores ativos podem contestar avaliações.' using errcode = '42501';
  end if;

  -- Avaliação de outra pessoa, ou excluída, é "não encontrada": a mensagem
  -- não confirma nem a existência de avaliações alheias.
  select * into _ev from public.evaluations where id = _evaluation_id;
  if not found or _ev.employee_id <> _eu or _ev.anulada then
    raise exception 'Avaliação não encontrada.' using errcode = 'P0002';
  end if;
  if not public.quinzena_publicada(_ev.fortnight_id) then
    raise exception 'Esta avaliação ainda não está disponível para contestação.' using errcode = 'P0001';
  end if;
  if not public.prazo_contestacao_aberto(_ev.fortnight_id) then
    -- Sem prazo registrado (ex.: quinzena fechada antes de existir o prazo),
    -- a mensagem não pode tentar mostrar uma data.
    raise exception '%', coalesce(
      (select 'O prazo para contestar esta quinzena terminou em '
              || to_char(prazo_contestacao_ate at time zone 'America/Fortaleza', 'DD/MM "às" HH24:MI') || '.'
         from public.fortnights where id = _ev.fortnight_id and prazo_contestacao_ate is not null),
      'O período de contestação desta quinzena já foi encerrado.')
      using errcode = 'P0001';
  end if;
  if exists (select 1 from public.contestations
              where evaluation_id = _evaluation_id and status in ('aberta', 'em_analise')) then
    raise exception 'Já existe uma contestação em andamento para esta avaliação.' using errcode = 'P0001';
  end if;
  if _descricao_limpa is null or length(_descricao_limpa) < 10 then
    raise exception 'Explique o motivo da contestação (pelo menos 10 caracteres).' using errcode = 'P0001';
  end if;
  if length(_descricao_limpa) > 2000 then
    raise exception 'O motivo deve ter no máximo 2000 caracteres.' using errcode = 'P0001';
  end if;

  begin
    insert into public.contestations (employee_id, fortnight_id, evaluation_id, assunto, descricao)
    values (_eu, _ev.fortnight_id, _ev.id,
            format('Avaliação de %s · %s · %s',
                   case _ev.tipo when 'interacao' then 'Interação' else 'Ticket N2' end,
                   coalesce(_ev.assunto, 'sem assunto'),
                   coalesce(to_char(_ev.data_contato, 'DD/MM/YYYY'), 'sem data')),
            _descricao_limpa)
    returning id into _id;
  exception when unique_violation then
    raise exception 'Já existe uma contestação em andamento para esta avaliação.' using errcode = 'P0001';
  end;

  insert into public.audit_logs (usuario_id, usuario_nome, acao, entidade, registro_id, valor_novo)
  values (auth.uid(),
          (select nome from public.employees where id = _eu),
          'abrir_contestacao', 'contestations', _id,
          jsonb_build_object('evaluation_id', _ev.id, 'nota', _ev.nota));

  return _id;
end; $$;

-- ---------- 7. Ciclo da quinzena (só ADM, com auditoria) ----------
-- _acao: 'publicar' | 'fechar' | 'reabrir'. Retorna o novo status.
create or replace function public.alterar_ciclo_quinzena(_fortnight_id uuid, _acao text, _motivo text default null)
returns public.fortnight_status
language plpgsql security definer set search_path = public as $$
declare
  _eu uuid := auth.uid();
  _f public.fortnights%rowtype;
  _pendentes int;
  _motivo_limpo text := nullif(btrim(_motivo), '');
  _novo public.fortnight_status;
begin
  if _eu is null or not public.is_admin(_eu) then
    raise exception 'Apenas administradores podem alterar o ciclo da quinzena.' using errcode = '42501';
  end if;

  select * into _f from public.fortnights where id = _fortnight_id for update;
  if not found then
    raise exception 'Quinzena não encontrada.' using errcode = 'P0002';
  end if;

  select count(*) into _pendentes from public.contestations
   where fortnight_id = _fortnight_id and status in ('aberta', 'em_analise');

  if _acao = 'publicar' then
    if _f.status not in ('aberta', 'em_analise') then
      raise exception 'Só é possível publicar uma quinzena aberta.' using errcode = 'P0001';
    end if;
    _novo := 'em_contestacao';
    update public.fortnights
       set status = _novo, publicado_em = now(),
           prazo_contestacao_ate = public.fim_do_dia_fortaleza(public.fim_do_prazo_util(public.hoje_fortaleza(), 2)),
           fechado_em = null, fechado_por = null
     where id = _fortnight_id;

  elsif _acao = 'fechar' then
    if _f.status <> 'em_contestacao' then
      raise exception 'Só é possível fechar uma quinzena em contestação.' using errcode = 'P0001';
    end if;
    if now() <= _f.prazo_contestacao_ate then
      raise exception 'O prazo de contestação vai até %. A quinzena só pode ser fechada depois dele.',
        to_char(_f.prazo_contestacao_ate at time zone 'America/Fortaleza', 'DD/MM "às" HH24:MI')
        using errcode = 'P0001';
    end if;
    if _pendentes > 0 then
      raise exception 'Há % contestação(ões) pendente(s). Responda todas antes de fechar.', _pendentes
        using errcode = 'P0001';
    end if;
    _novo := 'fechada';
    update public.fortnights set status = _novo, fechado_em = now(), fechado_por = _eu where id = _fortnight_id;

  elsif _acao = 'reabrir' then
    if _f.status in ('aberta', 'em_analise') then
      raise exception 'Esta quinzena já está aberta.' using errcode = 'P0001';
    end if;
    if _motivo_limpo is null or length(_motivo_limpo) < 10 then
      raise exception 'Informe o motivo da reabertura (pelo menos 10 caracteres).' using errcode = 'P0001';
    end if;
    if _pendentes > 0 then
      raise exception 'Há % contestação(ões) pendente(s). Responda todas antes de reabrir.', _pendentes
        using errcode = 'P0001';
    end if;
    _novo := 'aberta';
    update public.fortnights
       set status = _novo, publicado_em = null, prazo_contestacao_ate = null, fechado_em = null, fechado_por = null
     where id = _fortnight_id;

  else
    raise exception 'Ação inválida: %.', _acao using errcode = 'P0001';
  end if;

  insert into public.audit_logs (usuario_id, usuario_nome, acao, entidade, registro_id, valor_anterior, valor_novo)
  values (_eu, (select nome from public.employees where user_id = _eu limit 1),
          'quinzena_' || _acao, 'fortnights', _fortnight_id,
          jsonb_build_object('status', _f.status),
          jsonb_build_object('status', _novo, 'motivo', _motivo_limpo,
                             'prazo_contestacao_ate', (select prazo_contestacao_ate from public.fortnights where id = _fortnight_id)));
  return _novo;
end; $$;

revoke all on function public.alterar_ciclo_quinzena(uuid, text, text) from public, anon;
grant execute on function public.alterar_ciclo_quinzena(uuid, text, text) to authenticated;

-- ---------- 8. A quinzena só muda pelo ciclo; nunca é apagada pelo navegador ----------
-- Antes, o ADM podia mudar o status direto (sem regra nem auditoria) e até
-- apagar a quinzena, levando em cascata avaliações, resultados e contestações.
revoke insert, update, delete on public.fortnights from authenticated;
grant insert (ano, mes, tipo, data_inicio, data_fim) on public.fortnights to authenticated;

-- ---------- 9. Regra registrada ----------
insert into public.business_settings (chave, titulo, descricao, valor, pendente)
values ('prazos_contestacao', 'Prazos de contestação',
        'Contestar: 2 dias úteis contando o dia da publicação, até 23h59. Responder: 1 dia útil a partir do dia seguinte, até 23h59; vencido, fica atrasada. Dias úteis: segunda a sexta. Definida em 01/10/2026.',
        jsonb_build_object('dias_uteis_para_contestar', 2, 'conta_dia_da_publicacao', true,
                           'dias_uteis_para_responder', 1, 'conta_dia_do_recebimento', false,
                           'feriados', 'não considerados'),
        false)
on conflict (chave) do nothing;
