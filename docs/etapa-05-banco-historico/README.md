# ETAPA 5 — Banco de dados histórico

> Status: **concluída e testada**, aguardando sua validação.

## 1. O que fizemos (explicado de forma simples)

Construímos o **arquivo permanente** do sistema. Pense num armário:

- Cada **mês** é uma **gaveta** separada. Para ver setembro, o sistema abre só a gaveta de
  setembro. Por isso continua rápido mesmo com anos de dados.
- Dentro das gavetas ficam os números **de cada dia**: quanto gastou, impressões, cliques,
  leads, mensagens, conversões... para cada conta, campanha, conjunto/grupo e anúncio.
- Toda vez que uma campanha **muda** (foi pausada, mudou o orçamento, mudou o nome), o
  sistema anota sozinho **o que mudou, de quanto para quanto e quando**.
- Toda sincronização tira uma **"fotografia"** da conta (status, valor gasto, limite).
- Todo dia fica guardado um **resumo por cliente** (ex.: *Excalibur, 23/09: R$ 1.250, 350 leads*).

Nada disso é apagado automaticamente. **Retenção: permanente.**

Ainda **não há números reais** no banco. Quem vai preencher é a **sincronização** (próximas etapas).
Esta etapa prepara onde eles vão morar e como serão consultados.

## 2. Por que assim

| Decisão | Motivo |
|---|---|
| **Gavetas por mês** (particionamento) | Consultas de um mês não leem os outros. Dá para guardar anos sem ficar lento. |
| **Gavetas criadas sozinhas** | Todo dia 1º, às 00:00 de Brasília, o Supabase Cron cria as gavetas dos próximos 12 meses. Se chegar dado de um mês antigo (ex.: 2023), a gaveta é criada na hora. |
| **Dinheiro em "micros"** | R$ 12,34 é guardado como 12.340.000 (número inteiro). Não há erro de arredondamento. É o mesmo formato do Google Ads. |
| **Vazio ≠ zero** | Vazio (NULL) = "Informação não disponível pela API.". Zero = zero de verdade. Ex.: o Google Ads não tem "conversas iniciadas", então esse campo fica vazio, e não 0. |
| **Data no fuso da conta** | O dia é o dia do fuso da conta de anúncio, exatamente como a plataforma reporta. |
| **Uma linha por moeda** | Os resumos nunca somam BRL com USD. Se um cliente tiver as duas moedas, aparecem separadas. |
| **Não regrava se nada mudou** | Cada linha tem uma "impressão digital" (hash). Se a API devolver os mesmos números, nada é reescrito. |
| **Alcance separado** | Alcance **não pode ser somado** entre dias: a mesma pessoa contaria duas vezes. O alcance de um período é buscado pronto na API (tabela `period_reach`). |

## 3. Tabelas criadas

Todas têm **RLS**: o gestor só vê clientes liberados para ele, e o administrador vê todos.
O site **só lê**. Quem escreve é o servidor (sincronização).

### 3.1 `campaigns`, `ad_groups`, `ads` — estado atual
| Campo | Tipo | Para que serve |
|---|---|---|
| `id` | uuid | identificador interno |
| `ad_account_id` / `client_id` / `platform_id` | uuid / uuid / texto | a qual conta, cliente e plataforma pertence |
| `campaign_id`, `ad_group_id` | uuid | ligação com o "pai" (conjuntos e anúncios) |
| `external_id` | texto | ID na plataforma (único por conta) |
| `name`, `objective`, `bid_strategy`, `optimization_goal`, `creative_type` | texto | informações da plataforma |
| `status` | lista fixa | ativa, pausada, encerrada, arquivada, erro ou desconhecida |
| `raw_status`, `effective_status`, `review_status` | texto | valor original da API (auditoria) |
| `budget_micros`, `budget_period` | inteiro / texto | orçamento e se é diário ou vitalício |
| `start_date`, `end_date` | data | datas da campanha |
| `thumbnail_url` | texto | miniatura do anúncio (só `https://`) |
| `first_seen_at`, `last_seen_at`, `updated_at` | data/hora | quando apareceu, quando foi vista pela última vez, última mudança |

Índices: por cliente+status, por conta+status, por plataforma e pelo "pai".

### 3.2 `entity_changes` — histórico de alterações
Preenchida **automaticamente** quando o status, o orçamento, o nome (e outros campos
importantes) mudam em campanhas, conjuntos/grupos, anúncios ou contas.

| Campo | Tipo | Para que serve |
|---|---|---|
| `entity_level` | conta / campanha / conjunto / anúncio | o que mudou |
| `field` | texto | qual campo mudou (ex.: `status`) |
| `old_value` / `new_value` | JSON | de quanto para quanto |
| `source` | sync / platform_activity / manual | quem percebeu a mudança |
| `changed_at` / `detected_at` | data/hora | quando aconteceu na plataforma / quando o sistema percebeu |

### 3.3 `metrics_daily` — métricas por dia (particionada por mês)
Chave: **conta + nível + item + dia** (sem duplicidade).

| Campo | Tipo | Observação |
|---|---|---|
| `date` | data | dia no fuso da conta |
| `level`, `entity_external_id` | nível / texto | conta, campanha, conjunto ou anúncio |
| `currency` | texto (BRL, USD...) | moeda da conta |
| `spend_micros` | inteiro | investimento |
| `impressions`, `clicks` | inteiro | |
| `reach` | inteiro | alcance **do dia** (não somar entre dias) |
| `link_clicks`, `video_views` | inteiro | vazio se a API não informar |
| `leads`, `messages`, `conversions` | decimal | o Google pode ter conversões fracionadas |
| `conversion_value_micros` | inteiro | valor das conversões (para ROAS) |
| `platform_metrics` | JSON | valores oficiais da plataforma (CTR, CPC...) |
| `raw_actions` | JSON | lista original do Meta (auditoria do que virou lead/mensagem) |
| `hash`, `synced_at` | texto / data/hora | "impressão digital" e hora da gravação |

Índices: cliente+nível+data, conta+nível+data, campanha+data, plataforma+nível+data.
Gavetas: `history.metrics_daily_AAAA_MM` (hoje de 2024-01 até 2027-09). Elas **não podem ser
acessadas diretamente**. O acesso é sempre pela tabela principal, com RLS.

### 3.4 `account_snapshots` — fotografias da conta
Status, moeda, valor gasto, valor devido, limite de gastos e orçamento **como a API informou**
em cada sincronização. `is_daily_close` marca a fotografia de fechamento do dia.
> No Meta, o campo `balance` é **valor devido**, e não saldo pré-pago disponível. Isso está anotado no banco.

### 3.5 `period_reach` — alcance e frequência por período
Alcance de "setembro inteiro" ou "últimos 7 dias", como a plataforma calcula (pessoas únicas).

### 3.6 `daily_summaries` — resumo diário por cliente
Chave: **cliente + dia + moeda**. Soma as contas do cliente naquele dia.

## 4. Consultas prontas (para o painel e as perguntas)

| Função | Responde |
|---|---|
| `metrics_summary(de, até, clientes?, plataformas?, contas?)` | "Quanto o cliente X gastou em agosto?", "Quantos leads em julho?" (um total por moeda) |
| `metrics_timeseries(de, até, 'day'/'week'/'month', ...)` | Gráficos por dia, semana (começa na segunda) ou mês |

Elas rodam **com a permissão de quem pergunta**: um gestor nunca recebe números de cliente não liberado.

Só o servidor pode usar estas funções:
- `ingest_metrics_daily`: grava até 5.000 linhas por vez. Recusa conta inexistente e informa quantas linhas foram inseridas, atualizadas ou ficaram iguais.
- `refresh_daily_summaries`: recalcula os resumos.

## 5. Fórmulas e períodos (código compartilhado)

Em `packages/shared/src/metrics/`, usados pelo site e pelo servidor:
- **Fórmulas:** CTR, CPC, CPM, CPL, CPA, custo por conversa, ROAS, frequência, taxa de conversão
  e variação %. Se não dá para calcular (divisão por zero ou dado ausente), o resultado é
  **vazio**. Nunca inventamos número.
- **Períodos:** hoje, ontem, últimos 7/14/30 dias (sem contar hoje, que ainda está incompleto),
  mês atual, mês anterior, período anterior e mesmo período do ano passado. Tudo **no fuso horário
  informado** (padrão: America/Sao_Paulo).

## 6. Testes realizados

| Teste | Resultado |
|---|---|
| Banco (`supabase/tests/etapa05_history.sql`): gestor só vê o cliente liberado, gestor inativo não vê nada, site não consegue gravar, gavetas inacessíveis direto, histórico de alterações automático, ingestão (inserir / atualizar / igual, com contagem certa num lote misto), conta inexistente recusada, gaveta criada sozinha para mês antigo, resumo separado por moeda, consultas por período/semana/mês, NULL continua "não disponível" | ✅ |
| Fórmulas e períodos: 8 testes novos (fuso horário, virada de ano, 29/02, divisão por zero) | ✅ |
| Testes anteriores: site 20, compartilhado 26, Edge Functions 19 | ✅ |
| Supabase Advisor (segurança) | ✅ Nenhum aviso |
| Tarefa agendada `metrics-daily-partitions` registrada | ✅ |

**Problemas encontrados e corrigidos**
1. **Contagem errada na ingestão:** a técnica usada para saber se uma linha era nova não funciona
   em tabela com gavetas. Corrigi para contar antes quais já existiam, e o teste com lote misto confirma os números.
2. **Aviso do Supabase nas gavetas:** elas tinham a segurança ligada, mas sem regra escrita.
   Agora cada gaveta (inclusive as futuras) tem a regra explícita "acesso só pela tabela principal".
3. **Desempenho:** a verificação "quais clientes este usuário vê" agora é feita **uma vez por
   consulta**, e não linha por linha.

## 7. Como testar manualmente

1. Abra o painel do Supabase → projeto **backstage-flow-dev** → **SQL Editor**.
2. Copie todo o conteúdo de `supabase/tests/etapa05_history.sql`, cole e clique em **Run**.
3. O teste cria dados de mentira, confere tudo e **desfaz tudo no final**. Nada fica gravado.
4. **Table Editor**: aparecem as tabelas novas (`campaigns`, `ad_groups`, `ads`,
   `entity_changes`, `metrics_daily`, `account_snapshots`, `period_reach`, `daily_summaries`), todas vazias.
5. **Integrations → Cron**: aparece a tarefa `metrics-daily-partitions` (todo dia 1º).

### Resultado esperado
- A mensagem **"TODOS OS TESTES PASSARAM"** aparece.
- As tabelas existem e estão vazias. Elas serão preenchidas pela sincronização nas próximas etapas.
- O site continua funcionando igual. Esta etapa não muda nenhuma tela.

## 8. Arquivos

**Criados**
```
supabase/migrations/20260924040000_history_structure.sql       → campanhas, conjuntos, anúncios, alterações
supabase/migrations/20260924041000_history_metrics.sql         → métricas diárias, gavetas, cron, ingestão
supabase/migrations/20260924042000_history_snapshots_queries.sql → fotografias, alcance, resumos, consultas
supabase/migrations/20260924043000_fix_ingest_counts.sql       → correção da contagem
supabase/migrations/20260924044000_partitions_deny_policy.sql  → regra explícita nas gavetas
supabase/tests/etapa05_history.sql
packages/shared/src/metrics/formulas.ts
packages/shared/src/metrics/periods.ts
packages/shared/src/metrics/metrics.test.ts
docs/etapa-05-banco-historico/README.md
```

**Modificados**
```
packages/shared/src/index.ts   → exporta fórmulas e períodos
README.md                      → lista de etapas
```
