-- =====================================================================
-- O Histórico pelo servidor (21/10/2026). O servidor não pode gravar direto no Histórico (o endurecimento antigo
-- tirou essa permissão, de propósito), e os registros da troca de senha e da verificação em duas etapas eram
-- recusados em silêncio. Esta função registra por ele, só as ações que o servidor faz.
-- =====================================================================
create or replace function public.registrar_no_historico(_usuario_id uuid, _acao text, _entidade text, _registro_id uuid, _valor_novo jsonb)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if _acao not in ('senha_alterada', 'verificacao_codigos_gerados', 'verificacao_recuperada', 'verificacao_desligada') then
    raise exception 'Esta ação não é registrada pelo servidor.' using errcode = 'P0001';
  end if;
  insert into public.audit_logs (usuario_id, usuario_nome, acao, entidade, registro_id, valor_novo)
  values (_usuario_id, (select nome from public.employees where user_id = _usuario_id limit 1), _acao, _entidade, _registro_id, coalesce(_valor_novo, '{}'));
end; $$;
revoke all on function public.registrar_no_historico(uuid, text, text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.registrar_no_historico(uuid, text, text, uuid, jsonb) to service_role;

-- Os registros recuperados: as ativações da verificação feitas antes desta correção (que o Histórico recusou),
-- com o horário real de cada uma (o do Supabase), marcadas como recuperadas.
insert into public.audit_logs (usuario_id, usuario_nome, acao, entidade, registro_id, valor_novo, created_at)
select f.user_id, e.nome, 'verificacao_codigos_gerados', 'verificacao', null, jsonb_build_object('recuperado', true), f.ativada_em
  from (select user_id, min(created_at) as ativada_em from auth.mfa_factors where status = 'verified' and factor_type = 'totp' group by user_id) f
  left join public.employees e on e.user_id = f.user_id
 where not exists (select 1 from public.audit_logs a where a.usuario_id = f.user_id and a.acao = 'verificacao_codigos_gerados');
