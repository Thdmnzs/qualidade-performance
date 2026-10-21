-- =====================================================================
-- A verificação em duas etapas (21/10/2026), a etapa 1: os códigos de recuperação e as funções do servidor.
--   * O aplicativo autenticador (o TOTP) é do próprio Supabase Auth (o segredo fica lá, e não aqui).
--   * Os CÓDIGOS DE RECUPERAÇÃO (10 por pessoa, de uso único) são do CX Hub: guardados embaralhados de forma
--     irreversível (o bcrypt, como as senhas). Nem o banco nem a supervisão conseguem lê-los.
--   * Só o SERVIDOR chama estas funções (com a chave do servidor); o navegador não tem acesso a nada daqui.
-- =====================================================================
create table public.codigos_de_recuperacao (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  hash text not null,
  usado_em timestamptz,
  criado_em timestamptz not null default now()
);
create index codigos_de_recuperacao_da_pessoa on public.codigos_de_recuperacao (user_id) where usado_em is null;
alter table public.codigos_de_recuperacao enable row level security;
revoke all on public.codigos_de_recuperacao from anon, authenticated;

-- Os códigos novos de uma pessoa (os antigos deixam de valer).
create or replace function public.guardar_codigos_de_recuperacao(_user_id uuid, _codigos text[])
returns void
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
begin
  if coalesce(array_length(_codigos, 1), 0) <> 10 then raise exception 'São 10 códigos.' using errcode = 'P0001'; end if;
  delete from public.codigos_de_recuperacao where user_id = _user_id;
  insert into public.codigos_de_recuperacao (user_id, hash)
  select _user_id, extensions.crypt(upper(replace(c, '-', '')), extensions.gen_salt('bf', 10)) from unnest(_codigos) c;
end; $$;

-- Usar um código: true se ele vale (e ele deixa de valer na hora).
create or replace function public.usar_codigo_de_recuperacao(_user_id uuid, _codigo text)
returns boolean
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare _id uuid; _limpo text := upper(regexp_replace(coalesce(_codigo, ''), '[^A-Za-z0-9]', '', 'g'));
begin
  if length(_limpo) <> 8 then return false; end if;
  select id into _id from public.codigos_de_recuperacao
   where user_id = _user_id and usado_em is null and hash = extensions.crypt(_limpo, hash) limit 1 for update;
  if _id is null then return false; end if;
  update public.codigos_de_recuperacao set usado_em = now() where id = _id;
  return true;
end; $$;

-- O desligamento pelo ADM: os códigos da pessoa deixam de valer, e as sessões dela são encerradas.
create or replace function public.apagar_codigos_e_sessoes(_user_id uuid)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  delete from public.codigos_de_recuperacao where user_id = _user_id;
  delete from auth.sessions where user_id = _user_id;
end; $$;

-- Quem do time tem a verificação ativa (para a tela de Colaboradores do ADM): { user_id: quando foi ativada }.
create or replace function public.verificacao_do_time()
returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_object_agg(user_id, ativada_em), '{}') from (
    select user_id, min(created_at) as ativada_em from auth.mfa_factors where status = 'verified' and factor_type = 'totp' group by user_id) x
$$;

revoke all on function public.guardar_codigos_de_recuperacao(uuid, text[]), public.usar_codigo_de_recuperacao(uuid, text),
  public.apagar_codigos_e_sessoes(uuid), public.verificacao_do_time() from public, anon, authenticated;
grant execute on function public.guardar_codigos_de_recuperacao(uuid, text[]), public.usar_codigo_de_recuperacao(uuid, text),
  public.apagar_codigos_e_sessoes(uuid), public.verificacao_do_time() to service_role;
