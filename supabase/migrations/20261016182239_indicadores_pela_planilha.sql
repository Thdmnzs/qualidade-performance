-- =====================================================================
-- Os indicadores pela planilha (15/10/2026).
--
--   * A aba "Dados" da planilha "CX - Métricas individuais do time" é lida todo dia às 8h (e quando
--     o ADM pede), com os números BRUTOS por pessoa e por dia. Fica só o que é de antes de hoje.
--   * O "nome na planilha" de cada pessoa liga a linha ao cadastro (o primeiro nome, e os apelidos).
--   * Cada leitura fica registrada: quando, até que dia, quantas linhas, e as ignoradas (e por quê).
--   * As horas ativas da planilha são as horas online da meta (a decisão da supervisão).
--   * O CSAT do time passa a ser a soma das positivas ÷ a soma das avaliações (cada avaliação pesa
--     igual), e não a média das pessoas.
--   * Os oito tempos do SLA de cada dia (o B2C e o B2B; o chat e o e-mail; a 1ª resposta e o geral),
--     para as abas do colaborador. O "sla_chat_s" e o "sla_email_s" continuam: a média do B2C e do B2B.
--   * A CÓPIA das duas abas (a "Dados", só o dia anterior, e a "Análise", inteira), como estão na planilha
--     (os valores e a formatação dela), para a tabela da supervisão. O CX Hub não calcula nada nela.
--   * O colaborador vê os dele, todo dia (o D-1); a supervisão, a cópia da planilha.
-- =====================================================================

-- ---------- O nome na planilha ----------
alter table public.employees add column nome_na_planilha text check (nome_na_planilha is null or length(btrim(nome_na_planilha)) between 1 and 60);
create unique index employees_nome_na_planilha on public.employees (lower(btrim(nome_na_planilha))) where nome_na_planilha is not null;
-- O primeiro nome, quando ele é único entre os ativos; e os dois apelidos da planilha.
update public.employees e set nome_na_planilha = split_part(e.nome, ' ', 1)
 where e.status = 'ativo'
   and (select count(*) from public.employees o where o.status = 'ativo' and lower(split_part(o.nome, ' ', 1)) = lower(split_part(e.nome, ' ', 1))) = 1;
update public.employees set nome_na_planilha = 'Fran' where status = 'ativo' and nome = 'Franciele Rezende';
update public.employees set nome_na_planilha = 'Luiz Fernando' where status = 'ativo' and nome = 'Luiz Oliveira';

-- ---------- As leituras ----------
create table public.leituras_da_planilha (
  id uuid primary key default gen_random_uuid(),
  lida_em timestamptz not null default now(),
  origem text not null check (origem in ('automatica', 'manual')),
  ultimo_dia date,
  linhas int not null default 0,
  gravadas int not null default 0,
  ignoradas jsonb not null default '[]',
  erro text check (erro is null or length(erro) <= 500)
);
create index leituras_por_data on public.leituras_da_planilha (lida_em desc);
alter table public.leituras_da_planilha enable row level security;
revoke all on public.leituras_da_planilha from anon, authenticated;
alter table public.indicadores_diarios
  add column leitura_id uuid references public.leituras_da_planilha (id) on delete set null,
  add column sla_b2c_chat_1_s numeric check (sla_b2c_chat_1_s is null or sla_b2c_chat_1_s >= 0),
  add column sla_b2c_email_1_s numeric check (sla_b2c_email_1_s is null or sla_b2c_email_1_s >= 0),
  add column sla_b2c_chat_g_s numeric check (sla_b2c_chat_g_s is null or sla_b2c_chat_g_s >= 0),
  add column sla_b2c_email_g_s numeric check (sla_b2c_email_g_s is null or sla_b2c_email_g_s >= 0),
  add column sla_b2b_chat_1_s numeric check (sla_b2b_chat_1_s is null or sla_b2b_chat_1_s >= 0),
  add column sla_b2b_email_1_s numeric check (sla_b2b_email_1_s is null or sla_b2b_email_1_s >= 0),
  add column sla_b2b_chat_g_s numeric check (sla_b2b_chat_g_s is null or sla_b2b_chat_g_s >= 0),
  add column sla_b2b_email_g_s numeric check (sla_b2b_email_g_s is null or sla_b2b_email_g_s >= 0);

-- A cópia das abas da planilha (a última leitura de cada uma), para a tabela da supervisão.
create table public.copia_da_planilha (
  aba text primary key check (aba in ('dados', 'analise')),
  valores jsonb not null,            -- as linhas, como o Google as mostra (a primeira é o cabeçalho, na Dados)
  dia date,                          -- na Dados: o dia copiado (o anterior à leitura)
  lida_em timestamptz not null default now()
);
alter table public.copia_da_planilha enable row level security;
revoke all on public.copia_da_planilha from anon, authenticated;

-- Gravar uma leitura (só o servidor). As linhas já vêm normalizadas pelo servidor:
-- [{ nome, dia, conversas, autoatribuicoes, tempo_ativo_min, sla_chat_s, sla_email_s, csat_positivas, csat_total }]
create or replace function public.gravar_leitura_da_planilha(_origem text, _linhas jsonb)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  _hoje date := (now() at time zone 'America/Fortaleza')::date;
  _id uuid; _l jsonb; _emp uuid; _dia date; _nome text;
  _gravadas int := 0; _ignoradas jsonb := '{}'; _ultimo date; _total int := 0;
begin
  insert into public.leituras_da_planilha (origem) values (_origem) returning id into _id;
  for _l in select * from jsonb_array_elements(coalesce(_linhas, '[]')) loop
    _nome := btrim(coalesce(_l->>'nome', ''));
    _dia := nullif(_l->>'dia', '')::date;
    if _nome = '' or _dia is null or lower(_nome) = 'time' or _dia >= _hoje then continue; end if; -- o TIME, e o dia de hoje (ainda enchendo)
    _total := _total + 1;
    _emp := (select id from public.employees where status = 'ativo' and lower(btrim(nome_na_planilha)) = lower(_nome));
    if _emp is null then
      _ignoradas := jsonb_set(_ignoradas, array[_nome], to_jsonb(coalesce((_ignoradas->>_nome)::int, 0) + 1));
      continue;
    end if;
    begin
      insert into public.indicadores_diarios (employee_id, dia, conversas_atribuidas, autoatribuicoes, tempo_ativo_min, horas_logadas_min,
                                              sla_chat_s, sla_email_s, csat_positivas, csat_total, leitura_id, updated_at,
                                              sla_b2c_chat_1_s, sla_b2c_email_1_s, sla_b2c_chat_g_s, sla_b2c_email_g_s,
                                              sla_b2b_chat_1_s, sla_b2b_email_1_s, sla_b2b_chat_g_s, sla_b2b_email_g_s)
      values (_emp, _dia, (_l->>'conversas')::numeric, (_l->>'autoatribuicoes')::numeric, (_l->>'tempo_ativo_min')::numeric, (_l->>'tempo_ativo_min')::numeric,
              (_l->>'sla_chat_s')::numeric, (_l->>'sla_email_s')::numeric, (_l->>'csat_positivas')::int, (_l->>'csat_total')::int, _id, now(),
              (_l->>'sla_b2c_chat_1_s')::numeric, (_l->>'sla_b2c_email_1_s')::numeric, (_l->>'sla_b2c_chat_g_s')::numeric, (_l->>'sla_b2c_email_g_s')::numeric,
              (_l->>'sla_b2b_chat_1_s')::numeric, (_l->>'sla_b2b_email_1_s')::numeric, (_l->>'sla_b2b_chat_g_s')::numeric, (_l->>'sla_b2b_email_g_s')::numeric)
      on conflict (employee_id, dia) do update set
        conversas_atribuidas = excluded.conversas_atribuidas, autoatribuicoes = excluded.autoatribuicoes,
        tempo_ativo_min = excluded.tempo_ativo_min, horas_logadas_min = excluded.horas_logadas_min,
        sla_chat_s = excluded.sla_chat_s, sla_email_s = excluded.sla_email_s,
        csat_positivas = excluded.csat_positivas, csat_total = excluded.csat_total, leitura_id = _id, updated_at = now(),
        sla_b2c_chat_1_s = excluded.sla_b2c_chat_1_s, sla_b2c_email_1_s = excluded.sla_b2c_email_1_s,
        sla_b2c_chat_g_s = excluded.sla_b2c_chat_g_s, sla_b2c_email_g_s = excluded.sla_b2c_email_g_s,
        sla_b2b_chat_1_s = excluded.sla_b2b_chat_1_s, sla_b2b_email_1_s = excluded.sla_b2b_email_1_s,
        sla_b2b_chat_g_s = excluded.sla_b2b_chat_g_s, sla_b2b_email_g_s = excluded.sla_b2b_email_g_s;
      _gravadas := _gravadas + 1;
      _ultimo := greatest(_ultimo, _dia);
    exception when check_violation or invalid_text_representation or numeric_value_out_of_range then
      _ignoradas := jsonb_set(_ignoradas, array[_nome || ' (números inválidos em ' || to_char(_dia, 'DD/MM') || ')'], '1');
    end;
  end loop;
  update public.leituras_da_planilha set linhas = _total, gravadas = _gravadas, ultimo_dia = _ultimo,
         ignoradas = (select coalesce(jsonb_agg(jsonb_build_object('nome', k, 'linhas', v::int) order by k), '[]') from jsonb_each_text(_ignoradas) x(k, v))
   where id = _id;
  return (select to_jsonb(l) from public.leituras_da_planilha l where id = _id);
end; $$;

-- Registrar uma leitura que falhou antes de chegar ao banco (a planilha fora do ar, sem acesso...).
create or replace function public.registrar_erro_da_leitura(_origem text, _erro text)
returns void
language sql security definer set search_path = public, pg_temp as $$
  insert into public.leituras_da_planilha (origem, erro) values (_origem, left(_erro, 500))
$$;

-- ---------- O ADM ----------
create or replace function public.leituras_da_planilha_recentes()
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.is_admin(auth.uid()) then raise exception 'Apenas o ADM vê as leituras da planilha.' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(to_jsonb(l) order by l.lida_em desc) from (select * from public.leituras_da_planilha order by lida_em desc limit 15) l), '[]');
end; $$;

-- Ligar um nome da planilha a uma pessoa (ou desligar, com o nome vazio).
create or replace function public.associar_nome_da_planilha(_employee_id uuid, _nome text)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare _n text := nullif(btrim(coalesce(_nome, '')), '');
begin
  if not public.is_admin(auth.uid()) then raise exception 'Apenas o ADM liga os nomes da planilha.' using errcode = '42501'; end if;
  if not exists (select 1 from public.employees where id = _employee_id and status = 'ativo') then raise exception 'Cadastro não encontrado.' using errcode = 'P0002'; end if;
  if length(coalesce(_n, '')) > 60 then raise exception 'O nome pode ter até 60 caracteres.' using errcode = 'P0001'; end if;
  if _n is not null and exists (select 1 from public.employees where lower(btrim(nome_na_planilha)) = lower(_n) and id <> _employee_id) then
    raise exception 'Esse nome da planilha já está ligado a outra pessoa.' using errcode = 'P0001';
  end if;
  update public.employees set nome_na_planilha = _n where id = _employee_id;
  insert into public.audit_logs (usuario_id, usuario_nome, acao, entidade, registro_id, valor_anterior, valor_novo)
  values (auth.uid(), (select nome from public.employees where user_id = auth.uid() limit 1), 'nome_na_planilha', 'employees', _employee_id, null,
          jsonb_build_object('colaborador', (select nome from public.employees where id = _employee_id), 'nome_na_planilha', _n));
end; $$;

-- Gravar a cópia de uma aba (só o servidor): as linhas como estão na planilha.
create or replace function public.gravar_copia_da_planilha(_aba text, _valores jsonb, _dia date)
returns void
language sql security definer set search_path = public, pg_temp as $$
  insert into public.copia_da_planilha (aba, valores, dia, lida_em) values (_aba, coalesce(_valores, '[]'), _dia, now())
  on conflict (aba) do update set valores = excluded.valores, dia = excluded.dia, lida_em = now()
$$;

-- A cópia das duas abas, para a tabela da supervisão (o ADM).
create or replace function public.copia_da_planilha()
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.is_admin(auth.uid()) then raise exception 'Apenas o ADM vê a tabela da planilha.' using errcode = '42501'; end if;
  return coalesce((select jsonb_object_agg(aba, jsonb_build_object('valores', valores, 'dia', dia, 'lida_em', lida_em)) from public.copia_da_planilha), '{}');
end; $$;

-- O CSAT do time: a soma das positivas ÷ a soma das avaliações (cada avaliação pesa igual).
create or replace function public.calcular_indicadores_periodo(_employee_id uuid, _de date, _ate date)
 returns table(de date, ate date, dias_com_dados integer, qualidade numeric, avaliacoes integer, produtividade numeric, sla_chat_s numeric, sla_email_s numeric, csat_meu numeric, csat_time numeric, horas_semanais numeric)
 language sql stable security definer set search_path = public, pg_temp
as $function$
  with meus as (
    select * from public.indicadores_diarios d
     where d.employee_id = _employee_id and d.dia between _de and _ate
  ),
  -- As avaliações do CSAT de todo o time (ativos e não ADM), somadas.
  do_time as (
    select d.csat_positivas, d.csat_total
      from public.indicadores_diarios d join public.employees e on e.id = d.employee_id
     where d.dia between _de and _ate and e.status = 'ativo'
       and public.perfil_do_usuario(e.user_id) is distinct from 'adm'
  ),
  notas as (
    select ev.nota from public.evaluations ev
     where ev.employee_id = _employee_id and not ev.anulada and ev.nota is not null
       and ev.data_contato between _de and _ate
       and public.quinzena_publicada(ev.fortnight_id)
  )
  select _de, _ate,
         (select count(*)::int from meus),
         (select round(avg(nota), 2) from notas),
         (select count(*)::int from notas),
         (select round((sum(conversas_atribuidas) - coalesce(sum(autoatribuicoes), 0)) / nullif(sum(tempo_ativo_min) / 60.0, 0), 2)
            from meus where conversas_atribuidas is not null and tempo_ativo_min is not null),
         (select round(avg(sla_chat_s), 1) from meus),
         (select round(avg(sla_email_s), 1) from meus),
         (select round(sum(csat_positivas)::numeric / nullif(sum(csat_total), 0) * 100, 2) from meus),
         (select round(sum(csat_positivas)::numeric / nullif(sum(csat_total), 0) * 100, 2) from do_time),
         -- Média semanal proporcional aos dias corridos do período.
         (select round(sum(horas_logadas_min) / 60.0 / ((_ate - _de + 1) / 7.0), 2) from meus where horas_logadas_min is not null)
$function$;

revoke all on function public.gravar_leitura_da_planilha(text, jsonb), public.registrar_erro_da_leitura(text, text), public.gravar_copia_da_planilha(text, jsonb, date) from public, anon, authenticated;
grant execute on function public.gravar_leitura_da_planilha(text, jsonb), public.registrar_erro_da_leitura(text, text), public.gravar_copia_da_planilha(text, jsonb, date) to service_role;
revoke all on function public.leituras_da_planilha_recentes(), public.associar_nome_da_planilha(uuid, text), public.copia_da_planilha() from public, anon;
grant execute on function public.leituras_da_planilha_recentes(), public.associar_nome_da_planilha(uuid, text), public.copia_da_planilha() to authenticated;
