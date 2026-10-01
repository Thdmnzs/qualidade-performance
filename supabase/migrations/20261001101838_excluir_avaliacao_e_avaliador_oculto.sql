-- =====================================================================
-- Avaliações: exclusão com motivo e "Avaliado por" só para a gestão.
--
-- Regras de negócio (30/09/2026):
--   * Excluir avaliação: só quem a fez, ou um ADM. Motivo obrigatório.
--     A avaliação some das telas, notas e totais, mas fica guardada como
--     anulada, com quem, quando e por quê (auditoria).
--   * Não se exclui avaliação de quinzena fechada.
--   * "Avaliado por" aparece para avaliadores e ADM, nunca para o colaborador.
--     Garantido no banco: o navegador perde a leitura da coluna avaliador_id.
-- =====================================================================

-- ---------- 1. Registro da exclusão ----------
alter table public.evaluations
  add column anulada_em timestamptz,
  add column anulada_por uuid references auth.users(id),
  add column motivo_anulacao text;

alter table public.evaluations
  add constraint evaluations_anulacao_completa
  check (not anulada or (anulada_em is not null and nullif(btrim(motivo_anulacao), '') is not null));

-- ---------- 2. Excluir (anular) avaliação ----------
create or replace function public.excluir_avaliacao(_evaluation_id uuid, _motivo text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  _chamador uuid := auth.uid();
  _ev public.evaluations%rowtype;
  _motivo_limpo text := nullif(btrim(_motivo), '');
begin
  if _chamador is null or not (public.is_admin(_chamador) or public.is_avaliador(_chamador)) then
    raise exception 'Apenas avaliadores e administradores ativos podem excluir avaliações.'
      using errcode = '42501';
  end if;

  select * into _ev from public.evaluations where id = _evaluation_id for update;
  if not found then
    raise exception 'Avaliação não encontrada.' using errcode = 'P0002';
  end if;
  if _ev.anulada then
    raise exception 'Esta avaliação já foi excluída.' using errcode = 'P0001';
  end if;
  if not public.is_admin(_chamador) and _ev.avaliador_id is distinct from _chamador then
    raise exception 'Só quem fez a avaliação, ou um ADM, pode excluí-la.' using errcode = '42501';
  end if;
  if public.fortnight_is_closed(_ev.fortnight_id) then
    raise exception 'Esta quinzena está fechada; a avaliação não pode mais ser excluída.'
      using errcode = 'P0001';
  end if;
  if _motivo_limpo is null or length(_motivo_limpo) < 5 then
    raise exception 'Informe o motivo da exclusão (pelo menos 5 caracteres).' using errcode = 'P0001';
  end if;

  update public.evaluations
     set anulada = true, anulada_em = now(), anulada_por = _chamador, motivo_anulacao = _motivo_limpo
   where id = _evaluation_id;

  insert into public.audit_logs (usuario_id, usuario_nome, acao, entidade, registro_id, valor_anterior, valor_novo)
  values (_chamador,
          (select nome from public.employees where user_id = _chamador limit 1),
          'excluir_avaliacao', 'evaluations', _evaluation_id,
          jsonb_build_object('colaborador', (select nome from public.employees where id = _ev.employee_id),
                             'tipo', _ev.tipo, 'ticket', _ev.ticket, 'nota', _ev.nota),
          jsonb_build_object('motivo', _motivo_limpo));
end; $$;

revoke all on function public.excluir_avaliacao(uuid, text) from public, anon;
grant execute on function public.excluir_avaliacao(uuid, text) to authenticated;

-- ---------- 3. Lista da gestão, com "Avaliado por" ----------
-- Só o que o usuário pode ver (pode_atuar_sobre) e nunca as excluídas.
-- pode_excluir espelha a regra de excluir_avaliacao(), para a tela.
create or replace function public.listar_avaliacoes_gestao(_fortnight_id uuid default null)
returns table (
  id uuid,
  employee_id uuid,
  colaborador text,
  fortnight_id uuid,
  tipo public.evaluation_type,
  ticket text,
  link_conversa text,
  nota numeric,
  created_at timestamptz,
  avaliado_por text,
  pode_excluir boolean
)
language sql stable security definer set search_path = public as $$
  select ev.id, ev.employee_id, emp.nome, ev.fortnight_id, ev.tipo, ev.ticket, ev.link_conversa,
         ev.nota, ev.created_at,
         coalesce(av.nome, 'Avaliador removido'),
         not public.fortnight_is_closed(ev.fortnight_id)
           and (public.is_admin(auth.uid()) or ev.avaliador_id = auth.uid())
    from public.evaluations ev
    join public.employees emp on emp.id = ev.employee_id
    left join public.employees av on av.user_id = ev.avaliador_id
   where not ev.anulada
     and public.pode_atuar_sobre(auth.uid(), ev.employee_id)
     and (_fortnight_id is null or ev.fortnight_id = _fortnight_id)
   order by emp.nome, ev.created_at desc
$$;

revoke all on function public.listar_avaliacoes_gestao(uuid) from public, anon;
grant execute on function public.listar_avaliacoes_gestao(uuid) to authenticated;

-- ---------- 4. O navegador não lê mais quem avaliou ----------
-- O RLS decide QUAIS linhas; o privilégio por coluna decide QUAIS colunas.
-- Como avaliador e colaborador usam o mesmo papel (authenticated), a coluna
-- sai para todos, e a gestão lê o nome pela função acima.
revoke select on public.evaluations from anon, authenticated;
grant select (id, employee_id, fortnight_id, ticket, link_conversa, assunto, data_contato, tipo,
              versao_ficha, nota, comentarios, anulada, created_at, updated_at)
  on public.evaluations to authenticated;

-- ---------- 5. Avaliações excluídas somem para colaborador e avaliador ----------
-- (O ADM continua vendo tudo pelas policies is_admin, para auditoria.)
drop policy "evaluations_self_read_after_close" on public.evaluations;
create policy "evaluations_self_read_after_close" on public.evaluations for select to authenticated
  using (public.is_admin(auth.uid())
         or (employee_id = public.current_employee_id()
             and public.fortnight_is_closed(fortnight_id)
             and not anulada));

drop policy "evaluations_avaliador_read" on public.evaluations;
create policy "evaluations_avaliador_read" on public.evaluations for select to authenticated
  using (public.pode_atuar_sobre(auth.uid(), employee_id) and not anulada);

drop policy "eval_items_read" on public.evaluation_items;
create policy "eval_items_read" on public.evaluation_items for select to authenticated
  using (public.is_admin(auth.uid())
         or exists (select 1 from public.evaluations e
                     where e.id = evaluation_items.evaluation_id
                       and e.employee_id = public.current_employee_id()
                       and public.fortnight_is_closed(e.fortnight_id)
                       and not e.anulada));

drop policy "eval_items_avaliador_read" on public.evaluation_items;
create policy "eval_items_avaliador_read" on public.evaluation_items for select to authenticated
  using (exists (select 1 from public.evaluations e
                  where e.id = evaluation_items.evaluation_id
                    and public.pode_atuar_sobre(auth.uid(), e.employee_id)
                    and not e.anulada));
