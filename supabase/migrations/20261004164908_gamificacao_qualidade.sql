-- =====================================================================
-- Gamificação da qualidade (etapa 1): conquistas e XP a partir das avaliações.
-- Fonte: "Fluke Gamificação da Qualidade: Conquistas e XP" (PDF).
--
-- Regras decididas (05/10/2026):
--   * O XP é dado no FECHAMENTO da quinzena (resultados oficiais, depois das
--     contestações). Reabrir uma quinzena fechada retira o XP dela; o próximo
--     fechamento recalcula.
--   * Nota da quinzena = média das avaliações não anuladas. Meta = 91 (4G).
--   * Quinzena sem avaliação da pessoa (férias, afastamento) é ignorada: não
--     conta e não quebra sequência.
--   * Sequências e contagens repetem em BLOCOS (a cada 3 seguidas, a cada 5...).
--   * Bônus de sequência: a mesma conquista ganha na quinzena anterior da
--     pessoa soma +10% (2ª), +20% (3ª) e +25% (4ª em diante).
--   * #06: nenhuma avaliação com nota abaixo de 91 na quinzena.
--   * 9 conquistas são únicas (01, 11, 35, 36, 42, 43, 44, 45, 46).
-- =====================================================================

-- ---------- 1. Catálogo ----------
create table public.conquistas (
  numero int primary key,
  dimensao text not null check (dimensao in ('sinal', 'velocidade', 'conexao', 'rede', 'evolucao', 'ranking')),
  nome text not null,
  condicao text not null,
  xp int not null check (xp > 0),
  unica boolean not null default false,
  -- Calculada automaticamente nesta etapa? (as demais dependem de indicadores ou do ranking)
  ativa boolean not null default false
);

insert into public.conquistas (numero, dimensao, nome, condicao, xp, unica, ativa) values
 (1,'sinal','Sinal Encontrado','Primeira avaliação de qualidade registrada.',50,true,true),
 (2,'sinal','Sinal Estável','Atingir a meta de qualidade em uma quinzena.',50,false,true),
 (3,'sinal','Sinal Forte','Atingir qualidade ≥ 95% em uma quinzena.',100,false,true),
 (4,'sinal','Sinal Máximo','Atingir qualidade ≥ 98%.',200,false,true),
 (5,'sinal','Torre de Qualidade','Atingir a meta de qualidade por 3 quinzenas consecutivas.',200,false,true),
 (6,'sinal','Sem Interferência','Passar uma quinzena sem nenhuma avaliação abaixo da meta.',100,false,true),
 (7,'sinal','Cobertura Nacional','Atingir a meta de qualidade por 5 quinzenas.',350,false,true),
 (8,'sinal','Fibra Óptica','Atingir ≥ 98% em 2 quinzenas consecutivas.',350,false,true),
 (9,'sinal','Sinal de Ouro','Manter média de qualidade ≥ 97% após 5 quinzenas.',350,false,true),
 (10,'sinal','Antena Mestre','Manter a meta de qualidade por 10 quinzenas.',500,false,true),
 (11,'velocidade','Conexão Rápida','Atingir a meta de produtividade pela primeira vez.',50,true,false),
 (12,'velocidade','4G Ligado','Superar a meta de produtividade em 10%.',100,false,false),
 (13,'velocidade','5G Ativado','Superar a meta de produtividade em 20%.',200,false,false),
 (14,'velocidade','Latência Zero','Atingir a meta de SLA de chat na quinzena.',100,false,false),
 (15,'velocidade','Ping Baixo','SLA de chat abaixo de 2 minutos.',200,false,false),
 (16,'velocidade','Resposta na Velocidade da Luz','SLA de chat abaixo de 1 minuto.',350,false,false),
 (17,'velocidade','E-mail Expresso','Atingir a meta de SLA de e-mail.',100,false,false),
 (18,'velocidade','Modo Turbo','Superar simultaneamente as metas de produtividade e SLA.',200,false,false),
 (19,'velocidade','Velocidade de Fibra','Superar as metas de produtividade e SLA por 3 quinzenas consecutivas.',350,false,false),
 (20,'velocidade','Pacote Ilimitado','Atingir produtividade ≥ 120% da meta.',500,false,false),
 (21,'conexao','Primeira Conexão','Participar de uma quinzena em que o CSAT da equipe esteja dentro da meta.',50,false,false),
 (22,'conexao','Rede Bem Conectada','CSAT da equipe ≥ 97% por 2 quinzenas consecutivas.',100,false,false),
 (23,'conexao','Conexão Estável','CSAT da equipe ≥ 97% por 5 quinzenas.',200,false,false),
 (24,'conexao','Cobertura de Experiência','CSAT da equipe dentro da meta por 10 quinzenas.',350,false,false),
 (25,'conexao','Sinal Coletivo','Participar de uma quinzena em que os indicadores coletivos estejam dentro da meta.',200,false,false),
 (26,'conexao','Força da Rede','CSAT da equipe dentro da meta e meta individual de qualidade atingida na mesma quinzena.',200,false,false),
 (27,'rede','Rede Estável','Nenhuma meta individual abaixo do esperado em uma quinzena.',200,false,false),
 (28,'rede','Alta Disponibilidade','Cumprir todos os indicadores individuais por 2 quinzenas.',200,false,false),
 (29,'rede','Reconexão','Voltar a atingir a meta depois de uma quinzena abaixo dela.',50,false,false),
 (30,'rede','Manutenção Preventiva','Melhorar o resultado de qualidade em 2 quinzenas consecutivas.',100,false,true),
 (31,'rede','Sinal em Ascensão','Melhorar o resultado por 3 quinzenas consecutivas.',200,false,false),
 (32,'rede','Parede de Sinal','5 quinzenas consecutivas dentro da meta.',350,false,false),
 (33,'rede','Torre Inabalável','10 quinzenas consecutivas dentro da meta.',500,false,false),
 (34,'rede','Bateria Infinita','Atingir as metas durante 5 quinzenas sem queda brusca de desempenho.',350,false,false),
 (35,'evolucao','Chip Novo','Completar a primeira quinzena.',50,true,true),
 (36,'evolucao','Linha Ativada','Completar 3 quinzenas.',50,true,true),
 (37,'evolucao','Roaming Nacional','Atingir metas em 3 meses diferentes.',100,false,false),
 (38,'evolucao','Upgrade de Plano','Melhorar o próprio resultado em relação à quinzena anterior.',100,false,false),
 (39,'evolucao','Plano Premium','Ficar acima da média do time por 3 quinzenas.',200,false,false),
 (40,'evolucao','Cliente VIP','Atingir todos os indicadores individuais e qualidade ≥ 98%.',350,false,false),
 (41,'evolucao','Engenheiro de Sinal','Corrigir uma tendência negativa e voltar acima da meta.',200,false,false),
 (42,'evolucao','Explorador de Rede','Completar 10 quinzenas avaliadas.',100,true,true),
 (43,'evolucao','Cobertura Total','Completar 6 meses de histórico.',350,true,false),
 (44,'ranking','Primeiro Pódio','Ficar no Top 3 pela primeira vez.',100,true,false),
 (45,'ranking','Sinal de Prata','Ficar no Top 2 pela primeira vez.',150,true,false),
 (46,'ranking','Sinal de Ouro (pódio)','Ficar no Top 1 pela primeira vez.',200,true,false),
 (47,'ranking','Pódio Consistente','Ficar no Top 3 em 3 quinzenas consecutivas.',250,false,false),
 (48,'ranking','Três Torres','Ficar no Top 1 em 3 quinzenas consecutivas.',500,false,false),
 (49,'ranking','Frequência de Elite','Ficar no Top 3 em 5 quinzenas diferentes.',350,false,false),
 (50,'ranking','Dono da Frequência','Ficar no Top 1 em 5 quinzenas diferentes.',500,false,false),
 (51,'ranking','Reconexão ao Pódio','Voltar ao Top 3 após pelo menos 3 quinzenas sem pódio.',250,false,false),
 (52,'ranking','Upgrade de Pódio','Evoluir Top 3 → Top 2 → Top 1 em quinzenas consecutivas.',350,false,false);

-- ---------- 2. Conquistas ganhas ----------
create table public.conquistas_ganhas (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  conquista int not null references public.conquistas(numero),
  fortnight_id uuid not null references public.fortnights(id) on delete cascade,
  xp int not null check (xp > 0),          -- já com o bônus de sequência
  sequencia int not null default 1,        -- quantas quinzenas seguidas (da pessoa) ganhou esta
  ganha_em timestamptz not null default now(),
  unique (employee_id, conquista, fortnight_id)
);
create index conquistas_ganhas_por_pessoa on public.conquistas_ganhas (employee_id);

-- ---------- 3. Badges em destaque (até 5) ----------
create table public.perfis_colaborador (
  employee_id uuid primary key references public.employees(id) on delete cascade,
  destaques int[] not null default '{}' check (cardinality(destaques) <= 5),
  atualizado_em timestamptz not null default now()
);

-- ---------- 4. Acesso: o próprio colaborador e o ADM leem; ninguém grava direto ----------
alter table public.conquistas enable row level security;
alter table public.conquistas_ganhas enable row level security;
alter table public.perfis_colaborador enable row level security;
revoke all on public.conquistas, public.conquistas_ganhas, public.perfis_colaborador from anon, authenticated;
grant select on public.conquistas, public.conquistas_ganhas, public.perfis_colaborador to authenticated;
-- Menor privilégio também para a chave de serviço (o Supabase concede tudo por padrão).
revoke insert, update, delete, truncate on public.conquistas, public.conquistas_ganhas, public.perfis_colaborador from service_role;

create policy "conquistas_leitura" on public.conquistas for select to authenticated using (true);
create policy "conquistas_ganhas_proprias_ou_adm" on public.conquistas_ganhas for select to authenticated
  using (employee_id = public.current_employee_id() or public.is_admin(auth.uid()));
create policy "perfis_proprio_ou_adm" on public.perfis_colaborador for select to authenticated
  using (employee_id = public.current_employee_id() or public.is_admin(auth.uid()));

-- ---------- 5. Cálculo das conquistas de uma quinzena fechada ----------
create or replace function public.calcular_conquistas_da_quinzena(_fortnight_id uuid)
returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  _q public.fortnights%rowtype;
  _e record;
  _ids uuid[]; _notas numeric[]; _menores numeric[];
  _n int; _atual numeric;
  _seq91 int; _seq98 int; _melhora int; _total91 int; _i int;
  _ganhas int[];
  _c int; _cat public.conquistas%rowtype;
  _anterior public.conquistas_ganhas%rowtype; _sequencia int; _mult numeric;
  _inseridas int := 0;
begin
  select * into _q from public.fortnights where id = _fortnight_id;
  if not found or _q.status <> 'fechada' then
    return 0;
  end if;

  -- Idempotente: recalcular a mesma quinzena substitui o que havia.
  delete from public.conquistas_ganhas where fortnight_id = _fortnight_id;

  for _e in
    select distinct ev.employee_id from public.evaluations ev
     where ev.fortnight_id = _fortnight_id and not ev.anulada and ev.nota is not null
  loop
    -- Jornada da pessoa: quinzenas FECHADAS até esta em que ela teve avaliação, em ordem.
    select array_agg(id order by data_inicio), array_agg(nota order by data_inicio), array_agg(menor order by data_inicio)
      into _ids, _notas, _menores
      from (select f.id, f.data_inicio, avg(ev.nota) as nota, min(ev.nota) as menor
              from public.fortnights f
              join public.evaluations ev on ev.fortnight_id = f.id and ev.employee_id = _e.employee_id
                                         and not ev.anulada and ev.nota is not null
             where f.status = 'fechada' and f.data_inicio <= _q.data_inicio
             group by f.id, f.data_inicio) j;
    _n := array_length(_ids, 1);
    _atual := _notas[_n];

    -- Sequências a partir do fim (a quinzena atual).
    _seq91 := 0; _i := _n; while _i >= 1 and _notas[_i] >= 91 loop _seq91 := _seq91 + 1; _i := _i - 1; end loop;
    _seq98 := 0; _i := _n; while _i >= 1 and _notas[_i] >= 98 loop _seq98 := _seq98 + 1; _i := _i - 1; end loop;
    _melhora := 0; _i := _n; while _i >= 2 and _notas[_i] > _notas[_i - 1] loop _melhora := _melhora + 1; _i := _i - 1; end loop;
    select count(*) into _total91 from unnest(_notas) x where x >= 91;

    _ganhas := '{}';
    if _n = 1 then _ganhas := _ganhas || array[1, 35]; end if;                         -- primeira quinzena
    if _atual >= 91 then _ganhas := _ganhas || 2; end if;                              -- Sinal Estável
    if _atual >= 95 then _ganhas := _ganhas || 3; end if;                              -- Sinal Forte
    if _atual >= 98 then _ganhas := _ganhas || 4; end if;                              -- Sinal Máximo
    if _seq91 > 0 and _seq91 % 3 = 0 then _ganhas := _ganhas || 5; end if;             -- Torre (blocos de 3)
    if _menores[_n] >= 91 then _ganhas := _ganhas || 6; end if;                        -- Sem Interferência
    if _atual >= 91 and _total91 % 5 = 0 then _ganhas := _ganhas || 7; end if;         -- Cobertura Nacional (a cada 5)
    if _seq98 > 0 and _seq98 % 2 = 0 then _ganhas := _ganhas || 8; end if;             -- Fibra Óptica (blocos de 2)
    if _n % 5 = 0 and (select avg(x) from unnest(_notas[_n - 4:_n]) x) >= 97 then     -- Sinal de Ouro (a cada 5)
      _ganhas := _ganhas || 9;
    end if;
    if _atual >= 91 and _total91 % 10 = 0 then _ganhas := _ganhas || 10; end if;       -- Antena Mestre (a cada 10)
    if _melhora > 0 and _melhora % 2 = 0 then _ganhas := _ganhas || 30; end if;        -- Manutenção Preventiva
    if _n = 3 then _ganhas := _ganhas || 36; end if;                                    -- Linha Ativada
    if _n = 10 then _ganhas := _ganhas || 42; end if;                                   -- Explorador de Rede

    foreach _c in array _ganhas loop
      select * into _cat from public.conquistas where numero = _c;
      -- Únicas: só se nunca foi ganha antes.
      if _cat.unica and exists (select 1 from public.conquistas_ganhas g
                                 where g.employee_id = _e.employee_id and g.conquista = _c) then
        continue;
      end if;
      -- Bônus de sequência: ganha também na quinzena anterior da pessoa?
      _sequencia := 1;
      if _n >= 2 then
        select * into _anterior from public.conquistas_ganhas g
         where g.employee_id = _e.employee_id and g.conquista = _c and g.fortnight_id = _ids[_n - 1];
        if found then _sequencia := _anterior.sequencia + 1; end if;
      end if;
      _mult := case _sequencia when 1 then 1 when 2 then 1.10 when 3 then 1.20 else 1.25 end;
      insert into public.conquistas_ganhas (employee_id, conquista, fortnight_id, xp, sequencia)
      values (_e.employee_id, _c, _fortnight_id, round(_cat.xp * _mult)::int, _sequencia);
      _inseridas := _inseridas + 1;
    end loop;
  end loop;
  return _inseridas;
end; $$;

revoke all on function public.calcular_conquistas_da_quinzena(uuid) from public, anon, authenticated;

-- ---------- 6. Gatilho: fechar calcula; reabrir retira ----------
create or replace function public.gamificacao_ao_mudar_quinzena()
returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.status = 'fechada' and old.status is distinct from 'fechada' then
    perform public.calcular_conquistas_da_quinzena(new.id);
  elsif old.status = 'fechada' and new.status <> 'fechada' then
    delete from public.conquistas_ganhas where fortnight_id = new.id;
  end if;
  return new;
end; $$;
revoke all on function public.gamificacao_ao_mudar_quinzena() from public, anon, authenticated;

create trigger gamificacao_quinzena
  after update of status on public.fortnights
  for each row execute function public.gamificacao_ao_mudar_quinzena();

-- ---------- 7. Badges em destaque (o próprio colaborador escolhe) ----------
create or replace function public.definir_destaques(_conquistas int[])
returns int[]
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  _emp uuid := public.current_employee_id();
  _lista int[] := coalesce(_conquistas, '{}');
begin
  if _emp is null then
    raise exception 'Apenas colaboradores com cadastro ativo têm perfil.' using errcode = '42501';
  end if;
  if cardinality(_lista) > 5 then
    raise exception 'Você pode destacar até 5 badges.' using errcode = 'P0001';
  end if;
  if cardinality(_lista) <> (select count(distinct x) from unnest(_lista) x) then
    raise exception 'O mesmo badge não pode aparecer duas vezes.' using errcode = 'P0001';
  end if;
  if exists (select 1 from unnest(_lista) x
              where not exists (select 1 from public.conquistas_ganhas g where g.employee_id = _emp and g.conquista = x)) then
    raise exception 'Só é possível destacar conquistas que você já desbloqueou.' using errcode = 'P0001';
  end if;
  insert into public.perfis_colaborador (employee_id, destaques, atualizado_em)
  values (_emp, _lista, now())
  on conflict (employee_id) do update set destaques = excluded.destaques, atualizado_em = now();
  return _lista;
end; $$;
revoke all on function public.definir_destaques(int[]) from public, anon;
grant execute on function public.definir_destaques(int[]) to authenticated;

-- ---------- 8. Retroativo: as quinzenas que já estão fechadas ----------
do $$
declare _f uuid;
begin
  for _f in select id from public.fortnights where status = 'fechada' order by data_inicio loop
    perform public.calcular_conquistas_da_quinzena(_f);
  end loop;
end $$;
