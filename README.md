# Qualidade & Performance

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

Scripts úteis: `npm run typecheck`, `npm run lint`, `npm run build`.

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

## Banco de dados

As migrations ficam em `supabase/migrations`, em ordem de aplicação. O nome de cada arquivo
precisa bater com a versão registrada no banco (`supabase_migrations.schema_migrations`),
senão a ferramenta de migrations tenta reaplicá-la.

## Deploy

Cada push para o GitHub gera um deploy de preview na Vercel; o branch `main` vai para produção.
As variáveis de ambiente da tabela acima devem ser cadastradas em
*Vercel → Project → Settings → Environment Variables*.
