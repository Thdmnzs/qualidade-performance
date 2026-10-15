-- =====================================================================
-- O acesso rápido editável pelo ADM (14/10/2026).
--
--   * Os grupos (o nome, o emoji e a ordem) e os links (o nome, o endereço, o subgrupo, se é restrito,
--     e a ordem), que antes moravam no código. A carga traz os 7 grupos e os 50 links de hoje.
--   * A leitura: todos os do time; os restritos só chegam ao ADM (decidido aqui, e não na tela).
--   * O ADM acrescenta, edita, reordena e exclui (grupos e links), com o Histórico.
--   * Só endereços https; os tamanhos limitados.
-- =====================================================================
create table public.atalhos_grupos (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique check (length(btrim(nome)) between 1 and 40),
  icone text check (icone is null or length(icone) <= 8),
  ordem int not null
);
create table public.atalhos (
  id uuid primary key default gen_random_uuid(),
  grupo_id uuid not null references public.atalhos_grupos (id) on delete cascade,
  nome text not null check (length(btrim(nome)) between 1 and 60),
  url text not null check (url ~ '^https://[^[:space:]]+$' and length(url) <= 2000),
  sub text check (sub is null or length(btrim(sub)) between 1 and 40),
  restrito boolean not null default false,
  ordem int not null
);
create index atalhos_do_grupo on public.atalhos (grupo_id, ordem);
alter table public.atalhos_grupos enable row level security;
alter table public.atalhos enable row level security;
revoke all on public.atalhos_grupos, public.atalhos from anon, authenticated;

insert into public.atalhos_grupos (nome, icone, ordem) values ('Atendimento', '🎧', 1);
insert into public.atalhos (grupo_id, nome, url, sub, restrito, ordem) values
  ((select id from public.atalhos_grupos where nome = 'Atendimento'), 'Intercom', 'https://app.intercom.com/a/inbox/a3qubsb2/inbox', null, false, 1),
  ((select id from public.atalhos_grupos where nome = 'Atendimento'), 'Dash B2C', 'https://app-dash-fluke.vercel.app/b2c/clients', null, false, 2),
  ((select id from public.atalhos_grupos where nome = 'Atendimento'), 'Dash B2B', 'https://app-dash-21t9r2rr3-fluke.vercel.app/dashboard', null, false, 3),
  ((select id from public.atalhos_grupos where nome = 'Atendimento'), 'Wave', 'https://wave-telecall-admin.vercel.app/line-holders?company=fluke', null, false, 4),
  ((select id from public.atalhos_grupos where nome = 'Atendimento'), 'Consulta de portabilidade (ABR Telecom)', 'https://consultanumero.abrtelecom.com.br/consultanumero/consulta/consultaHistoricoRecenteCtg', null, false, 5),
  ((select id from public.atalhos_grupos where nome = 'Atendimento'), 'Manuais de aparelhos', 'https://ajuda.vodafone.pt/manuais/xiaomi/redmi-note-10-5g-android-11-0/conetividade/configure-o-telefone-para-internet', null, false, 6);
insert into public.atalhos_grupos (nome, icone, ordem) values ('Material de apoio', '📚', 2);
insert into public.atalhos (grupo_id, nome, url, sub, restrito, ordem) values
  ((select id from public.atalhos_grupos where nome = 'Material de apoio'), 'Produto e cliente', 'https://docs.google.com/presentation/d/1UrPiOGQU3ZkmQDaEqeScTpH508JvR-4NmgPnX0Tj6I8/edit', 'Slides', false, 1),
  ((select id from public.atalhos_grupos where nome = 'Material de apoio'), 'Jornada e Status', 'https://docs.google.com/presentation/d/1yHsURsHeZ4xMfdm3zIb7NnsCFOwou5seojx4KRNAgW8/edit', 'Slides', false, 2),
  ((select id from public.atalhos_grupos where nome = 'Material de apoio'), 'Portabilidade', 'https://docs.google.com/presentation/d/1ceRO9CllrD6zXvLDYZ5VjS0_QlhzK5KpK33Sw45Jv8M/edit', 'Slides', false, 3),
  ((select id from public.atalhos_grupos where nome = 'Material de apoio'), 'Logística', 'https://docs.google.com/presentation/d/1OcTjbdXtlSqn6n0f9Gq9P7scF3CqwTCgKD2tGRkVNzU/edit', 'Slides', false, 4),
  ((select id from public.atalhos_grupos where nome = 'Material de apoio'), 'Redes', 'https://docs.google.com/presentation/d/1CJqbIrXthD-TbEwthkvAAG_ubgR3y7npuonngYWamLE/edit', 'Slides', false, 5),
  ((select id from public.atalhos_grupos where nome = 'Material de apoio'), 'Ferramentas de Pagamento', 'https://docs.google.com/presentation/d/16fXT0owPokeJIHHTgc9Qx_p4M2RCYvWgX2eOhZ6pg4g/edit', 'Slides', false, 6),
  ((select id from public.atalhos_grupos where nome = 'Material de apoio'), 'CxTech', 'https://docs.google.com/presentation/d/1MdC1kjVdr8cbLrqAhmNuQ3889OsioiGXenwtaTStCEs/edit', 'Slides', false, 7),
  ((select id from public.atalhos_grupos where nome = 'Material de apoio'), 'Fraude e Risco', 'https://docs.google.com/presentation/d/1KBMwcmIsLEyzKdeOEWE_c-7qfcL_uKD-x2StMP9aSaU/edit', 'Slides', false, 8),
  ((select id from public.atalhos_grupos where nome = 'Material de apoio'), 'Tags e Macros e Micros', 'https://docs.google.com/presentation/d/19K9pY9hQtqgPC_dtpVFtDSb9xZatIbc73U7iuK5Lw6I/edit', 'Slides', false, 9),
  ((select id from public.atalhos_grupos where nome = 'Material de apoio'), 'Qualidade e Treinamento', 'https://docs.google.com/presentation/d/1l0eiCe9eZNZSC3Ufj7IooKQULoSgTHVY2jQ5MU7_F4M/edit', 'Slides', false, 10),
  ((select id from public.atalhos_grupos where nome = 'Material de apoio'), 'Instabilidade', 'https://docs.google.com/presentation/d/1SUNiNW9XrbmGtwe6cdjAmVIa2Psk5deRyJkcjQVCzVI/edit', 'Slides', false, 11),
  ((select id from public.atalhos_grupos where nome = 'Material de apoio'), 'Chip físico e eSIM', 'https://docs.google.com/presentation/d/1_QhIESEd1_KS6BnNl6o4vXRuUwr-fERsTwGXa51qpfs/edit', 'Slides', false, 12),
  ((select id from public.atalhos_grupos where nome = 'Material de apoio'), 'Idwall e Paiwall', 'https://docs.google.com/presentation/d/1-Vl349j-Ph8Df7EqkvbLn2fFS_rOdgQknSKHD-vnU58/edit', 'Slides', false, 13),
  ((select id from public.atalhos_grupos where nome = 'Material de apoio'), 'Reclame Aqui', 'https://docs.google.com/presentation/d/1iZ5a-8u0wgPzFQrfez1tgOD0rTNfCs2tDctwQXUtX5Q/edit', 'Slides', false, 14),
  ((select id from public.atalhos_grupos where nome = 'Material de apoio'), 'Réguas automáticas (n8n, B2B)', 'https://docs.google.com/presentation/d/1w5CLgfqVZHyabphEjiGUcxL4Uy73LM87BCSL8XJnzeo/edit', 'Slides', false, 15),
  ((select id from public.atalhos_grupos where nome = 'Material de apoio'), 'Número virtual: guia rápido', 'https://docs.google.com/presentation/d/169u7yLY7Todvo_TiWUYQEEjPoFV0FY-pwTXY-TxQyWk/edit', 'Slides', false, 16),
  ((select id from public.atalhos_grupos where nome = 'Material de apoio'), 'Dicionário de tags', 'https://www.notion.so/fluke-tmc/Dicion-rio-de-Tags-Assunto-e-Detalhe-1f4cc47b1d7c8091bbf6fc8f2e80aeec', null, false, 17),
  ((select id from public.atalhos_grupos where nome = 'Material de apoio'), 'Salva-vidas (site)', 'https://sites.google.com/flukeoperadora.com.br/cx-infos/p%C3%A1gina-inicial', null, false, 18),
  ((select id from public.atalhos_grupos where nome = 'Material de apoio'), 'Notion da Fluke', 'https://www.notion.so/fluke-tmc/Fluke-4db4262142d54224941b86605d5e0408', null, false, 19),
  ((select id from public.atalhos_grupos where nome = 'Material de apoio'), 'Salva-vidas (Notion)', 'https://www.notion.so/fluke-tmc/salva-vidas-a978bc7e88d74862b114bc35569ab7c9', null, false, 20),
  ((select id from public.atalhos_grupos where nome = 'Material de apoio'), 'Miro: processos de atendimento', 'https://miro.com/app/board/uXjVOALyHuk=/', null, false, 21),
  ((select id from public.atalhos_grupos where nome = 'Material de apoio'), 'Figma: fluxo do eSIM', 'https://www.figma.com/design/Tf9jZZVIaQC9fkrlATiNcG/-APP--melhorias-fluxo-aquisi%C3%A7%C3%A3o?node-id=370-2142&p=f', null, false, 22),
  ((select id from public.atalhos_grupos where nome = 'Material de apoio'), 'Figma: plataforma B2B', 'https://www.figma.com/design/DIokRgBmN0LBVpiAMxekw7/plataforma-b2b?node-id=2682-18168&p=f&t=YfuhP1xRPja4uPiE-0', null, false, 23);
insert into public.atalhos_grupos (nome, icone, ordem) values ('Financeiro', '💳', 3);
insert into public.atalhos (grupo_id, nome, url, sub, restrito, ordem) values
  ((select id from public.atalhos_grupos where nome = 'Financeiro'), 'Stripe', 'https://dashboard.stripe.com/acct_1JNlp9EFYWOdGeHF/payments', null, false, 1),
  ((select id from public.atalhos_grupos where nome = 'Financeiro'), 'Pagar.me', 'https://id.pagar.me/signin', null, false, 2),
  ((select id from public.atalhos_grupos where nome = 'Financeiro'), 'Leitor de QR Code (Pix)', 'https://www.qrplus.com.br/decodificar-qr-code', null, false, 3),
  ((select id from public.atalhos_grupos where nome = 'Financeiro'), 'Comprovantes de pagamento', 'https://docs.google.com/spreadsheets/d/1o_ohvIXhH8P6helqQVi3gpPxopVM7XqIam_6IHj6YSQ/edit', null, false, 4);
insert into public.atalhos_grupos (nome, icone, ordem) values ('Comunicação', '✉️', 4);
insert into public.atalhos (grupo_id, nome, url, sub, restrito, ordem) values
  ((select id from public.atalhos_grupos where nome = 'Comunicação'), 'Gmail', 'https://mail.google.com/mail/u/0/', null, false, 1),
  ((select id from public.atalhos_grupos where nome = 'Comunicação'), 'Slack', 'https://app.slack.com/client/T8LRQ6DU2', null, false, 2);
insert into public.atalhos_grupos (nome, icone, ordem) values ('A Fluke na web', '🌐', 5);
insert into public.atalhos (grupo_id, nome, url, sub, restrito, ordem) values
  ((select id from public.atalhos_grupos where nome = 'A Fluke na web'), 'Reclame Aqui', 'https://www.reclameaqui.com.br/empresa/fluke-operadora/', null, false, 1),
  ((select id from public.atalhos_grupos where nome = 'A Fluke na web'), 'Site: pessoa física', 'https://flu.ke/', null, false, 2),
  ((select id from public.atalhos_grupos where nome = 'A Fluke na web'), 'Site: empresas', 'https://flu.ke/empresas', null, false, 3),
  ((select id from public.atalhos_grupos where nome = 'A Fluke na web'), 'Site: agentes de voz', 'https://flu.ke/empresas/produtos/agentes-de-voz', null, false, 4);
insert into public.atalhos_grupos (nome, icone, ordem) values ('Consultas', '🔎', 6);
insert into public.atalhos (grupo_id, nome, url, sub, restrito, ordem) values
  ((select id from public.atalhos_grupos where nome = 'Consultas'), 'Jira: chamados', 'https://telecall.atlassian.net/servicedesk/customer/user/login?destination=portals', null, false, 1),
  ((select id from public.atalhos_grupos where nome = 'Consultas'), 'Anatel: IMEI bloqueado', 'https://www.gov.br/anatel/pt-br/assuntos/celular-legal/consulte-sua-situacao', null, false, 2),
  ((select id from public.atalhos_grupos where nome = 'Consultas'), 'Vivo: mapa de cobertura', 'https://mapadecobertura.vivo.com.br/', null, false, 3),
  ((select id from public.atalhos_grupos where nome = 'Consultas'), 'Receita: consulta de CPF', 'https://servicos.receita.fazenda.gov.br/servicos/cpf/consultasituacao/consultapublica.asp', null, false, 4),
  ((select id from public.atalhos_grupos where nome = 'Consultas'), 'Downdetector', 'https://downdetector.com.br/', null, false, 5),
  ((select id from public.atalhos_grupos where nome = 'Consultas'), 'Receita: consulta de CNPJ', 'https://solucoes.receita.fazenda.gov.br/servicos/cnpjreva/cnpjreva_solicitacao.asp', null, false, 6),
  ((select id from public.atalhos_grupos where nome = 'Consultas'), 'Consulta de IMEI', 'https://www.consultaserialaparelho.com.br/public-web/homeSiga', null, false, 7);
insert into public.atalhos_grupos (nome, icone, ordem) values ('Planilhas', '📊', 7);
insert into public.atalhos (grupo_id, nome, url, sub, restrito, ordem) values
  ((select id from public.atalhos_grupos where nome = 'Planilhas'), 'Onboarding', 'https://docs.google.com/spreadsheets/d/1WaSGdQiJ3sKtCIQwgbZm95axHg8XCu5bHqteVQaImjY/edit', null, false, 1),
  ((select id from public.atalhos_grupos where nome = 'Planilhas'), 'PIN/PUK (chips físicos)', 'https://docs.google.com/spreadsheets/d/1kFLO9NABeTdvv6QlqlcN3gsG1W_OgYmr/edit', null, true, 2),
  ((select id from public.atalhos_grupos where nome = 'Planilhas'), 'Modelo: histórico de consumo', 'https://docs.google.com/spreadsheets/d/1-UQk2DWpdx8QqjPFeUeqayavcO9r-WI1JDS_A5XK9u0/edit', null, false, 3),
  ((select id from public.atalhos_grupos where nome = 'Planilhas'), 'PIN/PUK (eSIM)', 'https://docs.google.com/spreadsheets/d/1sBKXuuCIL07NulPNOYZIOFG8R_ZMlemw/edit', null, true, 4);

-- ---------- A leitura ----------
create or replace function public.acesso_rapido()
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare _adm boolean := public.is_admin(auth.uid());
begin
  if not public.eh_membro() then
    raise exception 'Seu acesso não está vinculado a um colaborador ativo.' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', g.id, 'nome', g.nome, 'icone', g.icone, 'links', g.links) order by g.ordem)
      from (select gr.id, gr.nome, gr.icone, gr.ordem,
                   coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'nome', a.nome, 'url', a.url, 'sub', a.sub, 'restrito', a.restrito) order by a.ordem)
                               from public.atalhos a where a.grupo_id = gr.id and (_adm or not a.restrito)), '[]'::jsonb) as links
              from public.atalhos_grupos gr) g
     where _adm or jsonb_array_length(g.links) > 0), '[]'::jsonb);
end; $$;

-- ---------- A edição (o ADM) ----------
create or replace function public._auditar_atalho(_acao text, _registro uuid, _depois jsonb)
returns void
language sql security definer set search_path = public, pg_temp as $$
  insert into public.audit_logs (usuario_id, usuario_nome, acao, entidade, registro_id, valor_anterior, valor_novo)
  values (auth.uid(), (select nome from public.employees where user_id = auth.uid() limit 1), _acao, 'acesso_rapido', _registro, null, _depois)
$$;
create or replace function public._exigir_adm_do_acesso()
returns void
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'Apenas o ADM edita o acesso rápido.' using errcode = '42501';
  end if;
end; $$;

-- Criar (sem o id) ou mudar um grupo.
create or replace function public.salvar_grupo_de_atalhos(_id uuid, _nome text, _icone text)
returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare _n text := nullif(btrim(coalesce(_nome, '')), ''); _i text := nullif(btrim(coalesce(_icone, '')), ''); _r uuid;
begin
  perform public._exigir_adm_do_acesso();
  if _n is null or length(_n) > 40 then raise exception 'O nome do grupo precisa ter de 1 a 40 caracteres.' using errcode = 'P0001'; end if;
  if length(coalesce(_i, '')) > 8 then raise exception 'O ícone precisa ser um emoji só.' using errcode = 'P0001'; end if;
  if exists (select 1 from public.atalhos_grupos where lower(nome) = lower(_n) and id is distinct from _id) then
    raise exception 'Já existe um grupo com esse nome.' using errcode = 'P0001';
  end if;
  if _id is null then
    insert into public.atalhos_grupos (nome, icone, ordem) values (_n, _i, coalesce((select max(ordem) from public.atalhos_grupos), 0) + 1) returning id into _r;
  else
    update public.atalhos_grupos set nome = _n, icone = _i where id = _id returning id into _r;
    if _r is null then raise exception 'Grupo não encontrado.' using errcode = 'P0002'; end if;
  end if;
  perform public._auditar_atalho(case when _id is null then 'atalho_grupo_criar' else 'atalho_grupo_editar' end, _r, jsonb_build_object('grupo', _n));
  return _r;
end; $$;

create or replace function public.excluir_grupo_de_atalhos(_id uuid)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare _n text; _q int;
begin
  perform public._exigir_adm_do_acesso();
  select nome into _n from public.atalhos_grupos where id = _id;
  if _n is null then raise exception 'Grupo não encontrado.' using errcode = 'P0002'; end if;
  _q := (select count(*) from public.atalhos where grupo_id = _id);
  delete from public.atalhos_grupos where id = _id; -- os links do grupo saem junto
  perform public._auditar_atalho('atalho_grupo_excluir', _id, jsonb_build_object('grupo', _n, 'links', _q));
end; $$;

-- Subir (-1) ou descer (+1) um grupo, trocando de lugar com o vizinho.
create or replace function public.mover_grupo_de_atalhos(_id uuid, _direcao int)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare _o int; _viz uuid; _ov int;
begin
  perform public._exigir_adm_do_acesso();
  select ordem into _o from public.atalhos_grupos where id = _id;
  if _o is null then raise exception 'Grupo não encontrado.' using errcode = 'P0002'; end if;
  select id, ordem into _viz, _ov from public.atalhos_grupos
   where case when _direcao < 0 then ordem < _o else ordem > _o end
   order by case when _direcao < 0 then -ordem else ordem end limit 1;
  if _viz is null then return; end if; -- já é o primeiro (ou o último)
  update public.atalhos_grupos set ordem = _ov where id = _id;
  update public.atalhos_grupos set ordem = _o where id = _viz;
end; $$;

-- Criar (sem o id) ou mudar um link.
create or replace function public.salvar_atalho(_id uuid, _grupo_id uuid, _nome text, _url text, _sub text, _restrito boolean)
returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare _n text := nullif(btrim(coalesce(_nome, '')), ''); _u text := btrim(coalesce(_url, '')); _s text := nullif(btrim(coalesce(_sub, '')), ''); _r uuid;
begin
  perform public._exigir_adm_do_acesso();
  if not exists (select 1 from public.atalhos_grupos where id = _grupo_id) then raise exception 'Grupo não encontrado.' using errcode = 'P0002'; end if;
  if _n is null or length(_n) > 60 then raise exception 'O nome do link precisa ter de 1 a 60 caracteres.' using errcode = 'P0001'; end if;
  if _u !~ '^https://[^[:space:]]+$' or length(_u) > 2000 then raise exception 'O endereço precisa começar com https:// (e não ter espaços).' using errcode = 'P0001'; end if;
  if length(coalesce(_s, '')) > 40 then raise exception 'O subgrupo pode ter até 40 caracteres.' using errcode = 'P0001'; end if;
  if _id is null then
    insert into public.atalhos (grupo_id, nome, url, sub, restrito, ordem)
    values (_grupo_id, _n, _u, _s, coalesce(_restrito, false), coalesce((select max(ordem) from public.atalhos where grupo_id = _grupo_id), 0) + 1) returning id into _r;
  else
    update public.atalhos set grupo_id = _grupo_id, nome = _n, url = _u, sub = _s, restrito = coalesce(_restrito, false),
      ordem = case when grupo_id = _grupo_id then ordem else coalesce((select max(ordem) from public.atalhos where grupo_id = _grupo_id), 0) + 1 end
     where id = _id returning id into _r;
    if _r is null then raise exception 'Link não encontrado.' using errcode = 'P0002'; end if;
  end if;
  perform public._auditar_atalho(case when _id is null then 'atalho_criar' else 'atalho_editar' end, _r,
    jsonb_build_object('link', _n, 'grupo', (select nome from public.atalhos_grupos where id = _grupo_id), 'restrito', coalesce(_restrito, false)));
  return _r;
end; $$;

create or replace function public.excluir_atalho(_id uuid)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare _n text; _g text;
begin
  perform public._exigir_adm_do_acesso();
  select a.nome, g.nome into _n, _g from public.atalhos a join public.atalhos_grupos g on g.id = a.grupo_id where a.id = _id;
  if _n is null then raise exception 'Link não encontrado.' using errcode = 'P0002'; end if;
  delete from public.atalhos where id = _id;
  perform public._auditar_atalho('atalho_excluir', _id, jsonb_build_object('link', _n, 'grupo', _g));
end; $$;

create or replace function public.mover_atalho(_id uuid, _direcao int)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare _o int; _g uuid; _viz uuid; _ov int;
begin
  perform public._exigir_adm_do_acesso();
  select ordem, grupo_id into _o, _g from public.atalhos where id = _id;
  if _o is null then raise exception 'Link não encontrado.' using errcode = 'P0002'; end if;
  select id, ordem into _viz, _ov from public.atalhos
   where grupo_id = _g and case when _direcao < 0 then ordem < _o else ordem > _o end
   order by case when _direcao < 0 then -ordem else ordem end limit 1;
  if _viz is null then return; end if;
  update public.atalhos set ordem = _ov where id = _id;
  update public.atalhos set ordem = _o where id = _viz;
end; $$;

revoke all on function public._auditar_atalho(text, uuid, jsonb), public._exigir_adm_do_acesso() from public, anon, authenticated;
revoke all on function public.acesso_rapido(), public.salvar_grupo_de_atalhos(uuid, text, text), public.excluir_grupo_de_atalhos(uuid),
  public.mover_grupo_de_atalhos(uuid, int), public.salvar_atalho(uuid, uuid, text, text, text, boolean), public.excluir_atalho(uuid),
  public.mover_atalho(uuid, int) from public, anon;
grant execute on function public.acesso_rapido(), public.salvar_grupo_de_atalhos(uuid, text, text), public.excluir_grupo_de_atalhos(uuid),
  public.mover_grupo_de_atalhos(uuid, int), public.salvar_atalho(uuid, uuid, text, text, text, boolean), public.excluir_atalho(uuid),
  public.mover_atalho(uuid, int) to authenticated;
