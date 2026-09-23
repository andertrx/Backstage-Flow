# 01 — Arquitetura e tecnologia

## 1. As três camadas (explicado de forma simples)

Imagine uma **biblioteca**:

1. **As APIs (Meta e Google)** são as editoras que publicam os livros. Elas sabem os
   números, mas só mostram por um tempo e têm regras de quantas vezes você pode pedir.
2. **O Supabase** é a nossa **estante**. Toda vez que chega um livro novo, a gente
   guarda uma cópia. Mesmo que a editora pare de vender, a cópia continua na estante.
   E essa estante é "inteligente": ela sabe **somar e comparar** sozinha (é uma
   planilha gigante chamada PostgreSQL).
3. **O dashboard** é a **sala de leitura**. O leitor (usuário) nunca vai até a
   editora: ele lê o que está na estante, rápido e organizado.

E existe um **bibliotecário** (o backend) que é o único que tem a chave do depósito
das editoras (os tokens). O leitor nunca vê essa chave.

## 2. Por que Supabase

O nosso sistema é quase todo feito de **somas, médias, comparações de período e
relatórios**. O PostgreSQL (banco do Supabase) responde perguntas como "some o gasto
de agosto por cliente e compare com julho" numa única consulta. Com isso:

- o código fica **menor** (não precisamos manter "somas prontas" à mão);
- perguntas históricas (Etapa 23) funcionam para **qualquer** período;
- o custo é por **tamanho do plano**, não por cada leitura — mais previsível.

## 3. Stack escolhida

| Parte | Escolha | Por que |
|---|---|---|
| Linguagem | **TypeScript** em tudo | Uma só linguagem no site e no servidor; os "tipos" funcionam como corretor ortográfico do código |
| Frontend | **React + Vite** (SPA) | Moderno, rápido, enorme ecossistema |
| Visual | **Tailwind CSS + shadcn/ui** | Aparência de SaaS profissional, acessível e consistente |
| Gráficos | **Recharts** | Responsivos, tooltips com valores exatos, fácil trocar a métrica |
| Tabelas | **TanStack Table** | Ordenar por qualquer coluna, busca, paginação, scroll horizontal no celular |
| Dados no navegador | **TanStack Query** | Cache no navegador: não pede de novo o que acabou de pedir |
| Validação | **Zod** | Confere todo dado que entra (formulários e respostas das APIs) |
| Datas | **date-fns + date-fns-tz** | Períodos respeitando fuso horário |
| Banco | **Supabase PostgreSQL** | Consultas analíticas, particionamento para milhões de linhas |
| Login | **Supabase Auth** (e-mail/senha) | Recuperação de senha e sessão persistente prontas |
| Segurança do banco | **Row Level Security (RLS)** | O próprio banco recusa dados que o usuário não pode ver |
| Backend | **Supabase Edge Functions** (TypeScript/Deno) | Roda no servidor; guarda segredos; chama as APIs |
| Agendamento | **Supabase Cron** (pg_cron) | Dispara a sincronização de hora em hora |
| Fila | **Supabase Queues** (pgmq) | Uma tarefa por conta, com novas tentativas automáticas |
| Segredos | **Edge Function Secrets** + **Supabase Vault** | Cofre para chaves da agência e tokens de cada conexão |
| Tempo real | **Supabase Realtime** | Tela de sincronização atualiza sozinha |
| Arquivos | **Supabase Storage** | Relatórios PDF/Excel gerados |
| Hospedagem do site | **Vercel** | O Supabase não hospeda o site; a Vercel publica com HTTPS e CDN (você já tem conta conectada) |
| Estrutura do banco | **Migrações SQL versionadas** (Supabase CLI) | Toda mudança no banco fica registrada no Git e pode ser refeita |
| Testes | **Vitest** (lógica), **pgTAP** (regras de segurança do banco), **Playwright** (telas) | Testar sem tocar em dados reais |

## 4. Estrutura de pastas (monorepo)

"Monorepo" = uma única caixa com gavetas: o **site**, o **Supabase** (banco + servidor)
e as **peças compartilhadas** (como as fórmulas das métricas, que precisam ser iguais
em todo lugar).

```
Backstage-Flow/
├── apps/
│   └── web/                         # SITE (o que o usuário vê)
│       └── src/
│           ├── app/                 # rotas, layout com sidebar, provedores (auth, query)
│           ├── components/
│           │   ├── ui/              # botões, cards, inputs (shadcn/ui)
│           │   ├── charts/          # gráficos reutilizáveis
│           │   ├── tables/          # tabela genérica (ordenar, buscar, paginar)
│           │   ├── filters/         # filtro global (cliente, plataforma, período...)
│           │   └── feedback/        # mensagens amigáveis, estados vazios, "MODO DEMONSTRAÇÃO"
│           ├── features/            # uma pasta por área do menu
│           │   ├── auth/  dashboard/  executive/  clients/  accounts/  balance/
│           │   ├── campaigns/  meta/  google/  comparison/  alerts/  sync/
│           │   └── logs/  reports/  search/  client-portal/  settings/
│           ├── lib/                 # cliente Supabase, formatação de moeda/data
│           └── hooks/
│
├── supabase/                        # BANCO + SERVIDOR
│   ├── config.toml                  # configuração do projeto
│   ├── migrations/                  # criação das tabelas, índices e regras (SQL, em ordem)
│   ├── seed.sql                     # dados de DEMONSTRAÇÃO (nunca vai para produção)
│   ├── tests/                       # testes das regras de segurança (pgTAP)
│   └── functions/                   # EDGE FUNCTIONS
│       ├── _shared/                 # código comum do servidor
│       │   ├── platforms/           # ADAPTADORES por plataforma
│       │   │   ├── adapter.ts       # "contrato" que toda plataforma precisa cumprir
│       │   │   ├── registry.ts      # plataformas habilitadas
│       │   │   ├── meta/            # cliente HTTP, mapeamentos, normalização
│       │   │   └── google/
│       │   ├── auth.ts              # confere usuário e papel
│       │   ├── errors.ts            # tradução de erros técnicos em mensagens amigáveis
│       │   ├── logger.ts            # logs estruturados, sem segredos
│       │   └── rate-limit.ts
│       ├── sync-orchestrator/       # decide quais contas sincronizar e enfileira
│       ├── sync-worker/             # processa a fila, conta por conta
│       ├── sync-now/                # botão "SINCRONIZAR AGORA"
│       ├── admin-users/             # criar/editar usuários (só administrador)
│       ├── connect-meta/            # conectar conta Meta
│       ├── connect-google/          # login OAuth do Google + retorno
│       └── export-report/           # gerar CSV / Excel / PDF
│
├── packages/
│   └── shared/                      # PEÇAS COMPARTILHADAS (TypeScript puro, sem dependências)
│       └── src/
│           ├── metrics/             # fórmulas (CTR, CPC, CPL...) — uma única fonte da verdade
│           ├── periods/             # "últimos 7 dias", "mês anterior", comparação
│           ├── currency/            # moedas e formatação
│           ├── constants/           # papéis, status, plataformas
│           └── types/               # tipos gerados a partir do banco
│
├── .env.example                     # modelo de variáveis (sem valores secretos!)
└── docs/                            # esta documentação, etapa por etapa
```

## 5. Por que "adaptadores" (preparação para TikTok, LinkedIn, Pinterest)

Pense numa **tomada universal**. Cada plataforma tem um "plugue" diferente, mas todas
encaixam na mesma tomada. No código isso vira um contrato (`PlatformAdapter`):

- `listAccounts()` — quais contas existem nesta conexão
- `getAccountInfo()` — status, moeda, fuso, cobrança
- `listStructure()` — campanhas, conjuntos/grupos, anúncios
- `getDailyMetrics(periodo, nivel)` — números por dia
- `getBalance()` — saldo/limites, **quando a API oferecer**

No banco, as plataformas ficam numa tabela (`platforms`), não "chumbadas" no código.
Para adicionar TikTok Ads no futuro: cria `platforms/tiktok/` cumprindo o contrato e
insere uma linha na tabela. Nada mais muda.

## 6. Fluxo do dashboard (o que acontece quando você abre uma tela)

```
Usuário escolhe filtros (cliente, plataforma, período)
   ▼
Site calcula as datas (ex.: "últimos 7 dias" no fuso do cliente) e o período anterior
   ▼
Site chama UMA função do banco (ex.: dashboard_summary) com os filtros
   ▼
RLS confere: "esse usuário pode ver esse cliente?" — linhas proibidas nem aparecem
   ▼
PostgreSQL soma gasto, cliques, leads... dos dois períodos e devolve pronto
   ▼
Site aplica as fórmulas (CTR, CPL...) e mostra cards, gráficos e tabelas
   + "Última sincronização: 23/09/2026 18:20"
```

O site **lê** pelo Supabase com a chave pública (protegida pelo RLS), mas **nunca
escreve** métricas: só o servidor grava dados vindos das APIs. Ações sensíveis (criar
usuário, conectar conta, sincronizar agora) passam por Edge Functions que conferem a
permissão.
