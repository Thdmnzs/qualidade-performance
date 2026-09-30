-- =====================================================================
-- Etapa 1: user_roles passa a ser a ÚNICA fonte de verdade do perfil.
--
-- Antes: o front lia employees.perfil e o RLS lia user_roles.
--        A tela de Colaboradores gravava só em employees.perfil,
--        então promover alguém pela tela não surtia efeito no banco.
-- Depois: perfil só existe em user_roles, e só muda via definir_perfil().
-- =====================================================================

-- 1) Reconciliação: copia para user_roles o perfil que a tela exibia,
--    para ninguém perder (nem ganhar de surpresa) acesso ao remover a coluna.
insert into public.user_roles (user_id, role)
select e.user_id, e.perfil
from public.employees e
where e.user_id is not null
on conflict (user_id, role) do nothing;

-- 2) Perfil efetivo de um usuário. Se houver mais de um papel, vale o maior.
--    Sem papel cadastrado (ou sem acesso), o perfil é colaborador.
--    O CASE explícito evita depender da ordem de declaração do enum.
create or replace function public.perfil_do_usuario(_user_id uuid)
returns public.app_role
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select ur.role
       from public.user_roles ur
      where ur.user_id = _user_id
      order by case ur.role when 'adm' then 1 when 'gestor' then 2 else 3 end
      limit 1),
    'colaborador'::public.app_role
  )
$$;

-- 3) Perfil do usuário logado (usado pelo front para montar o menu).
create or replace function public.meu_perfil()
returns public.app_role
language sql stable security definer set search_path = public as $$
  select public.perfil_do_usuario(auth.uid())
$$;

-- 4) Lista de colaboradores com o perfil efetivo, só para gestão.
--    O filtro is_admin() reproduz a regra do RLS, já que security definer
--    ignora as policies da tabela.
create or replace function public.listar_colaboradores()
returns table (
  id uuid,
  user_id uuid,
  nome text,
  login text,
  email text,
  status public.employee_status,
  foto_url text,
  perfil public.app_role,
  tem_acesso boolean,
  created_at timestamptz,
  updated_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select e.id, e.user_id, e.nome, e.login, e.email, e.status, e.foto_url,
         public.perfil_do_usuario(e.user_id),
         e.user_id is not null,
         e.created_at, e.updated_at
    from public.employees e
   where public.is_admin(auth.uid())
   order by e.nome
$$;

-- 5) Único caminho de escrita de perfil, com as regras de negócio no banco.
create or replace function public.definir_perfil(_employee_id uuid, _perfil public.app_role)
returns public.app_role
language plpgsql security definer set search_path = public as $$
declare
  _chamador uuid := auth.uid();
  _alvo uuid;
  _perfil_chamador public.app_role;
  _perfil_atual public.app_role;
begin
  if _chamador is null or not public.is_admin(_chamador) then
    raise exception 'Apenas gestores e administradores podem alterar perfis.'
      using errcode = '42501';
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

  _perfil_chamador := public.perfil_do_usuario(_chamador);
  _perfil_atual    := public.perfil_do_usuario(_alvo);

  -- Gestor não pode criar nem rebaixar ADM (evita escalonamento de privilégio).
  if _perfil_chamador <> 'adm' and (_perfil = 'adm' or _perfil_atual = 'adm') then
    raise exception 'Apenas administradores podem conceder ou remover o perfil ADM.'
      using errcode = '42501';
  end if;

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

-- 6) Permissões. Postgres concede EXECUTE a PUBLIC por padrão em funções novas,
--    então é preciso revogar explicitamente.
revoke all on function public.perfil_do_usuario(uuid) from public, anon, authenticated;
revoke all on function public.meu_perfil() from public, anon;
revoke all on function public.listar_colaboradores() from public, anon;
revoke all on function public.definir_perfil(uuid, public.app_role) from public, anon;
grant execute on function public.meu_perfil() to authenticated;
grant execute on function public.listar_colaboradores() to authenticated;
grant execute on function public.definir_perfil(uuid, public.app_role) to authenticated;

-- 7) A policy de escrita em user_roles nunca funcionou (authenticated só tem
--    GRANT de SELECT). Removida para não sugerir um caminho que não existe:
--    a escrita agora é exclusiva de definir_perfil().
drop policy if exists "roles_admin_write" on public.user_roles;

-- 8) Remove a fonte de verdade duplicada.
alter table public.employees drop column perfil;
