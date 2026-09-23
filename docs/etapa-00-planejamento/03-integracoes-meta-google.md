# 03 — Integrações com Meta Ads e Google Ads

Regras: **apenas APIs oficiais e documentadas**, sem scraping, sem inventar endpoints,
sem simular dados reais. Quando algo não existir na API, o sistema mostra
**"Informação não disponível pela API."**

> Os nomes de campos abaixo são os documentados publicamente. Nas Etapas 3 e 4
> confirmaremos cada um na documentação da **versão atual** da API antes de usar,
> porque as duas plataformas lançam versões novas e aposentam as antigas.

---

## A. Meta Ads (Marketing API / Graph API)

### Como conectar (explicado simples)

A agência cria um **App** no Meta for Developers e um **Usuário do Sistema** (System
User) dentro do Business Manager dela. Esse "funcionário robô" recebe acesso às contas
de anúncio dos clientes e gera um token que **não expira como token pessoal**. O token
vai direto para o servidor, é **criptografado** e guardado; o navegador nunca o vê.

Alternativa futura: botão "Conectar com Facebook" (Facebook Login for Business) para
clientes que preferem conectar sozinhos.

Permissões necessárias: `ads_read` (leitura), `business_management` (listar ativos do
BM). Para usar com contas de terceiros é preciso **Acesso Avançado**, o que exige
**verificação da empresa** e **App Review** pelo Meta.

Toda chamada é assinada com `appsecret_proof` (prova de que veio do nosso servidor).

### O que buscamos

| Informação | De onde vem |
|---|---|
| Nome, moeda, fuso | Campos da conta: `name`, `currency`, `timezone_name` |
| Status da conta | `account_status` (ex.: ativa, desativada, pagamento pendente, em análise, período de carência, fechada) e `disable_reason` |
| Business Manager | Campo `business` da conta |
| Páginas / Instagram | Endpoints de páginas e contas do Instagram ligadas à conta/Business |
| Gasto acumulado, limite de gasto | `amount_spent`, `spend_cap` |
| Valor devido (pós-pago) | `balance` (é o valor **a pagar**, não "saldo disponível") |
| Pré-paga? | `is_prepay_account` |
| Forma de pagamento | `funding_source_details` (texto descritivo) |
| Campanhas / conjuntos / anúncios | Endpoints `campaigns`, `adsets`, `ads` com status, objetivo, orçamento |
| Métricas diárias | Endpoint `insights` com `time_increment=1` e `level` (account/campaign/adset/ad): `spend`, `impressions`, `reach`, `frequency`, `clicks`, `inline_link_clicks`, `ctr`, `cpc`, `cpm`, `actions`, `action_values`, `cost_per_action_type`, `purchase_roas` |
| Histórico de alterações | Endpoint `activities` da conta |

### Leads, mensagens e conversões no Meta

O Meta devolve uma lista de **ações** (`actions`) com tipos como lead de formulário,
conversa por mensagem iniciada, compra etc. Definiremos um **mapeamento configurável
por conta** ("o que conta como Lead / Mensagem / Conversão nesta conta"), com um padrão
sensato. A lista original fica guardada em `rawActions` para auditoria.

### Limitações importantes (Meta)

- **Saldo pré-pago disponível**: a API não oferece um campo numérico documentado de
  "saldo disponível" para contas pré-pagas. Se não houver campo oficial, exibimos
  "Informação não disponível pela API." — **não calculamos por conta própria nem
  lemos texto de tela**.
- Limites de uso (rate limit) por conta de anúncio → fila com velocidade controlada.
- Dados de insights antigos têm janela de retenção limitada (em torno de 37 meses) —
  mais um motivo para guardar tudo no Supabase.
- Números dos últimos dias podem mudar (atribuição atrasada) → ressincronizamos os
  últimos dias.

---

## B. Google Ads (Google Ads API)

### Como conectar (explicado simples)

O Google exige três "chaves":

1. **Developer Token** — obtido na conta **MCC** (conta de administrador) da agência.
   Começa em modo de teste; para contas reais é preciso **solicitar nível de acesso**
   ao Google (análise de alguns dias).
2. **OAuth Client** (Client ID + Client Secret) — criado no Google Cloud.
3. **Refresh Token** — gerado quando alguém da agência clica "Conectar Google Ads" e
   autoriza. Criptografado e guardado no servidor.

Se as contas dos clientes estão sob a MCC da agência, usamos o
`login-customer-id` (ID da MCC) e enxergamos todas por uma única conexão.

### Biblioteca

O Google oferece bibliotecas oficiais para Java, .NET, PHP, Python, Ruby e Perl, **mas
não para Node.js**. Para cumprir a regra "somente oficial", chamaremos a **interface
REST oficial** da Google Ads API diretamente (endpoint `googleAds:searchStream` com
consultas GAQL). A autenticação usa o fluxo OAuth 2.0 oficial do Google (troca do refresh token por um access token no endpoint de tokens do Google), feito pela Edge Function.

### O que buscamos

| Informação | Recurso GAQL |
|---|---|
| Nome, moeda, fuso, status, se é MCC | `customer` (`descriptive_name`, `currency_code`, `time_zone`, `status`, `manager`) |
| Contas sob a MCC | `customer_client` |
| Campanhas, grupos, anúncios | `campaign`, `ad_group`, `ad_group_ad` (status, tipo, política) |
| Orçamento | `campaign_budget` (`amount_micros`) |
| Métricas diárias | `metrics.cost_micros`, `impressions`, `clicks`, `ctr`, `average_cpc`, `average_cpm`, `conversions`, `conversions_value`, `cost_per_conversion` com `segments.date` |
| Cobrança | `billing_setup`, `account_budget` (limite aprovado, valor já consumido) |
| Histórico de alterações | `change_event` (a API só guarda ~30 dias → gravamos no Supabase) |

### Limitações importantes (Google)

- **Saldo de conta pré-paga (pagamento manual)**: não disponível pela API →
  "Informação não disponível pela API." O que existe é o **orçamento da conta**
  (`account_budget`) para contas com faturamento mensal/limite.
- **Alcance e frequência**: não existem para campanhas de Pesquisa; só em alguns tipos
  (Display/Vídeo). Onde não houver: "Informação não disponível pela API."
- **Mensagens**: não há métrica equivalente ao "conversa iniciada" do Meta.
- **Leads** = conversões das ações de conversão marcadas como lead (configurável).
- Conversões podem ser atribuídas dias depois do clique → ressincronização dos últimos dias.

---

## C. Onde cada métrica existe

| Métrica | Meta | Google |
|---|---|---|
| Investimento | ✅ | ✅ |
| Impressões, cliques, CTR, CPC, CPM | ✅ | ✅ |
| Alcance / Frequência | ✅ | ⚠️ só alguns tipos de campanha |
| Leads | ✅ (via ações) | ✅ (via ações de conversão) |
| Mensagens | ✅ | ❌ |
| Conversões / valor / ROAS | ✅ (se pixel/API de conversões configurados) | ✅ (se conversões configuradas) |
| Saldo pré-pago disponível | ❌ não documentado | ❌ |
| Limite / orçamento de conta | ✅ `spend_cap` | ✅ `account_budget` |
| Status da conta | ✅ | ✅ |
| Histórico de alterações | ✅ `activities` | ✅ `change_event` (~30 dias) |
