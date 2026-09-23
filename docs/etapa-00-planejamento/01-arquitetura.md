# 01 — Arquitetura e tecnologia

## 1. As três camadas (explicado de forma simples)

Imagine uma **biblioteca**:

1. **As APIs (Meta e Google)** são as editoras que publicam os livros. Elas sabem os
   números, mas só mostram por um tempo e têm regras de quantas vezes você pode pedir.
2. **O Firebase** é a nossa **estante**. Toda vez que chega um livro novo, a gente
   guarda uma cópia. Mesmo que a editora pare de vender, a cópia continua na estante.
3. **O dashboard** é a **sala de leitura**. O leitor (usuário) nunca vai até a
   editora: ele lê o que está na estante, rápido e organizado.

E existe um **bibliotecário** (o backend) que é o único que tem a chave do depósito
das editoras (os tokens). O leitor nunca vê essa chave.

## 2. Stack escolhida (e por quê)

| Parte | Escolha | Por que |
|---|---|---|
| Linguagem | **TypeScript** em tudo | Uma só linguagem no site e no servidor; o "corretor ortográfico" do código (tipos) evita muitos erros bobos |
| Frontend | **React + Vite** (SPA) | Moderno, rápido, enorme ecossistema. Como o backend já é o Firebase, não precisamos de um segundo servidor (por isso não usamos Next.js) |
| Visual | **Tailwind CSS + shadcn/ui** (componentes Radix) | Aparência de SaaS profissional, acessível, fácil de manter consistente |
| Gráficos | **Recharts** | Gráficos responsivos com tooltips exatos, simples de trocar a métrica |
| Tabelas | **TanStack Table** | Ordenar por qualquer coluna, busca, paginação, scroll horizontal no celular |
| Dados no navegador | **TanStack Query** | Cache no navegador: não pede de novo o que acabou de pedir |
| Validação | **Zod** | Confere todo dado que entra (formulários e respostas das APIs) |
| Datas | **date-fns + date-fns-tz** | Cálculos de período respeitando fuso horário |
| Login | **Firebase Authentication** (e-mail/senha) | Recuperação de senha e sessão persistente prontas |
| Banco | **Cloud Firestore** | Escala para milhões de documentos, regras de segurança por usuário |
| Backend | **Cloud Functions for Firebase (2ª geração, Node.js)** | Roda no servidor do Google; guarda segredos; agenda tarefas |
| Agendamento | **Scheduler (`onSchedule`) + Task Queues (`onTaskDispatched`)** | Sincroniza de hora em hora, uma conta por vez, com limite de velocidade e novas tentativas automáticas |
| Segredos | **Google Secret Manager** (`defineSecret`) | Cofre para client secrets, developer token e chave de criptografia |
| Proteção extra | **Firebase App Check** | Garante que só o nosso site chama o backend |
| Arquivos | **Firebase Storage** (só quando necessário) | Relatórios PDF/Excel gerados |
| Hospedagem | **Firebase Hosting** | HTTPS, CDN, deploy simples |
| Testes | **Vitest** (unidade), **Firebase Emulator Suite** (banco/regras/funções locais), **Playwright** (telas) | Testar sem tocar em dados reais |

> **Importante:** Cloud Functions que chamam APIs externas exigem o **plano Blaze**
> (pague pelo uso) do Firebase. Para o volume inicial o custo tende a ser baixo, mas
> é obrigatório cadastrar um cartão. Detalhes em `07-dificuldades-e-decisoes.md`.

## 3. Estrutura de pastas (monorepo)

"Monorepo" = uma única caixa com três gavetas: o **site**, o **servidor** e as
**peças compartilhadas** (como as fórmulas das métricas, que precisam ser iguais nos dois).

```
Backstage-Flow/
├── apps/
│   └── web/                         # SITE (o que o usuário vê)
│       ├── index.html
│       └── src/
│           ├── app/                 # rotas, layout com sidebar, provedores (auth, query)
│           ├── components/
│           │   ├── ui/              # botões, cards, inputs (shadcn/ui)
│           │   ├── charts/          # gráficos reutilizáveis
│           │   ├── tables/          # tabela genérica (ordenar, buscar, paginar)
│           │   ├── filters/         # filtro global (cliente, plataforma, período...)
│           │   └── feedback/        # mensagens amigáveis, estados vazios, "MODO DEMONSTRAÇÃO"
│           ├── features/            # uma pasta por área do menu
│           │   ├── auth/            # login, recuperar senha
│           │   ├── dashboard/       # resumo geral
│           │   ├── executive/       # dashboard executivo
│           │   ├── clients/
│           │   ├── accounts/        # contas + saúde das contas
│           │   ├── balance/         # saldo
│           │   ├── campaigns/       # campanhas → conjuntos/grupos → anúncios
│           │   ├── meta/            # visão Meta Ads
│           │   ├── google/          # visão Google Ads
│           │   ├── comparison/      # comparação de períodos
│           │   ├── alerts/
│           │   ├── sync/            # sincronização + botão "sincronizar agora"
│           │   ├── logs/
│           │   ├── reports/
│           │   ├── search/          # busca global
│           │   ├── client-portal/   # visão simplificada do cliente
│           │   └── settings/        # usuários, permissões, preferências
│           ├── lib/                 # firebase client, formatação de moeda/data
│           └── hooks/
│
├── functions/                       # SERVIDOR (Cloud Functions)
│   └── src/
│       ├── index.ts                 # exporta as funções
│       ├── config/                  # segredos e parâmetros (nunca valores fixos no código)
│       ├── platforms/               # ADAPTADORES por plataforma
│       │   ├── adapter.ts           # "contrato" que toda plataforma precisa cumprir
│       │   ├── registry.ts          # lista de plataformas habilitadas
│       │   ├── meta/                # cliente HTTP, mapeamentos, normalização
│       │   └── google/
│       ├── sync/                    # orquestrador, fila, trava por conta, backfill
│       ├── aggregation/             # rollups (somatórios diários/mensais)
│       ├── alerts/                  # regras de alerta
│       ├── api/                     # funções chamadas pelo site (callables)
│       ├── auth/                    # papéis, custom claims, verificação de acesso
│       ├── security/                # criptografia de tokens, rate limit
│       └── logging/                 # logs estruturados e tradução de erros
│
├── packages/
│   └── shared/                      # PEÇAS COMPARTILHADAS
│       └── src/
│           ├── types/               # formatos dos documentos do banco
│           ├── schemas/             # validações Zod
│           ├── metrics/             # fórmulas (CTR, CPC, CPL...) — uma única fonte da verdade
│           ├── periods/             # "últimos 7 dias", "mês anterior", comparação
│           ├── currency/            # moedas e formatação
│           └── constants/           # papéis, status, plataformas
│
├── firestore.rules                  # regras de segurança do banco
├── firestore.indexes.json           # índices do banco
├── storage.rules
├── firebase.json                    # configuração do Firebase e dos emuladores
├── .env.example                     # modelo de variáveis (sem valores secretos!)
└── docs/                            # esta documentação, etapa por etapa
```

## 4. Por que "adaptadores" (preparação para TikTok, LinkedIn, Pinterest)

Pense numa **tomada universal**. Cada plataforma tem um "plugue" diferente, mas todas
precisam encaixar na mesma tomada. No código isso vira um contrato (`PlatformAdapter`)
com funções como:

- `listAccounts()` — quais contas existem nesta conexão
- `getAccountInfo()` — status, moeda, fuso, cobrança
- `listStructure()` — campanhas, conjuntos/grupos, anúncios
- `getDailyMetrics(periodo, nivel)` — números por dia
- `getBalance()` — saldo/limites, **quando a API oferecer**

O resto do sistema (banco, dashboard, alertas) só conversa com a tomada, nunca com o
plugue. Para adicionar TikTok Ads no futuro, basta criar `platforms/tiktok/` cumprindo
o contrato. Nada mais muda.

## 5. Fluxo do dashboard (o que acontece quando você abre uma tela)

```
Usuário escolhe filtros (cliente, plataforma, período)
   ▼
Site calcula as datas (ex.: "últimos 7 dias" no fuso da conta) e o período anterior
   ▼
Site lê os ROLLUPS do Firestore (somatórios já prontos por dia) — poucas leituras
   ▼
Regras do Firestore conferem: "esse usuário pode ver esse cliente?"
   ▼
Site calcula CTR, CPL etc. a partir das somas (fórmulas do pacote shared)
   ▼
Cards, gráficos e tabelas são exibidos + data da "última sincronização"
```

O site **lê** direto do Firestore (rápido e barato), mas **nunca escreve** métricas:
só o servidor escreve dados vindos das APIs. Ações sensíveis (criar usuário, conectar
conta, sincronizar agora) passam por funções do servidor que conferem permissão.
