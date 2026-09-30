-- =====================================================================
-- Etapa 3: perfil Avaliador e avaliação registrada pelo banco.
--
-- PARTE A — Perfis (regra de negócio definida em 30/09/2026)
--   * "Gestor" passa a se chamar "Avaliador".
--   * O avaliador também é colaborador: mesma conta, duas áreas.
--   * Avaliador avalia e responde contestações de COLABORADORES; nunca as
--     próprias, nunca de outro avaliador. Avaliadores são avaliados só por ADM.
--   * Ranking, visão geral, cadastro, acessos e fechamento: só ADM.
--
-- Técnica: is_admin() passa a significar "ADM ativo". Como quase todas as
-- policies usam is_admin(), o avaliador perde tudo de uma vez, e recebe de
-- volta SÓ o necessário, por policies específicas (menor privilégio).
--
-- PARTE B — Avaliação registrada e calculada pelo banco (ver abaixo).
-- =====================================================================

-- ---------- A1. Renomeia o valor do enum ----------
-- Seguro agora: nenhum usuário tem esse perfil. As funções que comparam com
-- o texto 'gestor' são recriadas logo abaixo.
alter type public.app_role rename value 'gestor' to 'avaliador';

-- ---------- A2. Funções de perfil ----------
create or replace function public.perfil_do_usuario(_user_id uuid)
returns public.app_role
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select ur.role
       from public.user_roles ur
      where ur.user_id = _user_id
      order by case ur.role when 'adm' then 1 when 'avaliador' then 2 else 3 end
      limit 1),
    'colaborador'::public.app_role
  )
$$;

-- ADM ativo. (Antes: ADM ou gestor.) Todas as policies de gestão usam esta função.
create or replace function public.is_admin(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
      from public.user_roles ur
      join public.employees e on e.user_id = ur.user_id
     where ur.user_id = _user_id and ur.role = 'adm' and e.status = 'ativo'
  )
$$;

-- Avaliador ativo.
create or replace function public.is_avaliador(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
      from public.user_roles ur
      join public.employees e on e.user_id = ur.user_id
     where ur.user_id = _user_id and ur.role = 'avaliador' and e.status = 'ativo'
  )
$$;

-- Regra central: _uid pode avaliar / ver avaliações / marcar quiz /
-- ver e responder contestações do colaborador _employee_id?
--   * nunca sobre si mesmo;
--   * ADM: sobre colaboradores e avaliadores;
--   * avaliador: só sobre colaboradores.
create or replace function public.pode_atuar_sobre(_uid uuid, _employee_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select case
             when _uid is null or e.user_id is not distinct from _uid then false
             when public.is_admin(_uid)
               then public.perfil_do_usuario(e.user_id) in ('colaborador', 'avaliador')
             when public.is_avaliador(_uid)
               then public.perfil_do_usuario(e.user_id) = 'colaborador'
             else false
           end
      from public.employees e
     where e.id = _employee_id
  ), false)
$$;

-- Quem o usuário logado pode avaliar (para a tela de avaliações).
create or replace function public.listar_avaliaveis()
returns table (id uuid, nome text, perfil public.app_role)
language sql stable security definer set search_path = public as $$
  select e.id, e.nome, public.perfil_do_usuario(e.user_id)
    from public.employees e
   where e.status = 'ativo' and public.pode_atuar_sobre(auth.uid(), e.id)
   order by e.nome
$$;

-- ---------- A3. Mensagens que citavam "gestores" ----------
create or replace function public.definir_perfil(_employee_id uuid, _perfil public.app_role)
returns public.app_role
language plpgsql security definer set search_path = public as $$
declare
  _chamador uuid := auth.uid();
  _alvo uuid;
  _perfil_atual public.app_role;
begin
  if _chamador is null or not public.is_admin(_chamador) then
    raise exception 'Apenas administradores podem alterar perfis.' using errcode = '42501';
  end if;

  select e.user_id into _alvo from public.employees e where e.id = _employee_id;
  if not found then
    raise exception 'Colaborador não encontrado.' using errcode = 'P0002';
  end if;
  if _alvo is null then
    raise exception 'Este colaborador ainda não tem acesso à plataforma. Crie o acesso antes de definir o perfil.'
      using errcode = 'P0001';
  end if;
  if _alvo = _chamador then
    raise exception 'Você não pode alterar o seu próprio perfil.' using errcode = '42501';
  end if;

  _perfil_atual := public.perfil_do_usuario(_alvo);
  if _perfil_atual = _perfil then
    return _perfil;
  end if;

  delete from public.user_roles where user_id = _alvo;
  insert into public.user_roles (user_id, role) values (_alvo, _perfil);

  insert into public.audit_logs (usuario_id, usuario_nome, acao, entidade, registro_id, valor_anterior, valor_novo)
  values (
    _chamador,
    (select nome from public.employees where user_id = _chamador limit 1),
    'alterar_perfil', 'employees', _employee_id,
    jsonb_build_object('perfil', _perfil_atual),
    jsonb_build_object('perfil', _perfil)
  );

  return _perfil;
end;
$$;

create or replace function public.validar_gestao_de_acesso(_employee_id uuid, _chamador uuid)
returns public.app_role
language plpgsql stable security definer set search_path = public as $$
declare
  _alvo_user uuid;
begin
  if _chamador is null or not public.is_admin(_chamador) then
    raise exception 'Apenas administradores ativos podem gerenciar acessos.' using errcode = '42501';
  end if;

  select e.user_id into _alvo_user from public.employees e where e.id = _employee_id;
  if not found then
    raise exception 'Colaborador não encontrado.' using errcode = 'P0002';
  end if;

  if _alvo_user = _chamador then
    raise exception 'Você não pode alterar o seu próprio acesso.' using errcode = '42501';
  end if;

  return public.perfil_do_usuario(_alvo_user);
end; $$;

-- ---------- A4. O que o avaliador recebe de volta ----------
-- Policies do Postgres são permissivas: basta UMA liberar. Por isso estas
-- somam às existentes sem alterá-las.
create policy "employees_avaliador_read" on public.employees for select to authenticated
  using (public.pode_atuar_sobre(auth.uid(), id));

create policy "evaluations_avaliador_read" on public.evaluations for select to authenticated
  using (public.pode_atuar_sobre(auth.uid(), employee_id));

create policy "eval_items_avaliador_read" on public.evaluation_items for select to authenticated
  using (exists (select 1 from public.evaluations e
                  where e.id = evaluation_id and public.pode_atuar_sobre(auth.uid(), e.employee_id)));

create policy "quiz_avaliador_read" on public.quiz_results for select to authenticated
  using (public.pode_atuar_sobre(auth.uid(), employee_id));
create policy "quiz_avaliador_insert" on public.quiz_results for insert to authenticated
  with check (public.pode_atuar_sobre(auth.uid(), employee_id));
create policy "quiz_avaliador_update" on public.quiz_results for update to authenticated
  using (public.pode_atuar_sobre(auth.uid(), employee_id))
  with check (public.pode_atuar_sobre(auth.uid(), employee_id));

-- Contestações: leitura agora; a resposta (com a regra "nunca a própria")
-- entra na etapa de contestações, usando a mesma pode_atuar_sobre().
create policy "contest_avaliador_read" on public.contestations for select to authenticated
  using (public.pode_atuar_sobre(auth.uid(), employee_id));
create policy "contest_msg_avaliador_read" on public.contestation_messages for select to authenticated
  using (exists (select 1 from public.contestations c
                  where c.id = contestation_id and public.pode_atuar_sobre(auth.uid(), c.employee_id)));

revoke all on function public.is_avaliador(uuid) from public, anon;
revoke all on function public.pode_atuar_sobre(uuid, uuid) from public, anon;
revoke all on function public.listar_avaliaveis() from public, anon;
grant execute on function public.is_avaliador(uuid) to authenticated;
grant execute on function public.pode_atuar_sobre(uuid, uuid) to authenticated;
grant execute on function public.listar_avaliaveis() to authenticated;

-- =====================================================================
-- PARTE B — Avaliação registrada e calculada pelo banco.
--
-- Antes: o navegador calculava a nota e gravava avaliação e itens em duas
-- requisições. Agora registrar_avaliacao() recebe só as RESPOSTAS, valida,
-- calcula a nota e grava tudo numa transação. É o único caminho de escrita.
-- =====================================================================

-- ---------- B1. Regra de negócio definida em 30/09/2026 ----------
-- Justificativa obrigatória quando um critério é marcado como "Não".
update public.business_settings
   set pendente = false,
       valor = jsonb_build_object('obrigatoria_quando', jsonb_build_array('nao')),
       descricao = 'Justificativa obrigatória quando o critério é marcado como "Não". Definida em 30/09/2026.',
       versao = versao + 1
 where chave = 'avaliacao_justificativa_obrigatoria';

-- ---------- B2. Registro da avaliação ----------
-- _respostas: [{"criterio_id": uuid, "resposta": "sim"|"medio"|"nao", "observacao": texto}, ...]
-- O avaliador é auth.uid(): a identidade vem do token, não de um parâmetro.
-- Por isso esta função PODE ser chamada pelo navegador.
create or replace function public.registrar_avaliacao(
  _employee_id uuid,
  _fortnight_id uuid,
  _tipo public.evaluation_type,
  _ticket text,
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
  _ticket_limpo text := nullif(btrim(_ticket), '');
  _link_limpo text := nullif(btrim(_link_conversa), '');
  _problema text;
  _nota numeric;
  _id uuid;
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
    -- critério da ficha sem resposta
    select f.ordem, format('Responda o critério %s. %s', f.ordem, f.descricao) as problema
      from ficha f where not exists (select 1 from r where r.criterio_id = f.id)
    union all
    -- resposta para critério que não é da ficha vigente
    select 0, 'Há respostas para critérios que não pertencem à ficha atual.'
      from r where not exists (select 1 from ficha f where f.id = r.criterio_id)
    union all
    -- critério respondido mais de uma vez
    select min(f.ordem), format('O critério %s foi respondido mais de uma vez.', min(f.ordem))
      from r join ficha f on f.id = r.criterio_id group by r.criterio_id having count(*) > 1
    union all
    -- valor inválido
    select f.ordem, format('Resposta inválida no critério %s.', f.ordem)
      from r join ficha f on f.id = r.criterio_id
     where r.resposta is null or r.resposta not in ('sim', 'medio', 'nao')
    union all
    -- "Médio" onde não é permitido
    select f.ordem, format('O critério %s não aceita "Médio".', f.ordem)
      from r join ficha f on f.id = r.criterio_id
     where r.resposta = 'medio' and not f.permite_medio
    union all
    -- "Não" sem justificativa (regra de negócio)
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
      (employee_id, fortnight_id, tipo, ticket, link_conversa, comentarios, versao_ficha, nota, avaliador_id)
    values
      (_employee_id, _fortnight_id, _tipo, _ticket_limpo, _link_limpo,
       nullif(btrim(_comentarios), ''), _versao, _nota, _avaliador)
    returning id into _id;
  exception when unique_violation then
    raise exception 'O ticket % já foi avaliado para este colaborador nesta quinzena.', _ticket_limpo
      using errcode = 'P0001';
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
          jsonb_build_object('colaborador', _emp.nome, 'tipo', _tipo, 'ticket', _ticket_limpo,
                             'nota', _nota, 'versao_ficha', _versao));

  -- Totais da quinzena, para a tela avisar quando passar do previsto (6 + 4).
  return query
    select _id, _nota,
           count(*) filter (where e.tipo = 'interacao'),
           count(*) filter (where e.tipo = 'ticket_n2')
      from public.evaluations e
     where e.employee_id = _employee_id and e.fortnight_id = _fortnight_id and not e.anulada;
end; $$;

revoke all on function public.registrar_avaliacao(uuid, uuid, public.evaluation_type, text, text, text, jsonb)
  from public, anon;
grant execute on function public.registrar_avaliacao(uuid, uuid, public.evaluation_type, text, text, text, jsonb)
  to authenticated;

-- ---------- B3. Único caminho de escrita ----------
-- Edição e anulação ainda são regras pendentes na especificação; até lá,
-- avaliações não são alteradas pelo navegador.
revoke insert, update, delete on public.evaluations from authenticated;
revoke insert, update, delete on public.evaluation_items from authenticated;
