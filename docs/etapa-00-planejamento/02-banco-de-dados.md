# 02 — Banco de dados (Supabase / PostgreSQL)

> Esta é a **proposta inicial**. Conforme a regra do projeto, cada tabela será
> explicada de novo (campos, tipos, relacionamentos, índices, retenção) e aprovada
> **antes** de ser criada de verdade, na etapa correspondente.

## 1. Como o PostgreSQL funciona (versão simples)

- Uma **tabela** é uma aba de planilha (ex.: "clientes").
- Cada **linha** é um registro (ex.: "Excalibur Fitness").
- Cada **coluna** tem um tipo fixo (texto, número, data...). O banco **recusa** dado no
  formato errado — isso evita lixo.
- Tabelas se ligam por **chaves** (a conta de anúncio aponta para o cliente dono dela).
- Um **índice** é como o índice de um livro: acha o que você quer sem ler tudo.

## 2. Decisões que fazem o banco aguentar milhões de registros

1. **Particionamento por mês**: a tabela de métricas diárias é dividida em "gavetas"
   mensais (2026-08, 2026-09...). Uma consulta de setembro só abre a gaveta de setembro.
   Gavetas futuras são criadas automaticamente por um agendamento.
2. **Chave única natural**: (nível, entidade, data). Sincronizar de novo **atualiza** a
   linha em vez de duplicar (`INSERT ... ON CONFLICT DO UPDATE`).
3. **Data como `date` no fuso da conta** — "dia 23" é o dia 23 do anunciante.
4. **Dinheiro em "micros" (`bigint`)**: R$ 12,34 vira `12340000`. Sem erro de
   arredondamento. (O Google já entrega assim; o Meta é convertido.)
5. **Linhas no nível "conta" já são o total da conta** (a API entrega pronto), então o
   dashboard soma poucas linhas mesmo com milhares de anúncios.
6. **Visões mensais materializadas**: totais por mês, recalculados após cada sync.
7. **Escrever só quando mudou**: guardamos um `hash` da linha; se nada mudou, não gravamos.
8. **Nunca apagar histórico automaticamente.** Só logs técnicos terão regra de
   expiração, e somente com sua aprovação.

## 3. Organização em "schemas" (áreas do banco)

| Schema | O que guarda | Quem acessa |
|---|---|---|
| `public` | Dados do negócio (clientes, contas, métricas, alertas) | Site, **sempre filtrado pelo RLS** |
| `private` | Conexões com as plataformas e referências a tokens | **Somente o servidor.** Não é exposto pela API do Supabase |
| `vault` | Tokens criptografados (Supabase Vault) | Somente o servidor |

## 4. Tabelas propostas

Legenda de retenção: **Permanente** = nunca apagado automaticamente.

### Cadastro e acesso

| Tabela | Para que serve | Colunas principais | Retenção |
|---|---|---|---|
| `profiles` | Perfil de cada usuário (ligado ao login) | `id` (= usuário do Auth), `full_name`, `role` (admin/gestor/operador/visualizador/cliente), `active`, `created_at` | Permanente (desativar em vez de apagar) |
| `clients` | Cliente da agência | `id`, `name`, `company`, `cnpj` (opcional, validado), `owner_name`, `phone`, `email`, `notes`, `status`, `timezone`, `is_demo`, `created_at` | Permanente |
| `user_client_access` | Quais clientes cada usuário pode ver | `user_id`, `client_id` | Permanente |
| `platforms` | Plataformas suportadas (meta, google; futuramente tiktok...) | `id`, `name`, `enabled` | Permanente |
| `settings` | Limites de alerta, intervalo de sync, mapeamentos padrão | `key`, `value` (jsonb) | Permanente |

### Conexões e contas

| Tabela | Para que serve | Colunas principais | Retenção |
|---|---|---|---|
| `private.platform_connections` | Uma conexão com o Meta (System User do BM) ou Google (OAuth/MCC). **Invisível para o site.** | `id`, `platform_id`, `label`, `status`, `scopes`, `vault_secret_id` (aponta para o token no cofre), `token_expires_at`, `login_customer_id` (MCC), `created_by` | Enquanto ativa |
| `ad_accounts` | Conta de anúncio vinculada a um cliente | `id`, `platform_id`, `external_id` (act_… ou Customer ID), `client_id`, `connection_id`, `name`, `currency`, `timezone`, `status` (normalizado), `raw_status`, `business_id`, `business_name`, `manager_customer_id`, `result_mapping` (jsonb: o que conta como lead/mensagem/conversão), `is_demo`, `last_sync_at` | Permanente |
| `ad_account_assets` | Páginas e perfis do Instagram ligados à conta Meta | `ad_account_id`, `asset_type`, `external_id`, `name` | Permanente |

### Estrutura das campanhas (estado atual)

| Tabela | Colunas principais |
|---|---|
| `campaigns` | `id`, `ad_account_id`, `client_id`, `external_id`, `name`, `objective`, `status`, `effective_status`, `budget_micros`, `budget_type` (diário/vitalício), `start_date`, `end_date`, `updated_at` |
| `ad_groups` | Conjuntos (Meta) **e** grupos de anúncios (Google), com `campaign_id` |
| `ads` | `ad_group_id`, `campaign_id`, nome, status, tipo de criativo, status de revisão/política |

Um só nome (`ad_groups`) para "conjunto" e "grupo" porque têm o mesmo papel; na tela
o rótulo muda conforme a plataforma.

### Métricas (o coração do histórico)

| Tabela | Para que serve | Retenção |
|---|---|---|
| `metrics_daily` (**particionada por mês**) | Números de **um dia** de **uma** conta/campanha/grupo/anúncio | Permanente |
| `metrics_monthly` (visão materializada) | Totais por conta/mês e cliente/mês, separados por moeda | Recalculada; origem permanente |
| `period_reach` | Alcance e frequência de **períodos** (7d, 30d, mês) buscados prontos da API | Permanente |

Colunas de `metrics_daily`:
`date`, `level` (account/campaign/ad_group/ad), `entity_id`, `ad_account_id`,
`client_id`, `campaign_id`, `ad_group_id`, `platform_id`, `currency`,
`spend_micros`, `impressions`, `reach`, `clicks`, `link_clicks`, `leads`, `messages`,
`conversions`, `conversion_value_micros`, `video_views`,
`platform_metrics` (jsonb: CTR/CPC oficiais informados pela plataforma),
`raw_actions` (jsonb: lista original de ações do Meta, para auditoria),
`synced_at`, `hash`.

> **Aviso sobre alcance:** alcance **não pode ser somado** entre dias (a mesma pessoa
> vista na segunda e na terça contaria duas vezes). Por isso o alcance de um período é
> buscado pronto da API e guardado em `period_reach`. Para intervalos personalizados
> antigos, se a API não fornecer mais, mostramos "Informação não disponível pela API."

### Fotografias históricas (snapshots)

| Tabela | O que registra | Quando grava | Retenção |
|---|---|---|---|
| `account_snapshots` | Status, saldo/limites/gasto acumulado **como a API informou naquele momento** | A cada sync + 1 "fechamento" por dia | Permanente |
| `entity_changes` | Mudanças: campanha pausada, orçamento alterado, status da conta mudou | Somente quando algo muda | Permanente |
| `daily_summaries` | "Fotografia do dia" por cliente (ex.: Excalibur, 23/09: R$ 1.250, 350 leads, CPL R$ 3,57) | Fechamento diário | Permanente |

### Operação

| Tabela | Para que serve | Retenção proposta |
|---|---|---|
| `sync_state` | Por conta: última sync, próxima, trava (evita duas ao mesmo tempo), último erro | Permanente (1 linha por conta) |
| `sync_runs` | Log de cada sincronização: início, fim, status, registros, erro técnico | **Sugestão**: 400 dias (só com sua aprovação) |
| `alerts` | Tipo, gravidade, cliente, conta, descrição, status (aberto/reconhecido/resolvido), datas | Permanente |
| `audit_logs` | Quem fez o quê (criou usuário, conectou conta, mudou permissão) | Permanente |
| `reports` | Relatórios gerados (arquivo fica no Supabase Storage) | Sugestão: 180 dias para o arquivo; registro permanente |

## 5. Relacionamentos

```
clients ─┬─< ad_accounts ─┬─< campaigns ─< ad_groups ─< ads
         │                ├─< metrics_daily (por nível e dia)
         │                ├─< account_snapshots
         │                ├── sync_state
         │                └─< sync_runs
         ├─< daily_summaries
         └─< alerts
private.platform_connections ─< ad_accounts   (uma conexão pode dar acesso a várias contas)
profiles >─< clients                          (via user_client_access)
```

## 6. Índices previstos (exemplos)

- `metrics_daily`: (`ad_account_id`, `level`, `date`), (`client_id`, `level`, `date`), (`campaign_id`, `date`)
- `alerts`: (`status`, `severity`, `created_at`), (`client_id`, `status`, `created_at`)
- `sync_runs`: (`ad_account_id`, `started_at` desc)
- `campaigns`: (`client_id`, `status`), (`ad_account_id`, `status`)
- **Busca global**: índices de trigramas (`pg_trgm`) em nomes de clientes, contas,
  campanhas e anúncios — acha "Excalib" mesmo digitando só parte do nome.

## 7. Funções do banco para o dashboard

Em vez de o site montar dezenas de consultas, o banco terá funções prontas
(executadas **com as permissões do usuário**, então o RLS continua valendo):

- `dashboard_summary(filtros, período, período_anterior)` — cards do resumo
- `metrics_timeseries(filtros, período, agrupamento: dia/semana/mês)` — gráficos
- `campaign_table(filtros, período, ordenação, página)` — tabela de campanhas
- `global_search(texto)` — busca global

## 8. Estimativa de volume e custo

200 contas × ~100 entidades ativas × 365 dias ≈ **7,3 milhões de linhas por ano**.
Estimativa de espaço: **3 a 5 GB por ano**, contando índices. O particionamento mantém
as consultas rápidas mesmo depois de anos.

- **Plano Free** do Supabase: 500 MB e o projeto **pausa após 1 semana sem uso** →
  serve só para testes/demonstração.
- **Plano Pro** (US$ 25/mês): 8 GB inclusos, backups diários → recomendado para produção.
  Espaço extra é cobrado por GB.

## 9. Dados de demonstração

Dados fictícios terão `is_demo = true` e só existirão no **projeto de
desenvolvimento** (via `seed.sql`). A interface mostra a faixa
**"MODO DEMONSTRAÇÃO"** sempre que houver dado demo na tela. Assim é impossível
confundir com dados reais.
