# ETAPA 4 — Integração com o Google Ads

> Status: **concluída e testada**, aguardando sua validação manual.
> Para usar com contas reais, faltam **3 chaves do Google** no servidor (item 7).

## 1. O que fizemos (explicado de forma simples)

Construímos a **segunda ponte oficial**, agora com o Google Ads. O "plugue" do Google encaixa
na mesma **tomada universal** criada na Etapa 3. Por isso, telas e regras continuam as mesmas.

A diferença é **como se entra**:
- No **Meta**, o administrador cola um token.
- No **Google**, o administrador clica em **"Conectar com o Google"**, vai para a **página
  oficial do Google**, entra com a conta que acessa a MCC e autoriza. O Google devolve um
  **código de uso único**. O servidor troca esse código por uma **autorização permanente**
  (*refresh token*) e a guarda no **cofre criptografado**.

Depois disso, na página de cada cliente, o botão **"Vincular conta"** do Google lista as contas
que a MCC enxerga, mostrando:
- o **Customer ID** no formato do Google (`123-456-7890`);
- a **MCC** pela qual a conta é acessada;
- a **moeda** e o **fuso horário**;
- o **status**;
- se é **conta de teste**.

## 2. Por que assim

- **Só a API oficial:** usamos a **interface REST oficial da Google Ads API**. O Google não
  tem biblioteca oficial para o tipo de servidor que usamos, e a REST é oficial e documentada.
- **Versão v25:** é a mais nova, anunciada em julho de 2026. As versões **v20 e v21 foram
  desligadas** em junho e agosto de 2026. A versão é configurável, como no Meta.
- **MCC:** a maioria das agências acessa as contas dos clientes pela **conta administradora (MCC)**.
  O sistema guarda qual MCC dá acesso a cada conta e a usa em todas as consultas.
  É o cabeçalho `login-customer-id` exigido pelo Google.

## 3. Segurança do login com o Google

| Proteção | O que faz |
|---|---|
| **Estado de uso único** | Cada clique em "Conectar" gera uma senha temporária aleatória (64 caracteres). Ela vale **uma vez**, **por 10 minutos** e **só para o administrador que clicou**. Isso impede que alguém "cole" uma autorização alheia. |
| **Endereço de retorno fixo** | O Google só devolve o usuário para `/configuracoes/integracoes/google/callback` do próprio site. Qualquer outro endereço é recusado. |
| **Código some da barra de endereço** | Depois de usado, o código é apagado do histórico do navegador. |
| **Cofre** | O refresh token vai direto para o Supabase Vault. O token de acesso (1 hora) é gerado a cada uso, no servidor. |
| **Chaves no servidor** | Developer token, Client ID e Client Secret ficam nos **segredos das Edge Functions**, nunca no site ou no código. A tela só mostra **quais nomes** estão faltando. |

## 4. O que o sistema busca no Google Ads

| Informação | Onde vem na API oficial |
|---|---|
| Contas que o login acessa | `customers:listAccessibleCustomers` |
| Nome, moeda, fuso, status, se é MCC, se é conta de teste | consulta GAQL no recurso `customer` |
| Contas-cliente abaixo da MCC | consulta GAQL no recurso `customer_client` |
| Quem conectou (e-mail) | OpenID Connect (`userinfo`) |

### Status da conta (tradução)
| Google (`CustomerStatus`) | No sistema |
|---|---|
| ENABLED | Ativa |
| SUSPENDED | Restrita |
| CANCELED / CLOSED | Encerrada |
| qualquer outro | Status desconhecido (com o valor original guardado) |

**Informações que o Google não fornece:**
- **Páginas e Instagram:** não existem no Google Ads, então a seção não aparece para contas Google.
- **Conta pré-paga:** a API não informa. O campo fica vazio, sem nada inventado.

## 5. O que mudou no banco

| Mudança | Para que serve |
|---|---|
| `ad_accounts.manager_customer_id` | MCC que dá acesso à conta (só números, validado) |
| `ad_accounts.is_test_account` | Marca contas de teste do Google |
| Tabela `oauth_states` | Estados temporários do login com o Google. **Nenhum acesso pelo site**, nem pelo administrador; só o servidor usa |

As demais regras continuam iguais às da Etapa 3: o site só lê, uma conta fica vinculada a um
cliente por vez, desvincular preserva o histórico e tudo vai para a auditoria.

## 6. Testes realizados

| Teste | Resultado |
|---|---|
| **Servidor real:** status das chaves (lista os 3 segredos faltando), gestor tentando ver a configuração (bloqueado), início sem chaves (mensagem clara), endereço de retorno malicioso (recusado), estado inválido (recusado) | ✅ |
| **Regressão Meta** no servidor real (token falso → mensagem amigável) | ✅ |
| Banco: estado expira em 10 minutos, estado curto recusado, MCC em formato inválido recusada, site não lê os estados | ✅ |
| Adaptador Google: 9 testes (status, formato do ID, login offline, erros do Google, **expansão da MCC**, prioridade do acesso direto, conta cancelada pulada, `login-customer-id`, developer token não aprovado) | ✅ |
| Adaptador Meta: 10 testes (continuam passando) | ✅ |
| Navegador: **73 verificações** no total (17 novas do Google: chaves faltando, ida ao Google, cancelamento, código expirado, conexão, vínculo via MCC, conta de teste) | ✅ |
| Supabase Advisor (segurança) | ✅ Nenhum aviso |

**Problemas encontrados e corrigidos**
1. **Aviso do Supabase:** a tabela de estados do login não tinha nenhuma regra de acesso, o que é
   intencional. Adicionei uma regra explícita **"ninguém acessa pelo site"**, que deixa a intenção clara e zera o aviso.
2. **Acessibilidade:** a página do cliente passou a ter dois botões "Vincular conta" (Meta e Google).
   Cada seção agora tem nome próprio ("Contas Meta Ads" e "Contas Google Ads"). Isso ajuda leitores de tela.
3. **Formato do ID do Meta:** agora aparece como no Gerenciador de Anúncios (`act_123...`).
4. **Limpeza de dados de teste:** uma limpeza minha foi desfeita junto com um teste. Percebi pela
   contagem, apaguei de novo e confirmei que o banco ficou vazio.

## 7. O que você precisa fazer para conectar o Google Ads de verdade

### 7.1 Developer token (na MCC)
1. Entre no Google Ads com a **conta MCC** da agência → **Administrador → Central de API**.
2. Aceite os termos e copie o **developer token**.
3. Ele começa em **modo de teste**, que só acessa contas de teste. Clique em **solicitar acesso Básico**.
   O Google analisa em alguns dias. Enquanto isso, o sistema mostra o aviso
   *"O developer token ainda não foi aprovado"*.

### 7.2 Google Cloud (credenciais do login)
1. Em **console.cloud.google.com**, crie um projeto (ex.: "Backstage Flow").
2. **APIs e serviços → Biblioteca** → ative a **Google Ads API**.
3. **Tela de permissão OAuth** → tipo **Externo** → preencha o nome do app e o seu e-mail →
   em **Usuários de teste**, adicione o e-mail que vai conectar.
4. **Credenciais → Criar credenciais → ID do cliente OAuth** → tipo **Aplicativo da Web**.
5. Em **URIs de redirecionamento autorizados**, adicione o endereço do site seguido de
   `/configuracoes/integracoes/google/callback`. Exemplo:
   `https://SEU-SITE.vercel.app/configuracoes/integracoes/google/callback`.
   A tela de Integrações mostra o endereço exato.
6. Copie o **ID do cliente** e a **Chave secreta do cliente**.

### 7.3 Cadastrar no Supabase
Painel do Supabase → projeto **backstage-flow-dev** → **Edge Functions → Secrets**:

| Nome | Valor |
|---|---|
| `GOOGLE_ADS_DEVELOPER_TOKEN` | o developer token (7.1) |
| `GOOGLE_OAUTH_CLIENT_ID` | o ID do cliente (7.2) |
| `GOOGLE_OAUTH_CLIENT_SECRET` | a chave secreta do cliente (7.2) |

### 7.4 Conectar
**Configurações → Integrações → Google Ads → Conectar com o Google**. Entre com a conta Google
que acessa a MCC e autorize.

> Este passo precisa do **site publicado** (Vercel). O Google só devolve o usuário para um
> endereço cadastrado no item 7.2.

## 8. Como testar manualmente

1. **Configurações → Integrações**: o cartão **Google Ads** lista os segredos que faltam, com o botão desativado.
2. Depois de cadastrar os 3 segredos, recarregue a página: o aviso some e o botão fica ativo.
3. **Conectar com o Google** → página oficial do Google → escolha a conta → **Permitir**.
4. Você volta ao sistema e vê **"Google Ads conectado com seu-email@..."**. A conexão aparece como **Ativa**.
5. Se clicar em **Cancelar** no Google, aparece **"A autorização foi cancelada no Google."**
6. **Clientes → (um cliente) → Contas Google Ads → Vincular conta**: aparecem as contas da MCC,
   com ID `123-456-7890`, "via NOME DA MCC" e o selo **Conta de teste** quando for o caso.
7. Clique em **Vincular**. A ficha mostra o Customer ID, a moeda, o fuso e a **MCC (conta administradora)**.
8. **Atualizar** busca de novo no Google. **Desvincular** remove da ficha e mantém o histórico.

### Resultado esperado
Cada cliente mostra lado a lado as contas **Meta** e **Google**, com dados vindos das APIs oficiais.
Nenhuma chave ou token aparece na tela.

## 9. O que fica para as próximas etapas
- **Métricas** (investimento, cliques, conversões...): Etapas 5 e 16.
- **Orçamento da conta e problemas de cobrança do Google:** Etapa 7 (recurso `account_budget`).
- **Saldo pré-pago disponível:** o Google **não fornece** pela API. Será exibido "Informação não disponível pela API.".

## 10. Arquivos

**Criados**
```
supabase/migrations/20260924030000_google_ads.sql
supabase/migrations/20260924031000_oauth_states_deny_policy.sql
supabase/tests/etapa04_rls_google.sql
supabase/functions/_shared/platforms/google/config.ts    → versão da API, segredos, escopos
supabase/functions/_shared/platforms/google/oauth.ts     → login oficial do Google (OAuth 2.0)
supabase/functions/_shared/platforms/google/client.ts    → chamadas REST e consultas GAQL
supabase/functions/_shared/platforms/google/errors.ts    → erros do Google → mensagens amigáveis
supabase/functions/_shared/platforms/google/mapping.ts   → status e campos
supabase/functions/_shared/platforms/google/adapter.ts   → contas acessíveis, MCC, conta
supabase/functions/_shared/platforms/google/google_test.ts → 9 testes
packages/shared/src/accounts/format.ts (+ teste)         → formato do ID por plataforma
apps/web/src/features/integrations/GoogleIntegrationCard.tsx
apps/web/src/features/integrations/GoogleCallbackPage.tsx
apps/web/src/features/integrations/ConnectionsList.tsx   → lista de conexões reutilizável
apps/web/e2e/google.mjs
```

**Modificados**
```
supabase/functions/ad-accounts/index.ts               → google_status / google_start / google_complete, MCC no vínculo
supabase/functions/_shared/platforms/{types,adapter,registry}.ts → MCC e registro do Google
apps/web/src/features/ad-accounts/*                   → MCC, conta de teste, ID formatado, seções nomeadas
apps/web/src/features/integrations/*                  → cartão do Google, lista compartilhada
apps/web/src/features/clients/ClientDetailPage.tsx    → seção real de contas Google
apps/web/src/app/router.tsx                           → rota de retorno do Google
apps/web/e2e/{support,clients,meta}.mjs               → simulação do Google e ajustes
```
**Removido:** `apps/web/src/features/clients/LinkedAccountsCard.tsx` (o aviso "em construção" não é mais usado).
