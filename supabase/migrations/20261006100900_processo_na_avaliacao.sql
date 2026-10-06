-- =====================================================================
-- Processo da Flukepédia na avaliação (05/10/2026).
--
--   * evaluations ganha processo_id e processo_versao: qual processo (e qual
--     VERSÃO dele) o avaliador usou. Opcional. Numa contestação, mostra com qual
--     regra o contato foi avaliado, mesmo que o processo mude depois no Notion.
--   * registrar_avaliacao ganha o parâmetro opcional _processo_id e grava tudo
--     de uma vez (avaliação e processo). Partiu da definição que roda em
--     produção (mesmo hash), com só estes acréscimos.
--   * buscar_processos: sugestões e busca manual (título, código e texto da
--     versão atual). Respeita o RLS: só ADM e avaliadores enxergam processos.
-- =====================================================================

alter table public.evaluations
  add column processo_id uuid references public.processos(id) on delete set null,
  add column processo_versao int;
-- A tabela tem permissões por coluna (quem avaliou fica oculto): as novas
-- colunas precisam ser liberadas uma a uma.
grant select (processo_id, processo_versao) on public.evaluations to authenticated;

-- A assinatura muda (parâmetro novo), então a função é recriada.
drop function public.registrar_avaliacao(uuid, uuid, public.evaluation_type, text, date, text, text, jsonb);

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
         case when x ->> 'resposta' = 'nao' then nullif(btrim(x ->> 'observacao'), '') end
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

revoke all on function public.registrar_avaliacao(uuid, uuid, public.evaluation_type, text, date, text, text, jsonb, uuid) from public, anon;
grant execute on function public.registrar_avaliacao(uuid, uuid, public.evaluation_type, text, date, text, text, jsonb, uuid) to authenticated;

-- ---------- Busca de processos ----------
-- As palavras do texto (3 letras ou mais) são combinadas com OU; o título pesa
-- mais que o conteúdo, e um código ou título que contém o texto vem primeiro.
create or replace function public.buscar_processos(_texto text, _limite int default 5)
returns table (id uuid, codigo text, titulo text, base text, revisado boolean, versao int, url text)
language sql stable security invoker set search_path = public, pg_temp as $$
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
   order by (b.codigo ilike '%' || btrim(coalesce(_texto, '')) || '%' or b.titulo ilike '%' || btrim(coalesce(_texto, '')) || '%') desc,
            case when t.q is null then 0 else ts_rank(b.documento, to_tsquery('portuguese', t.q)) end desc,
            b.revisado desc, b.codigo
   limit greatest(1, least(coalesce(_limite, 5), 20))
$$;
revoke all on function public.buscar_processos(text, int) from public, anon;
grant execute on function public.buscar_processos(text, int) to authenticated;
