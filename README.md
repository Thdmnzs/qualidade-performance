# QualityHUB

Plataforma interna do time de CX para acompanhar qualidade, produtividade, CSAT, SLA,
horas online, avaliações, contestações, elegibilidade à premiação e ranking por quinzena.

As regras de negócio estão em [`docs/ESPECIFICACAO.md`](docs/ESPECIFICACAO.md).

## Stack

- **TanStack Start** (React 19, roteamento por arquivos em `src/routes`, SSR e server functions)
- **TanStack Query** para busca e cache de dados
- **Tailwind CSS 4** + componentes shadcn/ui (`src/components/ui`)
- **Supabase**: Postgres, Auth e Row Level Security (a segurança real fica no banco)
- **Vercel** para hospedagem (build via Nitro com preset `vercel`)

## Rodando localmente

Requisitos: Node.js 22.

```bash
npm install
cp .env.example .env   # preencha com os dados do projeto Supabase
npm run dev            # http://localhost:3000
```

Scripts úteis: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`.

## Variáveis de ambiente

| Variável | Onde é usada | Observação |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | navegador | URL do projeto Supabase |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | navegador | chave pública (anon/publishable); segura para expor |
| `SUPABASE_URL` | servidor | mesmo valor de `VITE_SUPABASE_URL` |
| `SUPABASE_PUBLISHABLE_KEY` | servidor | mesmo valor de `VITE_SUPABASE_PUBLISHABLE_KEY` |
| `SUPABASE_SERVICE_ROLE_KEY` | servidor | **secreta**; ignora o RLS. Nunca use prefixo `VITE_` |

Variáveis com prefixo `VITE_` são embutidas no JavaScript enviado ao navegador,
por isso só a chave pública pode tê-lo.

## Perfis

| Perfil | O que faz |
| --- | --- |
| **Colaborador** | Vê os próprios indicadores e avaliações (após o fechamento) e abre contestações |
| **Avaliador** | Também é colaborador. Na área de avaliação, avalia colaboradores, marca o quiz e vê as contestações deles |
| **ADM** | Gestão completa: visão geral, ranking, cadastro, acessos, avaliação de colaboradores e de avaliadores |

Regras que o banco garante (função `pode_atuar_sobre`): ninguém atua sobre si mesmo; avaliador só atua
sobre colaboradores; avaliadores são avaliados e têm as contestações tratadas só pelo ADM.

O avaliador usa a mesma conta nas duas áreas. A aba escolhida no login define a área de entrada, e o menu
permite trocar. A área decide só a navegação: o que cada um pode ler e gravar é decidido pelo banco.

## Base de processos (pré-avaliação por IA)

Cópia versionada dos processos do Notion (Flukepédia | B2C, Flukepédia | B2B e Guia de Clientes Atritados),
nas tabelas `processos` e `processos_versoes`. Cada página guarda o código (ex.: `B2C-CNT-INT-02`), o status de
revisão pela Qualidade e o texto de cada versão; uma versão nova só nasce quando o texto muda. Lida pelo ADM e
pelos avaliadores; gravada só pelo servidor, pela função `registrar_versao_processo`.

- **Piloto (02/10/2026):** `B2C-CNT-INT-01` e `B2C-CNT-INT-02`, por importação assistida. Serão substituídos
  pela sincronização automática quando a conexão do Notion (`NOTION_TOKEN`) estiver configurada.

## Identidade visual

- **Área logada:** tema escuro em tons de verde, definido só pelas variáveis de `src/styles.css`. Trocar a identidade é trocar essas variáveis; nenhuma tela usa cor fixa. Contraste conferido pelo WCAG AA: cores vivas (verde, vermelho, amarelo) levam texto escuro quando são fundo.
- **Login e página inicial:** identidade própria (cartão branco sobre a imagem de fundo), com cores fixas, independente do tema.
- **Logos:** `logo-fluke.png` (letras pretas, para fundo claro) e `logo-fluke-branca.png` (letras brancas, para o menu escuro). O favicon e o ícone do celular saem do ponto verde da logo.

## Ciclo da quinzena e contestações

O ADM conduz cada quinzena pela **Visão geral**; cada passo é validado pelo banco e registrado na auditoria.

| Status | O que acontece |
| --- | --- |
| **Aberta** | Avaliadores registram e excluem avaliações. O colaborador ainda não vê nada. |
| **Em contestação** | Após "Publicar": o colaborador vê as próprias avaliações e pode contestar por **2 dias úteis, contando o dia da publicação, até as 23h59**. Avaliações não são mais registradas nem excluídas; só ajustadas aceitando uma contestação. |
| **Fechada** | Só depois do prazo e sem contestações pendentes. Os resultados ficam oficiais. |

- Quem recebe a contestação tem **1 dia útil** (até as 23h59 do dia útil seguinte) para responder; vencido, ela aparece como **Atrasada** e continua respondível.
- Aceitar = ajustar a ficha no mesmo passo: a nota é recalculada e o antes/depois fica guardado.
- **Reabrir** (ADM) exige motivo, volta a quinzena para "Aberta" e fica na auditoria.
- Dia útil = segunda a sexta; feriados não são considerados nesta versão.

## Acesso dos colaboradores

Os acessos são criados pelo ADM; não existe cadastro aberto.

1. Em **Colaboradores**, o ADM cadastra a pessoa. O sistema cria o usuário no Supabase Auth
   e gera um **link de convite** de uso único, que o ADM copia e envia pelo Slack.
2. A pessoa abre o link, cai em `/definir-senha` e cria a própria senha. O ADM nunca a conhece.
3. **Link de senha** gera um link de redefinição para quem já tem acesso (senha esquecida, convite expirado).
4. **Inativar** bloqueia o login no Auth e corta o acesso aos dados na hora; o histórico é mantido.
5. **Excluir** (só ADM, só inativos, confirmando com o nome completo) apaga a pessoa e tudo o que é dela:
   cadastro, acesso, avaliações recebidas, contestações, resultados, quiz, ranking e elegibilidade. Não tem volta.
   O que ela fez para outros (por exemplo, avaliações feitas como avaliadora) continua, como "Avaliador removido".
   A auditoria guarda só quem excluiu, quando e quantos registros foram apagados, sem dados pessoais.

Essas operações usam a chave de serviço e rodam só no servidor (`src/server/acessos.server.ts`).
As regras de permissão ficam no banco (migration `ciclo_de_acesso`): só o ADM gerencia acessos,
ninguém altera o próprio acesso, e quem é inativado perde os poderes imediatamente.

Configuração necessária no Supabase:

- *Authentication → Sign In / Providers*: cadastro aberto **desligado**.
- *Authentication → URL Configuration*: o endereço do site em **Site URL** e `https://SEU-SITE/**`
  em **Redirect URLs** (o link de convite só volta para endereços dessa lista).
- *Authentication → Providers → Email*: **Email OTP Expiration** define a validade dos links.

## Banco de dados

As migrations ficam em `supabase/migrations`, em ordem de aplicação. O nome de cada arquivo
precisa bater com a versão registrada no banco (`supabase_migrations.schema_migrations`),
senão a ferramenta de migrations tenta reaplicá-la.

## Deploy

Cada push para o GitHub gera um deploy de preview na Vercel; o branch `main` vai para produção.
As variáveis de ambiente da tabela acima devem ser cadastradas em
*Vercel → Project → Settings → Environment Variables*.
