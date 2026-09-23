# 04 — Sincronização, cache e histórico

## 1. Fluxo de sincronização (o "robô bibliotecário")

```
⏰ Supabase Cron (a cada 60 min, configurável)
   ▼
Edge Function "sync-orchestrator": "quais contas precisam atualizar?"
   ▼
Coloca tarefas na FILA (Supabase Queues) — em PEDAÇOS pequenos
(ex.: "conta X, nível campanha, dias 17 a 23/09")
   ▼
⏰ A cada minuto, a Edge Function "sync-worker" pega alguns pedaços da fila
   ▼
Para cada pedaço:
  1. Trava a conta (evita duas sincronizações ao mesmo tempo)
  2. Busca dados da conta → status, moeda, fuso, cobrança
  3. Grava FOTOGRAFIA (account_snapshots) e registra mudanças (entity_changes)
  4. Busca estrutura → campanhas, conjuntos/grupos, anúncios (só o que mudou)
  5. Busca métricas diárias do intervalo do pedaço
  6. Normaliza (Meta e Google no mesmo formato, dinheiro em micros)
  7. Grava no PostgreSQL em lote (atualiza se já existir; ignora se não mudou)
  8. Avalia alertas (saldo baixo, conta restrita, sem entrega...)
  9. Grava o LOG (sync_runs) e atualiza sync_state (última/próxima sync)
 10. Destrava a conta e remove o pedaço da fila
```

**Por que em pedaços?** As Edge Functions têm um **tempo máximo por execução** (alguns
minutos). Buscar 2 anos de histórico de uma vez passaria desse limite. Dividindo em
pedaços pequenos, cada execução termina rápido e nada se perde.

Se um pedaço falhar, ele **volta sozinho para a fila** e é tentado de novo com espera
crescente (1 min, 2 min, 4 min...). Erro de token expirado **não** é repetido: vira
alerta "reconectar conta".

## 2. Quanto buscar em cada rodada

| Frequência | O que busca | Por quê |
|---|---|---|
| A cada hora | Status/cobrança da conta + métricas de **hoje** nos níveis conta e campanha | Dashboard "ao vivo" e alertas rápidos |
| 1–2× por dia | Últimos **7 dias** em todos os níveis (até anúncio) + alcance de períodos | Números de dias anteriores ainda mudam (atribuição) |
| 1× por semana | Últimos **28–30 dias** | Conversões atrasadas do Google |
| Ao conectar conta nova | **Backfill**: histórico o mais antigo que a API permitir, em pedaços | Começar já com histórico |

## 3. "SINCRONIZAR AGORA"

Botão chama a Edge Function `sync-now`, que confere a permissão, aplica **limite**
(ex.: 1 vez a cada 5 minutos por conta) e coloca a conta **no início** da fila. A tela
acompanha em tempo real (Supabase Realtime): sucesso/erro, registros atualizados,
duração, última tentativa.

## 4. Cache (evitar chamadas desnecessárias)

Três níveis de "memória":

1. **O banco Supabase** é o cache principal. Cada conta tem `sync_state.last_success_at`.
   - Dado com menos de 60 min → usa o que está salvo.
   - Dado antigo → mostra o salvo **com aviso "atualizado há X"** e agenda sync.
2. **Visões mensais materializadas** evitam refazer somas grandes a cada tela.
3. **TanStack Query no navegador** evita pedir de novo o que foi pedido segundos antes.

O usuário **nunca** dispara chamadas diretas à API ao trocar filtros: ele sempre lê do
Supabase. Isso protege contra limites de uso e deixa tudo rápido.

## 5. Estratégia de histórico

| O quê | Onde | Frequência |
|---|---|---|
| Métricas diárias (todos os níveis) | `metrics_daily` | Todo sync (atualiza a linha do dia) |
| Fotografia diária do cliente | `daily_summaries` | Fechamento do dia (fuso do cliente) |
| Histórico de saldo/limite/status | `account_snapshots` | Todo sync + fechamento diário |
| Histórico de campanhas (status, orçamento) | `entity_changes` | Quando muda |
| Alterações feitas nas plataformas | `entity_changes` (origem `activities` / `change_event`) | Diário |
| Logs de sincronização | `sync_runs` | Todo sync |

Com isso dá para perguntar ao sistema (Etapa 23): *"Quanto a conta gastou em agosto?"*
→ uma consulta em `metrics_monthly`. *"Qual o CPL de 01/07 a 15/07?"* → o banco soma
gasto e leads de `metrics_daily` no período e aplica a fórmula. Tudo vem do Supabase,
para **qualquer** intervalo, sem somas preparadas à mão.

## 6. Fluxo dos períodos

Períodos rápidos (Hoje, Ontem, 7/14/30 dias, Mês atual, Mês anterior, Personalizado)
são calculados **no fuso do cliente/conta**. O "período anterior" tem o mesmo tamanho
logo antes (ex.: 01/09–23/09 vs 09/08–31/08). "Ano contra ano" usa as mesmas datas do
ano anterior e só aparece se houver dados salvos.
