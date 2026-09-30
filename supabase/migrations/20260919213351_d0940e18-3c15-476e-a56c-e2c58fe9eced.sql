
-- ============ ENUMS ============
create type public.app_role as enum ('colaborador','gestor','adm');
create type public.employee_status as enum ('ativo','inativo');
create type public.fortnight_type as enum ('primeira','segunda');
create type public.fortnight_status as enum ('aberta','em_analise','em_contestacao','pronta_para_fechamento','fechada');
create type public.indicator_key as enum ('qualidade','produtividade','csat','sla_chat','sla_email','horas_online');
create type public.evaluation_type as enum ('interacao','ticket_n2');
create type public.contestation_status as enum ('aberta','em_analise','respondida','deferida','indeferida');
create type public.import_status as enum ('pendente','validado','importado','erro');
create type public.criterion_severity as enum ('normal','gravissimo');

-- ============ UPDATED_AT ============
create or replace function public.update_updated_at_column()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end; $$;

-- ============ EMPLOYEES ============
create table public.employees (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete set null,
  nome text not null,
  login text not null unique,
  email text,
  status public.employee_status not null default 'ativo',
  foto_url text,
  perfil public.app_role not null default 'colaborador',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.employees to authenticated;
grant all on public.employees to service_role;
alter table public.employees enable row level security;
create trigger trg_employees_updated before update on public.employees for each row execute function public.update_updated_at_column();
create index idx_employees_user on public.employees(user_id);
create index idx_employees_status on public.employees(status);

-- ============ ROLES ============
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create or replace function public.is_admin(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role in ('adm','gestor'))
$$;

create or replace function public.current_employee_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.employees where user_id = auth.uid() and status = 'ativo' limit 1
$$;

create policy "roles_self_read" on public.user_roles for select to authenticated using (user_id = auth.uid() or public.is_admin(auth.uid()));
create policy "roles_admin_write" on public.user_roles for all to authenticated using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

create policy "employees_self_read" on public.employees for select to authenticated
  using (user_id = auth.uid() or public.is_admin(auth.uid()));
create policy "employees_admin_write" on public.employees for all to authenticated
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

-- ============ FORTNIGHTS ============
create table public.fortnights (
  id uuid primary key default gen_random_uuid(),
  ano int not null,
  mes int not null check (mes between 1 and 12),
  tipo public.fortnight_type not null,
  data_inicio date not null,
  data_fim date not null,
  status public.fortnight_status not null default 'aberta',
  prazo_contestacao_ate timestamptz,
  fechado_em timestamptz,
  fechado_por uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (ano, mes, tipo)
);
grant select, insert, update, delete on public.fortnights to authenticated;
grant all on public.fortnights to service_role;
alter table public.fortnights enable row level security;
create trigger trg_fortnights_updated before update on public.fortnights for each row execute function public.update_updated_at_column();
create policy "fortnights_read_all" on public.fortnights for select to authenticated using (true);
create policy "fortnights_admin_write" on public.fortnights for all to authenticated using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

create or replace function public.fortnight_is_closed(_fortnight_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select status = 'fechada' from public.fortnights where id = _fortnight_id), false)
$$;

-- ============ INDICATORS ============
create table public.indicators (
  id uuid primary key default gen_random_uuid(),
  chave public.indicator_key not null unique,
  nome text not null,
  unidade text,
  meta_operador text,
  meta_valor numeric,
  descricao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.indicators to authenticated;
grant all on public.indicators to service_role;
alter table public.indicators enable row level security;
create trigger trg_indicators_updated before update on public.indicators for each row execute function public.update_updated_at_column();
create policy "indicators_read_all" on public.indicators for select to authenticated using (true);
create policy "indicators_admin_write" on public.indicators for all to authenticated using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

insert into public.indicators (chave, nome, unidade, meta_operador, meta_valor, descricao) values
 ('qualidade','Qualidade','pontos','>=',91,'Mínimo para elegibilidade: 91 (nível 4G)'),
 ('produtividade','Produtividade','tickets/h','>=',null,'Mínimo = 90% da média do time da quinzena'),
 ('csat','CSAT','%','>=',97,'Indicador da equipe. Meta 97%'),
 ('sla_chat','SLA Chat','minutos','<=',5,'Meta de até 5 minutos'),
 ('sla_email','SLA E-mail','minutos','<=',15,'Meta de até 15 minutos'),
 ('horas_online','Horas Online','horas',null,null,'Somente dias efetivamente trabalhados');

-- ============ TEAM METRICS ============
create table public.team_metrics (
  id uuid primary key default gen_random_uuid(),
  fortnight_id uuid not null references public.fortnights(id) on delete cascade,
  indicador public.indicator_key not null,
  media numeric,
  meta numeric,
  minimo_elegibilidade numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (fortnight_id, indicador)
);
grant select, insert, update, delete on public.team_metrics to authenticated;
grant all on public.team_metrics to service_role;
alter table public.team_metrics enable row level security;
create trigger trg_team_metrics_updated before update on public.team_metrics for each row execute function public.update_updated_at_column();
create policy "team_metrics_read_all" on public.team_metrics for select to authenticated using (true);
create policy "team_metrics_admin_write" on public.team_metrics for all to authenticated using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

-- ============ RESULTS ============
create table public.results (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  fortnight_id uuid not null references public.fortnights(id) on delete cascade,
  indicador public.indicator_key not null,
  valor numeric,
  dias_trabalhados int,
  origem text,
  import_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (employee_id, fortnight_id, indicador)
);
grant select, insert, update, delete on public.results to authenticated;
grant all on public.results to service_role;
alter table public.results enable row level security;
create trigger trg_results_updated before update on public.results for each row execute function public.update_updated_at_column();
create index idx_results_emp_fn on public.results(employee_id, fortnight_id);
create policy "results_self_read_after_close" on public.results for select to authenticated
  using (
    public.is_admin(auth.uid())
    or (employee_id = public.current_employee_id() and public.fortnight_is_closed(fortnight_id))
  );
create policy "results_admin_write" on public.results for all to authenticated using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

-- ============ EVALUATION CRITERIA ============
create table public.evaluation_criteria (
  id uuid primary key default gen_random_uuid(),
  versao int not null default 1,
  ordem int not null,
  grupo text not null,
  descricao text not null,
  peso numeric not null,
  gravidade public.criterion_severity not null default 'normal',
  permite_medio boolean not null default false,
  peso_medio numeric,
  orientacao text,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (versao, ordem)
);
grant select, insert, update, delete on public.evaluation_criteria to authenticated;
grant all on public.evaluation_criteria to service_role;
alter table public.evaluation_criteria enable row level security;
create trigger trg_criteria_updated before update on public.evaluation_criteria for each row execute function public.update_updated_at_column();
create policy "criteria_read_all" on public.evaluation_criteria for select to authenticated using (true);
create policy "criteria_admin_write" on public.evaluation_criteria for all to authenticated using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

insert into public.evaluation_criteria (versao, ordem, grupo, descricao, peso, gravidade, permite_medio, peso_medio) values
 (1,1,'LGPD','Cumpriu LGPD?',100,'gravissimo',false,null),
 (1,2,'Tom de voz / Marca','Demonstrou empatia durante o atendimento?',14,'normal',true,8),
 (1,3,'Tom de voz / Marca','Estruturou o atendimento de forma adequada/organizada?',5,'normal',false,null),
 (1,4,'Tom de voz / Marca','A macro utilizada foi relevante/adaptada para o atendimento?',5,'normal',false,null),
 (1,5,'Diagnóstico','Verificou as informações da conta do cliente corretamente?',10,'normal',false,null),
 (1,6,'Diagnóstico','Checou o histórico de interações anteriores?',10,'normal',false,null),
 (1,7,'Diagnóstico','Entendeu completamente a questão do atendimento?',10,'normal',false,null),
 (1,8,'Processo','Passou todas as informações corretamente?',7,'normal',false,null),
 (1,9,'Processo','Executou o processo relativo ao atendimento corretamente?',10,'normal',false,null),
 (1,10,'Processo','Deixou observações internas adequadas?',5,'normal',false,null),
 (1,11,'Processo','Deixou claros os passos, assim como um prazo estimado para a resolução do problema?',5,'normal',false,null),
 (1,12,'Processo','Encaminhou/atualizou o ticket corretamente quando aplicável?',5,'normal',false,null),
 (1,13,'Processo','Fez o processo de encerramento de ticket corretamente?',5,'normal',false,null),
 (1,14,'Processo','O ticket foi tagueado com precisão?',9,'normal',false,null);

-- ============ EVALUATIONS ============
create table public.evaluations (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  fortnight_id uuid not null references public.fortnights(id) on delete cascade,
  ticket text,
  link_conversa text,
  assunto text,
  data_contato date,
  tipo public.evaluation_type not null,
  versao_ficha int not null default 1,
  nota numeric,
  comentarios text,
  avaliador_id uuid references auth.users(id),
  anulada boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.evaluations to authenticated;
grant all on public.evaluations to service_role;
alter table public.evaluations enable row level security;
create trigger trg_evaluations_updated before update on public.evaluations for each row execute function public.update_updated_at_column();
create unique index uq_eval_ticket on public.evaluations(employee_id, fortnight_id, ticket) where ticket is not null and anulada = false;
create index idx_eval_emp_fn on public.evaluations(employee_id, fortnight_id);
create policy "evaluations_self_read_after_close" on public.evaluations for select to authenticated
  using (public.is_admin(auth.uid()) or (employee_id = public.current_employee_id() and public.fortnight_is_closed(fortnight_id)));
create policy "evaluations_admin_write" on public.evaluations for all to authenticated using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

create table public.evaluation_items (
  id uuid primary key default gen_random_uuid(),
  evaluation_id uuid not null references public.evaluations(id) on delete cascade,
  criterion_id uuid not null references public.evaluation_criteria(id),
  resposta text not null,
  desconto numeric not null default 0,
  observacao text,
  created_at timestamptz not null default now(),
  unique (evaluation_id, criterion_id)
);
grant select, insert, update, delete on public.evaluation_items to authenticated;
grant all on public.evaluation_items to service_role;
alter table public.evaluation_items enable row level security;
create policy "eval_items_read" on public.evaluation_items for select to authenticated
  using (public.is_admin(auth.uid()) or exists (
    select 1 from public.evaluations e where e.id = evaluation_id
      and e.employee_id = public.current_employee_id() and public.fortnight_is_closed(e.fortnight_id)));
create policy "eval_items_admin_write" on public.evaluation_items for all to authenticated using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

-- ============ QUIZ ============
create table public.quiz_results (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  fortnight_id uuid not null references public.fortnights(id) on delete cascade,
  entregue boolean not null default false,
  registrado_por uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (employee_id, fortnight_id)
);
grant select, insert, update, delete on public.quiz_results to authenticated;
grant all on public.quiz_results to service_role;
alter table public.quiz_results enable row level security;
create trigger trg_quiz_updated before update on public.quiz_results for each row execute function public.update_updated_at_column();
create policy "quiz_self_read" on public.quiz_results for select to authenticated
  using (public.is_admin(auth.uid()) or employee_id = public.current_employee_id());
create policy "quiz_admin_write" on public.quiz_results for all to authenticated using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

-- ============ ELIGIBILITY ============
create table public.bonus_eligibility (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  fortnight_id uuid not null references public.fortnights(id) on delete cascade,
  elegivel boolean not null default false,
  motivos jsonb not null default '[]'::jsonb,
  versao_regras text,
  calculado_em timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (employee_id, fortnight_id)
);
grant select, insert, update, delete on public.bonus_eligibility to authenticated;
grant all on public.bonus_eligibility to service_role;
alter table public.bonus_eligibility enable row level security;
create trigger trg_elig_updated before update on public.bonus_eligibility for each row execute function public.update_updated_at_column();
create policy "elig_self_read_after_close" on public.bonus_eligibility for select to authenticated
  using (public.is_admin(auth.uid()) or (employee_id = public.current_employee_id() and public.fortnight_is_closed(fortnight_id)));
create policy "elig_admin_write" on public.bonus_eligibility for all to authenticated using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

-- ============ CONTESTATIONS ============
create table public.contestations (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  fortnight_id uuid not null references public.fortnights(id) on delete cascade,
  result_id uuid references public.results(id) on delete set null,
  evaluation_id uuid references public.evaluations(id) on delete set null,
  assunto text not null,
  descricao text not null,
  status public.contestation_status not null default 'aberta',
  responsavel_id uuid references auth.users(id),
  resolucao text,
  respondida_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.contestations to authenticated;
grant all on public.contestations to service_role;
alter table public.contestations enable row level security;
create trigger trg_contest_updated before update on public.contestations for each row execute function public.update_updated_at_column();
create index idx_contest_fn on public.contestations(fortnight_id, status);
create policy "contest_self_read" on public.contestations for select to authenticated
  using (public.is_admin(auth.uid()) or employee_id = public.current_employee_id());
create policy "contest_self_insert" on public.contestations for insert to authenticated
  with check (employee_id = public.current_employee_id());
create policy "contest_admin_write" on public.contestations for all to authenticated using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

create table public.contestation_messages (
  id uuid primary key default gen_random_uuid(),
  contestation_id uuid not null references public.contestations(id) on delete cascade,
  autor_id uuid references auth.users(id),
  autor_tipo text not null,
  mensagem text not null,
  created_at timestamptz not null default now()
);
grant select, insert on public.contestation_messages to authenticated;
grant all on public.contestation_messages to service_role;
alter table public.contestation_messages enable row level security;
create policy "contest_msg_read" on public.contestation_messages for select to authenticated
  using (public.is_admin(auth.uid()) or exists (select 1 from public.contestations c where c.id = contestation_id and c.employee_id = public.current_employee_id()));
create policy "contest_msg_insert" on public.contestation_messages for insert to authenticated
  with check (public.is_admin(auth.uid()) or exists (select 1 from public.contestations c where c.id = contestation_id and c.employee_id = public.current_employee_id()));

-- ============ RANKINGS / PRIZES ============
create table public.rankings (
  id uuid primary key default gen_random_uuid(),
  fortnight_id uuid not null references public.fortnights(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  posicao int not null check (posicao between 1 and 3),
  criterios jsonb not null default '{}'::jsonb,
  gerado_em timestamptz not null default now(),
  unique (fortnight_id, posicao)
);
grant select, insert, update, delete on public.rankings to authenticated;
grant all on public.rankings to service_role;
alter table public.rankings enable row level security;
create policy "rankings_admin_only" on public.rankings for all to authenticated using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

create table public.bonus_prizes (
  id uuid primary key default gen_random_uuid(),
  posicao int not null unique check (posicao between 1 and 3),
  valor numeric,
  descricao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.bonus_prizes to authenticated;
grant all on public.bonus_prizes to service_role;
alter table public.bonus_prizes enable row level security;
create trigger trg_prizes_updated before update on public.bonus_prizes for each row execute function public.update_updated_at_column();
create policy "prizes_admin_only" on public.bonus_prizes for all to authenticated using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

-- ============ IMPORTS / CSAT ============
create table public.data_imports (
  id uuid primary key default gen_random_uuid(),
  fortnight_id uuid references public.fortnights(id) on delete set null,
  indicador public.indicator_key,
  nome_arquivo text not null,
  extensao text not null,
  storage_path text,
  status public.import_status not null default 'pendente',
  linhas_total int,
  linhas_validas int,
  erros jsonb not null default '[]'::jsonb,
  preview jsonb,
  enviado_por uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.data_imports to authenticated;
grant all on public.data_imports to service_role;
alter table public.data_imports enable row level security;
create trigger trg_imports_updated before update on public.data_imports for each row execute function public.update_updated_at_column();
create policy "imports_admin_only" on public.data_imports for all to authenticated using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

create table public.csat_reports (
  id uuid primary key default gen_random_uuid(),
  fortnight_id uuid not null references public.fortnights(id) on delete cascade,
  valor numeric,
  meta numeric not null default 97,
  nome_arquivo text not null,
  storage_path text,
  enviado_por uuid references auth.users(id),
  import_id uuid references public.data_imports(id) on delete set null,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.csat_reports to authenticated;
grant all on public.csat_reports to service_role;
alter table public.csat_reports enable row level security;
create policy "csat_read_all" on public.csat_reports for select to authenticated using (true);
create policy "csat_admin_write" on public.csat_reports for all to authenticated using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

-- ============ NOTIFICATIONS ============
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid references public.employees(id) on delete cascade,
  evento text not null,
  canal text not null default 'slack',
  payload jsonb not null default '{}'::jsonb,
  enviado_em timestamptz,
  erro text,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.notifications to authenticated;
grant all on public.notifications to service_role;
alter table public.notifications enable row level security;
create policy "notif_self_read" on public.notifications for select to authenticated
  using (public.is_admin(auth.uid()) or employee_id = public.current_employee_id());
create policy "notif_admin_write" on public.notifications for all to authenticated using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

-- ============ AUDIT ============
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid references auth.users(id),
  usuario_nome text,
  acao text not null,
  entidade text not null,
  registro_id uuid,
  valor_anterior jsonb,
  valor_novo jsonb,
  motivo text,
  contexto jsonb,
  created_at timestamptz not null default now()
);
grant select, insert on public.audit_logs to authenticated;
grant all on public.audit_logs to service_role;
alter table public.audit_logs enable row level security;
create index idx_audit_created on public.audit_logs(created_at desc);
create policy "audit_admin_read" on public.audit_logs for select to authenticated using (public.is_admin(auth.uid()));
create policy "audit_admin_insert" on public.audit_logs for insert to authenticated with check (public.is_admin(auth.uid()));

-- ============ BUSINESS SETTINGS (pendências) ============
create table public.business_settings (
  id uuid primary key default gen_random_uuid(),
  chave text not null unique,
  titulo text not null,
  descricao text,
  valor jsonb,
  pendente boolean not null default true,
  versao int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.business_settings to authenticated;
grant all on public.business_settings to service_role;
alter table public.business_settings enable row level security;
create trigger trg_settings_updated before update on public.business_settings for each row execute function public.update_updated_at_column();
create policy "settings_read_all" on public.business_settings for select to authenticated using (true);
create policy "settings_admin_write" on public.business_settings for all to authenticated using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

insert into public.business_settings (chave, titulo, descricao) values
 ('qualidade_menos_de_10_avaliacoes','Cálculo da qualidade com menos de 10 avaliações','Regra ainda não definida no projeto.'),
 ('avaliacao_campos_obrigatorios','Campos obrigatórios da avaliação','Obrigatoriedade de assunto/data ainda não definida.'),
 ('avaliacao_justificativa_obrigatoria','Justificativa obrigatória na avaliação','Ainda não definida.'),
 ('avaliacao_selecao','Critério de seleção das avaliações','Ainda não definido.'),
 ('avaliacao_edicao_anulacao','Regras de edição e anulação de avaliações','Ainda não definidas.'),
 ('avaliacao_feedback','Regras de feedback ao colaborador','Ainda não definidas.'),
 ('horas_online_minimo','Regra de horas online para elegibilidade','Baseada nos dias efetivamente trabalhados; parâmetro ainda não definido.'),
 ('erros_criticos','Regras especiais para erros críticos','Ainda não definidas.'),
 ('importacao_mapeamento_colunas','Mapeamento de colunas dos arquivos importados','Estrutura de colunas ainda não definida.');
