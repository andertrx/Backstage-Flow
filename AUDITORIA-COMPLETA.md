# Backstage Flow — Auditoria Completa do Sistema

> **Tipo:** Auditoria somente leitura — nenhum arquivo foi modificado, criado, excluído ou publicado.
> **Data:** 2026-11-20

---

## 1. Estrutura Geral do Sistema

### 1.1 Visão Geral

**Backstage Flow** é um CRM SaaS para agências de publicidade. Gerencia contas de anúncio (Meta Ads, Google Ads), onboarding de clientes, operações/tarefas, monitoramento, tracking/atribuição, integração WhatsApp e relatórios. O app é em português (brasileiro), usa Supabase como backend, e segue arquitetura baseada em features.

### 1.2 Stack Tecnológico

| Camada | Tecnologia |
|--------|-----------|
| Frontend | React 19 + TypeScript + Vite |
| Backend | Supabase (PostgreSQL + Edge Functions em Deno) |
| Estado | React Query (@tanstack/react-query) + React Context (Auth) |
| Roteamento | React Router v7 (createBrowserRouter) |
| UI | Componentes customizados + Tailwind CSS + ícones Lucide |
| Workspace | npm workspaces — `apps/web` (frontend) + `packages/shared` (tipos/lógica compartilhada) |
| Edge Functions | Runtime Deno em `supabase/functions/` |
| Migrations | 115 arquivos SQL em `supabase/migrations/` |

### 1.3 Estrutura de Diretórios

```
apps/web/src/
├── app/                    # Configuração do app (router, guards, error boundary)
├── features/               # 35 módulos de feature
├── components/             # Componentes compartilhados
│   ├── layout/             # App shell (sidebar, header)
│   ├── ui/                 # 18 componentes primitivos
│   ├── charts/             # Componentes de gráfico
│   ├── data/               # Tabelas de dados
│   └── feedback/           # Error boundaries, spinners, banner demo
├── lib/                    # Utilitários (17 arquivos)
├── demo/                   # Modo demonstração (mock backend, seed data)
└── index.css               # Estilos globais
```

### 1.4 Rotas do Sistema

#### Rotas Públicas (sem auth)

| Caminho | Componente | Descrição |
|---------|-----------|-----------|
| `/login` | `LoginPage` | Login |
| `/recuperar-senha` | `ForgotPasswordPage` | Recuperar senha |
| `/redefinir-senha` | `ResetPasswordPage` | Redefinir senha |
| `/privacidade` | `PrivacyPage` | Política de privacidade |
| `/termos` | `TermsPage` | Termos de uso |
| `/oauth/consent` | `OAuthConsentPage` | Consentimento OAuth MCP |
| `/r/:token` | `PublicReportPage` | Relatório público via link secreto |

#### Rotas Autenticadas

| Caminho | Permissão | Componente | Feature |
|---------|-----------|-----------|---------|
| `/` | — | `DashboardPage` | Dashboard principal |
| `/hoje` | — | `HojePage` | Dashboard "Hoje" |
| `/minha-conta` | — | `AccountPage` | Minha conta |
| `/comparar` | `internal.view` | `ComparisonPage` | Comparação de períodos |
| `/executivo` | `internal.view` | `ExecutivePage` | Visão executiva |
| `/historico` | `internal.view` | `HistoryPage` | Histórico mensal |
| `/clientes` | `clients.view` | `ClientsPage` | Lista de clientes |
| `/clientes/:id` | `clients.view` | `ClientDetailPage` | Detalhe do cliente |
| `/clientes/:id/dashboard` | — | `ClientReportPage` | Relatório do cliente |
| `/clientes/:id/conversas` | `tracking.suggestions` | `ClientConversationsRoute` | Conversas WhatsApp |
| `/campanhas` | `internal.view` | `CampaignsPage` | Lista de campanhas |
| `/campanhas/:id` | `internal.view` | `EntityDetailPage` | Detalhe da campanha |
| `/conjuntos/:id` | `internal.view` | `EntityDetailPage` | Detalhe do conjunto |
| `/anuncios/:id` | `internal.view` | `EntityDetailPage` | Detalhe do anúncio |
| `/criar-campanhas` | `ads.builder` | `CampaignBuilderPage` | Construtor de campanhas |
| `/criar-campanhas/:id` | `ads.builder` | `DraftEditorPage` | Editor de rascunho |
| `/criador-de-anuncios` | `ads.builder` | `AdsBuilderPage` | Construtor de anúncios IA |
| `/meta-ads` | `internal.view` | `PlatformPage` | Visão Meta Ads |
| `/google-ads` | `internal.view` | `PlatformPage` | Visão Google Ads |
| `/contas` | `internal.view` | `AccountsHealthPage` | Saúde das contas |
| `/monitoramento` | `monitor.view` | `MonitoringPage` | Monitoramento |
| `/inteligencia-resultados` | `results.view` | `ResultsPage` | Inteligência de resultados |
| `/alertas` | `internal.view` | `AlertsPage` | Alertas |
| `/tracking` | `tracking.view` | `TrackingHub` | Hub de tracking |
| `/vendas-sugeridas` | `tracking.suggestions` | `SuggestionsPage` | Vendas sugeridas (IA) |
| `/relatorios` | `reports.generate` | `ReportsPage` | Relatórios |
| `/logs` | `logs.view` | `LogsPage` | Logs |
| `/contatos` | `contacts.view` | `ContactsPage` | Contatos/leads |
| `/sincronizacao` | `internal.view` | `SyncPage` | Sincronização |

#### Rotas da Central de Operações

| Caminho | Descrição |
|---------|-----------|
| `/operacoes` | Central de Operações (hub principal) |
| `/operacoes/tarefas` | Tarefas |
| `/operacoes/minhas-tarefas` | Minhas tarefas |
| `/operacoes/arquivados` | Tarefas arquivadas |
| `/painel` | Dashboard de operações |
| `/comercial` | Comercial/leads |
| `/onboarding` | Onboarding de clientes |
| `/reunioes` | Reuniões |
| `/envios` | Envios semanais WhatsApp |
| `/notificacoes` | Notificações |
| `/config-central` | Configurações da Central |

#### Rotas de Configurações

| Caminho | Descrição |
|---------|-----------|
| `/configuracoes` | Layout de configurações (abas) |
| `/configuracoes/usuarios` | Gestão de usuários |
| `/configuracoes/integracoes` | Integrações |
| `/configuracoes/permissoes` | Papéis e permissões |

### 1.5 Layout e Navegação

**Layout principal (`AppLayout`):**
- **Sidebar** (desktop: fixa esquerda, recolhível a 4.5rem; mobile: drawer overlay)
- **Header** (barra superior sticky com título da seção, busca, sino de notificações, avatar, logout)
- **Área de conteúdo** (com `Outlet` para rotas filhas)
- **Overlays globais**: `DueTasksReminder`, `EnvioApprovalReminder`

**5 Grupos do Menu de Navegação:**
1. **Visão geral**: Dashboard, Clientes, Contas
2. **Operações**: Painel, Comercial, Onboarding, Central de Operações, Notificações, Reuniões, Vendas sugeridas, Envios semanais, Configurações da Central
3. **Anúncios**: Meta Ads, Google Ads, Campanhas, Criar campanhas, Criador de Anúncios
4. **Análise**: Relatórios, Monitoramento, Inteligência de Resultados, Alertas, Tracking
5. **Sistema**: Sincronização, Logs, Configurações

**Sinos de notificação no header (3):**
1. `AlertsBell` — Alertas de conta/campanha/tarefa
2. `MonitorBell` — Alertas de monitoramento de performance
3. `NotificationBell` — Notificações de operações

### 1.6 Módulos de Feature (35 diretórios)

| Módulo | Descrição | Arquivos principais |
|--------|-----------|---------------------|
| `account` | Página da conta do usuário | `AccountPage.tsx` |
| `ad-accounts` | Gestão de contas de anúncio | `PlatformAccountsCard.tsx`, `LinkAccountModal.tsx` |
| `ads-builder` | Construtor de anúncios com IA | `AdsBuilderPage.tsx` |
| `alerts` | Página de alertas | `AlertsPage.tsx`, `AlertsBell.tsx` |
| `auth` | Autenticação e autorização | `AuthProvider.tsx`, `LoginPage.tsx`, `guards.tsx` |
| `balance` | Saldo das contas | `BalanceSection.tsx`, `BalanceAccountCard.tsx` |
| `campaign-builder` | Construtor de campanhas | `CampaignBuilderPage.tsx`, `DraftEditorPage.tsx` |
| `campaigns` | Lista de campanhas | `CampaignsPage.tsx`, `columns.tsx` |
| `client-report` | Relatórios de cliente | `ClientHome.tsx`, `ClientReportPage.tsx`, `AccountReport.tsx` |
| `clients` | Gestão de clientes | `ClientsPage.tsx`, `ClientDetailPage.tsx`, `ClientFormModal.tsx` |
| `comparison` | Comparação de períodos | `ComparisonPage.tsx` |
| `contacts` | Contatos/leads | `ContactsPage.tsx`, `LeadFormsModal.tsx` |
| `dashboard` | Dashboard principal | `DashboardPage.tsx`, `KpiCard.tsx`, `ChartsSection.tsx` |
| `executive` | Visão executiva | `ExecutivePage.tsx` |
| `google-agenda` | Integração Google Calendar | `GoogleAgendaCard.tsx` |
| `health` | Saúde das contas | `AccountsHealthPage.tsx` |
| `history` | Histórico mensal | `HistoryPage.tsx` |
| `home` | Página "Hoje" | `HojePage.tsx` |
| `integrations` | Hub de integrações | `IntegrationsPage.tsx`, `MetaIntegrationCard.tsx` |
| `legal` | Páginas legais | `LegalPages.tsx` |
| `logs` | Visualização de logs | `LogsPage.tsx` |
| `monitoring` | Monitoramento de performance | `MonitoringPage.tsx`, `overview.tsx`, `compare.tsx` |
| `oauth` | Consentimento OAuth | `OAuthConsentPage.tsx` |
| `operations` | Central de Operações (**52 arquivos, maior módulo**) | Tasks, Kanban, Comercial, Reuniões, Envios, Notificações, Onboarding, Dashboard ops |
| `platforms` | Visão genérica de plataforma | `PlatformPage.tsx`, `logic.ts` |
| `reports` | Geração de relatórios | `ReportsPage.tsx` |
| `results` | Inteligência de resultados | `ResultsPage.tsx`, `ResultsDashboard.tsx` |
| `search` | Busca global (Cmd+K) | `GlobalSearch.tsx` |
| `settings` | Configurações | `SettingsLayout.tsx`, `PermissionsPage.tsx` |
| `structure` | Detalhe genérico de entidade | `EntityDetailPage.tsx` |
| `sync` | Gerenciamento de sincronização | `SyncPage.tsx`, `RunsTable.tsx` |
| `tracking` | Tracking e atribuição | `TrackingHub.tsx`, `TrackingPage.tsx`, `MetaCapiModal.tsx`, `ContainerModals.tsx` |
| `users` | Gestão de usuários | `UsersPage.tsx` |

### 1.7 Autenticação e Autorização

**7 Roles (ordem de acesso):**

| Role | Descrição | Escopo |
|------|-----------|--------|
| `admin` | Acesso total (usuários, conexões, config) | Todos os clientes |
| `gestor` | Gerencia clientes autorizados | Clientes autorizados |
| `operador` | Opera em clientes autorizados | Clientes autorizados |
| `visualizador` | Somente leitura | Clientes autorizados |
| `equipe` | Central de Operações apenas | Dados de operações |
| `vendedor` | Equipe de vendas do cliente | Contatos de clientes autorizados |
| `cliente` | Visão do cliente | Própria empresa |

**24 Permissões UI:**
`users.manage`, `clients.view`, `clients.edit`, `accounts.connect`, `sync.run`, `alerts.manage`, `reports.generate`, `logs.view`, `settings.manage`, `internal.view`, `tracking.view`, `tracking.manage`, `tracking.whatsapp`, `tracking.suggestions`, `monitor.view`, `monitor.handle`, `monitor.rules`, `monitor.admin`, `results.view`, `results.manage`, `contacts.view`, `contacts.mark`, `contacts.setup`, `ads.builder`

**20 Permissões de Operações (por pessoa):**
`ops.access`, `ops.kanban.view`, `ops.tasks.create`, `ops.tasks.edit`, `ops.tasks.archive`, `ops.tasks.assign`, `ops.tasks.sector`, `ops.cards.move`, `ops.clients.view`, `ops.history.edit`, `ops.meetings.manage`, `ops.dashboard.view`, `ops.commercial`, `ops.envios`

**4 Templates de Função Ops:**
1. Gestor de tráfego → sugere role `gestor`
2. Operação → sugere role `equipe`
3. Comercial → sugere role `equipe`
4. Administrador → sugere role `admin`

### 1.8 Edge Functions (22 funções)

| Função | Propósito |
|--------|-----------|
| `_shared/` | Auth compartilhada, logging de erros, sync, rate limiting |
| `ad-accounts/` | Gestão de contas de anúncio |
| `admin-users/` | Operações de admin de usuários |
| `capi-sender/` | Envio de eventos CAPI |
| `client-report-email/` | Envio de relatório por e-mail |
| `client-report-link/` | Geração de link de relatório |
| `envio-aviso/` | Envio de notificações de alerta |
| `google-agenda/` | Integração Google Calendar |
| `lead-webhook/` | Processamento de webhook de lead |
| `mcp/` | Servidor MCP (ferramentas IA: commercial, CRM, envios, ops) |
| `monitor-email/` | Notificações de monitoramento |
| `ops-push/` | Push notifications para operações |
| `sales-webhook/` | Processamento de webhook de venda |
| `sheets/` | Integração Google Sheets |
| `sync/` | Sincronização (Meta Ads, Google Ads) |
| `track/` | Processamento de eventos de tracking |
| `tracking-destinations/` | Gestão de destinos de tracking |
| `tracking-whatsapp/` | Integração WhatsApp tracking |
| `wa-ai/` | Assistente IA WhatsApp |
| `wa-gateway/` | Gateway WhatsApp (Evolution API) |
| `wa-inbound/` | Processamento de mensagens inbound WhatsApp |
| `wa-instance/` | Gestão de instâncias WhatsApp |
| `wa-send/` | Envio de mensagens WhatsApp |
| `whatsapp-webhook/` | Receptor de webhook WhatsApp |

### 1.9 Migrations (115 arquivos SQL)

Principais grupos:

| Tópico | Quantidade | Arquivos-chave |
|--------|-----------|----------------|
| Auth & Profiles | 4 | `_auth_profiles.sql` |
| Clients | 7 | `_clients.sql`, `_clientes_desativar.sql`, `_clientes_excluir.sql` |
| Ad Accounts (Meta) | 2 | `_ad_accounts_meta.sql` |
| Google Ads | 1 | `_google_ads.sql` |
| History & Metrics | 4 | `_history_structure.sql`, `_history_metrics.sql` |
| Dashboard | 3 | `_dashboard_summary.sql`, `_dashboard_timeseries.sql` |
| Balance | 3 | `_balance.sql` |
| Account Health | 1 | `_account_health.sql` |
| Campaigns | 1 | `_campaign_table.sql` |
| Alerts | 4 | `_alerts.sql` (mais 3 fix files) |
| Sync | 1 | `_sync.sql` |
| Logs | 1 | `_logs.sql` |
| Permissions | 1 | `_permissions.sql` |
| **Tracking** | 8 | `_tracking_foundation.sql`, `_tracking_leads.sql`, `_tracking_capi.sql`, `_tracking_whatsapp.sql`, `_tracking_whatsapp_api.sql`, `_tracking_attribution.sql` |
| Client Reports | 4 | `_client_report.sql`, `_client_portal.sql` |
| Operations Center | 15+ | `_ops_*` (foundation, tasks, clients, commercial, meetings, etc.) |
| Monitoring | 15+ | `_monitor_*` (foundation, compare, alerts, handling, notify, overview, objectives) |
| WhatsApp | 12+ | `_wa_*` (coexistência, conversas, disparos, avisos, grupos, etc.) |
| Envios (Weekly) | 6 | `_envios_*` (semanais, aprovacao, padroes, config, codigo, fila) |
| Onboarding | 8+ | `_onboarding_*` (etapas, cancelado, ficha, substituir, tarefas, etc.) |
| Results Intelligence | 8 | `_ri_*` (sheets, results, daily, quality, records, params, ids, campanha) |
| Campaign Builder | 2 | `_campaign_builder_base.sql` |

### 1.10 Modo Demonstração

- `demo/constants.ts` — E-mail/senha demo
- `demo/demoFetch.ts` — Intercepta chamadas fetch, retorna dados mock
- `demo/mockBackend.js` — 200KB+ de dados mock para todas as features
- `demo/mockOpsTasks.js` — 137KB de tarefas mock
- `demo/mockCampaignBuilder.js` — Mock do construtor de campanhas
- `demo/mockWaGateway.js` — Mock do gateway WhatsApp
- `demo/seed.ts` — Seed data: 3 clientes, 6 contas, 12 campanhas, 10 conjuntos, 15 criativos

---

## 2. Design System / Theme

### 2.1 Paleta de Cores

| Token | Valor | Uso |
|-------|-------|-----|
| `--color-brand-600` | `#2563eb` | Cor primária |
| `--color-accent-400` | `#22d3ee` | Detalhes de destaque |
| `--color-canvas` | `#eef0f4` | Fundo da página |
| Slate (50–950) | Tailwind scale | Texto, bordas, backgrounds |
| Emerald | `emerald-50/700/800/900` | Sucesso |
| Amber | `amber-50/800/900` | Aviso |
| Red | `red-50/600/700/800` | Erro/perigo |

### 2.2 Sombras

```css
--shadow-card: 0 1px 0 rgb(15 23 42 / 0.02);          /* Estilo "Vertix" — quase invisível */
--shadow-elevated: 0 12px 32px -8px rgb(15 23 42 / 0.2), 0 4px 12px -4px rgb(15 23 42 / 0.1);
--shadow-brand: 0 4px 14px -4px rgb(37 99 235 / 0.55); /* Brilho azul para cards hero */
```

### 2.3 Tipografia

- **Fonte**: Inter Variable (`@fontsource-variable/inter`)
- Heading principal: `text-3xl font-semibold tracking-tight text-slate-950`
- Corpo secundário: `text-sm text-slate-500`
- Números em KPIs: `tabular-nums` para alinhamento

### 2.4 Dark Mode

- Toggle via `data-theme="dark"` no `<html>`
- Escala slate invertida; cores brand/accent/semantic mantidas
- Suporte a `prefers-color-scheme: dark`

### 2.5 Decisões de Design Principais

- **Cards**: `rounded-2xl bg-white shadow-card ring-1 ring-slate-200/60`
- **Border radius**: `rounded-xl` (inputs/badges), `rounded-2xl` (cards), `rounded-full` (pills)
- **Bordas**: Baseadas em `ring` ao invés de bordas sólidas

---

## 3. Componentes Visuais

### 3.1 Componentes Primitivos (`components/ui/`)

| Componente | Arquivo | Descrição |
|------------|---------|-----------|
| `Button` | `button.tsx` | 5 variants (primary/secondary/subtle/ghost/danger), 3 sizes, loading |
| `Card` | `card.tsx` | Surface: `rounded-2xl bg-white shadow-card ring-1` |
| `Field` | `field.tsx` | Wrapper de Label + Input/Select/Textarea |
| `Input` | `field.tsx` | `rounded-xl` com ring-based border, brand focus ring |
| `Select` | `field.tsx` | Seta SVG customizada |
| `Textarea` | `field.tsx` | Mesmo estilo, min-h-24 |
| `Badge` | `badge.tsx` | Badges de status/pill |
| `Alert` | `alert.tsx` | 4 tons (error/success/info/warning) com ícones Lucide |
| `Modal` | `modal.tsx` | Sheet no mobile / centered no desktop, Escape-to-close |
| `IconButton` | `icon-button.tsx` | Botão apenas ícone |
| `Tooltip` | `tooltip.tsx` | Tooltip customizado |
| `Toast` | `toast.tsx` | Notificações toast |
| `StatusBadge` | `status-badge.tsx` | Badge de status |
| `Switch` | `switch.tsx` | Toggle switch |
| `Skeleton` | `skeleton.tsx` | Loading skeleton com shimmer |
| `SortableList` | `sortable-list.tsx` | DnD list com @dnd-kit |

### 3.2 KpiCard (`dashboard/KpiCard.tsx`)

O componente visualmente mais importante. Características:
- **Card padrão**: Fundo branco, texto slate, ícone com círculo brand
- **Card hero** (métrica `spend`): Gradiente escuro (`HERO_STYLE`), texto branco, sombra elevada
- **Animação de contagem**: Hook `useCountUp`
- **Badge de variação**: Pill com seta up/down, colorido (emerald=good, red=bad, slate=neutral)
- **Container query**: `@container` + `[font-size:clamp(0.8rem,13.5cqw,1.75rem)]`
- **Animação staggered**: Via CSS custom property `--i`

### 3.3 Ícones

- **Biblioteca**: Lucide React (exclusivamente)
- Uso em KPIs: `size-4` dentro de containers `size-8 rounded-full`
- Cores por plataforma: Meta `#2a78d6`, Google `#eb6834`

---

## 4. Animações e Transições

### 4.1 Sistema de Animações (CSS-only, sem biblioteca)

| Animação | Duração | Uso |
|----------|---------|-----|
| `fade-in` | 150ms | Backdrop de modal |
| `modal-in` | 320ms | Dialog de modal |
| `sheet-in` | 220ms | Bottom sheet no mobile |
| `toast-in` | 200ms | Toast notifications |
| `page-in` | 240ms | Transições de página |
| `rise` | 420ms | Entrada staggered de cards |
| `draw-line` | 1000ms | Desenho de linha do gráfico |
| `area-in` | 700ms | Preenchimento de gradiente do gráfico |
| `shimmer` | 1.4s infinite | Skeleton loading |
| `shell-in-left` | 480ms | Entrada da sidebar |
| `shell-in-top` | 480ms | Entrada do header |

### 4.2 Padrões de Animação

- **Stagger de cards**: `animation-delay: calc(var(--i, 0) * 45ms)`
- **Draw do gráfico**: `stroke-dasharray: 1` + `animation: draw-line 1000ms`
- **Skeleton shimmer**: Gradiente linear com shimmer infinito
- **Reduced motion**: `prefers-reduced-motion: reduce` desliga todas as animações
- **Toggle de animação**: `data-motion="off"` desliga programaticamente

---

## 5. Design Responsivo

### 5.1 Breakpoints

| Token | Largura | Uso |
|-------|---------|-----|
| `sm:` | 640px | Padding de inputs, header |
| `md:` | 768px | Grid 3-col de KPIs, colunas do ads builder |
| `lg:` | 1024px | Sidebar visível, header pill arredondado, grid 4-col KPIs |
| `xl:` | 1280px | Grid 4-col KPIs, filtros 6-col |
| `2xl:` | 1536px | Filtros 6-col |

### 5.2 Sidebar

- **Desktop (`lg:`)**: Fixa, 256px (ou 72px recolhida), sticky, rounded-3xl
- **Tablet/Mobile**: Oculta, substituída por hamburger menu → drawer `w-72 max-w-[85vw]`
- **Recolhível**: Usuário pode recolher a icon-only mode (`w-[4.5rem]`), preferência persistida

### 5.3 Header

- **Mobile**: Flat, full-width, hamburger
- **Desktop (`lg:+`)**: Pill arredondado, flutuante com sombra, backdrop-blur

### 5.4 Grid de KPIs

```
grid-cols-2 (mobile)
→ md:grid-cols-3 (tablet)
→ xl:grid-cols-4 (desktop)
```

---

## 6. Dashboards e Visualizações

### 6.1 Dashboard Principal

**10 cartões KPI:**
1. Investimento (Spend) — card hero, col-span-2
2. Saldo (Balance)
3. Leads
4. Mensagens
5. Conversões
6. CPL
7. CPC
8. CPM
9. CTR
10. ROAS

**Seção de gráficos (`ChartsSection`):**
- **Tipo**: SVG TimeSeriesChart customizado
- **Métricas**: spend, reach, impressions, clicks, link_clicks, leads, messages, conversions, conversion_value
- **Granularidade**: day, week, month
- **Divisão por plataforma**: checkbox (Meta em azul `#2563eb`, Google em laranja `#eb6834`)
- **Toggle**: Gráfico ↔ Tabela
- **Max dias**: 400 (auto-fallback para semanal)

**Outras seções:**
- `CurrencyTabs` — Troca entre moedas
- `BalanceSection` — Grid de cartões de saldo
- `FiltersBar` — Filtros de cliente, plataforma, conta, campanha, data
- Links rápidos para Visão Executiva, Comparação, Histórico

### 6.2 Visão Executiva

**Cadeia de KPIs (5 passos em fluxo horizontal):**
1. Investimento → 2. Resultados → 3. Custo por resultado → 4. Conversões → 5. ROAS

**Tabelas de breakdown:**
- **Por plataforma**: Com barras de progresso de share
- **Por cliente**: Com barras de progresso de share

### 6.3 Dashboard de Operações

**10 cartões de estatísticas:**
1. Em aberto
2. Atrasadas (tom vermelho quando > 0)
3. Vencem hoje (tom âmbar quando > 0)
4. Próximos 7 dias
5. Sem responsável
6. Bloqueadas
7. Aguardando cliente
8. Paradas (tom de aviso quando > 0)
9. Concluídas no período
10. Tempo médio

**4 seções de breakdown:**
1. **Por setor** — Tabela com barras horizontais
2. **Em aberto por status** — Barras horizontais com dots coloridos
3. **Carga por pessoa** — Barras horizontais (top 15)
4. **Gargalos** — Lista de tarefas paradas/bloqueadas

### 6.4 Monitoramento / Alertas de Performance

**Visão geral (`overview.tsx`):**
- 3 tiles KPI: "Com você", "Sem responsável", "Novos (não vistos)"
- "Mais urgentes": Lista de alertas com badges de severidade
- "Alertas abertos por cliente": Tabela com contagens critical/warning/unassigned

**Aba Histórico:**
- TimeSeriesChart: Alertas criados (azul) vs Alertas encerrados (laranja)
- 4 cartões KPI + seção "Resultado das providências"
- Barras horizontais de métricas que mais geram alertas

**Comparação (`compare.tsx`):**
- 4 cartões de severidade
- Tabela de comparação principal
- Modal de drill-down com TimeSeriesChart
- Grid de criativos para comparação em nível de criativo

### 6.5 Tracking e Atribuição

**Visão de Marketing (`MarketingView`):**
- 6 cartões KPI: Leads, Compras, Receita, Investimento, Custo por lead, ROAS
- "Origem × resultado": Tabela por canal (9 canais)
- "O caminho até a venda": Análise de jornada
- "Onde foi o dinheiro": Breakdown por campanha
- Toggle First-touch vs Last-touch

**Seção de Atribuição (`AttributionSection`):**
- Tabela de resumo por canal
- Tabela de detalhe por campanha
- Badges de qualidade de matching: "ID da campanha" (sucesso), "Pelo nome" (atenção), "Sem conversão no site" (neutro)

### 6.6 Tipos de Visualização Usados

| Tipo | Onde | Propósito |
|------|------|-----------|
| SVG Time-series line chart | Dashboard, Monitoring, Compare | Tendência temporal |
| CSS horizontal bar chart | Operations dashboard, Monitoring, Executive | Distribuição/comparação |
| KPI Stat cards | Dashboard, Executive, Operations, Marketing, Monitoring | Métricas chave |
| Data tables | Attribution, Marketing, Executive, Compare | Dados detalhados |
| Progress bars | Attribution (share %), Executive breakdown | Representação proporcional |
| Pie/donut charts | — | Não usados |
| Vertical bar charts | — | Não usados (são horizontais) |

---

## 7. Tracking — Captura no Navegador

### 7.1 O Script do Cliente (`t.js`)

- **Arquivo único**: `apps/web/public/t.js` (573 linhas, ~30KB)
- **Servido como arquivo estático** pela Vercel em `https://www.backstageflow.com.br/t.js`
- **IIFE ES5** (JavaScript "de sites", apenas ASCII exceto comentários)
- **Cache**: `max-age=3600` via `vercel.json` (1 hora, sem versionamento/cache-busting)
- **Montado no CRM** por `installSnippetWithOptions()` em `logic.ts:147-160`
- **Chave pública**: `public_key` do container, formato `bf_` + 24 hex

### 7.2 Atributos do Snippet

| Atributo | Efeito |
|----------|--------|
| `data-key` | Obrigatório, `bf_` + 24 hex |
| `data-endpoint` | Destino dos eventos (default: Supabase `/track`) |
| `data-consent="aguardar"` | Só coleta após `bf("consent", true)` |
| `data-forms="lead"` | Formulários com e-mail/telefone viram Lead |
| `data-pixel="ID"` | Dispara Pixel do Meta no navegador com mesmo `event_id` |
| `data-wa-code="1"` | Coloca `(ref. XXXXXX)` na mensagem do WhatsApp |
| `data-clicks="on"` | Evento `bf_click` |
| `data-fields="on"` | Preenche campos escondidos com a origem |

### 7.3 Parâmetros de URL Capturados

**15 parâmetros**: `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`, `fbclid`, `gclid`, `wbraid`, `gbraid`, `msclkid`, `ttclid`, `li_fat_id`, `bf_c`, `bf_s`, `bf_a`

- `bf_c/bf_s/bf_a`: IDs dinâmicos de anúncio (Meta `{{campaign.id}}/{{adset.id}}/{{ad.id}}`, Google `{campaignid}/{adgroupid}/{creative}`)

### 7.4 Cookies

| Cookie | Conteúdo | TTL |
|--------|----------|-----|
| `_bft` | ID do visitante (22 chars aleatórios) | 365 dias |
| `_bfs` | `sessao.timestamp.assinatura_de_campanha` | 30 min |
| `_bfc` | Consentimento (`"1"`/`"0"`) | 365 dias |
| `_bfa` | Primeira origem (JSON com UTMs/click-ids) | 365 dias (só com `data-fields="on"`) |
| `_bfl` | Última origem (JSON com UTMs/click-ids) | 365 dias (só com `data-fields="on"`) |
| `_fbp`/`_fbc` | Cookies first-party do Meta | 90 dias |

- `_bfa`/`_bfl` **só são gravados quando `data-fields="on"`**
- **Nenhum `localStorage`**. Único armazenamento não-cookie: **`sessionStorage._bfu`** (identidade cifrada)
- **Sem fila offline persistente**: fila em memória, máx. 20 itens, perde ao recarregar

### 7.5 Hashing SHA-256

**O que é hasheado (apenas dados de contato):**
- E-mail, telefone, primeiro nome, último nome
- SHA-256 puro, **sem sal**, feito no navegador (`crypto.subtle.digest`)
- Texto legível **nunca sai do navegador**
- Se não for `https` (sem `crypto.subtle`), **nada é enviado**

**O que NÃO é hasheado:**
- `fbclid`, `gclid`, `wbraid`, `gbraid`, `msclkid`, `ttclid`, `li_fat_id` e todos os UTMs
- `bf_c`, `bf_s`, `bf_a`
- URL completa da página (`u`) e referrer completo (`r`)
- IP e User-Agent (nunca são coletados no navegador)

### 7.6 `_fbp` e `fbc`

- Gerados no formato do Meta: `fb.1.<timestamp>.<aleatório>` / `fb.1.<timestamp>.<fbclid>`
- Transmitidos **em claro** no corpo do beacon (CAPI exige o formato original)
- **Criados mesmo sem `data-pixel`** (`t.js` cria cookies com cara de Pixel no domínio do cliente sem o Pixel estar ativo)

### 7.7 Transporte de Eventos

- **Endpoint**: `POST https://.../functions/v1/track`
- **Transporte**: `navigator.sendBeacon` → fallback `fetch keepalive no-cors`
- **Payload**: `k`, `v`, `s`, `e` (event_id único), `n`, `t`, `u`, `r`, `nt`, `c`, `cd`, `ud` (hashes), `fbp`, `fbc`
- **Sem retry, sem fila persistente**
- **Limites**: 8 KB por corpo, 600 req/min por container, 120 req/min por IP
- **Validação de origem**: domínio autorizado por header `Origin` + host da URL

### 7.8 Consentimento / LGPD

- **Dois níveis**: Navegador (fila em memória) + Servidor (recusa gravação)
- **Modos por container**: `nao_exigir` (padrão) | `aguardar_consentimento`
- **Padrão**: `nao_exigir` — **coleta imediata sem pedir aceite**
- **Aviso de privacidade: NÃO existe dentro do `t.js`**. Depende do banner do cliente chamar `bf("consent", true)`
- Ao consentir: grava `_bfc=1`, roda `touchNow()`/`fillHidden()`, despeja fila

### 7.9 Identificação

- **Visitante**: cookie `_bft` (22 chars aleatórios), 365 dias, gerado no navegador
- **Sessão**: cookie `_bfs`, 30 min, nova sessão quando: sem cookie, formato inválido, 30 min passaram, ou campanha diferente
- **Contato (Lead)**: hash do e-mail/telefone/nome (`ud`), identidade cifrada em `sessionStorage._bfu`
- **Ligação pessoa↔lead feita no servidor**

### 7.10 Lacunas Encontradas

1. `consent_version` nunca enviado pelo navegador → coluna sempre nula
2. Sem sal no SHA-256 (diferente do padrão Meta Advanced Matching)
3. Sem fila persistente/retry: eventos se perdem
4. Sem versionamento do `t.js` nem cache-busting
5. Consentimento **não exigido por padrão**
6. Nenhum aviso de privacidade no script
7. URL completa e referrer viajam em claro no beacon
8. `_fbp`/`_fbc` ficam em claro nos cookies do cliente
9. Risco de cookie `_fbp` duplicado (fallback de domínio)
10. Sem mock do `t.js` no modo demonstração
11. Assinatura de campanha usa só 40 caracteres → risco de colisão

---

## 8. Meta Pixel e API de Conversões (CAPI)

### 8.1 Pixel do Navegador

- **Snippet HTML montado no CRM**, colado no site do cliente
- `data-pixel="<ID do Pixel>"` injeta o `fbevents.js` do Meta sob demanda
- **Desligado por padrão** (checkbox desmarcada no modal)
- Dispara evento com **mesmo `event_id`** do servidor → dedupe pelo Meta
- Se o site já tem Pixel próprio, deixar desmarcado evita contagem em dobro

### 8.2 API de Conversões (CAPI)

**Endpoint**: `POST https://graph.facebook.com/{graph_version}/{pixel_id}/events`
- Versão padrão: `v26.0` (sobrescrevível por `META_GRAPH_VERSION`)

**Origem do token (nunca o valor exposto):**
1. Ander cola o token no campo do CRM (`MetaCapiModal.tsx`, `type="password"`)
2. Edge Function `tracking-destinations` valida formato, exige role `admin`/`gestor`
3. Token vai para **Supabase Vault** via `public.tracking_destination_secret_set(...)`
4. Na hora do envio, lido por `public.tracking_destination_secret_get(...)` (service_role only)
5. Token viaja no corpo do POST, nunca na URL
6. Tela nunca recebe o token de volta (coluna `vault_secret_id` não exposta via RLS)

**Eventos enviados (configuráveis por site):**
- Padrão: `Lead, CompleteRegistration, SubmitApplication, Schedule, Purchase, Contact`
- `PageView` e `ViewContent` disponíveis mas fora do padrão (volume alto)

**Campos do evento (`buildMetaEvent`):**
- `event_name` — pode ser renomeado por regra do CRM (`bf_meta`) ou cancelado (`nao_enviar`)
- `event_id` — mesmo do navegador
- `event_time` — epoch em segundos
- `action_source` — `website`, `chat`, `business_messaging`
- `user_data`: `external_id` (SHA-256 do visitor_id), `em`/`ph`/`fn`/`ln` (hashes), `client_ip_address`, `client_user_agent`, `fbp`, `fbc`
- `custom_data`: valores simples, `transaction_id` → `order_id`

### 8.3 Envio

- **Edge Function** `capi-sender` + **cron de 1 minuto** (`tracking-capi`)
- **Lotes de 200**, timeout 20s
- Se lote inválido (código 100), reenvia **um a um**

### 8.4 Fila (`tracking_capi_queue`)

- **Status**: `pendente` | `enviando` | `enviado` | `erro` | `descartado`
- **Trava**: `tracking_capi_claim` pega até 1000 linhas com `for update skip locked`, trava 2 min
- **Retry/backoff**: 1 min → 5 min → 30 min → 2 h → 6 h
- **6ª falha** → status `'descartado'` (dead-letter na mesma tabela, sem tela/separada)
- **7 dias**: eventos com `occurred_at` > 7 dias são descartados antes do envio

### 8.5 Log (`tracking_capi_log`)

- Uma linha por chamada ao Meta
- Sem token, sem IP, sem navegador
- Atualiza `last_success_at` / `last_error_at` / `last_error_message` do destino

### 8.6 Tela do CRM

- **Modal Meta CAPI**: Badge de situação, 4 contadores, últimas 10 chamadas
- **Contadores via `tracking_capi_overview()`**: `pending`, `sent_24h`, `errors_24h`, `discarded_24h`, `last_sent_at`

### 8.7 Lacunas e Defeitos

1. **`errors_24h` não filtra por 24h** — número "Com erro" cresce para sempre
2. **`discarded_24h` filtra por `created_at`** — contagem invertida em relação ao nome
3. **`t.js` cria `_fbp`/`_fbc` mesmo sem `data-pixel`** — cookies "fabricados" no domínio do cliente
4. **Erro de credencial (190/10/200/803) não diferenciado** — consome 6 tentativas com esperas de até 6h
5. **Desligar destino não esvazia a fila** — eventos já enfileirados continuam sendo enviados
6. **Sem limpeza automática** de `tracking_capi_queue`, `tracking_capi_log`, `tracking_events`
7. **Sem alerta/monitoramento automático de CAPI**

### 8.8 O que NÃO Existe

- Nenhuma coluna `browser_event_id`
- Nenhum cálculo de match quality / EMQ (acompanhar no Gerenciador de Eventos do Meta)
- Nenhum envio de conversões para Google Ads ou GA4
- Nenhum "wa-params" no repositório
- Nenhum "Pixel ID por cliente" — configuração é **por site/container**

---

## 9. WhatsApp e Tracking

### 9.1 Três Caminhos

1. **Botão WhatsApp no site (app comum)**: `t.js` detecta clique em `wa.me`/`api.whatsapp.com`, dispara `Contact`, injeta código `(ref. K7Q2M9)` se `data-wa-code="1"`
2. **Anúncio de clique para WhatsApp (API oficial)**: webhook traz `referral.ctwa_clid`, cria toque com `channel='meta', paid=true`
3. **Servidor não oficial (Evolution API)**: lê `ctwaClid` do payload

### 9.2 Integração com CAPI

- `action_source`: `chat` ou `business_messaging`
- Para WhatsApp: `messaging_channel: "whatsapp"`, `ctwa_clid`, `whatsapp_business_account_id`
- Venda marcada pelo CRM também vira evento de servidor com `meta_sent text[]` evitando reenvio

---

## 10. Google Ads

- **NÃO existe envio de conversões para o Google**
- `google/client.ts` só tem leitura (`listAccessibleCustomers`, `search`)
- O que existe: captura de `gclid`/`wbraid`/`gbraid` da URL, classificação como canal pago
- Fase futura documentada mas **zero código**

---

## 11. Estado e Gerenciamento de Estado

- **Sem Redux/Zustand**
- **React Query** (30s stale time, retry 1, sem refetch no focus)
- **React Context**: `AuthContext` (session, profile, signOut, refreshProfile)
- **Custom Hooks**: `usePersistentState`, `useSearchParamsUpdater`, `useCountUp`, `useDebouncedValue`
- **URL State**: `useOpenTask` usa `?tarefa=`
- **Toast Store**: `toastStore.ts`

---

## 12. Pontos de Atenção Consolidados

### Segurança
- RLS + Edge Functions como segurança real (permissões UI são só UX)
- Tokens no Supabase Vault (service_role only)
- Nenhuma credencial hardcoded

### Performance
- SVG customizado (sem biblioteca de chart)
- Skeleton loading com shimmer
- Container queries no KpiCard para typography fluida

### Acessibilidade
- Navegação por teclado nos gráficos
- ARIA labels
- Suporte a `prefers-reduced-motion`
- Error boundaries em cada página

### Débitos Técnicos Principais
1. Sem sal no SHA-256 de dados de contato
2. Fila de eventos só em memória (perde ao recarregar)
3. `errors_24h` não filtra por tempo
4. `discarded_24h` com filtro invertido
5. `t.js` cria cookies `_fbp`/`_fbc` mesmo sem Pixel ativo
6. Consentimento não exigido por padrão
7. Sem aviso de privacidade no script
8. Sem versionamento/cache-busting do `t.js`
9. Sem fila persistente/retry de eventos
10. Sem envio de conversões para Google Ads
11. Sem limpeza automática das tabelas CAPI
12. Sem mock do `t.js` no modo demonstração
13. Sem cálculo de match quality / EMQ
14. Sem monitoramento automático de CAPI
15. Sem suporte a gravação de campos escondidos sem `data-fields="on"`

---

*Arquivo gerado a partir de 6 auditorias paralelas: Tracking no navegador, Campaign Builder/Relatórios, Meta Pixel/CAPI, Estrutura geral, Dashboards/Visualizações, UX/UI.*
