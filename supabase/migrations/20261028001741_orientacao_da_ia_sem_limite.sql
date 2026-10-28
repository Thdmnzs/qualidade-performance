-- =====================================================================
-- Treinar a IA (27/10/2026): a orientação de cada critério sem o limite de 600 caracteres por parte (o Sim, o
-- Médio, o Não e o Exemplo). O resto do salvar continua igual (a permissão, o critério, o Histórico).
-- =====================================================================
alter table public.orientacoes_dos_criterios drop constraint orientacoes_dos_criterios_sim_check, drop constraint orientacoes_dos_criterios_medio_check,
  drop constraint orientacoes_dos_criterios_nao_check, drop constraint orientacoes_dos_criterios_exemplo_check;

create or replace function public.salvar_orientacao(_criterion_id uuid, _sim text, _medio text, _nao text, _exemplo text)
returns void
language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
declare
  _c public.evaluation_criteria%rowtype;
  _s text := nullif(btrim(coalesce(_sim, '')), '');
  _m text := nullif(btrim(coalesce(_medio, '')), '');
  _n text := nullif(btrim(coalesce(_nao, '')), '');
  _e text := nullif(btrim(coalesce(_exemplo, '')), '');
  _nome text := (select nome from public.employees where user_id = auth.uid() limit 1);
begin
  if not public._pode_treinar_a_ia() then raise exception 'Apenas o ADM e os avaliadores treinam a IA.' using errcode = '42501'; end if;
  select * into _c from public.evaluation_criteria where id = _criterion_id and ativo;
  if not found then raise exception 'Critério não encontrado.' using errcode = 'P0002'; end if;
  if not _c.permite_medio then _m := null; end if;
  insert into public.orientacoes_dos_criterios (criterion_id, sim, medio, nao, exemplo, autor_id, autor_nome)
  values (_criterion_id, _s, _m, _n, _e, auth.uid(), _nome);
  update public.evaluation_criteria set orientacao = public._texto_da_orientacao(_s, _m, _n, _e) where id = _criterion_id;
  insert into public.audit_logs (usuario_id, usuario_nome, acao, entidade, registro_id, valor_anterior, valor_novo)
  values (auth.uid(), _nome, 'orientacao_da_ia', 'evaluation_criteria', _criterion_id, null,
          jsonb_build_object('criterio', _c.ordem || '. ' || _c.descricao, 'vazia', _s is null and _m is null and _n is null and _e is null));
end; $function$;
