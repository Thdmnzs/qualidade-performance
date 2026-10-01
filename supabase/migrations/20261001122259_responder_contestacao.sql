-- =====================================================================
-- Resposta às contestações (etapa 4).
--
-- Regras (01/10/2026):
--   * Responde quem pode_atuar_sobre() o colaborador: avaliadores respondem
--     as de colaboradores; o ADM responde todas; ninguém responde a própria.
--   * Resposta obrigatória (10 a 2000 caracteres) para aceitar e recusar.
--   * Aceitar = ajustar no mesmo passo: a ficha é corrigida, a nota é
--     recalculada e o antes/depois fica guardado na contestação.
--   * Aceitar exige alterar a resposta de pelo menos um critério.
--   * O colaborador não vê quem respondeu (responsavel_id oculto).
--   * "Nota anterior" = nota original do registro (nota_original).
--
-- Também: validação e cálculo da ficha extraídos para funções únicas,
-- usadas pelo registro e pelo ajuste (antes, uma cópia em cada lugar).
-- =====================================================================

-- ---------- 1. Funções compartilhadas da ficha ----------
create or replace function public.desconto_do_criterio(_peso numeric, _peso_medio numeric, _resposta text)
returns numeric language sql immutable as $$
  select case _resposta when 'nao' then _peso when 'medio' then coalesce(_peso_medio, 0) else 0 end
$$;

-- Primeiro problema das respostas, na ordem da ficha (ou null se estiver tudo certo).
-- _versao: a ficha a usar (no registro, a vigente; no ajuste, a da avaliação).
create or replace function public.problema_nas_respostas(_respostas jsonb, _versao int)
returns text language sql stable security definer set search_path = public as $$
  with r as (
    select (x ->> 'criterio_id')::uuid as criterio_id,
           x ->> 'resposta' as resposta,
           nullif(btrim(x ->> 'observacao'), '') as observacao
      from jsonb_array_elements(_respostas) x
  ),
  ficha as (
    select * from public.evaluation_criteria where versao = _versao
  )
  select problema from (
    select f.ordem, format('Responda o critério %s. %s', f.ordem, f.descricao) as problema
      from ficha f where not exists (select 1 from r where r.criterio_id = f.id)
    union all
    select 0, 'Há respostas para critérios que não pertencem à ficha de avaliação.'
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
  limit 1
$$;

-- Nota = 100 − soma dos descontos, nunca negativa (especificação, seção 11).
create or replace function public.nota_das_respostas(_respostas jsonb)
returns numeric language sql stable security definer set search_path = public as $$
  select greatest(0, 100 - coalesce(sum(public.desconto_do_criterio(c.peso, c.peso_medio, x ->> 'resposta')), 0))
    from jsonb_array_elements(_respostas) x
    join public.evaluation_criteria c on c.id = (x ->> 'criterio_id')::uuid
$$;

revoke all on function public.desconto_do_criterio(numeric, numeric, text) from public, anon, authenticated;
revoke all on function public.problema_nas_respostas(jsonb, int) from public, anon, authenticated;
revoke all on function public.nota_das_respostas(jsonb) from public, anon, authenticated;

-- ---------- 2. Registro de avaliação usando as funções compartilhadas ----------
-- Mesmo comportamento de antes (coberto pelas baterias de teste).
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

-- ---------- 3. Colunas do antes/depois ----------
alter table public.evaluations add column nota_original numeric;
alter table public.contestations
  add column nota_anterior numeric,
  add column nota_nova numeric,
  add column alteracoes jsonb;

-- O colaborador lê a nota original da própria avaliação.
grant select (nota_original) on public.evaluations to authenticated;

-- ---------- 4. Contestações: quem respondeu fica oculto; resposta só pela função ----------
revoke select, update, delete on public.contestations from anon, authenticated;
grant select (id, employee_id, fortnight_id, result_id, evaluation_id, assunto, descricao, status,
              resolucao, respondida_em, created_at, updated_at, nota_anterior, nota_nova, alteracoes)
  on public.contestations to authenticated;

-- ---------- 5. Responder (aceitar com ajuste, ou recusar) ----------
-- _respostas: a ficha completa ajustada (mesmo formato do registro).
-- Retorna a nova nota quando uma avaliação foi ajustada.
create or replace function public.responder_contestacao(
  _contestation_id uuid, _aceitar boolean, _resposta text, _respostas jsonb default null)
returns numeric
language plpgsql security definer set search_path = public as $$
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
           case when x ->> 'resposta' = 'nao' then nullif(btrim(x ->> 'observacao'), '') end as observacao
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
         observacao = case when x ->> 'resposta' = 'nao' then nullif(btrim(x ->> 'observacao'), '') end
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
end; $$;

revoke all on function public.responder_contestacao(uuid, boolean, text, jsonb) from public, anon;
grant execute on function public.responder_contestacao(uuid, boolean, text, jsonb) to authenticated;
