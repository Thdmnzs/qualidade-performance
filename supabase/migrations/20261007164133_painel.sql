-- =====================================================================
-- Painel (07/10/2026): a página "Painel" do ADM, com as abas Métricas e
-- Avaliações, no formato do relatório "Qualidade e Treinamento" do Looker Studio.
--
--   * O turno no cadastro (Manhã, Tarde ou Noite), gravado só pelo ADM, no mesmo
--     padrão das outras colunas do cadastro (nome, login, e-mail, foto).
--   * Duas funções de leitura, só para o ADM. O período seleciona as QUINZENAS
--     que começam dentro dele (o mesmo recorte nas duas abas). A quinzena
--     ainda aberta entra, marcada pelo status (a tela mostra "parcial").
--   * As métricas REAPROVEITAM a classificação da quinzena (a do Ranking):
--     o Painel e o Ranking nunca discordam. Acrescentam o turno, o CSAT e o
--     prêmio (pela posição, na tabela de prêmios, se elegível).
-- =====================================================================
alter table public.employees add column turno text check (turno in ('Manhã', 'Tarde', 'Noite'));
-- As permissões do cadastro são por coluna: a coluna nova precisa das mesmas três
-- (ler, incluir e atualizar). A regra de acesso deixa a gravação só para o ADM.
grant select (turno), insert (turno), update (turno) on public.employees to authenticated;

-- ---------- Avaliações: uma linha por avaliação, com as respostas de cada critério ----------
create or replace function public.painel_avaliacoes(_de date, _ate date, _turno text default null, _employee_id uuid default null)
returns table (evaluation_id uuid, fortnight_id uuid, quinzena_inicio date, quinzena_status text,
               employee_id uuid, nome text, turno text, tipo text, data_contato date, nota numeric,
               comentarios text, itens jsonb)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null or not public.is_admin(auth.uid()) then
    raise exception 'Apenas o ADM vê o Painel.' using errcode = '42501';
  end if;
  if _de is null or _ate is null or _de > _ate then
    raise exception 'Escolha um período válido.' using errcode = 'P0001';
  end if;
  return query
  select ev.id, f.id, f.data_inicio, f.status::text, e.id, e.nome, e.turno, ev.tipo::text, ev.data_contato, ev.nota,
         ev.comentarios,
         coalesce((select jsonb_agg(jsonb_build_object('ordem', c.ordem, 'resposta', i.resposta, 'observacao', i.observacao) order by c.ordem)
                     from public.evaluation_items i join public.evaluation_criteria c on c.id = i.criterion_id
                    where i.evaluation_id = ev.id), '[]'::jsonb)
    from public.evaluations ev
    join public.fortnights f on f.id = ev.fortnight_id
    join public.employees e on e.id = ev.employee_id
   where not ev.anulada
     and f.data_inicio between _de and _ate
     and (_turno is null or e.turno is not distinct from nullif(_turno, 'sem turno'))
     and (_employee_id is null or e.id = _employee_id)
   order by f.data_inicio, e.nome, ev.data_contato;
end; $$;
revoke all on function public.painel_avaliacoes(date, date, text, uuid) from public, anon;
grant execute on function public.painel_avaliacoes(date, date, text, uuid) to authenticated;

-- ---------- Métricas: uma linha por pessoa por quinzena ----------
create or replace function public.painel_metricas(_de date, _ate date, _turno text default null, _employee_id uuid default null)
returns table (fortnight_id uuid, quinzena_inicio date, quinzena_status text, oficial boolean,
               employee_id uuid, nome text, turno text, produtividade numeric, qualidade numeric,
               sla_chat numeric, sla_email numeric, csat numeric, horas_semanais numeric,
               quiz_entregue boolean, elegivel boolean, posicao int, premio numeric)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare _q record;
begin
  if auth.uid() is null or not public.is_admin(auth.uid()) then
    raise exception 'Apenas o ADM vê o Painel.' using errcode = '42501';
  end if;
  if _de is null or _ate is null or _de > _ate then
    raise exception 'Escolha um período válido.' using errcode = 'P0001';
  end if;
  for _q in select f.id, f.data_inicio, f.status::text as status from public.fortnights f
             where f.data_inicio between _de and _ate order by f.data_inicio loop
    return query
    select _q.id, _q.data_inicio, _q.status, c.oficial, c.employee_id, c.nome, e.turno,
           c.produtividade, c.qualidade, c.sla_chat, c.sla_email,
           (select r.valor from public.results r
             where r.employee_id = c.employee_id and r.fortnight_id = _q.id and r.indicador = 'csat' limit 1),
           c.horas_semanais, c.quiz_entregue, c.elegivel, c.posicao,
           (select b.valor from public.bonus_prizes b where c.elegivel and b.posicao = c.posicao limit 1)
      from public.classificacao_da_quinzena(_q.id) c
      join public.employees e on e.id = c.employee_id
     where (_turno is null or e.turno is not distinct from nullif(_turno, 'sem turno'))
       and (_employee_id is null or e.id = _employee_id);
  end loop;
end; $$;
revoke all on function public.painel_metricas(date, date, text, uuid) from public, anon;
grant execute on function public.painel_metricas(date, date, text, uuid) to authenticated;
