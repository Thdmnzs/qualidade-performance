-- =====================================================================
-- Etapa 2: ciclo de acesso dos colaboradores.
--
-- 1. Normaliza e valida e-mail e login.
-- 2. is_admin() passa a exigir colaborador ATIVO (antes, gestor inativado
--    continuava com todos os poderes).
-- 3. Colunas sensíveis de employees (status, user_id) deixam de ser
--    graváveis pelo navegador; só mudam pelas funções abaixo.
-- 4. Funções usadas pelo servidor (chave de serviço) para criar acesso,
--    gerar link de senha e inativar/reativar, com as regras no banco.
-- =====================================================================

-- ---------- 1. Normalização dos dados existentes ----------
update public.employees
   set email = lower(btrim(email))
 where email is distinct from lower(btrim(email));

-- "Thiago Dantas" -> "thiago.dantas": minúsculas, espaços viram ponto,
-- demais caracteres fora do padrão são removidos.
update public.employees
   set login = regexp_replace(regexp_replace(lower(btrim(login)), '\s+', '.', 'g'), '[^a-z0-9._-]', '', 'g')
 where login !~ '^[a-z0-9._-]{3,50}$';

-- ---------- 2. Validações ----------
alter table public.employees alter column email set not null;

alter table public.employees
  add constraint employees_email_formato
  check (email = lower(btrim(email)) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$');

alter table public.employees
  add constraint employees_login_formato
  check (login ~ '^[a-z0-9._-]{3,50}$');

create unique index employees_email_unico on public.employees (email);

-- E-mail de quem já tem acesso é o e-mail de login no Supabase Auth.
-- Mudar só aqui faria os dois divergirem, então bloqueamos.
create or replace function public.impedir_troca_email_com_acesso()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.email is distinct from old.email and old.user_id is not null then
    raise exception 'Não é possível alterar o e-mail de quem já tem acesso à plataforma.'
      using errcode = 'P0001';
  end if;
  return new;
end; $$;

create trigger trg_employees_email_com_acesso
  before update of email on public.employees
  for each row execute function public.impedir_troca_email_com_acesso();

-- ---------- 3. is_admin exige colaborador ativo ----------
create or replace function public.is_admin(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
      from public.user_roles ur
      join public.employees e on e.user_id = ur.user_id
     where ur.user_id = _user_id
       and ur.role in ('adm', 'gestor')
       and e.status = 'ativo'
  )
$$;

-- ---------- 4. Colunas graváveis pelo navegador ----------
-- Privilégio por coluna: o RLS decide QUAIS linhas; o GRANT decide QUAIS colunas.
revoke insert, update, delete on public.employees from authenticated;
grant insert (nome, login, email, foto_url) on public.employees to authenticated;
grant update (nome, login, email, foto_url) on public.employees to authenticated;
-- Sem DELETE: colaborador com histórico nunca é excluído, só inativado.

-- ---------- 5. Regra comum de permissão sobre um colaborador ----------
-- Valida se _chamador pode administrar o acesso de _employee_id.
-- Retorna o perfil efetivo atual do alvo.
create or replace function public.validar_gestao_de_acesso(_employee_id uuid, _chamador uuid)
returns public.app_role
language plpgsql stable security definer set search_path = public as $$
declare
  _alvo_user uuid;
  _perfil_alvo public.app_role;
begin
  if _chamador is null or not public.is_admin(_chamador) then
    raise exception 'Apenas gestores e administradores ativos podem gerenciar acessos.'
      using errcode = '42501';
  end if;

  select e.user_id into _alvo_user from public.employees e where e.id = _employee_id;
  if not found then
    raise exception 'Colaborador não encontrado.' using errcode = 'P0002';
  end if;

  if _alvo_user = _chamador then
    raise exception 'Você não pode alterar o seu próprio acesso.' using errcode = '42501';
  end if;

  _perfil_alvo := public.perfil_do_usuario(_alvo_user);
  if _perfil_alvo = 'adm' and public.perfil_do_usuario(_chamador) <> 'adm' then
    raise exception 'Apenas administradores podem gerenciar o acesso de um ADM.'
      using errcode = '42501';
  end if;

  return _perfil_alvo;
end; $$;

-- ---------- 6. Criação de acesso (duas fases) ----------
-- Fase 1: valida tudo ANTES de criar o usuário no Auth. Retorna o e-mail.
create or replace function public.preparar_criacao_acesso(
  _employee_id uuid, _perfil public.app_role, _chamador uuid)
returns text
language plpgsql stable security definer set search_path = public as $$
declare
  _emp public.employees%rowtype;
begin
  perform public.validar_gestao_de_acesso(_employee_id, _chamador);
  select * into _emp from public.employees where id = _employee_id;

  if _emp.user_id is not null then
    raise exception 'Este colaborador já tem acesso. Use "Link de senha" para enviar um novo link.'
      using errcode = 'P0001';
  end if;
  if _emp.status <> 'ativo' then
    raise exception 'Reative o colaborador antes de criar o acesso.' using errcode = 'P0001';
  end if;
  if _perfil = 'adm' and public.perfil_do_usuario(_chamador) <> 'adm' then
    raise exception 'Apenas administradores podem conceder o perfil ADM.' using errcode = '42501';
  end if;

  return _emp.email;
end; $$;

-- Fase 2: depois que o servidor criou o usuário no Auth, vincula e define o
-- perfil numa única transação. Revalida, porque o estado pode ter mudado.
create or replace function public.vincular_acesso(
  _employee_id uuid, _user_id uuid, _perfil public.app_role, _chamador uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  _email text;
begin
  _email := public.preparar_criacao_acesso(_employee_id, _perfil, _chamador);

  if exists (select 1 from public.employees where user_id = _user_id) then
    raise exception 'Este usuário já está vinculado a outro colaborador.' using errcode = 'P0001';
  end if;

  update public.employees set user_id = _user_id where id = _employee_id and user_id is null;
  if not found then
    raise exception 'O colaborador foi alterado durante a operação. Tente novamente.'
      using errcode = 'P0001';
  end if;

  delete from public.user_roles where user_id = _user_id;
  insert into public.user_roles (user_id, role) values (_user_id, _perfil);

  insert into public.audit_logs (usuario_id, usuario_nome, acao, entidade, registro_id, valor_novo)
  values (_chamador,
          (select nome from public.employees where user_id = _chamador limit 1),
          'criar_acesso', 'employees', _employee_id,
          jsonb_build_object('email', _email, 'perfil', _perfil));
end; $$;

-- ---------- 7. Link de redefinição de senha ----------
-- Um gestor que gerasse o link de um ADM poderia assumir a conta dele;
-- por isso a mesma regra de hierarquia vale aqui.
create or replace function public.preparar_link_senha(_employee_id uuid, _chamador uuid)
returns text
language plpgsql security definer set search_path = public as $$
declare
  _emp public.employees%rowtype;
begin
  perform public.validar_gestao_de_acesso(_employee_id, _chamador);
  select * into _emp from public.employees where id = _employee_id;

  if _emp.user_id is null then
    raise exception 'Este colaborador ainda não tem acesso. Use "Criar acesso".' using errcode = 'P0001';
  end if;
  if _emp.status <> 'ativo' then
    raise exception 'Reative o colaborador antes de gerar um link de senha.' using errcode = 'P0001';
  end if;

  insert into public.audit_logs (usuario_id, usuario_nome, acao, entidade, registro_id)
  values (_chamador,
          (select nome from public.employees where user_id = _chamador limit 1),
          'gerar_link_senha', 'employees', _employee_id);

  return _emp.email;
end; $$;

-- ---------- 8. Inativar / reativar ----------
-- Retorna o user_id (ou null) para o servidor bloquear/desbloquear o login.
create or replace function public.alterar_status_colaborador(
  _employee_id uuid, _status public.employee_status, _chamador uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  _emp public.employees%rowtype;
begin
  perform public.validar_gestao_de_acesso(_employee_id, _chamador);
  select * into _emp from public.employees where id = _employee_id for update;

  if _emp.status <> _status then
    update public.employees set status = _status where id = _employee_id;
    insert into public.audit_logs (usuario_id, usuario_nome, acao, entidade, registro_id, valor_anterior, valor_novo)
    values (_chamador,
            (select nome from public.employees where user_id = _chamador limit 1),
            case when _status = 'inativo' then 'inativar_colaborador' else 'reativar_colaborador' end,
            'employees', _employee_id,
            jsonb_build_object('status', _emp.status),
            jsonb_build_object('status', _status));
  end if;

  return _emp.user_id;
end; $$;

-- ---------- 9. Permissões ----------
-- Estas funções recebem o "_chamador" como parâmetro, então NÃO podem ser
-- chamadas pelo navegador (qualquer um se passaria por outro). Só o servidor,
-- que obtém o _chamador de um token verificado, pode executá-las.
revoke all on function public.impedir_troca_email_com_acesso() from public, anon, authenticated;
revoke all on function public.validar_gestao_de_acesso(uuid, uuid) from public, anon, authenticated;
revoke all on function public.preparar_criacao_acesso(uuid, public.app_role, uuid) from public, anon, authenticated;
revoke all on function public.vincular_acesso(uuid, uuid, public.app_role, uuid) from public, anon, authenticated;
revoke all on function public.preparar_link_senha(uuid, uuid) from public, anon, authenticated;
revoke all on function public.alterar_status_colaborador(uuid, public.employee_status, uuid) from public, anon, authenticated;

grant execute on function public.validar_gestao_de_acesso(uuid, uuid) to service_role;
grant execute on function public.preparar_criacao_acesso(uuid, public.app_role, uuid) to service_role;
grant execute on function public.vincular_acesso(uuid, uuid, public.app_role, uuid) to service_role;
grant execute on function public.preparar_link_senha(uuid, uuid) to service_role;
grant execute on function public.alterar_status_colaborador(uuid, public.employee_status, uuid) to service_role;
