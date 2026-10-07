-- =====================================================================
-- Pré-avaliação pela IA (06/10/2026).
--
--   * Guarda as SUGESTÕES (respostas, observações e o feedback), o modelo e
--     quando foram geradas, e NÃO o texto da conversa (minimização: a conversa
--     fica só no Intercom). O que foi enviado à IA é sempre a versão mascarada.
--   * Reaproveitamento: a mesma conversa, para o mesmo colaborador na mesma
--     quinzena, nunca gera um segundo pedido (e um segundo custo).
--   * Medição: guardar quando cada sugestão foi gerada ajuda a próxima etapa
--     (avaliações por hora de cada avaliador) e a comparar a IA com os
--     avaliadores ao longo do tempo.
--   * Quem lê: o ADM, todas; o avaliador, as próprias; o colaborador, nenhuma.
--     Só o servidor grava, pelas funções abaixo (que conferem a permissão).
-- =====================================================================
create table public.pre_avaliacoes (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  fortnight_id uuid not null references public.fortnights(id) on delete cascade,
  conversa_id text not null check (conversa_id ~ '^[0-9]{1,30}$'),
  avaliador_user_id uuid,
  modelo text not null,
  sugestoes jsonb not null,
  processo_id uuid references public.processos(id) on delete set null,
  processo_versao int,
  duracao_ms int,
  tokens_entrada int,
  tokens_saida int,
  criado_em timestamptz not null default now(),
  unique (employee_id, fortnight_id, conversa_id)
);
alter table public.pre_avaliacoes enable row level security;
create policy "pre_avaliacoes_ler" on public.pre_avaliacoes for select to authenticated
  using (public.is_admin(auth.uid()) or avaliador_user_id = auth.uid());
revoke all on public.pre_avaliacoes from anon, authenticated, service_role;
grant select on public.pre_avaliacoes to authenticated;

-- ---------- Buscar uma sugestão já guardada (reaproveitamento) ----------
create or replace function public.buscar_pre_avaliacao(_chamador uuid, _employee_id uuid, _fortnight_id uuid, _conversa_id text)
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if _chamador is null or not public.pode_atuar_sobre(_chamador, _employee_id) then
    raise exception 'Você não pode avaliar este colaborador.' using errcode = '42501';
  end if;
  return (select sugestoes from public.pre_avaliacoes
           where employee_id = _employee_id and fortnight_id = _fortnight_id and conversa_id = _conversa_id);
end; $$;

-- ---------- Gravar uma sugestão nova ----------
create or replace function public.registrar_pre_avaliacao(
  _chamador uuid, _employee_id uuid, _fortnight_id uuid, _conversa_id text,
  _modelo text, _sugestoes jsonb, _processo_id uuid, _processo_versao int,
  _duracao_ms int, _tokens_entrada int, _tokens_saida int)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare _guardada jsonb;
begin
  if _chamador is null or not public.pode_atuar_sobre(_chamador, _employee_id) then
    raise exception 'Você não pode avaliar este colaborador.' using errcode = '42501';
  end if;
  if _sugestoes is null or jsonb_typeof(_sugestoes) <> 'object' then
    raise exception 'Sugestões inválidas.' using errcode = 'P0001';
  end if;
  insert into public.pre_avaliacoes
    (employee_id, fortnight_id, conversa_id, avaliador_user_id, modelo, sugestoes,
     processo_id, processo_versao, duracao_ms, tokens_entrada, tokens_saida)
  values (_employee_id, _fortnight_id, _conversa_id, _chamador, _modelo, _sugestoes,
          _processo_id, _processo_versao, _duracao_ms, _tokens_entrada, _tokens_saida)
  on conflict (employee_id, fortnight_id, conversa_id) do nothing;
  -- Se outro pedido gravou primeiro (duas abas), vale a que já estava guardada.
  select sugestoes into _guardada from public.pre_avaliacoes
   where employee_id = _employee_id and fortnight_id = _fortnight_id and conversa_id = _conversa_id;
  return _guardada;
end; $$;

revoke all on function public.buscar_pre_avaliacao(uuid, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.registrar_pre_avaliacao(uuid, uuid, uuid, text, text, jsonb, uuid, int, int, int, int) from public, anon, authenticated;
grant execute on function public.buscar_pre_avaliacao(uuid, uuid, uuid, text) to service_role;
grant execute on function public.registrar_pre_avaliacao(uuid, uuid, uuid, text, text, jsonb, uuid, int, int, int, int) to service_role;

-- ---------- As referências do pedido: o processo mais provável e o Dicionário de Tags ----------
-- Devolve só o necessário, sem abrir a leitura das tabelas de processos para a
-- chave de serviço (menor privilégio). Só o servidor chama.
create or replace function public.referencias_para_pre_avaliacao(_texto text)
returns table (processo_id uuid, codigo text, titulo text, versao int, conteudo text, dicionario text)
language sql stable security definer set search_path = public, pg_temp as $$
  -- O processo mais provável sai só da B2C e da B2B: o Dicionário vai à parte, e o Guia não é processo.
  with provavel as (select * from public.buscar_processos(_texto, 6) where base in ('B2C', 'B2B') limit 1)
  select pv.id, pv.codigo, pv.titulo, pv.versao,
         (select v.conteudo from public.processos_versoes v where v.processo_id = pv.id and v.versao = pv.versao),
         (select v.conteudo from public.processos p
            join public.processos_versoes v on v.processo_id = p.id and v.versao = p.versao_atual
           where p.ativo and p.base = 'Guia' and p.titulo ilike 'dicionário de tags%' limit 1)
    from (select 1) um left join provavel pv on true
$$;
revoke all on function public.referencias_para_pre_avaliacao(text) from public, anon, authenticated;
grant execute on function public.referencias_para_pre_avaliacao(text) to service_role;

-- ---------- Correção na busca de processos (vale também para o cartão da ficha) ----------
-- Partiu da definição que roda em produção (mesmo hash); muda só a ordenação.
CREATE OR REPLACE FUNCTION public.buscar_processos(_texto text, _limite integer DEFAULT 5)
 RETURNS TABLE(id uuid, codigo text, titulo text, base text, revisado boolean, versao integer, url text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with termos as (
    select nullif(string_agg(distinct w, ' | '), '') as q
      from regexp_split_to_table(lower(regexp_replace(coalesce(_texto, ''), '[^[:alnum:]À-ÿ]+', ' ', 'g')), '\s+') w
     where length(w) >= 3
  ),
  base as (
    select p.*, v.conteudo,
           setweight(to_tsvector('portuguese', coalesce(p.codigo, '') || ' ' || p.titulo), 'A')
             || setweight(to_tsvector('portuguese', coalesce(v.conteudo, '')), 'B') as documento
      from public.processos p
      left join public.processos_versoes v on v.processo_id = p.id and v.versao = p.versao_atual
     where p.ativo
  )
  select b.id, b.codigo, b.titulo, b.base, b.revisado, b.versao_atual, b.url
    from base b, termos t
   -- Texto com cara de código (B2C-..., B2B-...): procura só no código. Senão, "b2c",
   -- que aparece em todos os processos da B2C, faria todos baterem.
   where (btrim(coalesce(_texto, '')) !~* '^b2[bc]-' and t.q is not null and b.documento @@ to_tsquery('portuguese', t.q))
      or (length(btrim(coalesce(_texto, ''))) >= 2
          and (b.codigo ilike '%' || btrim(_texto) || '%' or b.titulo ilike '%' || btrim(_texto) || '%'))
   -- coalesce: sem código (Guia, Dicionário), a comparação daria NULL, e NULL vem
   -- antes de tudo numa ordenação decrescente (as páginas sem código subiam ao topo).
   order by (coalesce(b.codigo ilike '%' || btrim(coalesce(_texto, '')) || '%', false)
             or coalesce(b.titulo ilike '%' || btrim(coalesce(_texto, '')) || '%', false)) desc,
            case when t.q is null then 0 else ts_rank(b.documento, to_tsquery('portuguese', t.q)) end desc,
            b.revisado desc, b.codigo
   limit greatest(1, least(coalesce(_limite, 5), 20))
$function$;

-- ---------- A observação também no Médio (a pré-avaliação escreve nos dois) ----------
-- Partiu da definição que roda em produção (mesmo hash); muda só a condição.
-- A validação compartilhada continua exigindo a observação apenas no Não.
CREATE OR REPLACE FUNCTION public.registrar_avaliacao(_employee_id uuid, _fortnight_id uuid, _tipo evaluation_type, _assunto text, _data_contato date, _link_conversa text, _comentarios text, _respostas jsonb, _processo_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(evaluation_id uuid, nota numeric, total_interacao bigint, total_ticket_n2 bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  _avaliador uuid := auth.uid();
  _emp public.employees%rowtype;
  _status_quinzena public.fortnight_status;
  _versao int;
  _assunto_limpo text := nullif(btrim(_assunto), '');
  _link_limpo text := nullif(btrim(_link_conversa), '');
  _hoje date := (now() at time zone 'America/Fortaleza')::date;
  _problema text;
  _nota numeric;
  _id uuid;
  _restricao text;
  _processo_versao int;
  _processo_codigo text;
begin
  if _avaliador is null or not (public.is_admin(_avaliador) or public.is_avaliador(_avaliador)) then
    raise exception 'Apenas avaliadores e administradores ativos podem registrar avaliações.'
      using errcode = '42501';
  end if;

  -- Quinzena
  select status into _status_quinzena from public.fortnights where id = _fortnight_id;
  if not found then
    raise exception 'Quinzena não encontrada.' using errcode = 'P0002';
  end if;
  if _status_quinzena not in ('aberta', 'em_analise') then
    raise exception 'Esta quinzena não está mais aberta para avaliações (já foi publicada para contestação ou fechada).'
      using errcode = 'P0001';
  end if;

  -- Colaborador avaliado
  select * into _emp from public.employees where id = _employee_id;
  if not found then
    raise exception 'Colaborador não encontrado.' using errcode = 'P0002';
  end if;
  if _emp.status <> 'ativo' then
    raise exception 'Não é possível avaliar um colaborador inativo.' using errcode = 'P0001';
  end if;
  -- Quem avalia quem. Mensagens específicas; pode_atuar_sobre() é a trava final.
  if _emp.user_id is not distinct from _avaliador then
    raise exception 'Você não pode avaliar a si mesmo.' using errcode = '42501';
  end if;
  if public.perfil_do_usuario(_emp.user_id) = 'adm' then
    raise exception 'O perfil ADM não recebe avaliação de qualidade.' using errcode = 'P0001';
  end if;
  if public.perfil_do_usuario(_emp.user_id) = 'avaliador' and not public.is_admin(_avaliador) then
    raise exception 'Avaliadores só podem ser avaliados por um ADM.' using errcode = '42501';
  end if;
  if not public.pode_atuar_sobre(_avaliador, _employee_id) then
    raise exception 'Você não tem permissão para avaliar este colaborador.' using errcode = '42501';
  end if;

  -- Assunto e data do contato (obrigatórios)
  if _assunto_limpo is null then
    raise exception 'Informe o assunto do contato.' using errcode = 'P0001';
  end if;
  if length(_assunto_limpo) > 200 then
    raise exception 'O assunto deve ter no máximo 200 caracteres.' using errcode = 'P0001';
  end if;
  if _data_contato is null then
    raise exception 'Informe a data do contato.' using errcode = 'P0001';
  end if;
  if _data_contato > _hoje then
    raise exception 'A data do contato não pode ser futura.' using errcode = 'P0001';
  end if;

  -- Link
  if _link_limpo is not null and _link_limpo !~* '^https?://' then
    raise exception 'O link da conversa deve começar com http:// ou https://.' using errcode = 'P0001';
  end if;

  -- Ficha vigente: a maior versão com critérios ativos.
  select max(versao) into _versao from public.evaluation_criteria where ativo;
  if _versao is null then
    raise exception 'Nenhuma ficha de avaliação ativa.' using errcode = 'P0001';
  end if;

  if _respostas is null or jsonb_typeof(_respostas) <> 'array' then
    raise exception 'As respostas devem ser uma lista.' using errcode = 'P0001';
  end if;

  -- Validação compartilhada com o ajuste por contestação.
  _problema := public.problema_nas_respostas(_respostas, _versao);

  if _problema is not null then
    raise exception '%', _problema using errcode = 'P0001';
  end if;

  _nota := public.nota_das_respostas(_respostas);

  -- Processo da Flukepédia usado na avaliação (opcional): guarda a VERSÃO vigente,
  -- para uma contestação saber com qual regra o contato foi avaliado.
  if _processo_id is not null then
    select versao_atual, codigo into _processo_versao, _processo_codigo
      from public.processos where id = _processo_id and ativo;
    if not found then
      raise exception 'O processo escolhido não está mais na base de processos.' using errcode = 'P0001';
    end if;
  end if;

  begin
    insert into public.evaluations
      (employee_id, fortnight_id, tipo, assunto, data_contato, link_conversa, comentarios,
       versao_ficha, nota, avaliador_id, processo_id, processo_versao)
    values
      (_employee_id, _fortnight_id, _tipo, _assunto_limpo, _data_contato, _link_limpo,
       nullif(btrim(_comentarios), ''), _versao, _nota, _avaliador, _processo_id, _processo_versao)
    returning id into _id;
  exception when unique_violation then
    -- Identifica QUAL proteção barrou, para a mensagem ser útil.
    get stacked diagnostics _restricao = constraint_name;
    if _restricao = 'uq_eval_link_conversa' then
      raise exception 'Esta conversa já foi avaliada para este colaborador nesta quinzena.'
        using errcode = 'P0001';
    end if;
    raise;
  end;

  insert into public.evaluation_items (evaluation_id, criterion_id, resposta, desconto, observacao)
  select _id,
         c.id,
         x ->> 'resposta',
         public.desconto_do_criterio(c.peso, c.peso_medio, x ->> 'resposta'),
         -- Desde 06/10/2026, o Médio também guarda a observação (obrigatória só no Não).
         case when x ->> 'resposta' in ('nao', 'medio') then nullif(btrim(x ->> 'observacao'), '') end
    from jsonb_array_elements(_respostas) x
    join public.evaluation_criteria c on c.id = (x ->> 'criterio_id')::uuid;

  insert into public.audit_logs (usuario_id, usuario_nome, acao, entidade, registro_id, valor_novo)
  values (_avaliador,
          (select nome from public.employees where user_id = _avaliador limit 1),
          'registrar_avaliacao', 'evaluations', _id,
          jsonb_build_object('colaborador', _emp.nome, 'tipo', _tipo, 'assunto', _assunto_limpo,
                             'data_contato', _data_contato, 'nota', _nota, 'versao_ficha', _versao,
                             'processo', _processo_codigo, 'processo_versao', _processo_versao));

  return query
    select _id, _nota,
           count(*) filter (where e.tipo = 'interacao'),
           count(*) filter (where e.tipo = 'ticket_n2')
      from public.evaluations e
     where e.employee_id = _employee_id and e.fortnight_id = _fortnight_id and not e.anulada;
end; $function$;
