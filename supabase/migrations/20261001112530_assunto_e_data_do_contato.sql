-- =====================================================================
-- Avaliação: "Assunto" e "Data do contato" no lugar de "Ticket".
--
-- Regras de negócio (01/10/2026):
--   * Assunto e data do contato são obrigatórios.
--   * A data do contato pode ser qualquer data até hoje.
--   * A mesma conversa (link) não pode ser avaliada duas vezes para a
--     mesma pessoa na mesma quinzena. Antes, essa proteção era pelo ticket.
--
-- As colunas assunto e data_contato já existiam. A obrigatoriedade fica na
-- função de registro (o único caminho de escrita), e não na tabela: as
-- avaliações antigas não têm esses campos, e uma restrição na tabela faria
-- até a exclusão delas falhar. A coluna ticket fica, sem uso, por histórico.
-- =====================================================================

-- ---------- 1. Regra definida ----------
update public.business_settings
   set pendente = false,
       valor = jsonb_build_object('obrigatorios', jsonb_build_array('assunto', 'data_contato'),
                                  'data_contato', 'qualquer data até hoje'),
       descricao = 'Assunto e data do contato obrigatórios; data até hoje. Definida em 01/10/2026.',
       versao = versao + 1
 where chave = 'avaliacao_campos_obrigatorios';

-- ---------- 2. Proteção contra duplicidade pelo link ----------
create unique index uq_eval_link_conversa
  on public.evaluations (employee_id, fortnight_id, link_conversa)
  where link_conversa is not null and not anulada;

-- ---------- 3. Registro da avaliação com os novos campos ----------
-- A assinatura muda (sai _ticket, entram _assunto e _data_contato), então
-- a função antiga é removida e a nova é criada.
drop function public.registrar_avaliacao(uuid, uuid, public.evaluation_type, text, text, text, jsonb);

create function public.registrar_avaliacao(
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
  if _status_quinzena = 'fechada' then
    raise exception 'Esta quinzena está fechada; avaliações não podem mais ser registradas.'
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

  -- Validação das respostas contra a ficha, numa única consulta.
  -- A primeira regra violada (na ordem dos critérios) vira a mensagem.
  with r as (
    select (x ->> 'criterio_id')::uuid as criterio_id,
           x ->> 'resposta' as resposta,
           nullif(btrim(x ->> 'observacao'), '') as observacao
      from jsonb_array_elements(_respostas) x
  ),
  ficha as (
    select * from public.evaluation_criteria where ativo and versao = _versao
  )
  select problema into _problema from (
    select f.ordem, format('Responda o critério %s. %s', f.ordem, f.descricao) as problema
      from ficha f where not exists (select 1 from r where r.criterio_id = f.id)
    union all
    select 0, 'Há respostas para critérios que não pertencem à ficha atual.'
      from r where not exists (select 1 from ficha f where f.id = r.criterio_id)
    union all
    select min(f.ordem), format('O critério %s foi respondido mais de uma vez.', min(f.ordem))
      from r join ficha f on f.id = r.criterio_id group by r.criterio_id having count(*) > 1
    union all
    select f.ordem, format('Resposta inválida no critério %s.', f.ordem)
      from r join ficha f on f.id = r.criterio_id
     where r.resposta is null or r.resposta not in ('sim', 'medio', 'nao')
    union all
    select f.ordem, format('O critério %s não aceita "Médio".', f.ordem)
      from r join ficha f on f.id = r.criterio_id
     where r.resposta = 'medio' and not f.permite_medio
    union all
    select f.ordem, format('Justifique o critério %s. %s, marcado como "Não".', f.ordem, f.descricao)
      from r join ficha f on f.id = r.criterio_id
     where r.resposta = 'nao' and r.observacao is null
  ) problemas
  order by ordem
  limit 1;

  if _problema is not null then
    raise exception '%', _problema using errcode = 'P0001';
  end if;

  -- Nota = 100 − soma dos descontos, nunca negativa (especificação, seção 11).
  select greatest(0, 100 - coalesce(sum(
           case x ->> 'resposta'
             when 'nao' then c.peso
             when 'medio' then coalesce(c.peso_medio, 0)
             else 0
           end), 0))
    into _nota
    from jsonb_array_elements(_respostas) x
    join public.evaluation_criteria c on c.id = (x ->> 'criterio_id')::uuid;

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
         case x ->> 'resposta' when 'nao' then c.peso when 'medio' then coalesce(c.peso_medio, 0) else 0 end,
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

revoke all on function public.registrar_avaliacao(uuid, uuid, public.evaluation_type, text, date, text, text, jsonb)
  from public, anon;
grant execute on function public.registrar_avaliacao(uuid, uuid, public.evaluation_type, text, date, text, text, jsonb)
  to authenticated;

-- ---------- 4. Lista da gestão com assunto e data do contato ----------
-- O formato de retorno muda, então a função é recriada.
drop function public.listar_avaliacoes_gestao(uuid);

create function public.listar_avaliacoes_gestao(_fortnight_id uuid default null)
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
         not public.fortnight_is_closed(ev.fortnight_id)
           and (public.is_admin(auth.uid()) or ev.avaliador_id = auth.uid())
    from public.evaluations ev
    join public.employees emp on emp.id = ev.employee_id
    left join public.employees av on av.user_id = ev.avaliador_id
   where not ev.anulada
     and public.pode_atuar_sobre(auth.uid(), ev.employee_id)
     and (_fortnight_id is null or ev.fortnight_id = _fortnight_id)
   order by emp.nome, ev.created_at desc
$$;

revoke all on function public.listar_avaliacoes_gestao(uuid) from public, anon;
grant execute on function public.listar_avaliacoes_gestao(uuid) to authenticated;

-- ---------- 5. Auditoria da exclusão de avaliação mostra o assunto ----------
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
  if public.fortnight_is_closed(_ev.fortnight_id) then
    raise exception 'Esta quinzena está fechada; a avaliação não pode mais ser excluída.'
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
