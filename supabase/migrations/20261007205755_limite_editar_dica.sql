-- =====================================================================
-- Limite de 10, editar a avaliação e a dica no "Sim" (07/10/2026).
--
--   * O registro recusa a 11ª avaliação (válida) do colaborador na quinzena, de
--     qualquer tipo. O sorteio também para (no servidor).
--   * Uma avaliação registrada pode ser editada, com as regras da exclusão.
--   * A observação passa a ser guardada em QUALQUER resposta (no "Sim", é uma
--     dica), no registro, na edição e no ajuste por contestação. Ela continua
--     obrigatória só no "Não" (a validação compartilhada não muda).
-- As duas funções alteradas partiram das definições em produção (hashes conferidos).
-- =====================================================================
CREATE OR REPLACE FUNCTION public.registrar_avaliacao(_employee_id uuid, _fortnight_id uuid, _tipo evaluation_type, _assunto text, _data_contato date, _link_conversa text, _comentarios text, _respostas jsonb, _processo_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(evaluation_id uuid, nota numeric, total_interacao bigint, total_ticket_n2 bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  _processo_versao int;
  _processo_codigo text;
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

  -- Limite de 10 avaliações (válidas) por colaborador na quinzena, de qualquer tipo
  -- (07/10/2026). A trava faz um registro simultâneo do mesmo colaborador ESPERAR
  -- este terminar, para a contagem nunca passar de 10.
  perform pg_advisory_xact_lock(hashtextextended(_employee_id::text || ':' || _fortnight_id::text, 0));
  if (select count(*) from public.evaluations e
       where e.employee_id = _employee_id and e.fortnight_id = _fortnight_id and not e.anulada) >= 10 then
    raise exception 'Este colaborador já tem 10 avaliações nesta quinzena, o limite. Para registrar outra, exclua uma das existentes.'
      using errcode = 'P0001';
  end if;

  -- Processo da Flukepédia usado na avaliação (opcional): guarda a VERSÃO vigente,
  -- para uma contestação saber com qual regra o contato foi avaliado.
  if _processo_id is not null then
    select versao_atual, codigo into _processo_versao, _processo_codigo
      from public.processos where id = _processo_id and ativo;
    if not found then
      raise exception 'O processo escolhido não está mais na base de processos.' using errcode = 'P0001';
    end if;
  end if;

  begin
    insert into public.evaluations
      (employee_id, fortnight_id, tipo, assunto, data_contato, link_conversa, comentarios,
       versao_ficha, nota, avaliador_id, processo_id, processo_versao)
    values
      (_employee_id, _fortnight_id, _tipo, _assunto_limpo, _data_contato, _link_limpo,
       nullif(btrim(_comentarios), ''), _versao, _nota, _avaliador, _processo_id, _processo_versao)
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
         -- Desde 07/10/2026, qualquer resposta guarda a observação (no Sim, é uma dica);
         -- ela continua obrigatória só no Não.
         nullif(btrim(x ->> 'observacao'), '')
    from jsonb_array_elements(_respostas) x
    join public.evaluation_criteria c on c.id = (x ->> 'criterio_id')::uuid;

  insert into public.audit_logs (usuario_id, usuario_nome, acao, entidade, registro_id, valor_novo)
  values (_avaliador,
          (select nome from public.employees where user_id = _avaliador limit 1),
          'registrar_avaliacao', 'evaluations', _id,
          jsonb_build_object('colaborador', _emp.nome, 'tipo', _tipo, 'assunto', _assunto_limpo,
                             'data_contato', _data_contato, 'nota', _nota, 'versao_ficha', _versao,
                             'processo', _processo_codigo, 'processo_versao', _processo_versao));

  return query
    select _id, _nota,
           count(*) filter (where e.tipo = 'interacao'),
           count(*) filter (where e.tipo = 'ticket_n2')
      from public.evaluations e
     where e.employee_id = _employee_id and e.fortnight_id = _fortnight_id and not e.anulada;
end; $function$;

CREATE OR REPLACE FUNCTION public.responder_contestacao(_contestation_id uuid, _aceitar boolean, _resposta text, _respostas jsonb DEFAULT NULL::jsonb)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  _eu uuid := auth.uid();
  _c public.contestations%rowtype;
  _ev public.evaluations%rowtype;
  _resposta_limpa text := nullif(btrim(_resposta), '');
  _problema text;
  _nova numeric;
  _alteracoes jsonb;
begin
  if _eu is null or not (public.is_admin(_eu) or public.is_avaliador(_eu)) then
    raise exception 'Apenas avaliadores e administradores ativos podem responder contestações.'
      using errcode = '42501';
  end if;

  select * into _c from public.contestations where id = _contestation_id for update;
  if not found then
    raise exception 'Contestação não encontrada.' using errcode = 'P0002';
  end if;
  -- Nunca a própria; avaliador só de colaboradores; ADM de todos.
  if not public.pode_atuar_sobre(_eu, _c.employee_id) then
    raise exception 'Você não pode responder a esta contestação.' using errcode = '42501';
  end if;
  if _c.status not in ('aberta', 'em_analise') then
    raise exception 'Esta contestação já foi respondida.' using errcode = 'P0001';
  end if;
  if _resposta_limpa is null or length(_resposta_limpa) < 10 then
    raise exception 'Escreva a resposta ao colaborador (pelo menos 10 caracteres).' using errcode = 'P0001';
  end if;
  if length(_resposta_limpa) > 2000 then
    raise exception 'A resposta deve ter no máximo 2000 caracteres.' using errcode = 'P0001';
  end if;

  -- Recusar, ou aceitar contestação geral (sem avaliação para ajustar).
  if not _aceitar or _c.evaluation_id is null then
    update public.contestations
       set status = case when _aceitar then 'deferida' else 'indeferida' end::public.contestation_status,
           resolucao = _resposta_limpa, responsavel_id = _eu, respondida_em = now()
     where id = _contestation_id;
    insert into public.audit_logs (usuario_id, usuario_nome, acao, entidade, registro_id, valor_novo)
    values (_eu, (select nome from public.employees where user_id = _eu limit 1),
            case when _aceitar then 'aceitar_contestacao' else 'recusar_contestacao' end,
            'contestations', _contestation_id, jsonb_build_object('resposta', _resposta_limpa));
    return null;
  end if;

  -- Aceitar com ajuste da avaliação.
  select * into _ev from public.evaluations where id = _c.evaluation_id for update;
  if not found or _ev.anulada then
    raise exception 'A avaliação contestada não está mais disponível; recuse explicando o motivo.'
      using errcode = 'P0001';
  end if;
  if _respostas is null or jsonb_typeof(_respostas) <> 'array' then
    raise exception 'Para aceitar, envie a ficha ajustada.' using errcode = 'P0001';
  end if;

  _problema := public.problema_nas_respostas(_respostas, _ev.versao_ficha);
  if _problema is not null then
    raise exception '%', _problema using errcode = 'P0001';
  end if;

  -- O que mudou: critérios cuja RESPOSTA mudou (é o que mexe no apontamento).
  with novo as (
    select (x ->> 'criterio_id')::uuid as criterio_id,
           x ->> 'resposta' as resposta,
           nullif(btrim(x ->> 'observacao'), '') as observacao
      from jsonb_array_elements(_respostas) x
  )
  select jsonb_agg(jsonb_build_object(
           'ordem', c.ordem, 'descricao', c.descricao,
           'antes', jsonb_build_object('resposta', i.resposta, 'desconto', i.desconto, 'observacao', i.observacao),
           'depois', jsonb_build_object('resposta', n.resposta,
                                        'desconto', public.desconto_do_criterio(c.peso, c.peso_medio, n.resposta),
                                        'observacao', n.observacao))
           order by c.ordem)
    into _alteracoes
    from public.evaluation_items i
    join novo n on n.criterio_id = i.criterion_id
    join public.evaluation_criteria c on c.id = i.criterion_id
   where i.evaluation_id = _ev.id and i.resposta is distinct from n.resposta;

  if _alteracoes is null then
    raise exception 'Nenhum critério foi alterado. Para aceitar, ajuste a avaliação; se não houver o que ajustar, recuse.'
      using errcode = 'P0001';
  end if;

  _nova := public.nota_das_respostas(_respostas);

  update public.evaluation_items i
     set resposta = x ->> 'resposta',
         desconto = public.desconto_do_criterio(c.peso, c.peso_medio, x ->> 'resposta'),
         -- Desde 07/10/2026, qualquer resposta guarda a observação (como no registro).
         observacao = nullif(btrim(x ->> 'observacao'), '')
    from jsonb_array_elements(_respostas) x
    join public.evaluation_criteria c on c.id = (x ->> 'criterio_id')::uuid
   where i.evaluation_id = _ev.id and i.criterion_id = c.id;

  update public.evaluations
     set nota = _nova, nota_original = coalesce(nota_original, _ev.nota)
   where id = _ev.id;

  update public.contestations
     set status = 'deferida', resolucao = _resposta_limpa, responsavel_id = _eu, respondida_em = now(),
         nota_anterior = _ev.nota, nota_nova = _nova, alteracoes = _alteracoes
   where id = _contestation_id;

  insert into public.audit_logs (usuario_id, usuario_nome, acao, entidade, registro_id, valor_anterior, valor_novo)
  values (_eu, (select nome from public.employees where user_id = _eu limit 1),
          'aceitar_contestacao', 'contestations', _contestation_id,
          jsonb_build_object('nota', _ev.nota),
          jsonb_build_object('nota', _nova, 'alteracoes', _alteracoes, 'resposta', _resposta_limpa));

  return _nova;
end; $function$;

-- ---------- Editar uma avaliação registrada ----------
-- As MESMAS regras da exclusão: quem fez a avaliação, ou um ADM, e só com a
-- quinzena aberta (depois da publicação, a correção é pela contestação). Não
-- mudam o colaborador, a quinzena, o tipo nem o link (eles definem QUAL contato
-- foi avaliado). A nota é recalculada, e a auditoria guarda o antes e o depois.
create or replace function public.editar_avaliacao(
  _evaluation_id uuid, _assunto text, _data_contato date, _comentarios text,
  _respostas jsonb, _processo_id uuid default null)
returns numeric
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  _eu uuid := auth.uid();
  _ev public.evaluations%rowtype;
  _status public.fortnight_status;
  _assunto_limpo text := nullif(btrim(_assunto), '');
  _hoje date := (now() at time zone 'America/Fortaleza')::date;
  _problema text;
  _nota numeric;
  _processo_versao int;
  _processo_codigo text;
  _antes jsonb;
  _depois jsonb;
begin
  if _eu is null or not (public.is_admin(_eu) or public.is_avaliador(_eu)) then
    raise exception 'Apenas avaliadores e administradores ativos podem editar avaliações.' using errcode = '42501';
  end if;
  select * into _ev from public.evaluations where id = _evaluation_id for update;
  if not found then
    raise exception 'Avaliação não encontrada.' using errcode = 'P0002';
  end if;
  if _ev.anulada then
    raise exception 'Esta avaliação foi excluída e não pode ser editada.' using errcode = 'P0001';
  end if;
  if not public.is_admin(_eu) and _ev.avaliador_id is distinct from _eu then
    raise exception 'Só quem fez a avaliação, ou um ADM, pode editá-la.' using errcode = '42501';
  end if;
  select status into _status from public.fortnights where id = _ev.fortnight_id;
  if _status not in ('aberta', 'em_analise') then
    raise exception 'Esta quinzena não está mais aberta; a avaliação não pode ser editada (para corrigir, use a contestação).'
      using errcode = 'P0001';
  end if;

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
  if _respostas is null or jsonb_typeof(_respostas) <> 'array' then
    raise exception 'As respostas devem ser uma lista.' using errcode = 'P0001';
  end if;
  -- A mesma validação do registro, na versão da ficha em que a avaliação foi feita.
  _problema := public.problema_nas_respostas(_respostas, _ev.versao_ficha);
  if _problema is not null then
    raise exception '%', _problema using errcode = 'P0001';
  end if;
  _nota := public.nota_das_respostas(_respostas);

  -- O processo: o mesmo de antes mantém a versão guardada; um novo pega a vigente.
  if _processo_id is not null and _processo_id is distinct from _ev.processo_id then
    select versao_atual, codigo into _processo_versao, _processo_codigo
      from public.processos where id = _processo_id and ativo;
    if not found then
      raise exception 'O processo escolhido não está mais na base de processos.' using errcode = 'P0001';
    end if;
  elsif _processo_id is not null then
    _processo_versao := _ev.processo_versao;
    select codigo into _processo_codigo from public.processos where id = _processo_id;
  end if;

  _antes := jsonb_build_object(
    'nota', _ev.nota, 'assunto', _ev.assunto, 'data_contato', _ev.data_contato,
    'itens', (select jsonb_agg(jsonb_build_object('ordem', c.ordem, 'resposta', i.resposta, 'observacao', i.observacao) order by c.ordem)
                from public.evaluation_items i join public.evaluation_criteria c on c.id = i.criterion_id
               where i.evaluation_id = _ev.id));

  update public.evaluations
     set assunto = _assunto_limpo, data_contato = _data_contato,
         comentarios = nullif(btrim(_comentarios), ''), nota = _nota,
         processo_id = _processo_id, processo_versao = _processo_versao
   where id = _ev.id;

  delete from public.evaluation_items where evaluation_id = _ev.id;
  insert into public.evaluation_items (evaluation_id, criterion_id, resposta, desconto, observacao)
  select _ev.id, c.id, x ->> 'resposta',
         public.desconto_do_criterio(c.peso, c.peso_medio, x ->> 'resposta'),
         nullif(btrim(x ->> 'observacao'), '')
    from jsonb_array_elements(_respostas) x
    join public.evaluation_criteria c on c.id = (x ->> 'criterio_id')::uuid;

  _depois := jsonb_build_object(
    'colaborador', (select nome from public.employees where id = _ev.employee_id),
    'nota', _nota, 'assunto', _assunto_limpo, 'data_contato', _data_contato, 'processo', _processo_codigo,
    'itens', (select jsonb_agg(jsonb_build_object('ordem', c.ordem, 'resposta', i.resposta, 'observacao', i.observacao) order by c.ordem)
                from public.evaluation_items i join public.evaluation_criteria c on c.id = i.criterion_id
               where i.evaluation_id = _ev.id));
  insert into public.audit_logs (usuario_id, usuario_nome, acao, entidade, registro_id, valor_anterior, valor_novo)
  values (_eu, (select nome from public.employees where user_id = _eu limit 1),
          'editar_avaliacao', 'evaluations', _ev.id, _antes, _depois);
  return _nota;
end; $$;
revoke all on function public.editar_avaliacao(uuid, text, date, text, jsonb, uuid) from public, anon;
grant execute on function public.editar_avaliacao(uuid, text, date, text, jsonb, uuid) to authenticated;
