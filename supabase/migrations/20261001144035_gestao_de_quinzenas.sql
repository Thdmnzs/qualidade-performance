-- =====================================================================
-- Gestão de quinzenas.
--
-- Regras (01/10/2026):
--   * 1ª quinzena: dia 1 ao 15. 2ª quinzena: dia 16 ao ÚLTIMO dia do mês
--     (a especificação dizia "16 a 30", o que deixaria o dia 31 sem
--     quinzena e não existe em fevereiro).
--   * O ADM cria a PRÓXIMA quinzena, em sequência; as datas são calculadas
--     pelo banco, nunca digitadas.
--   * A próxima só pode ser criada a partir de 7 dias antes de começar
--     (evita, por cliques repetidos, quinzenas de meses à frente).
--   * Duas quinzenas ativas ao mesmo tempo são normais (a anterior em
--     contestação enquanto a nova corre).
-- =====================================================================

-- ---------- 1. Datas de uma quinzena ----------
create or replace function public.datas_da_quinzena(_ano int, _mes int, _tipo public.fortnight_type)
returns table (inicio date, fim date) language sql immutable as $$
  select case _tipo when 'primeira' then make_date(_ano, _mes, 1) else make_date(_ano, _mes, 16) end,
         case _tipo when 'primeira' then make_date(_ano, _mes, 15)
                    else (make_date(_ano, _mes, 1) + interval '1 month' - interval '1 day')::date end
$$;

-- Versões escalares, para a restrição da tabela (CHECK não aceita subconsulta).
create or replace function public.inicio_da_quinzena(_ano int, _mes int, _tipo public.fortnight_type)
returns date language sql immutable as $$ select inicio from public.datas_da_quinzena(_ano, _mes, _tipo) $$;
create or replace function public.fim_da_quinzena(_ano int, _mes int, _tipo public.fortnight_type)
returns date language sql immutable as $$ select fim from public.datas_da_quinzena(_ano, _mes, _tipo) $$;

revoke all on function public.datas_da_quinzena(int, int, public.fortnight_type) from public, anon, authenticated;
revoke all on function public.inicio_da_quinzena(int, int, public.fortnight_type) from public, anon, authenticated;
revoke all on function public.fim_da_quinzena(int, int, public.fortnight_type) from public, anon, authenticated;

-- ---------- 2. Toda quinzena tem as datas certas para o mês e o tipo ----------
-- Vale para qualquer caminho de escrita, inclusive alterações por fora do sistema.
alter table public.fortnights
  add constraint fortnights_datas_corretas
  check (data_inicio = public.inicio_da_quinzena(ano, mes, tipo)
         and data_fim = public.fim_da_quinzena(ano, mes, tipo));

-- ---------- 3. Criar a próxima quinzena (só ADM, com auditoria) ----------
create or replace function public.criar_proxima_quinzena()
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  _eu uuid := auth.uid();
  _ultima public.fortnights%rowtype;
  _hoje date := public.hoje_fortaleza();
  _ano int;
  _mes int;
  _tipo public.fortnight_type;
  _inicio date;
  _fim date;
  _id uuid;
begin
  if _eu is null or not public.is_admin(_eu) then
    raise exception 'Apenas administradores podem criar quinzenas.' using errcode = '42501';
  end if;

  -- Uma criação por vez (dois cliques simultâneos não criam a mesma quinzena duas vezes).
  perform pg_advisory_xact_lock(hashtext('criar_proxima_quinzena'));

  select * into _ultima from public.fortnights order by data_inicio desc limit 1;

  if not found then
    -- Sem nenhuma quinzena: começa pela que contém o dia de hoje.
    _ano := extract(year from _hoje)::int;
    _mes := extract(month from _hoje)::int;
    _tipo := case when extract(day from _hoje) <= 15 then 'primeira' else 'segunda' end;
  elsif _ultima.tipo = 'primeira' then
    _ano := _ultima.ano; _mes := _ultima.mes; _tipo := 'segunda';
  else
    _ano := case when _ultima.mes = 12 then _ultima.ano + 1 else _ultima.ano end;
    _mes := case when _ultima.mes = 12 then 1 else _ultima.mes + 1 end;
    _tipo := 'primeira';
  end if;

  select inicio, fim into _inicio, _fim from public.datas_da_quinzena(_ano, _mes, _tipo);

  if _inicio > _hoje + 7 then
    raise exception 'A próxima quinzena (% a %) só pode ser criada a partir de %.',
      to_char(_inicio, 'DD/MM/YYYY'), to_char(_fim, 'DD/MM/YYYY'), to_char(_inicio - 7, 'DD/MM/YYYY')
      using errcode = 'P0001';
  end if;

  insert into public.fortnights (ano, mes, tipo, data_inicio, data_fim)
  values (_ano, _mes, _tipo, _inicio, _fim)
  returning id into _id;

  insert into public.audit_logs (usuario_id, usuario_nome, acao, entidade, registro_id, valor_novo)
  values (_eu, (select nome from public.employees where user_id = _eu limit 1),
          'quinzena_criar', 'fortnights', _id,
          jsonb_build_object('ano', _ano, 'mes', _mes, 'tipo', _tipo, 'inicio', _inicio, 'fim', _fim));
  return _id;
end; $$;

revoke all on function public.criar_proxima_quinzena() from public, anon;
grant execute on function public.criar_proxima_quinzena() to authenticated;

-- ---------- 4. Quinzenas só nascem pela função ----------
revoke insert on public.fortnights from authenticated;

-- ---------- 5. Regra registrada ----------
insert into public.business_settings (chave, titulo, descricao, valor, pendente)
values ('datas_das_quinzenas', 'Datas das quinzenas',
        '1ª quinzena: dia 1 ao 15. 2ª quinzena: dia 16 ao último dia do mês. Criadas em sequência pelo ADM, a partir de 7 dias antes do início. Definida em 01/10/2026.',
        jsonb_build_object('primeira', '1 a 15', 'segunda', '16 ao último dia do mês',
                           'criar_com_antecedencia_maxima_dias', 7),
        false)
on conflict (chave) do nothing;
