-- =====================================================================
-- Os limites de tamanho dos textos livres (revisão de segurança, 09/10/2026).
-- Ficam na PRÓPRIA TABELA: valem para qualquer caminho de gravação (as funções
-- de hoje e as do futuro). Sem eles, quem pode gravar poderia guardar um texto
-- de vários megabytes, enchendo o banco e deixando as telas lentas.
-- Os valores são generosos: o maior texto existente hoje tem 76 caracteres.
-- =====================================================================
alter table public.evaluations
  add constraint evaluations_comentarios_tamanho check (comentarios is null or length(comentarios) <= 4000),
  add constraint evaluations_assunto_tamanho check (assunto is null or length(assunto) <= 200),
  add constraint evaluations_link_tamanho check (link_conversa is null or length(link_conversa) <= 500),
  add constraint evaluations_motivo_anulacao_tamanho check (motivo_anulacao is null or length(motivo_anulacao) <= 1000);

alter table public.evaluation_items
  add constraint evaluation_items_observacao_tamanho check (observacao is null or length(observacao) <= 2000);

alter table public.contestations
  add constraint contestations_assunto_tamanho check (assunto is null or length(assunto) <= 300),
  add constraint contestations_descricao_tamanho check (descricao is null or length(descricao) <= 2000),
  add constraint contestations_resolucao_tamanho check (resolucao is null or length(resolucao) <= 2000);

alter table public.sorteios_contato
  add constraint sorteios_motivo_tamanho check (motivo_descarte is null or length(motivo_descarte) <= 1000),
  add constraint sorteios_link_tamanho check (link is null or length(link) <= 500),
  add constraint sorteios_conversa_tamanho check (conversa_id is null or length(conversa_id) <= 40);

alter table public.employees
  add constraint employees_nome_tamanho check (length(nome) <= 120),
  add constraint employees_email_tamanho check (email is null or length(email) <= 254),
  add constraint employees_login_tamanho check (login is null or length(login) <= 80);
