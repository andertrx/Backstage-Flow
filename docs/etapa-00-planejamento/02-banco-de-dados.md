# 02 — Banco de dados (Firestore)

> Esta é a **proposta inicial**. Conforme a regra do projeto, cada coleção será
> explicada de novo (campos, tipos, índices, retenção) e aprovada **antes** de ser
> criada de verdade, na etapa correspondente.

## 1. Como o Firestore funciona (versão simples)

- Uma **coleção** é uma gaveta (ex.: "clientes").
- Um **documento** é uma ficha dentro da gaveta (ex.: "Excalibur Fitness").
- Cada ficha tem **campos** (nome, telefone...).
- O Firestore cobra por **leitura** e **escrita** de fichas. Por isso guardamos
  **somas prontas** (rollups): em vez de ler 3.000 fichas de anúncios para mostrar o
  gasto do mês, lemos 30 fichas (uma por dia).

## 2. Decisões que fazem o banco aguentar milhões de registros

1. **IDs determinísticos**: a ficha de métricas do anúncio X no dia 23/09 sempre tem o
   mesmo nome (`meta_act123_ad_456_2026-09-23`). Sincronizar de novo **atualiza** a
   ficha em vez de duplicar.
2. **Coleções de métricas no nível raiz** com os campos `clientId`, `accountId`,
   `platform`, `date` — permite filtrar por qualquer um sem "varrer" tudo.
3. **Data como texto `AAAA-MM-DD` no fuso da conta** — "dia 23" é o dia 23 para o
   anunciante, não para o servidor em outro país.
4. **Dinheiro em "micros" (número inteiro)**: R$ 12,34 vira `12340000`. Evita erros de
   arredondamento de números quebrados. (O Google já entrega assim; o Meta é convertido.)
5. **Rollups** (somas prontas) por conta/dia, cliente/dia e mês.
6. **Escrever só quando mudou**: guardamos um "resumo" (hash) do dado; se nada mudou,
   não escrevemos — economiza dinheiro.
7. **Nunca apagar histórico automaticamente.** Só os logs técnicos terão regra de
   expiração, e somente se você aprovar.

## 3. Coleções propostas

Legenda de retenção: **Permanente** = nunca apagado automaticamente.

### Cadastro e acesso

| Coleção | Para que serve | Campos principais | Retenção |
|---|---|---|---|
| `users/{uid}` | Perfil do usuário | `name`, `email`, `role` (admin/gestor/operador/visualizador/cliente), `clientIds[]` (clientes permitidos), `active`, `createdAt` | Permanente (desativar em vez de apagar) |
| `clients/{clientId}` | Cliente da agência | `name`, `company`, `cnpj?`, `ownerName`, `phone`, `email`, `notes`, `status`, `timezone`, `createdAt`, `searchTokens[]` | Permanente |
| `settings/{docId}` | Configurações gerais (limites de alerta, intervalo de sync, modo demonstração) | variam | Permanente |

### Conexões e contas

| Coleção | Para que serve | Campos principais | Retenção |
|---|---|---|---|
| `connections/{connectionId}` | Uma "conexão" com Meta (ex.: System User do Business Manager) ou Google (login OAuth/MCC). **Somente o servidor lê.** | `platform`, `label`, `status`, `scopes[]`, `encryptedToken` (criptografado), `tokenExpiresAt?`, `loginCustomerId?` (MCC), `createdBy` | Enquanto ativa |
| `adAccounts/{accountId}` | Conta de anúncio vinculada a um cliente | `platform`, `externalId` (act_… ou Customer ID), `clientId`, `connectionId`, `name`, `currency`, `timezone`, `status` (normalizado), `rawStatus`, `businessId?`, `businessName?`, `pageIds[]?`, `instagramIds[]?`, `managerCustomerId?`, `lastSyncAt`, `isDemo` | Permanente |

Na regra de segurança, `connections` é **proibida para qualquer usuário** — só o
servidor (Admin SDK) enxerga. Assim o token nunca chega ao navegador.

### Estrutura das campanhas (estado atual)

| Coleção | Campos principais |
|---|---|
| `campaigns/{id}` | `platform`, `clientId`, `accountId`, `externalId`, `name`, `objective`, `status`, `effectiveStatus`, `budgetMicros?`, `budgetType` (diário/vitalício), `startDate?`, `endDate?`, `updatedAt` |
| `adGroups/{id}` | Conjuntos (Meta) **e** grupos de anúncios (Google) numa só coleção, com `campaignId` |
| `ads/{id}` | `adGroupId`, `campaignId`, nome, status, tipo de criativo, status de revisão/política |

Usamos um só nome (`adGroups`) para "conjunto" e "grupo" porque têm o mesmo papel;
na tela o rótulo muda conforme a plataforma.

### Métricas (o coração do histórico)

| Coleção | Para que serve | Granularidade | Retenção |
|---|---|---|---|
| `metricsDaily/{id}` | Números de **um dia** de **uma** conta/campanha/grupo/anúncio | `level` = account \| campaign \| adGroup \| ad | Permanente |
| `rollupsDaily/{id}` | Soma pronta por **conta/dia** e **cliente/dia** (separada por moeda) | dia | Permanente |
| `rollupsMonthly/{id}` | Soma pronta por conta/mês e cliente/mês | mês | Permanente |
| `periodReach/{id}` | Alcance e frequência de **períodos** (7d, 30d, mês) buscados direto da API — veja o aviso abaixo | período | Permanente |

Campos de `metricsDaily`:
`platform`, `clientId`, `accountId`, `level`, `entityId`, `campaignId?`, `adGroupId?`,
`date` (AAAA-MM-DD, fuso da conta), `currency`, `spendMicros`, `impressions`, `reach?`,
`clicks`, `linkClicks?`, `leads`, `messages`, `conversions`, `conversionValueMicros`,
`videoViews?`, `platformMetrics` (valores oficiais da plataforma como CTR/CPC informados),
`rawActions` (lista original de ações do Meta para auditoria), `syncedAt`, `hash`.

> **Aviso sobre alcance:** alcance **não pode ser somado** entre dias (a mesma pessoa
> vista na segunda e na terça contaria duas vezes). Por isso o alcance de um período é
> buscado pronto da API e guardado em `periodReach`. Para intervalos personalizados
> antigos, se a API não fornecer mais, mostraremos "Informação não disponível pela API."

### Fotografias históricas (snapshots)

| Coleção | O que registra | Quando grava | Retenção |
|---|---|---|---|
| `accountSnapshots/{id}` | Status da conta, saldo/limites/gasto acumulado **como a API informou naquele momento** | A cada sincronização (1 por hora no máximo) + 1 "fechamento" por dia | Permanente |
| `entityChanges/{id}` | Mudanças detectadas: campanha pausada, orçamento alterado, status da conta mudou | Somente quando algo muda | Permanente |
| `dailySummaries/{id}` | A "fotografia do dia" por cliente (ex.: Excalibur, 23/09: R$ 1.250, 350 leads, CPL R$ 3,57) | Fechamento diário | Permanente |

### Operação

| Coleção | Para que serve | Retenção proposta |
|---|---|---|
| `syncState/{accountId}` | Última sincronização, próxima, trava (para não rodar duas ao mesmo tempo), último erro | Permanente (1 ficha por conta) |
| `syncRuns/{id}` | Log de cada sincronização: início, fim, status, registros, erro técnico | **Sugestão**: 400 dias (só com sua aprovação) |
| `alerts/{id}` | Alertas: tipo, gravidade, cliente, conta, descrição, status (aberto/reconhecido/resolvido), datas | Permanente |
| `auditLogs/{id}` | Quem fez o quê (criou usuário, conectou conta, mudou permissão) | Permanente |
| `reports/{id}` | Relatórios gerados (arquivo fica no Storage) | Sugestão: 180 dias para o arquivo; registro permanente |

## 4. Relacionamentos

```
clients ─┬─< adAccounts ─┬─< campaigns ─< adGroups ─< ads
         │               ├─< metricsDaily (por nível e dia)
         │               ├─< accountSnapshots
         │               ├── syncState
         │               └─< syncRuns
         ├─< rollupsDaily / rollupsMonthly / dailySummaries
         └─< alerts
connections ─< adAccounts   (uma conexão pode dar acesso a várias contas)
users >─< clients           (via users.clientIds)
```

## 5. Índices previstos (exemplos)

- `metricsDaily`: (`accountId`, `level`, `date`), (`clientId`, `level`, `date`), (`campaignId`, `date`)
- `rollupsDaily`: (`clientId`, `date`), (`accountId`, `date`), (`platform`, `date`)
- `alerts`: (`status`, `severity`, `createdAt`), (`clientId`, `status`, `createdAt`)
- `syncRuns`: (`accountId`, `startedAt` desc), (`status`, `startedAt` desc)
- `campaigns`: (`clientId`, `status`), (`accountId`, `status`)

## 6. Estimativa de volume (para mostrar que escala)

200 contas × ~100 entidades ativas (campanhas+grupos+anúncios) × 365 dias ≈
**7,3 milhões de fichas diárias por ano**. O Firestore lida bem com isso porque o
dashboard lê os **rollups** (centenas de fichas), e não as fichas de anúncio.
As fichas por anúncio só são lidas quando alguém abre o detalhe daquele anúncio.

## 7. Dados de demonstração

Dados fictícios terão `isDemo: true` e ficarão num **projeto Firebase separado de
desenvolvimento** (ou no emulador local). A interface mostra a faixa
**"MODO DEMONSTRAÇÃO"** sempre que houver qualquer dado demo na tela. Assim é
impossível confundir com dados reais.
