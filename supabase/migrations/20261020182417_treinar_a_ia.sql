-- =====================================================================
-- Treinar a IA (20/10/2026): o que vai junto de cada pré-avaliação, para ela seguir o estilo do time.
-- A IA não é retreinada; ela lê, a cada pedido, as orientações e os exemplos.
--
--   1. As ORIENTAÇÕES de cada critério (o que conta como sim, médio e não, e um exemplo), escritas pelos
--      avaliadores e pelo ADM. Cada mudança vira uma versão (com o autor), e vai para o Histórico. O texto
--      vigente fica no "orientacao" do critério, que a pré-avaliação já lê.
--   2. O "POR QUÊ?" de cada sugestão mudada pelo avaliador (opcional), junto da avaliação.
--   3. A CONCORDÂNCIA: a sugestão da IA × a decisão do avaliador, critério a critério (calculada aqui,
--      a partir do que já está guardado: a pré-avaliação da conversa e a avaliação dela).
--   4. Os EXEMPLARES: avaliações marcadas como referência. A pré-avaliação leva até 2 do mesmo processo.
-- Quem treina: o ADM e os avaliadores.
-- =====================================================================
create or replace function public._pode_treinar_a_ia()
returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select public.is_admin(auth.uid()) or public.perfil_do_usuario(auth.uid()) = 'avaliador'
$$;

-- ---------- 1. As orientações ----------
create table public.orientacoes_dos_criterios (
  id uuid primary key default gen_random_uuid(),
  criterion_id uuid not null references public.evaluation_criteria (id) on delete cascade,
  sim text check (sim is null or length(sim) <= 600),
  medio text check (medio is null or length(medio) <= 600),
  nao text check (nao is null or length(nao) <= 600),
  exemplo text check (exemplo is null or length(exemplo) <= 600),
  autor_id uuid,
  autor_nome text,
  criada_em timestamptz not null default now()
);
create index orientacoes_por_criterio on public.orientacoes_dos_criterios (criterion_id, criada_em desc);
alter table public.orientacoes_dos_criterios enable row level security;
revoke all on public.orientacoes_dos_criterios from anon, authenticated;

-- O texto que a IA lê (o mesmo formato da prévia).
create or replace function public._texto_da_orientacao(_sim text, _medio text, _nao text, _exemplo text)
returns text
language sql immutable set search_path = public, pg_temp as $$
  select nullif(concat_ws(' ',
    case when _sim is not null then 'Conta como SIM: ' || _sim end,
    case when _medio is not null then 'Conta como MÉDIO: ' || _medio end,
    case when _nao is not null then 'Conta como NÃO: ' || _nao end,
    case when _exemplo is not null then 'Exemplo: ' || _exemplo end), '')
$$;

create or replace function public.orientacoes_para_treinar()
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public._pode_treinar_a_ia() then raise exception 'Apenas o ADM e os avaliadores treinam a IA.' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', c.id, 'ordem', c.ordem, 'grupo', c.grupo, 'descricao', c.descricao, 'permite_medio', c.permite_medio,
      'sim', o.sim, 'medio', o.medio, 'nao', o.nao, 'exemplo', o.exemplo, 'autor', o.autor_nome, 'em', o.criada_em,
      'versoes', (select count(*) from public.orientacoes_dos_criterios x where x.criterion_id = c.id)) order by c.ordem)
      from public.evaluation_criteria c
      left join lateral (select * from public.orientacoes_dos_criterios x where x.criterion_id = c.id order by x.criada_em desc limit 1) o on true
     where c.ativo), '[]');
end; $$;

create or replace function public.versoes_da_orientacao(_criterion_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public._pode_treinar_a_ia() then raise exception 'Apenas o ADM e os avaliadores treinam a IA.' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('sim', sim, 'medio', medio, 'nao', nao, 'exemplo', exemplo, 'autor', autor_nome, 'em', criada_em) order by criada_em desc)
                     from public.orientacoes_dos_criterios where criterion_id = _criterion_id), '[]');
end; $$;

create or replace function public.salvar_orientacao(_criterion_id uuid, _sim text, _medio text, _nao text, _exemplo text)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
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
  if not _c.permite_medio then _m := null; end if; -- o critério não aceita Médio: não há o que orientar
  if greatest(length(coalesce(_s, '')), length(coalesce(_m, '')), length(coalesce(_n, '')), length(coalesce(_e, ''))) > 600 then
    raise exception 'Cada parte da orientação pode ter até 600 caracteres.' using errcode = 'P0001';
  end if;
  insert into public.orientacoes_dos_criterios (criterion_id, sim, medio, nao, exemplo, autor_id, autor_nome)
  values (_criterion_id, _s, _m, _n, _e, auth.uid(), _nome);
  update public.evaluation_criteria set orientacao = public._texto_da_orientacao(_s, _m, _n, _e) where id = _criterion_id;
  insert into public.audit_logs (usuario_id, usuario_nome, acao, entidade, registro_id, valor_anterior, valor_novo)
  values (auth.uid(), _nome, 'orientacao_da_ia', 'evaluation_criteria', _criterion_id, null,
          jsonb_build_object('criterio', _c.ordem || '. ' || _c.descricao, 'vazia', _s is null and _m is null and _n is null and _e is null));
end; $$;

-- ---------- 2. O "por quê?" das mudanças ----------
create table public.motivos_das_mudancas (
  evaluation_id uuid not null references public.evaluations (id) on delete cascade,
  criterion_id uuid not null,
  motivo text not null check (motivo in ('nao_viu', 'orientacao_nao_cobre', 'criterio_do_avaliador', 'outro')),
  criado_por uuid,
  criado_em timestamptz not null default now(),
  primary key (evaluation_id, criterion_id)
);
alter table public.motivos_das_mudancas enable row level security;
revoke all on public.motivos_das_mudancas from anon, authenticated;

create or replace function public.registrar_motivos_das_mudancas(_evaluation_id uuid, _motivos jsonb)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare _ev public.evaluations%rowtype; _m jsonb;
begin
  select * into _ev from public.evaluations where id = _evaluation_id;
  if not found then raise exception 'Avaliação não encontrada.' using errcode = 'P0002'; end if;
  if not public._pode_treinar_a_ia() then raise exception 'Apenas o ADM e os avaliadores treinam a IA.' using errcode = '42501'; end if;
  for _m in select * from jsonb_array_elements(coalesce(_motivos, '[]')) loop
    insert into public.motivos_das_mudancas (evaluation_id, criterion_id, motivo, criado_por)
    values (_evaluation_id, (_m->>'criterio_id')::uuid, _m->>'motivo', auth.uid())
    on conflict (evaluation_id, criterion_id) do update set motivo = excluded.motivo, criado_por = excluded.criado_por, criado_em = now();
  end loop;
end; $$;

-- ---------- 3. A concordância ----------
create or replace function public.concordancia_da_ia(_de date, _ate date)
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public._pode_treinar_a_ia() then raise exception 'Apenas o ADM e os avaliadores treinam a IA.' using errcode = '42501'; end if;
  return (
    with avaliacoes as (
      select e.* from public.evaluations e where not e.anulada and e.data_contato between _de and _ate
    ),
    -- a pré-avaliação da MESMA conversa (a pessoa, a quinzena e o número da conversa no link)
    pares as (
      select e.id as evaluation_id, p.sugestoes from avaliacoes e
      join lateral (select p.sugestoes from public.pre_avaliacoes p
                     where p.employee_id = e.employee_id and p.fortnight_id = e.fortnight_id
                       and e.link_conversa ~ ('(^|[^0-9])' || p.conversa_id || '([^0-9]|$)')
                     order by p.criado_em desc limit 1) p on true
    ),
    itens as (
      select i.criterion_id, i.resposta as decidiu, pr.sugestoes -> 'criterios' -> (i.criterion_id::text) ->> 'resposta' as sugeriu, i.evaluation_id
        from pares pr join public.evaluation_items i on i.evaluation_id = pr.evaluation_id
    ),
    validos as (select * from itens where sugeriu is not null),
    por_criterio as (
      select v.criterion_id, count(*) as total, count(*) filter (where v.sugeriu = v.decidiu) as acordos,
             (select x.sugeriu || '>' || x.decidiu from validos x where x.criterion_id = v.criterion_id and x.sugeriu <> x.decidiu
               group by x.sugeriu, x.decidiu order by count(*) desc limit 1) as mudanca,
             (select jsonb_object_agg(m.motivo, m.qtd) from (select mm.motivo, count(*) as qtd from public.motivos_das_mudancas mm
                join validos y on y.evaluation_id = mm.evaluation_id and y.criterion_id = mm.criterion_id
               where mm.criterion_id = v.criterion_id group by mm.motivo) m) as motivos
        from validos v group by v.criterion_id
    )
    select jsonb_build_object(
      'avaliacoes', (select count(*) from avaliacoes),
      'pre_avaliadas', (select count(*) from pares),
      'criterios', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'ordem', c.ordem, 'grupo', c.grupo, 'descricao', c.descricao,
                    'tem_orientacao', c.orientacao is not null, 'total', pc.total, 'acordos', pc.acordos, 'mudanca', pc.mudanca, 'motivos', pc.motivos) order by c.ordem)
                    from por_criterio pc join public.evaluation_criteria c on c.id = pc.criterion_id), '[]'))
  );
end; $$;

-- ---------- 4. Os exemplares ----------
alter table public.evaluations
  add column exemplar boolean not null default false,
  add column exemplar_por uuid,
  add column exemplar_em timestamptz;

create or replace function public.avaliacoes_para_exemplos(_limite int default 80)
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public._pode_treinar_a_ia() then raise exception 'Apenas o ADM e os avaliadores treinam a IA.' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(x order by x->>'data' desc) from (
    select jsonb_build_object('id', e.id, 'data', e.data_contato, 'pessoa', split_part(emp.nome, ' ', 1), 'nota', e.nota, 'exemplar', e.exemplar,
             'processo', pr.titulo, 'assunto', e.assunto, 'comentario', left(coalesce(e.comentarios, ''), 400)) as x
      from public.evaluations e join public.employees emp on emp.id = e.employee_id
      left join public.processos pr on pr.id = e.processo_id
     where not e.anulada
     order by e.exemplar desc, e.data_contato desc, e.created_at desc limit least(greatest(coalesce(_limite, 80), 1), 200)) t), '[]');
end; $$;

create or replace function public.marcar_exemplar(_evaluation_id uuid, _exemplar boolean)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare _ev public.evaluations%rowtype;
begin
  if not public._pode_treinar_a_ia() then raise exception 'Apenas o ADM e os avaliadores treinam a IA.' using errcode = '42501'; end if;
  select * into _ev from public.evaluations where id = _evaluation_id;
  if not found or _ev.anulada then raise exception 'Avaliação não encontrada.' using errcode = 'P0002'; end if;
  update public.evaluations set exemplar = coalesce(_exemplar, false),
         exemplar_por = case when _exemplar then auth.uid() end, exemplar_em = case when _exemplar then now() end
   where id = _evaluation_id;
  insert into public.audit_logs (usuario_id, usuario_nome, acao, entidade, registro_id, valor_anterior, valor_novo)
  values (auth.uid(), (select nome from public.employees where user_id = auth.uid() limit 1), 'exemplar_da_ia', 'evaluations', _evaluation_id, null,
          jsonb_build_object('exemplar', coalesce(_exemplar, false), 'colaborador', (select nome from public.employees where id = _ev.employee_id)));
end; $$;

-- Os exemplos que vão junto da pré-avaliação (só o servidor): até 2 exemplares, do mesmo processo
-- primeiro, depois do mesmo assunto. Só as respostas, as observações e o comentário (sem a conversa).
create or replace function public.exemplos_para_pre_avaliacao(_processo_id uuid, _assunto text, _excluir_employee uuid)
returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object('processo', x.titulo, 'comentario', x.comentarios, 'itens', x.itens)), '[]')
    from (select pr.titulo, e.comentarios,
                 (select jsonb_agg(jsonb_build_object('criterio', c.ordem || '. ' || c.descricao, 'resposta', i.resposta, 'observacao', i.observacao) order by c.ordem)
                    from public.evaluation_items i join public.evaluation_criteria c on c.id = i.criterion_id where i.evaluation_id = e.id) as itens
            from public.evaluations e left join public.processos pr on pr.id = e.processo_id
           where e.exemplar and not e.anulada and e.employee_id is distinct from _excluir_employee
           order by (e.processo_id is not distinct from _processo_id and _processo_id is not null) desc,
                    (lower(coalesce(e.assunto, '')) = lower(coalesce(_assunto, '')) and coalesce(_assunto, '') <> '') desc,
                    e.exemplar_em desc nulls last
           limit 2) x
$$;

revoke all on function public._pode_treinar_a_ia(), public._texto_da_orientacao(text, text, text, text), public.exemplos_para_pre_avaliacao(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.exemplos_para_pre_avaliacao(uuid, text, uuid) to service_role;
revoke all on function public.orientacoes_para_treinar(), public.versoes_da_orientacao(uuid), public.salvar_orientacao(uuid, text, text, text, text),
  public.registrar_motivos_das_mudancas(uuid, jsonb), public.concordancia_da_ia(date, date), public.avaliacoes_para_exemplos(int), public.marcar_exemplar(uuid, boolean) from public, anon;
grant execute on function public.orientacoes_para_treinar(), public.versoes_da_orientacao(uuid), public.salvar_orientacao(uuid, text, text, text, text),
  public.registrar_motivos_das_mudancas(uuid, jsonb), public.concordancia_da_ia(date, date), public.avaliacoes_para_exemplos(int), public.marcar_exemplar(uuid, boolean) to authenticated;
