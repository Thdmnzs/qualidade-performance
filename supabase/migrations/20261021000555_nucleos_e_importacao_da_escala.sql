-- =====================================================================
-- Os núcleos e a importação da escala (20/10/2026).
--   * Os NÚCLEOS de cada pessoa (rede, cxtech, quali, log, F&R, cob B2B e auto; mais de um por pessoa),
--     marcados pela supervisão, no estilo das folgas fixas. Só registram quem é de qual núcleo.
--   * Os APELIDOS da escala: o nome que a planilha da escala usa para cada pessoa ("Ruby" é a Rubia), para a
--     importação ligar sozinha a partir da segunda vez.
--   * A IMPORTAÇÃO da semana: grava os 7 dias de uma vez (um dia fora do arquivo fica vazio). Numa semana já
--     PUBLICADA, só com a confirmação, e a semana volta para rascunho (o time já via aquela escala).
-- Só o ADM (a supervisão).
-- =====================================================================
create table public.nucleos_das_pessoas (
  employee_id uuid not null references public.employees (id) on delete cascade,
  nucleo text not null check (nucleo in ('rede', 'cxtech', 'quali', 'log', 'F&R', 'cob B2B', 'auto')),
  primary key (employee_id, nucleo)
);
alter table public.nucleos_das_pessoas enable row level security;
revoke all on public.nucleos_das_pessoas from anon, authenticated;

create table public.apelidos_da_escala (
  apelido text primary key check (apelido = lower(btrim(apelido)) and length(apelido) between 1 and 60),
  employee_id uuid not null references public.employees (id) on delete cascade
);
alter table public.apelidos_da_escala enable row level security;
revoke all on public.apelidos_da_escala from anon, authenticated;

create or replace function public.nucleos_do_time()
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public._exigir_adm_da_escala();
  return coalesce((select jsonb_object_agg(employee_id, nucleos) from (
    select employee_id, jsonb_agg(nucleo order by nucleo) as nucleos from public.nucleos_das_pessoas group by employee_id) x), '{}');
end; $$;

create or replace function public.definir_nucleos(_employee_id uuid, _nucleos text[])
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare _eu uuid; _antes jsonb;
begin
  _eu := public._exigir_adm_da_escala();
  if not exists (select 1 from public.employees where id = _employee_id and status = 'ativo') then
    raise exception 'Cadastro não encontrado.' using errcode = 'P0002';
  end if;
  _antes := coalesce((select jsonb_agg(nucleo order by nucleo) from public.nucleos_das_pessoas where employee_id = _employee_id), '[]');
  delete from public.nucleos_das_pessoas where employee_id = _employee_id;
  insert into public.nucleos_das_pessoas (employee_id, nucleo) select _employee_id, n from unnest(coalesce(_nucleos, '{}')) n group by n;
  insert into public.audit_logs (usuario_id, usuario_nome, acao, entidade, registro_id, valor_anterior, valor_novo)
  values (auth.uid(), (select nome from public.employees where user_id = auth.uid() limit 1), 'nucleos_da_pessoa', 'employees', _employee_id,
          jsonb_build_object('nucleos', _antes),
          jsonb_build_object('colaborador', (select nome from public.employees where id = _employee_id),
                             'nucleos', coalesce((select jsonb_agg(nucleo order by nucleo) from public.nucleos_das_pessoas where employee_id = _employee_id), '[]')));
end; $$;

create or replace function public.apelidos_da_escala_do_time()
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public._exigir_adm_da_escala();
  return coalesce((select jsonb_object_agg(apelido, employee_id) from public.apelidos_da_escala), '{}');
end; $$;

--
-- A importação: os 7 dias ({"0": [...], ..., "6": [...]}, como o salvar), e os apelidos novos ({"ruby": id}).
-- Numa semana publicada, só com _confirmar; e ela volta para rascunho.
--
create or replace function public.importar_semana_da_escala(_inicio date, _dias jsonb, _apelidos jsonb, _confirmar boolean)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare _s public.escala_semanas%rowtype; _k int; _ap record; _publicada boolean;
begin
  perform public._exigir_adm_da_escala();
  if jsonb_typeof(coalesce(_dias, '{}'::jsonb)) <> 'object' then raise exception 'Os dias da semana estão num formato inválido.' using errcode = 'P0001'; end if;
  if exists (select 1 from jsonb_object_keys(_dias) k where k !~ '^[0-6]$') then
    raise exception 'O dia precisa ser de 0 (segunda) a 6 (domingo).' using errcode = 'P0001';
  end if;
  _s := public._semana_da_escala(_inicio);
  _publicada := _s.situacao = 'publicada';
  if _publicada and not coalesce(_confirmar, false) then
    raise exception 'A semana já está publicada. Confirme para importar: ela volta para rascunho.' using errcode = 'P0001';
  end if;
  if _publicada then
    update public.escala_semanas set situacao = 'rascunho', publicada_em = null, atualizada_em = now() where id = _s.id;
    select * into _s from public.escala_semanas where id = _s.id;
  end if;
  for _k in 0..6 loop
    perform public._gravar_dia(_s, _k, coalesce(_dias -> _k::text, '[]'::jsonb));
  end loop;
  for _ap in select key, value from jsonb_each_text(coalesce(_apelidos, '{}'::jsonb)) loop
    insert into public.apelidos_da_escala (apelido, employee_id) values (lower(btrim(_ap.key)), _ap.value::uuid)
    on conflict (apelido) do update set employee_id = excluded.employee_id;
  end loop;
  perform public._auditar_escala('escala_importar', _s.id, null, jsonb_build_object('inicio', _s.inicio, 'voltou_para_rascunho', _publicada));
end; $$;

revoke all on function public.nucleos_do_time(), public.definir_nucleos(uuid, text[]), public.apelidos_da_escala_do_time(),
  public.importar_semana_da_escala(date, jsonb, jsonb, boolean) from public, anon;
grant execute on function public.nucleos_do_time(), public.definir_nucleos(uuid, text[]), public.apelidos_da_escala_do_time(),
  public.importar_semana_da_escala(date, jsonb, jsonb, boolean) to authenticated;
