-- =====================================================================
-- Exclusão definitiva de colaborador (regra de negócio de 01/10/2026).
--
-- Decisão do responsável: colaboradores desligados não devem ficar no
-- sistema. Substitui a regra anterior ("colaboradores com histórico nunca
-- são excluídos, apenas inativados").
--
-- Proteções:
--   * só ADM ativo; só colaborador INATIVO; nunca a si mesmo;
--   * confirmação digitando o nome completo;
--   * tudo numa transação (não existe exclusão pela metade);
--   * fica um registro na auditoria: quem excluiu, quando e quantos
--     registros foram apagados, SEM dados pessoais do excluído.
--
-- O que é dele é apagado (cascata a partir de employees). O que ele fez
-- para OUTROS (ex.: avaliações que fez como avaliador) continua existindo,
-- com a autoria desligada ("Avaliador removido").
-- =====================================================================

-- ---------- 1. Resumo do que será apagado ----------
-- Fonte única da contagem: a tela mostra exatamente o que a exclusão apaga.
-- Interna (sem checagem de auth.uid(), que é nula quando quem chama é o servidor).
create or replace function public.resumo_exclusao_colaborador_interno(_employee_id uuid)
returns table (
  avaliacoes bigint, contestacoes bigint, resultados bigint, quiz bigint,
  rankings bigint, elegibilidades bigint, avaliacoes_feitas_para_outros bigint
)
language sql stable security definer set search_path = public as $$
  select
    (select count(*) from public.evaluations where employee_id = e.id),
    (select count(*) from public.contestations where employee_id = e.id),
    (select count(*) from public.results where employee_id = e.id),
    (select count(*) from public.quiz_results where employee_id = e.id),
    (select count(*) from public.rankings where employee_id = e.id),
    (select count(*) from public.bonus_eligibility where employee_id = e.id),
    (select count(*) from public.evaluations where avaliador_id = e.user_id and employee_id <> e.id)
  from public.employees e
  where e.id = _employee_id
$$;

-- Versão para a tela: a mesma contagem, só para ADM.
create or replace function public.resumo_exclusao_colaborador(_employee_id uuid)
returns table (
  avaliacoes bigint, contestacoes bigint, resultados bigint, quiz bigint,
  rankings bigint, elegibilidades bigint, avaliacoes_feitas_para_outros bigint
)
language sql stable security definer set search_path = public as $$
  select * from public.resumo_exclusao_colaborador_interno(_employee_id)
   where public.is_admin(auth.uid())
$$;

revoke all on function public.resumo_exclusao_colaborador_interno(uuid) from public, anon, authenticated;
revoke all on function public.resumo_exclusao_colaborador(uuid) from public, anon;
grant execute on function public.resumo_exclusao_colaborador(uuid) to authenticated;

-- ---------- 2. Exclusão definitiva (só o servidor chama) ----------
-- Recebe _chamador porque roda com a chave de serviço; por isso NÃO é
-- exposta ao navegador. Retorna o user_id para o servidor apagar o acesso.
create or replace function public.excluir_colaborador_definitivo(
  _employee_id uuid, _confirmacao text, _chamador uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  _emp public.employees%rowtype;
  _perfil public.app_role;
  _resumo jsonb;
  _avaliacoes uuid[];
  _contestacoes uuid[];
begin
  if _chamador is null or not public.is_admin(_chamador) then
    raise exception 'Apenas administradores ativos podem excluir colaboradores.' using errcode = '42501';
  end if;

  select * into _emp from public.employees where id = _employee_id for update;
  if not found then
    raise exception 'Colaborador não encontrado.' using errcode = 'P0002';
  end if;
  if _emp.user_id is not distinct from _chamador then
    raise exception 'Você não pode excluir o seu próprio cadastro.' using errcode = '42501';
  end if;
  if _emp.status <> 'inativo' then
    raise exception 'Inative o colaborador antes de excluí-lo.' using errcode = 'P0001';
  end if;
  if lower(btrim(coalesce(_confirmacao, ''))) <> lower(btrim(_emp.nome)) then
    raise exception 'A confirmação não confere. Digite o nome completo do colaborador.' using errcode = 'P0001';
  end if;

  _perfil := public.perfil_do_usuario(_emp.user_id);
  select to_jsonb(r) into _resumo
    from (select * from public.resumo_exclusao_colaborador_interno(_employee_id)) r;

  -- Auditoria SOBRE ele (o cadastro, as avaliações e as contestações dele) sai junto.
  select coalesce(array_agg(id), '{}') into _avaliacoes from public.evaluations where employee_id = _employee_id;
  select coalesce(array_agg(id), '{}') into _contestacoes from public.contestations where employee_id = _employee_id;
  delete from public.audit_logs
   where registro_id = _employee_id
      or registro_id = any(_avaliacoes)
      or registro_id = any(_contestacoes);

  -- O que ele fez para outros continua, sem autoria.
  if _emp.user_id is not null then
    update public.evaluations set avaliador_id = null where avaliador_id = _emp.user_id;
    update public.evaluations set anulada_por = null where anulada_por = _emp.user_id;
    update public.quiz_results set registrado_por = null where registrado_por = _emp.user_id;
    update public.contestations set responsavel_id = null where responsavel_id = _emp.user_id;
    update public.contestation_messages set autor_id = null where autor_id = _emp.user_id;
    update public.data_imports set enviado_por = null where enviado_por = _emp.user_id;
    update public.csat_reports set enviado_por = null where enviado_por = _emp.user_id;
    update public.fortnights set fechado_por = null where fechado_por = _emp.user_id;
    update public.audit_logs set usuario_id = null, usuario_nome = 'Usuário removido'
     where usuario_id = _emp.user_id;
    delete from public.user_roles where user_id = _emp.user_id;
  end if;

  -- O cadastro sai, e com ele (cascata) avaliações e itens, contestações e
  -- mensagens, resultados, quiz, ranking, elegibilidade e notificações.
  delete from public.employees where id = _employee_id;

  insert into public.audit_logs (usuario_id, usuario_nome, acao, entidade, registro_id, valor_anterior)
  values (_chamador,
          (select nome from public.employees where user_id = _chamador limit 1),
          'excluir_colaborador', 'employees', _employee_id,
          jsonb_build_object('perfil', _perfil, 'registros_apagados', _resumo));

  return _emp.user_id;
end; $$;

revoke all on function public.excluir_colaborador_definitivo(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.excluir_colaborador_definitivo(uuid, text, uuid) to service_role;

-- A frase da regra antiga, que a tela exibia, deixa de valer.
comment on table public.employees is
  'Colaboradores. Inativar bloqueia o acesso; excluir (só inativos, só ADM) apaga a pessoa e tudo que é dela.';
