# Especificação do CX Hub

**Versão:** 13/10/2026 · **Situação:** o sistema como ele é hoje, em produção.

Este documento descreve as regras de negócio do CX Hub: os perfis, os módulos e o que cada um faz, com
os números que o sistema usa de verdade. Ele substitui o documento original de requisitos (o "prompt
mestre" da primeira versão), que está guardado, sem alterações, em
[`docs/historico/prompt-mestre-original.md`](historico/prompt-mestre-original.md).

**Como ler e manter este documento:**

- **O banco é a fonte de verdade das regras.** As regras descritas aqui são garantidas pelas funções e
  pelas regras de acesso do banco (Supabase), e não só pela tela. A tela repete algumas delas para avisar
  a pessoa antes de enviar, mas quem decide é o banco.
- **Cada regra tem um registro de origem.** As migrations (`supabase/migrations/`) começam com um
  cabeçalho que explica o que mudou e por quê, com a data da decisão. Quando este documento e uma
  migration divergirem, vale a migration mais recente, e este documento deve ser corrigido.
- **Ao mudar uma regra**, atualize a seção correspondente daqui e o "Histórico deste documento", no fim.

---

## 1. Visão geral

O CX Hub é a plataforma interna do time de CX da Fluke para acompanhar a qualidade e a performance do
atendimento: as avaliações de qualidade, as contestações, os indicadores, a elegibilidade e o ranking por
quinzena, a gamificação, a escala de trabalho, as trocas de escala e as férias.

| Item | Definição |
|---|---|
| Idioma | Português do Brasil |
| Fuso horário | `America/Fortaleza` (todas as datas, prazos e "hoje" do sistema) |
| Datas | no padrão brasileiro (dd/mm/aaaa) |
| Endereço | `qualidade-performance.vercel.app` |
| Tecnologia | TanStack Start (React 19), TanStack Query, Tailwind CSS 4 + shadcn/ui, Supabase (Postgres, Auth, Storage e as regras de acesso), Vercel |
| Indexação | o site pede aos robôs de busca para não indexá-lo (`robots.txt` e `noindex`) |

---

## 2. Perfis e acesso

### 2.1 Os perfis

| Perfil | Quem é | O que faz |
|---|---|---|
| **Colaborador** | quem atende | vê os próprios resultados, avaliações, indicadores e a escala; contesta as próprias avaliações; pede férias e trocas de escala |
| **Avaliador** | um colaborador que também avalia | tudo o que o colaborador faz, e também avalia e responde as contestações dos **colaboradores** (nunca as próprias, nem as de outro avaliador) |
| **ADM** | a supervisão | toda a gestão: as quinzenas, o cadastro, os acessos, o quiz, o ranking completo, a escala, as férias, as trocas, o painel e o histórico |

- **O avaliador também é colaborador:** a mesma conta dá acesso às duas áreas. Os avaliadores são
  avaliados só pelo ADM.
- **O ADM não é colaborador:** usa só a área de gestão. Ele **pode entrar na escala** (a supervisão também
  cobre turnos), mas **não entra nas trocas de escala** (nem pede, nem aparece na lista de quem pode trocar).
- **Quem pode atuar sobre quem** é decidido pelo banco (a função `pode_atuar_sobre`), e vale para a
  avaliação, o sorteio de contatos e a resposta das contestações.

### 2.2 O login e a sessão

- **A tela de login tem duas abas:** "Colaborador" e "Avaliador" (a da gestão). A aba errada **bloqueia**
  o login: o colaborador entra pela aba Colaborador; o ADM, pela aba Avaliador; o avaliador, pelas duas (a
  aba escolhida decide a área de entrada).
- **O prazo da sessão:** **30 minutos** sem uso, ou **9 horas** desde o login, o que vier primeiro. Um
  minuto antes de expirar, a tela avisa. O uso em qualquer aba conta.
- **As contas só são criadas pelo ADM** (na tela Colaboradores), com um link para a pessoa definir a
  senha. O cadastro público do Supabase está desligado.
- **A senha:** no mínimo **10 caracteres**, com minúsculas, maiúsculas, números e símbolos (regra
  configurada também no Supabase). A tela confere, antes de aceitar, se a senha aparece em vazamentos
  conhecidos (pela técnica de anonimato do Have I Been Pwned: só os primeiros caracteres do resumo da senha
  saem do servidor).
- **Inativar um colaborador** impede o acesso na hora e preserva o histórico. **Excluir** é definitivo e
  só é possível para quem já está inativo; a tela mostra antes o resumo do que será apagado.

---

## 3. Quinzenas

### 3.1 As datas

- **1ª quinzena:** do dia 1 ao dia 15. **2ª quinzena:** do dia 16 ao **último** dia do mês.
- **As datas são calculadas pelo banco**, nunca digitadas. Uma regra da tabela garante que toda quinzena
  tenha as datas certas para o ano, o mês e o tipo dela.
- **O ADM cria a próxima quinzena**, sempre em sequência, a partir de **7 dias** antes de ela começar.
- **Duas quinzenas ativas ao mesmo tempo são normais:** a anterior em contestação, enquanto a nova corre.

### 3.2 O ciclo

`aberta` → `em_contestacao` → `fechada`, sempre pelo ADM, e cada passo vai para o Histórico.

| Etapa | O que acontece |
|---|---|
| **Aberta** | os avaliadores registram, editam e excluem as avaliações. O colaborador ainda não as vê. |
| **Publicar** (aberta → em contestação) | o colaborador passa a ver as avaliações e os indicadores, e pode **contestar por 2 dias úteis**, contando o dia da publicação, até as 23h59. |
| **Fechar** (em contestação → fechada) | só depois do prazo de contestação e **sem nenhuma contestação pendente**. O fechamento gera os resultados oficiais, a elegibilidade, o ranking e o XP da gamificação. |
| **Reabrir** | o ADM pode reabrir uma quinzena fechada, com um motivo de pelo menos 10 caracteres; o XP dela é retirado, e o próximo fechamento recalcula tudo. |

- **Antes do fechamento**, o ranking é **provisório** (calculado na hora) e pode mudar com uma contestação
  aceita ou um indicador.
- **Nenhum resultado de quinzena fechada muda sem um fluxo explícito** (a reabertura) e o registro no
  Histórico.

---

## 4. Avaliações de qualidade

### 4.1 Os tipos e as quantidades

- **Dois tipos:** a **interação** de atendimento e o **ticket de back-office** (no banco, `ticket_n2`).
  Os dois usam a mesma ficha.
- **A referência por quinzena** é de 6 interações e 4 tickets, mas **vale qualquer combinação** até o
  **limite de 10 avaliações válidas** por colaborador e quinzena. O banco recusa a 11ª.
- **Avaliações só são registradas, editadas e excluídas com a quinzena aberta.**

### 4.2 A ficha e a nota

- **A ficha tem 14 critérios**, em quatro grupos (LGPD, tom de voz e marca, diagnóstico e processo), cada
  um com o seu peso de desconto. Os critérios e os pesos ficam no banco, com versão.
- **As respostas:** "Sim" (sem desconto), "Não" (o desconto do critério) e, na empatia, também "Médio"
  (um desconto parcial). Falhar na **LGPD** desconta **100 pontos**.
- **A nota = 100 − a soma dos descontos**, nunca negativa. Ela é calculada pelo banco.
- **A observação** é obrigatória no "Não", e pode ser deixada em qualquer resposta (no "Sim", vira uma
  dica para o colaborador).
- **O processo da Flukepédia** usado na avaliação pode ser vinculado a ela, com a **versão** do processo
  naquele momento (numa contestação, mostra com qual regra o contato foi avaliado).
- **"Avaliado por"** aparece para os avaliadores e o ADM, **nunca para o colaborador** (o banco não entrega
  essa informação ao navegador dele).

### 4.3 O sorteio dos contatos

- **O servidor sorteia** uma conversa encerrada do colaborador na quinzena, no Intercom. Nenhuma conversa
  é guardada: só o número e o link (o texto é buscado na hora, para a tela).
- **Um contato em aberto por vez** (por avaliador, colaborador, quinzena e tipo): para sortear outro, é
  preciso **descartar** o atual, com justificativa. A mesma conversa nunca é sorteada duas vezes para a
  mesma pessoa e quinzena, nem uma conversa já avaliada.
- **Os tickets de back-office** entram pelos núcleos `[cxtech]`, `[rede]`, `[fraude e risco]`,
  `[logística]` e `[financeiro]` (ficam de fora `[leads]` e os de teste de automação). É avaliado quem
  **criou** o ticket (o atendente do primeiro registro); sem um atendente identificado com segurança, o
  ticket fica fora do sorteio. O ADM sorteia de todos os núcleos; cada avaliadora, dos núcleos dela.
- **Os descartes** aparecem no Histórico; acima de **30%** de descartes de um avaliador, a tela sinaliza
  (nada é bloqueado).

### 4.4 Editar e excluir

- **Editar e excluir** só podem ser feitos por quem fez a avaliação, ou por um ADM, com a quinzena aberta.
- **Excluir exige um motivo** (de pelo menos 5 caracteres). A avaliação some das telas, das notas e dos
  totais, mas fica guardada como anulada, com quem, quando e por quê.

### 4.5 A pré-avaliação por IA (aguardando a chave)

- **O que faz:** sugere as respostas da ficha, as observações e um feedback para uma conversa, usando o
  modelo **Claude Sonnet 5.5** e a base de processos da Flukepédia. O avaliador revisa e decide: a
  sugestão **nunca sobrescreve** o que ele já preencheu.
- **Privacidade:** o que vai para a IA é a versão **mascarada** da conversa, e o sistema guarda só as
  sugestões (não o texto da conversa).
- **Custo:** a mesma conversa, para a mesma pessoa e quinzena, nunca gera um segundo pedido.
- **Situação:** a construção está pronta; falta a chave da API da Anthropic (`ANTHROPIC_API_KEY`) na
  Vercel.

---

## 5. Contestações

- **Quando:** o colaborador contesta as próprias avaliações durante o prazo de contestação (2 dias úteis
  a partir da publicação da quinzena).
- **Uma contestação em andamento por avaliação**, com motivo obrigatório (de pelo menos **10
  caracteres**).
- **Quem responde:** quem pode atuar sobre o colaborador. Os avaliadores respondem as dos colaboradores; o
  ADM responde todas; ninguém responde a própria. O colaborador não vê quem respondeu.
- **O prazo de resposta:** **1 dia útil** (até as 23h59 do dia útil seguinte ao recebimento). Vencido, a
  contestação aparece como **atrasada** e continua respondível.
- **Responder** exige um texto de **10 a 2.000 caracteres**, para aceitar ou recusar. **Aceitar é ajustar
  no mesmo passo:** a ficha é corrigida (pelo menos um critério precisa mudar), a nota é recalculada, e o
  antes e o depois ficam guardados.
- **Os avisos no Slack** (o robô **Radar da Qualidade**, no canal de qualidade): a abertura, o lembrete no
  dia do prazo (às 8h, se ainda sem resposta) e a resposta, na conversa do aviso de abertura.

---

## 6. Indicadores e metas

| Indicador | Meta | Como é calculado |
|---|---|---|
| **Qualidade** | **91** (o nível 4G) | a média das notas das avaliações válidas da quinzena |
| **Produtividade** | **6 tickets por hora** (fixo) | (as atribuições automáticas − as autoatribuições) ÷ as horas ativas. Substitui a regra original de "90% da média do time". |
| **SLA do chat** | até **5 minutos** | o percentil 90 do tempo da 1ª resposta, por dia (num período de vários dias, a média dos dias) |
| **SLA do e-mail** | até **15 minutos** | idem |
| **CSAT** | **97%** | as avaliações positivas ÷ o total. É um indicador do **time**, e não individual. |
| **Horas logadas** | média de **20 h por semana** | as horas dos dias efetivamente trabalhados |

**A escala de qualidade:** 5G = 98 a 100 · 4,5G = 95 a 97,99 · 4G = 91 a 94,99 · 3G = 86 a 90,99 ·
2G = abaixo de 86.

- **O colaborador vê os indicadores a partir da publicação** da quinzena (para poder contestá-los). A
  elegibilidade só aparece no fechamento.
- **A média de qualidade do time** é a média das notas de cada pessoa (cada uma pesa igual), e só aparece
  com pelo menos **3 pessoas** avaliadas.
- **A aba Indicadores** do colaborador mostra os indicadores diários, com os filtros "5 dias", "7 dias"
  (os últimos dias com dados) e um período personalizado de até **92 dias**.
- **A fonte dos dados:** os indicadores diários do Intercom, guardados como dados brutos (as contagens e as
  horas, e não as taxas prontas), para qualquer período ser calculado do jeito certo.
- **A importação dos indicadores pela planilha** (a conta de serviço do Google `qualityhub-leitor`) está
  **aguardando** a planilha e a definição do SLA da quinzena e do tempo ativo.

---

## 7. Elegibilidade, ranking e pódio

### 7.1 A elegibilidade

**Concorre quem cumpre todos os requisitos** da quinzena:

1. **Qualidade** de pelo menos 91.
2. **Produtividade** de pelo menos 6 tickets por hora.
3. **Horas logadas** com média semanal de pelo menos 20 horas.
4. **O quiz entregue** (com 60% de aproveitamento), registrado **só pelo ADM**.

Quem falha em mais de um requisito leva **todos** os motivos (e não só o primeiro).

### 7.2 O ranking

- **A ordem:** a maior qualidade; depois, a maior produtividade; depois, o melhor SLA do chat; depois, o
  melhor SLA do e-mail. **Empate em tudo:** as pessoas dividem a posição.
- **O ranking é provisório** até o fechamento, e oficial depois dele.
- **A classificação completa** (quem concorre, quem fica de fora e por quê) é **só do ADM**.
- **O Painel do ADM** mostra também o **prêmio** de cada posição, para quem é elegível (os valores ficam
  na tabela de prêmios do banco).

### 7.3 O pódio

- **O Top 3** da quinzena aparece para o **time** depois da publicação, com a foto e a moldura de cada
  pessoa. Antes da publicação, só o ADM o vê (o avaliador o vê como o colaborador, depois da publicação).
- **O ADM pode gerar e baixar a imagem do pódio.**

---

## 8. Gamificação

### 8.1 O XP e os níveis

- **O XP é dado no fechamento da quinzena** (com os resultados oficiais, depois das contestações).
  Reabrir a quinzena retira o XP dela.
- **Cada nível tem 1.000 XP.**
- **A quinzena sem avaliação da pessoa** (férias, afastamento) é ignorada: não conta e não quebra uma
  sequência.
- **O bônus de sequência:** ganhar a mesma conquista em quinzenas seguidas multiplica o XP dela (×1,10 na
  2ª, ×1,20 na 3ª, ×1,25 da 4ª em diante).

### 8.2 As conquistas

| Grupo | O que é |
|---|---|
| **As seis dimensões** | Sinal (a qualidade), Velocidade (a produtividade e o SLA), Conexão (a experiência do time), Rede (a consistência), Evolução (a jornada) e Ranking (o pódio da quinzena) |
| **As Centrais de Comando** (ultra épicas, 700 XP) | uma por dimensão: todas as outras conquistas da dimensão, ao menos uma vez |
| **A FLUKER** (suprema, 1.500 XP) | todas as conquistas ativas, **fora as sazonais**, ao menos uma vez. Fica oculta para quem ainda não a ganhou. |
| **As sazonais** (100 XP cada) | Carnaval (fevereiro), Festa Junina (junho), Dia do Cliente (setembro), Noite das Bruxas (outubro), Black Friday (novembro) e Fim de ano (dezembro). A regra: todas as quinzenas avaliadas do mês com a qualidade em 95 ou mais. Uma vez por ano em cada temporada. Não contam para a FLUKER nem para as Centrais. |

- **Hoje, as conquistas de qualidade são calculadas.** As que dependem dos indicadores (produtividade, SLA,
  CSAT, horas) aguardam a importação dos indicadores.
- **Os destaques:** cada pessoa escolhe até **5** conquistas para mostrar no perfil e no Ranking.
- **"Quase lá":** o perfil mostra as três conquistas mais perto de serem ganhas.

---

## 9. Meu perfil

- **A foto:** preparada no navegador antes do envio (recorte quadrado, **256 × 256 px**, **WebP**; o
  arquivo original pode ter até 10 MB). Redesenhar a imagem apaga os metadados do arquivo original (como o
  local onde a foto foi tirada). As fotos ficam num depósito **privado**, e só abrem por links temporários.
- **A capa e a moldura:** liberadas pelo nível, pelas conquistas e pelo pódio. Molduras: verde (nível 2),
  prata (nível 5), ouro (nível 10), lendária (uma conquista de 350 XP ou mais) e FLUKER. Capas: as cinco
  iniciais, e as liberadas nos níveis 3, 5, 10, 15 e 20, pelo pódio e pela FLUKER.
- **As temporadas:** no mês de cada temporada, o perfil pode usar a capa dela (e, na Noite das Bruxas,
  também a moldura). A pessoa escolhe se quer usar a da temporada.
- **O aniversário:** o dia e o mês (sem o ano), se a pessoa quer mostrá-lo ao time, e se quer o **tema de
  festa** no dia (a capa e a moldura de festa). Quem nasceu em 29/02 é festejado em 28/02 nos anos que não
  são bissextos.
- **Os dados pessoais** (o endereço e o contato de emergência): ficam numa tabela separada, que só a
  pessoa e o **ADM** leem (os avaliadores, não). O ADM pode corrigi-los; a correção vai para o Histórico
  com os **nomes** das partes alteradas, e não com os valores.
- **Os parabéns:** no dia do aniversário (de quem mostra), os colegas podem deixar **um recado por ano**
  (de 2 a 200 caracteres). Só quem mandou e quem recebeu leem o recado; o aniversariante pode ocultá-lo. O
  cartão "Aniversariantes de hoje" aparece na Visão geral, sem nenhuma contagem.

---

## 10. Escala

### 10.1 A escala da semana

- **As siglas:** cada atividade tem uma sigla e uma cor (o atendimento, a pausa, os núcleos de N2, as
  reuniões, a folga, as férias...). O ADM pode criar siglas novas (até 10 letras e um significado de até
  40).
- **As horas:** de 6h a 21h, uma célula por hora.
- **A montagem:** o ADM monta a semana como **rascunho** e a **publica**. Só a semana publicada aparece
  para o time. Cada mudança numa semana publicada aparece na hora e vai para o Histórico.
- **As mudanças rápidas:** selecionar várias horas de uma vez (arrastando ou com o Shift), e, para cada
  pessoa, "ficar off a partir de", "substituir por" e "limpar o dia".
- **Quem entra na escala:** toda pessoa ativa, **inclusive a supervisão** (o ADM). Ficar fora das trocas
  não impede ninguém de ser escalado.
- **Nos fins de semana e nos feriados, quem folga fica fora da escala:** a escala desses dias mostra só quem
  trabalha (uma linha só de folga não é gravada, venha de onde vier: a montagem, a cópia, o botão ou uma
  troca). As férias e as ausências continuam aparecendo. Numa semana publicada, não estar na escala de um
  sábado ou domingo significa folga; num feriado, significa estar fora da escala do feriado.
- **O time vê** a semana publicada (a grade do time e o "Meu dia").

### 10.2 As férias e os feriados

- **As férias:** o ADM lança direto no calendário; o colaborador **pede** (só para si, só dias futuros) e
  o ADM aprova ou recusa (a recusa exige um motivo de pelo menos 10 caracteres). Aprovar lança as férias
  na hora. Os pedidos valem até o **fim do 2º ano seguinte** (em 2026, até 31/12/2028).
- **Os feriados:** o ADM marca os dias de feriado. Num feriado, a escala é diferenciada (a equipe é
  reduzida).

### 10.3 As folgas fixas

- **Os dias da semana em que cada pessoa folga**, cadastrados pelo ADM na aba "Folgas fixas" (até 4 por
  semana). O pedido de troca usa as folgas fixas nas semanas que ainda não foram publicadas.
- **O horário de trabalho** de cada pessoa (a entrada, a saída e a hora da pausa, o mesmo para todos os dias
  de trabalho), preenchido pelo ADM na ficha, em Colaboradores. Até 10 horas, das 6h às 22h, e a pausa nem
  na primeira nem na última hora. Opcionalmente, um **horário diferente aos fins de semana** (no sábado, no
  domingo ou nos dois), com as mesmas regras. Fica à parte dos dados pessoais (não é um dado sensível), e só
  o ADM o lê.
- **O botão "Atribuir folgas e horários"**, na montagem, preenche os dias **vazios** da semana, só nas
  semanas **não publicadas**: nos dias da folga fixa, a folga; nos outros, o horário de trabalho (o
  atendimento, com a pausa na hora dela). Depois, o ADM só ajusta as tarefas. Num dia da folga fixa em que a
  pessoa já tem horário, o horário **fica**, e o ADM vê o conflito (com o "Pôr a folga" e o "Manter o
  horário"); quem não tem horário cadastrado fica com os dias de trabalho vazios, com um aviso. O que já foi
  montado, as férias do calendário e os dias de uma troca aplicada não são tocados. No fim, cada dia fica
  **em ordem de horário**: primeiro quem entra mais cedo (na mesma entrada, quem sai primeiro). Quem não
  trabalha no dia (a folga num dia de semana, as férias, a ausência) fica na posição do **seu** horário de
  trabalho, com a atividade do dia; só quem não tem horário cadastrado vai para o fim.

### 10.4 As trocas de escala

- **Os tipos:**
  - **Trocar os horários de um dia:** num dia em que as duas pessoas trabalham, cada uma fica com o
    horário da outra.
  - **Trocar as folgas:** "um dia de folga" (uma das minhas pela dela, na mesma semana) ou "os dois dias"
    (as minhas folgas da semana pelas dela; um dia que as duas já folgam continua igual).
  - **Sair da escala (feriado):** num feriado com a escala **publicada**, em que eu estou escalado e a
    colega não, ela entra no meu lugar.
- **O pedido, passo a passo:** com quem → a troca → o dia → a revisão. O calendário mostra só os dias que
  servem para a troca escolhida, com aquela pessoa (lendo a escala publicada ou, nas outras semanas, a
  folga fixa), nos **próximos três meses**. Escolher só marca; quem avança é o "Continuar".
- **O fluxo:** a colega **aceita** ou recusa; depois, a supervisão **aprova** ou recusa (a recusa exige um
  motivo de 10 a 300 caracteres, que as duas pessoas veem). Quem pediu pode cancelar enquanto a supervisão
  não decidiu. Uma troca aguardando por pessoa e dia.
- **Como a escala fica:** o que se troca é o **horário** (a janela e a pausa vêm da outra pessoa); as
  **reuniões** ficam na mesma hora; as **atividades de N2** acompanham a pessoa. Sobrando horas, viram
  atendimento; faltando, sai primeiro o atendimento. A mesma regra existe na tela (para o "Como fica") e no
  banco (que aplica a troca), testadas com os mesmos cenários.
- **A aprovação:** a qualquer momento. Com a escala da semana montada (publicada ou em rascunho), a troca
  é aplicada na hora; senão, fica "aprovada · entra ao montar a semana", e a montagem oferece o "Aplicar as
  trocas aprovadas".
- **Os avisos no Slack** (o robô **Central de Turnos**, no canal de escala): só depois que a colega aceita
  ("Troca de escala para aprovar", com quem pediu, com quem, a troca e como fica), e, na conversa, a
  decisão (a aprovação, a recusa sem o motivo, ou o cancelamento). O que acontece antes do aceite fica só
  entre as duas pessoas.

---

## 11. Central de notificações

- **O sino**, no canto superior, ao lado do modo escuro, com a bolinha vermelha que soma as ações
  pendentes e as novidades não lidas. Ele confere a cada **minuto** e ao voltar para a aba.
- **"Para fazer"** (calculado na hora, das próprias tabelas; some sozinho quando a ação é feita): as trocas
  aguardando o meu aceite; e, para quem decide, as trocas e os pedidos de férias aguardando a supervisão e
  as contestações para responder.
- **"Novidades"** (criadas no momento do acontecimento, uma por pessoa e acontecimento): o resultado
  publicado e as conquistas da quinzena (só depois da publicação), a contestação respondida, a escala
  publicada, o pedido de férias decidido, as trocas (o aceite, a recusa da colega, a decisão e o
  cancelamento) e os aniversários do dia.
- **Cada pessoa vê só as dela.** As novidades ficam **30 dias**.

---

## 11.1 O acesso rápido

- **Na barra lateral, embaixo do menu** (no celular, num painel aberto pelo botão 🔗): os links das
  ferramentas do time, em 7 grupos (o Atendimento, o Material de apoio, o Financeiro, a Comunicação, a Fluke
  na web, as Consultas e as Planilhas). O Atendimento começa aberto; os slides são um subgrupo recolhível.
- **A busca** procura em todos os grupos, sem acento. Os links abrem numa aba nova.
- **Os "Meus atalhos":** a estrela fixa um link no topo. Ficam guardados no navegador de cada pessoa.
- **Os restritos** (as planilhas de PIN/PUK) aparecem só para o ADM.
- **A lista mora no código** (`src/lib/acesso-rapido.ts`): para mudar um link, é uma mudança no sistema.

## 12. Painel e Histórico (ADM)

- **O Painel:** as abas Métricas e Avaliações, no formato do relatório "Qualidade e Treinamento", com o
  filtro de período (as quinzenas que começam nele) e de turno. A quinzena ainda aberta aparece como
  "parcial".
- **O Histórico:** o registro das ações (quem fez, quando e o quê), com a busca e os filtros por categoria
  e por pessoa. Inclui a produtividade dos avaliadores (o tempo de cada avaliação, da primeira abertura do
  contato até o registro; acima de 60 minutos, fica fora da conta) e os descartes dos sorteios.
- **O que o Histórico não guarda:** os valores dos dados sensíveis (como o endereço e o contato de
  emergência). Ele registra **que** algo mudou, e não **para o quê**.

---

## 13. Integrações

| Serviço | Para quê | Como |
|---|---|---|
| **Intercom** | o sorteio e a leitura das conversas e dos tickets; os indicadores diários | pelo servidor, com uma chave só de leitura |
| **Notion** | a base de processos (Flukepédia B2C e B2B, e o Guia de Clientes Atritados), com versão | a sincronização pelo ADM, em lotes; a chave só de leitura. Ela lê o **Índice Mestre** de cada Flukepédia (os processos revisados, com o código) e a **página da Flukepédia** (todos os processos: cada seção é a categoria, o negrito no topo de uma coluna é a subcategoria, e cada subpágina é um processo). O Índice tem a prioridade; os que só estão na página entram como "ainda não revisado" |
| **Slack** | o **Radar da Qualidade** (as contestações, no canal de qualidade) e a **Central de Turnos** (as trocas, no canal de escala) | cada robô com o próprio token e canal, só com a permissão de escrever; nenhum aviso sai duas vezes |
| **Google** | a importação dos indicadores pela planilha (aguardando) | a conta de serviço `qualityhub-leitor`, só de leitura |
| **Anthropic** | a pré-avaliação por IA (aguardando a chave) | pelo servidor, com a conversa mascarada |

**A tarefa da manhã** (todo dia às 8h, pela Vercel, protegida por um segredo): o lembrete das contestações
no dia do prazo, os avisos do Slack que se perderam, e a limpeza das novidades com mais de 30 dias e das
contagens do limite de uso.

---

## 14. Segurança

- **Toda gravação passa por uma função do banco:** nenhuma tabela aceita gravação direta do navegador, e
  nenhuma pode ser lida por um visitante. Cada função confere quem pode o quê, o formato e o tamanho do que
  foi enviado; as regras de acesso (RLS) estão ligadas em todas as tabelas, e o próprio Supabase as liga
  automaticamente em toda tabela nova.
- **As chaves e os segredos ficam só no servidor** (as variáveis de ambiente da Vercel, marcadas como
  sensíveis). O navegador recebe apenas o endereço e a chave pública do Supabase. Os mapas do código-fonte
  não são publicados.
- **O HTTPS é obrigatório:** a Vercel redireciona todo acesso por HTTP, e o site envia o HSTS (2 anos).
- **Os cabeçalhos de segurança** em todas as respostas (as páginas e os arquivos estáticos): a política de
  conteúdo (CSP: os scripts, as conexões e as imagens só do próprio site e do Supabase), o anti-iframe, o
  `nosniff`, a política de referência, a de permissões (sem câmera, microfone, localização, pagamento ou
  USB) e o `Cross-Origin-Opener-Policy`. A CSP permite os scripts embutidos que o TanStack Start precisa
  para montar a página (decisão consciente: o código único por página traria pouco ganho para uma mudança
  grande).
- **O limite de uso:** as funções do servidor têm um limite por pessoa e por ação, contado no banco (por
  exemplo, 30 pré-avaliações por hora e 60 sorteios a cada 10 minutos). Passou do limite, a função responde
  "Muitas tentativas em pouco tempo".
- **As prévias da Vercel** (os endereços de cada deploy) exigem o login no time da Vercel.
- **A minimização dos dados:** as conversas do Intercom não são guardadas; os dados pessoais ficam numa
  tabela separada; as fotos perdem os metadados; o Histórico não guarda os valores sensíveis.
- **As dependências** são conferidas pelo `npm audit` (nenhuma vulnerabilidade conhecida em 13/10/2026).
- **Os testes:** cerca de 490 testes da aplicação e mais de 1.000 cenários do banco, rodados a cada
  mudança. Toda migration é testada num banco de testes antes de ser aplicada, e a versão em produção é
  conferida depois (as funções devem ser idênticas às testadas).

---

## 15. O que está pendente

| Item | Quem | Situação |
|---|---|---|
| A importação dos indicadores pela planilha | a supervisão | aguardando a planilha e a definição do SLA da quinzena e do tempo ativo |
| A pré-avaliação por IA | a supervisão | aguardando a chave da API da Anthropic |
| As conquistas dos indicadores | — | dependem da importação dos indicadores |
| O cadastro do time e as folgas fixas | a supervisão | quando o sistema for liberado para todos |
| Os feriados de 2027 e 2028 | a supervisão | os de 2026 já estão cadastrados |
| O Carnaval em março | — | a temporada do Carnaval (a capa e a conquista) é sempre em fevereiro; num ano em que ele cair em março, a mudança é pequena, se for desejada |

---

## Histórico deste documento

| Data | O que mudou |
|---|---|
| 30/09/2026 | O documento original de requisitos (o "prompt mestre"), hoje em `docs/historico/`. |
| 13/10/2026 | Reescrito para descrever o sistema como ele é hoje: os perfis, as quinzenas, as avaliações, as contestações, os indicadores, o ranking, a gamificação, o perfil, a escala, as trocas, as notificações, as integrações e a segurança. |
| 13/10/2026 | A supervisão (o ADM) passa a entrar na escala e nas férias; continua fora das trocas. |
| 13/10/2026 | O botão "Atribuir folgas fixas", na montagem da semana. |
| 13/10/2026 | O horário de trabalho de cada pessoa, e o botão passa a "Atribuir folgas e horários". |
| 14/10/2026 | Nos fins de semana e nos feriados, quem folga fica fora da escala. |
| 14/10/2026 | O horário diferente aos fins de semana (o botão e a ordem usam o horário de cada dia). |
| 14/10/2026 | A sincronização do Notion passa a ler também a página da Flukepédia (todos os processos, e não só os do Índice Mestre). |
| 14/10/2026 | O acesso rápido na barra lateral, e o nome da plataforma passa a ser CX Hub. |
| 14/10/2026 | A tela de Processos em duas colunas (o B2C e o B2B), recolhíveis, do tamanho da janela, na ordem da Flukepédia, com a busca e o botão para o Notion; e as outras referências (o Guia e o Dicionário de Tags). |
