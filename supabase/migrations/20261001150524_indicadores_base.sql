-- =====================================================================
-- Indicadores: metas e diagnóstico da integração com o Intercom.
--
-- Regras de negócio (01/10/2026):
--   * Produtividade: mínimo de 6 tickets por hora, fixo. SUBSTITUI a regra
--     da especificação ("90% da média do time"), por decisão do responsável.
--     A conta de tickets por hora é a do relatório atual do Intercom
--     (a confirmar com o relatório).
--   * SLA Chat: até 5 min. SLA E-mail: até 15 min. Mediana do tempo da 1ª
--     resposta, contando só o horário de atendimento.
--   * CSAT: 97%. Indicador do TIME (não individual), como na especificação.
--   * Horas logadas: média de 20h por semana na quinzena; semanas por dias
--     corridos (dias da quinzena / 7). Ex.: 15 dias -> 42h51.
--   * Os dados vêm do Intercom pela API; o ADM revisa e aprova.
-- =====================================================================

-- ---------- 1. Metas (fonte única; a tela lê daqui) ----------
insert into public.business_settings (chave, titulo, descricao, valor, pendente)
values ('metas_indicadores', 'Metas dos indicadores',
        'Produtividade >= 6 tickets/h (fixo; substitui a regra de 90% da média). SLA Chat <= 5 min e SLA E-mail <= 15 min (mediana da 1ª resposta, só no horário de atendimento). CSAT >= 97% (do time). Horas logadas: média >= 20h/semana (semanas por dias corridos). Definida em 01/10/2026.',
        jsonb_build_object(
          'produtividade', jsonb_build_object('meta', 6, 'unidade', 'tickets/h', 'sentido', 'minimo', 'escopo', 'individual'),
          'sla_chat', jsonb_build_object('meta', 5, 'unidade', 'min', 'sentido', 'maximo', 'escopo', 'individual',
                                         'calculo', 'mediana da 1ª resposta, horário de atendimento'),
          'sla_email', jsonb_build_object('meta', 15, 'unidade', 'min', 'sentido', 'maximo', 'escopo', 'individual',
                                          'calculo', 'mediana da 1ª resposta, horário de atendimento'),
          'csat', jsonb_build_object('meta', 97, 'unidade', '%', 'sentido', 'minimo', 'escopo', 'time'),
          'horas_online', jsonb_build_object('meta', 20, 'unidade', 'h/semana', 'sentido', 'minimo', 'escopo', 'individual',
                                             'semanas', 'dias da quinzena / 7')
        ),
        false)
on conflict (chave) do nothing;

-- ---------- 2. Diagnóstico da integração com o Intercom ----------
-- Guarda o que o workspace realmente oferece (conjuntos de dados e colunas)
-- e como os atendentes do Intercom se ligam aos cadastros. Só o servidor grava
-- (com a chave de serviço); só o ADM lê.
create table public.intercom_diagnosticos (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  criado_por uuid references auth.users(id) on delete set null,
  ok boolean not null,
  resumo jsonb,
  erro text
);

alter table public.intercom_diagnosticos enable row level security;
revoke all on public.intercom_diagnosticos from anon, authenticated;
grant select on public.intercom_diagnosticos to authenticated;
create policy "intercom_diagnosticos_admin_read" on public.intercom_diagnosticos
  for select to authenticated using (public.is_admin(auth.uid()));
