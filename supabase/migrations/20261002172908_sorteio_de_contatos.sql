-- =====================================================================
-- Sorteio de contatos do Intercom para avaliação.
--
-- Regras (02/10/2026):
--   * O servidor sorteia uma conversa encerrada do colaborador na quinzena.
--   * Um contato em aberto por vez (avaliador + colaborador + quinzena + tipo):
--     para sortear outro, é preciso DESCARTAR o atual com justificativa.
--   * A mesma conversa nunca é sorteada duas vezes para a mesma pessoa e
--     quinzena, nem uma conversa já avaliada.
--   * Mesmas permissões da avaliação (pode_atuar_sobre, quinzena aberta).
--   * Nenhuma conversa é guardada: só o número e o link. O texto é buscado
--     no Intercom na hora e só aparece na tela.
-- =====================================================================

create table public.sorteios_contato (
  id uuid primary key default gen_random_uuid(),
  sorteado_por uuid references auth.users(id) on delete set null,
  employee_id uuid not null references public.employees(id) on delete cascade,
  fortnight_id uuid not null references public.fortnights(id) on delete cascade,
  tipo public.evaluation_type not null,
  conversa_id text not null,
  link text not null,
  criado_em timestamptz not null default now(),
  descartado_em timestamptz,
  motivo_descarte text,
  unique (employee_id, fortnight_id, conversa_id),
  check ((descartado_em is null) = (motivo_descarte is null))
);

alter table public.sorteios_contato enable row level security;
revoke all on public.sorteios_contato from anon, authenticated;
grant select on public.sorteios_contato to authenticated;
-- O ADM vê todos (inclusive os descartes, para acompanhar); o avaliador, os seus.
create policy "sorteios_read" on public.sorteios_contato for select to authenticated
  using (public.is_admin(auth.uid()) or sorteado_por = auth.uid());

-- Em aberto = não descartado e ainda sem avaliação registrada com aquele link.
create or replace function public.sorteio_em_aberto(_s public.sorteios_contato)
returns boolean language sql stable security definer set search_path = public as $$
  select _s.descartado_em is null
     and not exists (select 1 from public.evaluations e
                      where e.employee_id = _s.employee_id and e.fortnight_id = _s.fortnight_id
                        and e.link_conversa = _s.link and not e.anulada)
$$;

-- ---------- Registrar um sorteio (só o servidor, depois de escolher a conversa) ----------
create or replace function public.registrar_sorteio_contato(
  _chamador uuid, _employee_id uuid, _fortnight_id uuid, _tipo public.evaluation_type,
  _conversa_id text, _link text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  _id uuid;
begin
  if _chamador is null or not (public.is_admin(_chamador) or public.is_avaliador(_chamador)) then
    raise exception 'Apenas avaliadores e administradores ativos podem sortear contatos.' using errcode = '42501';
  end if;
  if not public.pode_atuar_sobre(_chamador, _employee_id) then
    raise exception 'Você não pode sortear contatos para este colaborador.' using errcode = '42501';
  end if;
  if not public.quinzena_aceita_avaliacoes(_fortnight_id) then
    raise exception 'Esta quinzena não está aberta para avaliações.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.sorteios_contato s
              where s.sorteado_por = _chamador and s.employee_id = _employee_id
                and s.fortnight_id = _fortnight_id and s.tipo = _tipo and public.sorteio_em_aberto(s)) then
    raise exception 'Já existe um contato sorteado em aberto para este colaborador. Avalie-o ou descarte-o com justificativa antes de sortear outro.'
      using errcode = 'P0001';
  end if;
  if exists (select 1 from public.evaluations e
              where e.employee_id = _employee_id and e.fortnight_id = _fortnight_id
                and e.link_conversa = _link and not e.anulada) then
    raise exception 'Esta conversa já foi avaliada para este colaborador nesta quinzena.' using errcode = 'P0001';
  end if;

  begin
    insert into public.sorteios_contato (sorteado_por, employee_id, fortnight_id, tipo, conversa_id, link)
    values (_chamador, _employee_id, _fortnight_id, _tipo, _conversa_id, _link)
    returning id into _id;
  exception when unique_violation then
    raise exception 'Esta conversa já foi sorteada para este colaborador nesta quinzena.' using errcode = 'P0001';
  end;

  insert into public.audit_logs (usuario_id, usuario_nome, acao, entidade, registro_id, valor_novo)
  values (_chamador, (select nome from public.employees where user_id = _chamador limit 1),
          'sortear_contato', 'sorteios_contato', _id,
          jsonb_build_object('colaborador', (select nome from public.employees where id = _employee_id),
                             'tipo', _tipo, 'conversa_id', _conversa_id));
  return _id;
end; $$;

-- ---------- Descartar o contato em aberto, com justificativa ----------
create or replace function public.descartar_sorteio_contato(_chamador uuid, _sorteio_id uuid, _motivo text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  _s public.sorteios_contato%rowtype;
  _motivo_limpo text := nullif(btrim(_motivo), '');
begin
  select * into _s from public.sorteios_contato where id = _sorteio_id for update;
  if not found then
    raise exception 'Sorteio não encontrado.' using errcode = 'P0002';
  end if;
  if _chamador is null or not (public.is_admin(_chamador) or _s.sorteado_por = _chamador) then
    raise exception 'Só quem sorteou, ou um ADM, pode descartar este contato.' using errcode = '42501';
  end if;
  if not public.sorteio_em_aberto(_s) then
    raise exception 'Este contato não está mais em aberto (já foi avaliado ou descartado).' using errcode = 'P0001';
  end if;
  if _motivo_limpo is null or length(_motivo_limpo) < 10 then
    raise exception 'Explique por que o contato será descartado (pelo menos 10 caracteres).' using errcode = 'P0001';
  end if;

  update public.sorteios_contato set descartado_em = now(), motivo_descarte = _motivo_limpo where id = _sorteio_id;

  insert into public.audit_logs (usuario_id, usuario_nome, acao, entidade, registro_id, valor_novo)
  values (_chamador, (select nome from public.employees where user_id = _chamador limit 1),
          'descartar_contato', 'sorteios_contato', _sorteio_id,
          jsonb_build_object('conversa_id', _s.conversa_id, 'motivo', _motivo_limpo));
end; $$;

revoke all on function public.sorteio_em_aberto(public.sorteios_contato) from public, anon;
grant execute on function public.sorteio_em_aberto(public.sorteios_contato) to authenticated;
revoke all on function public.registrar_sorteio_contato(uuid, uuid, uuid, public.evaluation_type, text, text) from public, anon, authenticated;
revoke all on function public.descartar_sorteio_contato(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.registrar_sorteio_contato(uuid, uuid, uuid, public.evaluation_type, text, text) to service_role;
grant execute on function public.descartar_sorteio_contato(uuid, uuid, text) to service_role;
