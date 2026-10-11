-- =====================================================================
-- Os feriados de 2026, como estavam na planilha "escala cx" (aba "férias 26"),
-- pré-cadastrados para a supervisão não precisar marcá-los de novo (11/10/2026).
-- Daqui em diante, ela os marca ou desmarca pela tela de férias.
-- Rodar de novo não duplica nada.
--
-- E um ajuste no histórico das férias: o registro passa a guardar o NOME da
-- pessoa (como as avaliações guardam o "colaborador"), para a tela Histórico
-- escrever "marcou as férias de Ruby Lima", e não "de um colaborador".
-- =====================================================================
insert into public.feriados (data) values
  ('2026-01-01'), ('2026-01-25'),
  ('2026-02-16'), ('2026-02-17'),
  ('2026-04-03'), ('2026-04-04'), ('2026-04-05'), ('2026-04-20'), ('2026-04-21'),
  ('2026-05-01'),
  ('2026-06-04'), ('2026-06-05'),
  ('2026-07-09'),
  ('2026-09-07'),
  ('2026-10-12'),
  ('2026-11-02'), ('2026-11-15'), ('2026-11-20'),
  ('2026-12-25')
on conflict (data) do nothing;

create or replace function public.definir_ferias(_employee_id uuid, _datas date[], _de_ferias boolean)
returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare _n int;
begin
  perform public._exigir_adm_da_escala();
  if not exists (select 1 from public.employees where id = _employee_id and status = 'ativo') then
    raise exception 'A pessoa precisa ser um cadastro ativo.' using errcode = 'P0001';
  end if;
  if coalesce(array_length(_datas, 1), 0) = 0 or array_length(_datas, 1) > 366 then
    raise exception 'Escolha de 1 a 366 dias.' using errcode = 'P0001';
  end if;
  if _de_ferias then
    insert into public.ferias_dias (data, employee_id) select distinct d, _employee_id from unnest(_datas) d on conflict do nothing;
  else
    delete from public.ferias_dias where employee_id = _employee_id and data = any (_datas);
  end if;
  get diagnostics _n = row_count;
  if _n > 0 then
    perform public._auditar_escala(case when _de_ferias then 'ferias_marcar' else 'ferias_tirar' end, _employee_id, null,
      jsonb_build_object('datas', (select jsonb_agg(d order by d) from (select distinct unnest(_datas) d) x),
                         'colaborador', (select nome from public.employees where id = _employee_id)));
  end if;
  return _n;
end; $$;
