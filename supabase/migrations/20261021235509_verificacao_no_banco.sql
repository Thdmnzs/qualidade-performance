-- =====================================================================
-- A verificação em duas etapas no banco (21/10/2026), a etapa 2: uma sessão de PESSOA sem o código do celular
-- (o "aal2" do Supabase) é recusada em todo lugar, mesmo chamando o banco direto, sem passar pelas telas.
--   1) A porta principal (a API do banco, o PostgREST): a conferência ANTES de cada pedido. A única exceção é a
--      consulta do próprio perfil (o login a faz logo depois da senha, antes do código).
--   2) O tempo real e as fotos (que não passam pela API): as funções que identificam quem chama respondem
--      "ninguém" para uma sessão sem o código; as regras do mural, das instabilidades e das fotos dependem delas.
--   3) As chamadas do SERVIDOR (com a chave dele) não são sessões de pessoas, e continuam iguais.
-- O caminho de volta, se algo der errado (desliga a porta principal; o resto pode ficar):
--   alter role authenticator reset pgrst.db_pre_request; notify pgrst, 'reload config';
-- =====================================================================

-- A sessão está ok? Só a de uma PESSOA (o papel "authenticated") precisa do código; o servidor e o visitante não.
create or replace function public._sessao_verificada()
returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(auth.jwt() ->> 'role', '') <> 'authenticated' or coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
$$;
revoke all on function public._sessao_verificada() from public, anon;
grant execute on function public._sessao_verificada() to authenticated, service_role;

-- 2) Quem é você? e você é ADM / avaliador? (para uma pessoa sem o código: ninguém)
create or replace function public.current_employee_id()
returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select id from public.employees where user_id = auth.uid() and status = 'ativo' and public._sessao_verificada() limit 1
$$;
create or replace function public.is_admin(_user_id uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select public._sessao_verificada() and exists (
    select 1 from public.user_roles ur join public.employees e on e.user_id = ur.user_id
     where ur.user_id = _user_id and ur.role = 'adm' and e.status = 'ativo')
$$;
create or replace function public.is_avaliador(_user_id uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select public._sessao_verificada() and exists (
    select 1 from public.user_roles ur join public.employees e on e.user_id = ur.user_id
     where ur.user_id = _user_id and ur.role = 'avaliador' and e.status = 'ativo')
$$;

-- O reforço (a defesa em camadas): toda tabela ganha uma regra RESTRITIVA (que se soma às outras, e que nenhuma
-- outra libera): uma sessão de pessoa só passa com o código. ATENÇÃO: toda tabela NOVA precisa da mesma regra.
do $$ declare t record; begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('create policy "exige a verificação" on public.%I as restrictive for all to authenticated using (public._sessao_verificada()) with check (public._sessao_verificada())', t.tablename);
  end loop;
end $$;

-- 1) A porta principal: a conferência antes de cada pedido à API do banco.
create or replace function public.verificar_a_sessao()
returns void
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public._sessao_verificada() and coalesce(current_setting('request.path', true), '') not in ('/rpc/meu_perfil') then
    raise exception 'Confirme o código do celular para continuar.' using errcode = '42501', hint = 'aal2';
  end if;
end; $$;
revoke all on function public.verificar_a_sessao() from public, anon;
grant execute on function public.verificar_a_sessao() to authenticated, anon, service_role;
alter role authenticator set pgrst.db_pre_request to 'public.verificar_a_sessao';
notify pgrst, 'reload config';

-- A revisão de segurança (21/10/2026): quem pode disparar o aviso de uma troca pela tela: uma das duas pessoas da
-- troca, ou um ADM. Só o servidor chama (a tarefa da manhã, que recupera os avisos perdidos, não passa por aqui).
create or replace function public.pode_avisar_troca(_id uuid, _user_id uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
      select 1 from public.trocas_de_escala t join public.employees e on e.user_id = _user_id and e.status = 'ativo'
       where t.id = _id and e.id in (t.de_employee, t.para_employee))
    or exists (
      select 1 from public.user_roles ur join public.employees e on e.user_id = ur.user_id
       where ur.user_id = _user_id and ur.role = 'adm' and e.status = 'ativo')
$$;
revoke all on function public.pode_avisar_troca(uuid, uuid) from public, anon, authenticated;
grant execute on function public.pode_avisar_troca(uuid, uuid) to service_role;
