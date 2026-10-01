-- =====================================================================
-- Contestação de avaliação pelo colaborador.
--
-- Regras (01/10/2026):
--   * O colaborador vê as próprias avaliações após o fechamento da
--     quinzena, e é então que pode contestá-las ("publicação para
--     contestação" = fechamento).
--   * Uma contestação em andamento (aberta ou em análise) por avaliação.
--   * Motivo obrigatório (pelo menos 10 caracteres).
--   * Quem recebe segue pode_atuar_sobre(): contestação de colaborador vai
--     para avaliadores e ADM; de avaliador, só para ADM.
--   * Prazo e resposta: etapa de contestações.
--
-- Correção de segurança: a policy de inserção só conferia o dono
-- (employee_id). Pela API, um colaborador podia criar a contestação já
-- "deferida", com resposta e responsável inventados. Agora o navegador só
-- preenche assunto, descrição e quinzena; o vínculo com avaliação só pela
-- função abaixo; status, resposta e responsável, só pelo fluxo de resposta.
-- =====================================================================

-- ---------- 1. Campos que o navegador pode preencher ----------
revoke insert on public.contestations from authenticated;
grant insert (employee_id, fortnight_id, assunto, descricao) on public.contestations to authenticated;

-- ---------- 2. No máximo uma contestação em andamento por avaliação ----------
-- A função confere antes; o índice garante mesmo com dois cliques simultâneos.
create unique index uq_contestacao_em_andamento_por_avaliacao
  on public.contestations (evaluation_id)
  where evaluation_id is not null and status in ('aberta', 'em_analise');

-- ---------- 3. Contestar uma avaliação ----------
create or replace function public.contestar_avaliacao(_evaluation_id uuid, _descricao text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  _eu uuid := public.current_employee_id();
  _ev public.evaluations%rowtype;
  _descricao_limpa text := nullif(btrim(_descricao), '');
  _id uuid;
begin
  if _eu is null then
    raise exception 'Apenas colaboradores ativos podem contestar avaliações.' using errcode = '42501';
  end if;

  -- Avaliação de outra pessoa, ou excluída, é "não encontrada": a mensagem
  -- não confirma nem a existência de avaliações alheias.
  select * into _ev from public.evaluations where id = _evaluation_id;
  if not found or _ev.employee_id <> _eu or _ev.anulada then
    raise exception 'Avaliação não encontrada.' using errcode = 'P0002';
  end if;
  if not public.fortnight_is_closed(_ev.fortnight_id) then
    raise exception 'Esta avaliação ainda não está disponível para contestação.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.contestations
              where evaluation_id = _evaluation_id and status in ('aberta', 'em_analise')) then
    raise exception 'Já existe uma contestação em andamento para esta avaliação.' using errcode = 'P0001';
  end if;
  if _descricao_limpa is null or length(_descricao_limpa) < 10 then
    raise exception 'Explique o motivo da contestação (pelo menos 10 caracteres).' using errcode = 'P0001';
  end if;
  if length(_descricao_limpa) > 2000 then
    raise exception 'O motivo deve ter no máximo 2000 caracteres.' using errcode = 'P0001';
  end if;

  begin
    insert into public.contestations (employee_id, fortnight_id, evaluation_id, assunto, descricao)
    values (_eu, _ev.fortnight_id, _ev.id,
            format('Avaliação de %s · %s · %s',
                   case _ev.tipo when 'interacao' then 'Interação' else 'Ticket N2' end,
                   coalesce(_ev.assunto, 'sem assunto'),
                   coalesce(to_char(_ev.data_contato, 'DD/MM/YYYY'), 'sem data')),
            _descricao_limpa)
    returning id into _id;
  exception when unique_violation then
    raise exception 'Já existe uma contestação em andamento para esta avaliação.' using errcode = 'P0001';
  end;

  insert into public.audit_logs (usuario_id, usuario_nome, acao, entidade, registro_id, valor_novo)
  values (auth.uid(),
          (select nome from public.employees where id = _eu),
          'abrir_contestacao', 'contestations', _id,
          jsonb_build_object('evaluation_id', _ev.id, 'nota', _ev.nota));

  return _id;
end; $$;

revoke all on function public.contestar_avaliacao(uuid, text) from public, anon;
grant execute on function public.contestar_avaliacao(uuid, text) to authenticated;
