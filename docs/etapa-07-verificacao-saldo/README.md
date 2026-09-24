# ETAPA 7 — Verificação de saldo

> Status: **concluída e testada**, aguardando sua validação.

## 1. O que fizemos (explicado de forma simples)

O dashboard ganhou a área **"Saldo por conta"**, com uma ficha para cada conta de anúncio:

| Campo | De onde vem |
|---|---|
| **Valor disponível** | Limite − valor já usado, **só quando a plataforma informa os dois** |
| **Valor gasto** | Gasto contado contra o limite (Meta `amount_spent`, Google `amount_served`) |
| **Orçamento** | Google: orçamento da conta (faturamento mensal), com data de término |
| **Limite** | Meta: limite de gastos da conta. Google: limite do orçamento da conta |
| **Crédito disponível** | As APIs usadas **não informam**, então aparece "Informação não disponível pela API." |
| **Valor devido** (Meta) | O que o Meta informa como devido na próxima cobrança |
| **Forma de pagamento** (Meta) | Texto do Meta, **exatamente como veio** (ex.: "Visa final 1234") |
| **Gasto médio por dia** | Média dos últimos 7 dias completos, calculada do nosso histórico |
| **Previsão de duração** | Disponível ÷ gasto médio. Ex.: "cerca de 2 dias" |
| **Última atualização** | Quando o saldo foi consultado. Avisa se a consulta tiver mais de 24 horas |

O cartão **Saldo** do resumo geral agora soma o disponível das contas (na mesma moeda) e diz quantas
contas informam esse dado e quantas têm alerta.

### Alertas
| Alerta | Quando aparece |
|---|---|
| 🔴 **Sem saldo** | O disponível chegou a zero (limite atingido) |
| 🟠 **Saldo baixo** | A previsão é menor que X dias (padrão: 3) **ou** o disponível é menor que um valor escolhido |
| 🔴 **Pagamento pendente** | Meta: conta com pagamento em aberto. Google: faturamento aguardando aprovação |
| 🔴 **Problema na cobrança** | Meta: conta em período de carência ou bloqueada por risco de pagamento |
| 🔴 **Conta desativada** / 🟠 **Conta limitada** | A plataforma desativou a conta ou a colocou em análise/suspensão |
| 🟠 **Sem forma de pagamento ativa** | Google: nenhuma configuração de faturamento ativa |

Cada conta tem o botão **"Alerta de saldo baixo"**, onde se escolhe o número de dias e/ou o valor mínimo.

### Botões
- **Atualizar saldo:** consulta a plataforma na hora, só para aquela conta.
- **Atualizar todos os saldos:** consulta todas as contas do filtro. Se uma falhar, as outras continuam e o erro aparece com o nome da conta.

Os botões e a configuração de alertas aparecem só para **administrador e gestor**. Os demais papéis apenas veem.

## 2. Por que assim (e o que as plataformas NÃO informam)

- **Meta, conta pré-paga (boleto/PIX):** a API **não tem um número** para o saldo pré-pago. Existe só um
  texto de forma de pagamento. Mostramos esse texto como veio, **sem tentar "adivinhar" o número**.
- **Meta, limite de gastos:** quando a conta tem limite de gastos definido, calculamos com segurança
  "limite − valor gasto". Sem limite definido, o disponível fica "não disponível".
- **Google, pagamento automático (cartão):** não existe "saldo" na API. Só contas com **orçamento da conta**
  (faturamento mensal) têm limite, e aí calculamos "limite − valor veiculado".
- **Cada consulta vira uma fotografia no histórico.** Mesmo que a plataforma mude, fica registrado como estava.
- **Moedas nunca se misturam.** Contas em USD não entram na soma em BRL.

## 3. O que mudou no banco

**Nenhuma tabela nova.**

| Mudança | Tipo | Para que serve |
|---|---|---|
| `account_snapshots.available_micros` | número inteiro (micros) | Valor disponível (vazio = não informado) |
| `account_snapshots.available_basis` | texto | De onde veio o disponível (limite do Meta ou orçamento do Google) |
| `account_snapshots.funding_description` | texto | Forma de pagamento do Meta, como veio |
| `account_snapshots.budget_end_at` | data/hora | Fim do orçamento da conta (Google) |
| `account_snapshots.issues` | lista de textos | Problemas de cobrança. Só aceita códigos conhecidos |
| `ad_accounts.low_balance_days` | inteiro (1 a 60, padrão 3) | Regra do alerta de saldo baixo por dias |
| `ad_accounts.low_balance_amount_micros` | número inteiro (opcional) | Regra do alerta de saldo baixo por valor |
| Consulta `account_balances` | — | Última fotografia de cada conta + gasto dos últimos 7 dias. Roda **com a permissão de quem pergunta** |

**Retenção:** permanente. As fotografias formam o histórico do saldo.
Só o servidor grava. O site apenas lê.

## 4. Testes realizados

| Teste | Resultado |
|---|---|
| **Banco** (`supabase/tests/etapa07_balance.sql`) | ✅ |
| ↳ usa a fotografia mais recente | ✅ |
| ↳ gasto de 7 dias sem contar hoje nem dias antigos | ✅ |
| ↳ conta sem fotografia não quebra | ✅ |
| ↳ problema desconhecido recusado | ✅ |
| ↳ site não grava; gestor não vê cliente não liberado; visitante sem login bloqueado | ✅ |
| **Servidor:** 10 testes novos de leitura de saldo, 29 no total | ✅ |
| ↳ centavos do Meta e moedas sem centavos (JPY) | ✅ |
| ↳ limite de gastos "0" = sem limite | ✅ |
| ↳ problemas de cobrança | ✅ |
| ↳ sem permissão para a forma de pagamento, o resto é lido | ✅ |
| ↳ orçamento vigente do Google e fuso horário | ✅ |
| ↳ faturamento pendente; sem permissão de faturamento, nada é presumido | ✅ |
| **Cálculos:** previsão, alertas, resumo por moeda. Compartilhado: 43 testes; site: 31 testes | ✅ |
| **Navegador:** 31 verificações novas de saldo, e as 112 anteriores continuam passando | ✅ |
| **Servidor publicado** (ad-accounts v4), conferido arquivo por arquivo com o projeto | ✅ |
| **Supabase Advisor** (segurança) | ✅ Nenhum aviso |

**Problemas encontrados e corrigidos**
1. **Checagem fora de ordem:** o ID da conta Google passou a ser conferido **depois** de falar com o Google.
   Um teste antigo pegou o erro. Agora a conferência vem antes, sem chamada desnecessária.
2. **Mensagem em inglês:** o navegador bloqueava o formulário de alerta com um aviso próprio, em inglês.
   Agora aparece a nossa mensagem, em português.
3. **Dois títulos "Saldo":** a nova área passou a se chamar "Saldo por conta", o que ficou mais claro e acessível.

## 5. Como testar manualmente

> O saldo real só aparece com **contas vinculadas** e a **conexão ativa** (Etapas 3 e 4).

1. Abra o **Dashboard** e desça até **"Saldo por conta"**: cada conta vinculada tem uma ficha.
2. Uma conta nunca consultada mostra *"Saldo ainda não verificado"*.
3. Clique em **Atualizar saldo**. A ficha se preenche com o que a plataforma informa, e o que ela não informa
   aparece como "Informação não disponível pela API.".
4. Clique em **Alerta de saldo baixo**, escolha por exemplo 5 dias e salve. Se a previsão for menor, aparece o selo **Saldo baixo**.
5. Troque o filtro **Cliente**: as fichas acompanham.

### Resultado esperado
- Nenhum valor inventado: o que a API não dá aparece escrito assim.
- Alertas coloridos por conta, e o cartão **Saldo** do topo resumindo tudo.

## 6. Arquivos

**Criados**
```
supabase/migrations/20260925010000_balance.sql
supabase/tests/etapa07_balance.sql
supabase/functions/_shared/platforms/meta/funding.ts      → saldo e cobrança do Meta
supabase/functions/_shared/platforms/google/funding.ts    → orçamento da conta e faturamento do Google
supabase/functions/_shared/platforms/funding_test.ts      → 10 testes
packages/shared/src/balance/balance.ts (+ teste)          → previsão e alertas
apps/web/src/features/balance/{api,types,summary}.ts (+ teste)
apps/web/src/features/balance/BalanceSection.tsx
apps/web/src/features/balance/BalanceAccountCard.tsx
apps/web/src/features/balance/BalanceSettingsModal.tsx
apps/web/e2e/balance.mjs
```

**Modificados**
```
supabase/functions/ad-accounts/index.ts                   → ações refresh_balance e balance_settings
supabase/functions/_shared/platforms/{types,adapter}.ts   → contrato getFunding
supabase/functions/_shared/platforms/{meta,google}/adapter.ts
apps/web/src/features/dashboard/{DashboardPage,KpiCard}.tsx → cartão Saldo real + área de saldo
apps/web/src/features/ad-accounts/api.ts
apps/web/e2e/{support,dashboard}.mjs, apps/web/package.json
packages/shared/src/index.ts, README.md
```
