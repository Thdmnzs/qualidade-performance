# Especificação do produto

> Documento original de requisitos (o "prompt mestre" usado na primeira versão do projeto).
> É a fonte de verdade das regras de negócio. Onde ele cita o Lovable, leia como "o frontend da aplicação":
> o projeto hoje é mantido fora do Lovable e hospedado na Vercel.


PROMPT MESTRE — PLATAFORMA DE QUALIDADE & PERFORMANCE

Crie uma aplicação web interna completa chamada Plataforma de Qualidade & Performance, utilizando:

Lovable para frontend e implementação da aplicação.

Supabase para autenticação, banco PostgreSQL, Storage, Row Level Security (RLS) e funções necessárias.

Interface responsiva para desktop e tablet.

Idioma principal: Português do Brasil.

Formatação monetária: BRL.

Datas no padrão brasileiro.

Timezone da aplicação: America/Fortaleza.

1. FONTE DE VERDADE E REGRA DE PRIORIDADE

Use como base toda a especificação consolidada da Plataforma de Qualidade & Performance v3.0.

Para qualquer item que tenha sido posteriormente definido no documento “Pendências consolidadas — Projeto”, considere essa definição mais recente como a regra válida do sistema.

Não invente regras de negócio para itens que continuam marcados como “A definir”.

Quando uma regra ainda não estiver definida:

não crie uma regra arbitrária;

crie a estrutura técnica necessária para receber essa configuração posteriormente;

sinalize o item na área administrativa como “Configuração pendente”;

evite bloquear o restante do sistema, salvo quando a ausência dessa definição impedir o cálculo correto;

nunca altere retroativamente resultados de quinzenas já fechadas.

2. OBJETIVO DO SISTEMA

A aplicação será uma plataforma interna de controle de:

qualidade;

produtividade;

CSAT;

SLA;

horas online;

avaliações de qualidade;

contestação de avaliações/resultados;

elegibilidade para bônus;

ranking administrativo;

pódio Top 3;

histórico por quinzena;

importação de indicadores;

notificações;

auditoria.

Não criar apenas um dashboard. Criar uma aplicação completa com autenticação, permissões, banco de dados, workflows e painel administrativo.

3. PERFIS

Criar os seguintes perfis:

COLABORADOR

Pode:

acessar somente seus próprios resultados;

visualizar seus próprios indicadores;

visualizar histórico;

visualizar elegibilidade;

visualizar motivos da não elegibilidade;

abrir contestação;

acompanhar resposta da contestação;

visualizar se o quiz foi entregue;

visualizar média da equipe e CSAT da equipe quando aplicável.

Não pode:

visualizar outros colaboradores;

visualizar ranking;

visualizar posição na equipe;

alterar resultados;

acessar painel administrativo;

fechar quinzena;

importar arquivos;

editar avaliações.

ADM

Possui todas as permissões administrativas.

GESTOR

Possui todas as permissões administrativas do sistema, equivalentes ao ADM nesta versão.

Permissões de ADM/Gestor:

upload de relatórios;

visualizar todos os colaboradores;

visualizar resultados;

cadastrar colaboradores;

editar colaboradores;

ativar/inativar colaboradores;

enviar fotos;

gerenciar avaliações;

registrar quiz;

gerenciar contestações;

responder contestações;

alterar resultados;

visualizar indicadores;

visualizar ranking;

visualizar pódio;

gerar e baixar imagem do pódio;

fechar quinzena;

acessar auditoria;

acessar telas administrativas.

4. AUTENTICAÇÃO E LOGIN

Criar uma tela inicial de login.

Na versão atual, o fluxo aprovado para acesso do Gestor é:

login/usuário;

senha;

opção separada “Gestor”;

ao selecionar “Gestor” e autenticar com credenciais válidas de gestor, direcionar para o Painel ADM.

Para os demais usuários, direcionar para o dashboard do colaborador.

Implementar autenticação utilizando Supabase Auth.

Criar controle de usuário ativo/inativo.

Quando um colaborador for desligado:

manter seu histórico;

marcar como inativo;

impedir novo acesso imediatamente.

A autorização não pode depender apenas do frontend.

Implementar obrigatoriamente Supabase Row Level Security (RLS).

5. IDENTIDADE VISUAL

Seguir a identidade das telas de referência:

fundo escuro/preto;

verde neon como cor principal de destaque;

vermelho para estados negativos;

cards arredondados;

estética moderna e limpa;

logo “fluke”;

alto contraste;

aparência de plataforma interna profissional.

O pódio deve possuir identidade própria:

fundo verde vivo;

formato 16:9;

três blocos pretos;

primeiro colocado ao centro e mais alto;

segundo à esquerda;

terceiro à direita;

fotos;

círculo branco atrás das fotos;

coroa para o primeiro colocado;

medalhas para segundo e terceiro;

nome do colaborador em minúsculas;

botão para gerar e baixar a imagem.

6. DASHBOARD DO COLABORADOR

Criar uma tela principal chamada:

Destaques de CX

Cards obrigatórios:

Qualidade

Produtividade

CSAT

SLA Chat

SLA E-mail

Horas Online

Elegibilidade

Também incluir:

histórico;

filtro de quinzena;

comparação com período anterior;

evolução;

data/hora da última atualização;

botão “Atualizar dados”.

CARD DE QUALIDADE

Mostrar:

nota da quinzena;

nível correspondente;

indicador visual verde/vermelho conforme regra da qualidade;

referência da média do time quando aplicável.

Escala:

5G = 98 a 100

4,5G = 95 a 97,99

4G = 91 a 94,99

3G = 86 a 90,99

2G = abaixo de 86

A qualidade mínima para elegibilidade é 91 / nível 4G.

Exibir, por exemplo:
95,3 — 5G

CARD DE PRODUTIVIDADE

Nesta versão, a regra consolidada é:

mínimo de produtividade = 90% da média do time da respectiva quinzena.

Exemplo:

média do time = 10 tickets/h;

mínimo individual = 9 tickets/h.

O sistema deve calcular dinamicamente esse valor por quinzena.

Mostrar:

Você;

Média do time;

mínimo para elegibilidade;

status verde/vermelho;

valor individual.

Não utilizar o antigo mínimo fixo de 6 tickets/h como regra de elegibilidade nesta versão.

CARD DE CSAT

Mostrar:

média do time;

meta de 97%;

indicador visual.

Regra:

verde quando média do time >= 97%;

vermelho quando média do time < 97%.

O CSAT é indicador da equipe, não resultado individual.

O relatório de CSAT será importado pela administração.

SLA CHAT

Mostrar:

SLA individual;

média da equipe;

meta <= 5 minutos.

SLA E-MAIL

Mostrar:

SLA individual;

média da equipe;

meta <= 15 minutos.

HORAS ONLINE

Criar card específico.

Mostrar:

horas online do colaborador na quinzena;

referência correspondente ao período.

Contabilizar somente horas dos dias efetivamente trabalhados.

Não contabilizar:

faltas;

afastamentos;

folgas;

dias/períodos sem trabalho.

ELEGIBILIDADE

O card deve aparecer para cada colaborador.

Estados:

elegível = indicador verde;

não elegível = indicador vermelho.

A elegibilidade somente será positiva quando TODOS os requisitos definidos forem atendidos.

Quando houver mais de um requisito não cumprido, mostrar todos os motivos.

Exemplo de estrutura:

“Não elegível”

Qualidade abaixo do mínimo

Produtividade abaixo do mínimo

Quiz não entregue

Não mostrar apenas o primeiro motivo.

A elegibilidade não significa estar no pódio.

7. QUINZENAS

Criar entidade própria de quinzena.

Nesta versão:

1ª quinzena: dia 1 ao dia 15;

2ª quinzena: dia 16 ao dia 30.

A data do calendário prevalece sobre o dia da semana.

Cada quinzena deve armazenar:

período;

status;

resultados;

médias;

metas;

avaliações;

contestações;

elegibilidade;

ranking;

fechamento;

histórico;

registros de auditoria.

Estados sugeridos:

aberta;

em análise;

em contestação;

pronta para fechamento;

fechada.

Não permitir alterar resultados de uma quinzena fechada sem fluxo administrativo explícito e registro de auditoria.

8. REGRA DE FECHAMENTO E PUBLICAÇÃO

Implementar exatamente este fluxo:

Quinzena em andamento.

Resultados disponíveis para análise de ADM/Gestor.

Período de contestação.

Contestações analisadas e respondidas.

Gestor seleciona “Fechar Quinzena”.

Sistema valida se existem contestações pendentes.

Se existir qualquer contestação pendente, impedir fechamento.

Se não existir, fechar a quinzena.

Publicar resultados finais nos dashboards dos colaboradores.

Exibir elegibilidade.

Disponibilizar indicadores finais.

Adicionar período ao histórico.

Antes do fechamento:

colaboradores não veem os resultados finais;

ADM/Gestor vê os resultados;

resultados podem sofrer alterações;

contestações podem ser analisadas.

Depois do fechamento:

resultados ficam oficiais;

elegibilidade é publicada;

histórico é atualizado.

Registrar toda operação de fechamento em auditoria.

9. IMPORTAÇÃO DE DADOS

Todos os dados de indicadores serão enviados por arquivo.

Formatos aceitos exclusivamente:

XLSX;

XLS;

CSV.

Qualquer outro formato deve ser recusado.

O nome do arquivo deve conter explicitamente o indicador.

Exemplos:

Relatório de CSAT

Relatório de Produtividade

Relatório de Qualidade

Relatório de SLA

Relatório de Horas Online

O sistema deve usar o nome do arquivo para identificar automaticamente o indicador.

Criar uma tela de importação administrativa com:

seleção do arquivo;

identificação automática do indicador;

identificação da quinzena quando possível;

validação;

pré-visualização;

erros de importação;

confirmação;

histórico de importações;

auditoria.

Não inventar estrutura de colunas que não esteja definida na especificação.

A camada de importação deve ser preparada para permitir mapeamento/configuração das colunas posteriormente.

10. CSAT

Criar módulo específico de importação do CSAT.

Regras:

meta = 97%;

relatório enviado a cada 15 dias;

upload administrativo;

resultado alimenta o card CSAT dos colaboradores;

armazenar arquivo original no Supabase Storage;

armazenar valor extraído;

vincular relatório à quinzena;

manter histórico.

Caso o arquivo seja reenviado, não sobrescrever silenciosamente:

registrar novo upload;

registrar usuário;

registrar data/hora;

preservar auditoria.

Não criar regra adicional de substituição sem configuração explícita.

11. AVALIAÇÕES DE QUALIDADE

Cada colaborador recebe 10 avaliações por quinzena:

6 de interações de atendimento;

4 tickets N2.

Tickets N2 utilizam a mesma ficha das interações.

Criar formulário digital nativo.

Cada avaliação deve conter:

colaborador;

ticket;

link da conversa;

assunto;

data do contato;

tipo;

versão da ficha;

nota;

critérios;

comentários.

A avaliação possui 14 critérios.

CRITÉRIOS

LGPD

Cumpriu LGPD?

peso = 100

gravidade = Gravíssimo

TOM DE VOZ / MARCA

Demonstrou empatia durante o atendimento?

sim = 0 desconto

médio = 8

não = 14

Estruturou o atendimento de forma adequada/organizada?

peso 5

A macro utilizada foi relevante/adaptada para o atendimento?

peso 5

DIAGNÓSTICO

Verificou as informações da conta do cliente corretamente?

peso 10

Checou o histórico de interações anteriores?

peso 10

Entendeu completamente a questão do atendimento?

peso 10

PROCESSO

Passou todas as informações corretamente?

peso 7

Executou o processo relativo ao atendimento corretamente?

peso 10

Deixou observações internas adequadas?

peso 5

Deixou claros os passos, assim como um prazo estimado para a resolução do problema?

peso 5

Encaminhou/atualizou o ticket corretamente quando aplicável?

peso 5

Fez o processo de encerramento de ticket corretamente?

peso 5

O ticket foi tagueado com precisão?

peso 9

O modelo deve preservar os pesos por critério e permitir versionamento da ficha.

CÁLCULO

A nota de cada avaliação:

100 - soma dos descontos

A empatia possui:

sim;

médio;

não.

LGPD = 100 pontos de desconto em caso de falha.

Não permitir nota negativa.

Entretanto, as regras de:

cálculo com menos de 10 avaliações;

campos obrigatórios;

justificativa obrigatória;

seleção das avaliações;

edição/anulação;

feedback;

continuam configuráveis/pendentes.

Portanto, não inventar essas regras.

Não considerar fichas em branco como avaliações válidas.

12. QUIZ

Criar registro por:

colaborador;

quinzena;

status sim/não.

Pergunta:

“Entregou o quiz com 60% de aproveitamento?”

A marcação será feita pelo avaliador no Painel ADM.

O colaborador não visualizará o resultado detalhado da avaliação.

Ele visualizará apenas se o quiz foi entregue ou não.

13. ELEGIBILIDADE

Criar cálculo de elegibilidade por colaborador e quinzena.

Os requisitos consolidados são:

Qualidade

= 91 / 4G

Produtividade

= 90% da média do time

Horas online

Regra baseada nos dias efetivamente trabalhados na quinzena.

Quiz

Entrega confirmada pelo avaliador.

Todos os requisitos devem ser avaliados.

Salvar:

elegível;

não elegível;

motivos;

data do cálculo;

versão das regras utilizadas.

Quando múltiplos requisitos falharem, persistir todos os motivos.

14. CONTESTAÇÕES

Criar módulo completo.

Responsáveis:

ADM;

Gestor.

Prazo:

6 dias a partir do envio/publicação dos resultados para contestação.

Fluxo:

colaborador abre contestação;

sistema registra data;

ADM/Gestor analisa;

ADM/Gestor responde;

colaborador visualiza resposta;

quando aplicável, resultado pode ser alterado;

registrar auditoria.

A contestação deve ficar vinculada:

colaborador;

quinzena;

resultado;

data;

status;

mensagens;

responsável;

resolução.

Não permitir fechamento de quinzena enquanto houver contestação pendente.

15. NOTIFICAÇÕES

Implementar notificações via Slack conforme regras consolidadas.

Eventos:

nova avaliação disponível;

resultado da avaliação;

resultado da quinzena fechada;

elegibilidade do bônus;

contestação recebida;

contestação respondida.

Alteração de resultado:

não gera notificação.

Criar arquitetura desacoplada para permitir e-mail no futuro, mas não inventar regras de destinatários de e-mail nesta versão.

16. RANKING

O ranking é exclusivamente administrativo.

O colaborador jamais deve visualizar:

ranking;

posição;

colocação da equipe.

O ranking terá Top 3.

REQUISITOS PARA CONCORRER

qualidade >= 91;

produtividade >= 90% da média do time;

horas online conforme regra;

quiz entregue.

ORDENAMENTO

Primeiro:

melhor nota de qualidade.

Em caso de empate:

melhor produtividade.

Persistindo empate:

melhor SLA Chat.

Persistindo novamente:

melhor SLA E-mail.

Não criar outro critério de desempate sem definição.

Sempre gerar 3 posições no pódio quando houver dados válidos suficientes para a classificação.

17. PÓDIO

Criar módulo administrativo.

Visual:

16:9;

fundo verde vivo;

3 posições;

1º no centro;

2º à esquerda;

3º à direita;

blocos pretos arredondados;

foto;

círculo branco;

coroa no primeiro;

medalhas nos demais;

nome em minúsculas.

Fotos armazenadas no Supabase Storage.

Criar botão:

Gerar Pódio

E botão:

Baixar Imagem

A imagem deve poder ser gerada de forma consistente para compartilhamento em Slack.

Os valores financeiros dos bônus não devem ser exibidos na interface.

18. PAINEL ADMINISTRATIVO

Criar navegação com:

Visão Geral;

Colaboradores;

Resultados;

Indicadores;

Avaliações;

Contestações;

Elegibilidade;

Histórico;

Ranking;

Pódio;

Importação de Dados;

Auditoria.

VISÃO GERAL

Exibir:

SLA Chat;

SLA E-mail;

CSAT;

Elegibilidade;

Top 3.

Não incluir:

SLA Phone;

FCR;

NPS;

Fatores de CSAT;

Eficiência do Time;

Tempo Médio de Resolução.

19. COLABORADORES

Criar CRUD completo.

Campos:

nome;

login;

perfil;

status ativo/inativo;

foto;

demais campos necessários ao sistema.

Permitir:

cadastrar;

editar;

ativar;

inativar;

consultar histórico.

Nunca excluir fisicamente um colaborador que tenha histórico de resultados.

20. AUDITORIA

Toda alteração administrativa deve registrar:

usuário responsável;

ação;

entidade;

registro afetado;

valor anterior quando aplicável;

valor novo quando aplicável;

data/hora;

IP ou contexto disponível;

motivo quando fornecido.

Aplicar auditoria em:

resultados;

avaliações;

colaboradores;

contestações;

importações;

fechamento de quinzena;

ranking;

configurações.

21. BANCO DE DADOS SUPABASE

Criar estrutura equivalente às seguintes entidades:

users

Autenticação e identidade.

employees

id

user_id

nome

login

status

foto_url

perfil

created_at

updated_at

roles

Perfis e permissões.

fortnights

id

ano

mes

tipo

data_inicio

data_fim

status

fechado_em

fechado_por

indicators

Indicadores e metas.

results

Resultados individuais por indicador e quinzena.

evaluations

Avaliações de qualidade.

evaluation_items

Respostas dos critérios.

evaluation_criteria

Critérios, pesos, gravidade, orientação e versão.

contestations

Contestações.

bonus_eligibility

Elegibilidade por colaborador/quinzena.

notifications

Registro das notificações.

audit_logs

Auditoria.

team_metrics

Médias e metas por quinzena.

csat_reports

Relatórios importados de CSAT.

rankings

Top 3 por quinzena e critérios usados.

bonus_prizes

Tabela configurável de premiação, mesmo que os valores não sejam exibidos na interface.

quiz_results

Controle de entrega do quiz.

22. SUPABASE STORAGE

Criar buckets separados ou estrutura equivalente para:

fotos dos colaboradores;

arquivos importados de indicadores;

arquivos de CSAT.

Aplicar permissões corretamente.

Colaborador não pode acessar diretamente arquivos administrativos sem autorização.

23. RLS — OBRIGATÓRIO

Implementar RLS no Supabase.

Colaborador

Pode ler somente:

seu próprio cadastro;

seus próprios resultados;

suas próprias avaliações permitidas;

sua própria elegibilidade;

suas próprias contestações;

seu histórico;

dados agregados de equipe explicitamente permitidos.

ADM/Gestor

Pode acessar os dados administrativos necessários.

Nunca confiar somente em:

esconder botão;

esconder menu;

verificar role no frontend.

A segurança deve existir também no banco.

24. HISTÓRICO

Dashboard do colaborador:

mostrar quinzena atual;

permitir seleção de períodos anteriores;

histórico de 4 meses;

equivalente a 8 quinzenas.

Mostrar:

qualidade;

produtividade;

CSAT;

SLA;

horas online;

elegibilidade;

evolução.

Persistir todo histórico no banco.

25. EVOLUÇÃO

Permitir comparação entre:

quinzena atual;

quinzena anterior.

Diferenciar:

pontos percentuais;

evolução relativa.

Exemplo:
64% → 96%

+32 p.p.

+50% relativo.

26. REGRAS DE UI IMPORTANTES

Nunca mostrar ao colaborador:

ranking;

posição;

resultados de colegas;

dados administrativos;

valores de premiação;

ferramentas de fechamento.

No dashboard:

indicadores devem ser claros;

status positivo/negativo visual;

mostrar a regra utilizada;

mostrar motivo da não elegibilidade.

Utilizar modais para:

avaliações;

contestação;

histórico;

evolução;

detalhes.

Manter a tela principal limpa.

27. CONFIGURAÇÕES DE NEGÓCIO

Criar uma área administrativa/configurável para regras que ficaram abertas no projeto.

Não inventar os valores.

Exemplos:

cálculo de qualidade com menos de 10 avaliações;

obrigatoriedade de assunto/data;

obrigatoriedade de justificativa;

regras especiais para erros críticos;

regras de exceção;

outros critérios futuros.

A arquitetura deve permitir versionamento das regras para não modificar historicamente quinzenas fechadas.

28. INTEGRIDADE DOS DADOS

Criar validações para:

evitar duplicidade de resultados por colaborador/indicador/quinzena;

impedir duplicidade de avaliações;

impedir fechamento com contestação pendente;

impedir resultado final sem quinzena;

impedir acesso de colaborador a outro colaborador;

impedir upload de extensão não permitida;

impedir dados inválidos;

impedir alterações silenciosas.

29. PERFORMANCE

Use:

consultas paginadas;

índices adequados;

queries agregadas eficientes;

cache quando apropriado;

componentes reutilizáveis;

carregamento progressivo nas telas administrativas.

Não fazer uma consulta gigante trazendo todos os resultados sem necessidade.

30. RESPONSIVIDADE

Garantir funcionamento em:

desktop;

notebook;

tablet.

Priorizar desktop para o painel administrativo.

Priorizar leitura rápida para o dashboard do colaborador.

31. UX

Criar:

estados de loading;

estados vazios;

mensagens de erro úteis;

confirmação antes de alterações críticas;

feedback visual após upload;

feedback visual após fechamento;

confirmação após resposta de contestação;

confirmação após alteração de resultado.

32. PRIMEIRA ENTREGA

Não tente resolver todas as decisões futuras com regras inventadas.

Construa primeiro a fundação funcional:

FASE 1

projeto;

Supabase;

autenticação;

roles;

RLS;

banco;

layout base;

dashboard;

painel ADM.

FASE 2

colaboradores;

quinzenas;

importação;

indicadores;

cálculos.

FASE 3

avaliações;

formulário de qualidade;

quiz;

elegibilidade.

FASE 4

contestação;

notificações;

fechamento.

FASE 5

ranking;

pódio;

auditoria;

testes;

refinamento visual.

Ao finalizar cada fase, mantenha a aplicação executável e funcional.

33. TESTES DE ACEITAÇÃO OBRIGATÓRIOS

Criar testes para pelo menos estes cenários:

Colaborador só acessa os próprios resultados.

Colaborador não consegue acessar resultado de outro colaborador mesmo manipulando URL/API.

ADM consegue visualizar todos.

Gestor consegue visualizar todos.

Quinzena não fecha com contestação pendente.

Quinzena fecha quando todas as contestações estão respondidas.

Resultado somente aparece ao colaborador após fechamento.

Qualidade 91 é elegível quanto ao requisito de qualidade.

Qualidade 90,99 não atende ao mínimo de qualidade.

Produtividade usa 90% da média da equipe.

CSAT >= 97 fica verde.

CSAT < 97 fica vermelho.

Mais de um motivo de não elegibilidade aparece simultaneamente.

Arquivo PDF é recusado.

XLSX/XLS/CSV são aceitos.

Nome do arquivo permite identificar o indicador.

Colaborador não vê ranking.

ADM consegue gerar o pódio.

SLA Chat desempata antes do SLA E-mail.

Alterações administrativas geram auditoria.

Colaborador inativado perde acesso.

Histórico do colaborador permanece após inativação.

Upload de foto funciona via Supabase Storage.

Arquivos importados ficam vinculados à quinzena.

Quinzena fechada não sofre alteração silenciosa.

34. PRINCÍPIO FINAL DE IMPLEMENTAÇÃO

Não crie um sistema visualmente bonito mas sem regras reais.

A implementação deve priorizar nesta ordem:

integridade do banco;

segurança/RLS;

regras de negócio;

cálculos;

permissões;

workflow de fechamento;

importação;

experiência visual.

Sempre que houver conflito entre uma regra antiga e uma definição posterior das pendências consolidadas, utilizar a definição posterior.

Sempre que uma regra estiver explicitamente marcada como pendente, não inventá-la.

Comece criando a estrutura do Supabase, as tabelas, relacionamentos, enums, índices, policies RLS e autenticação. Depois construa a interface sobre essa estrutura.

Ao terminar cada fase, mantenha tudo funcionando e sem quebrar as fases anteriores.
