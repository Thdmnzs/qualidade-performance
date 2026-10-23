-- =====================================================================
-- Os contatos de emergência a mais (23/10/2026): além do contato principal (as colunas de sempre), até 3 contatos,
-- cada um com o nome, o parentesco e o telefone (as mesmas regras do principal). Quem vê: a pessoa e o ADM.
-- =====================================================================
alter table public.dados_pessoais add column contatos_extras jsonb not null default '[]'
  check (jsonb_typeof(contatos_extras) = 'array' and jsonb_array_length(contatos_extras) <= 3);

create or replace function public._ficha_de(_emp uuid)
returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'nome', e.nome,
    'aniversario_dia', p.aniversario_dia, 'aniversario_mes', p.aniversario_mes,
    'aniversario_visivel', coalesce(p.aniversario_visivel, true), 'aniversario_tema', coalesce(p.aniversario_tema, true),
    'cep', d.cep, 'rua', d.rua, 'numero', d.numero, 'complemento', d.complemento, 'bairro', d.bairro, 'cidade', d.cidade, 'uf', d.uf,
    'contato_nome', d.contato_nome, 'contato_parentesco', d.contato_parentesco, 'contato_telefone', d.contato_telefone,
    'contatos_extras', coalesce(d.contatos_extras, '[]'::jsonb),
    'atualizado_em', d.atualizado_em, 'corrigido_pela_adm', coalesce(d.corrigido_pela_adm, false))
  from public.employees e
  left join public.perfis_colaborador p on p.employee_id = e.id
  left join public.dados_pessoais d on d.employee_id = e.id
  where e.id = _emp
$$;

-- Gravar os contatos a mais: sem _employee_id, os da própria pessoa; com ele, os de outra (só o ADM).
create or replace function public.salvar_contatos_extras(_employee_id uuid, _contatos jsonb)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare _emp uuid; _pela_adm boolean := _employee_id is not null; _c jsonb; _limpos jsonb := '[]'; _nome text; _tel text; _par text;
begin
  if _pela_adm then
    if not public.is_admin(auth.uid()) then raise exception 'Apenas o ADM corrige os dados pessoais do time.' using errcode = '42501'; end if;
    _emp := _employee_id;
  else
    _emp := public.current_employee_id();
    if _emp is null then raise exception 'Apenas colaboradores com cadastro ativo têm perfil.' using errcode = '42501'; end if;
  end if;
  if jsonb_typeof(coalesce(_contatos, '[]')) <> 'array' then raise exception 'Os contatos estão num formato inválido.' using errcode = 'P0001'; end if;
  if jsonb_array_length(coalesce(_contatos, '[]')) > 3 then raise exception 'São no máximo 3 contatos a mais.' using errcode = 'P0001'; end if;
  for _c in select * from jsonb_array_elements(coalesce(_contatos, '[]')) loop
    _nome := btrim(coalesce(_c ->> 'nome', ''));
    _tel := regexp_replace(coalesce(_c ->> 'telefone', ''), '\D', '', 'g');
    _par := nullif(btrim(coalesce(_c ->> 'parentesco', '')), '');
    if _nome = '' and _tel = '' then continue; end if; -- um contato em branco é ignorado
    if _nome = '' then raise exception 'Escreva o nome de cada contato de emergência.' using errcode = 'P0001'; end if;
    if length(_nome) > 80 or length(coalesce(_par, '')) > 40 then raise exception 'O nome ou o parentesco está longo demais.' using errcode = 'P0001'; end if;
    if length(_tel) not between 10 and 11 then raise exception 'O telefone de cada contato precisa ter o DDD e o número.' using errcode = 'P0001'; end if;
    _limpos := _limpos || jsonb_build_object('nome', _nome, 'parentesco', _par, 'telefone', _tel);
  end loop;
  insert into public.dados_pessoais (employee_id, contatos_extras, atualizado_em, corrigido_pela_adm)
  values (_emp, _limpos, now(), _pela_adm)
  on conflict (employee_id) do update set contatos_extras = excluded.contatos_extras, atualizado_em = now(),
    corrigido_pela_adm = public.dados_pessoais.corrigido_pela_adm or excluded.corrigido_pela_adm;
end; $$;
revoke all on function public.salvar_contatos_extras(uuid, jsonb) from public, anon;
grant execute on function public.salvar_contatos_extras(uuid, jsonb) to authenticated;
