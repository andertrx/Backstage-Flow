# 04 — Sincronização, cache e histórico

## 1. Fluxo de sincronização (o "robô bibliotecário")

```
⏰ Relógio (a cada 60 min, configurável)
   ▼
Orquestrador: "quais contas precisam atualizar?"
   ▼
Coloca UMA tarefa por conta numa FILA (com limite de velocidade)
   ▼
Para cada conta:
  1. Trava a conta (evita duas sincronizações ao mesmo tempo)
  2. Busca dados da conta → status, moeda, fuso, cobrança
  3. Grava FOTOGRAFIA (accountSnapshots) e registra mudanças (entityChanges)
  4. Busca estrutura → campanhas, conjuntos/grupos, anúncios (só o que mudou)
  5. Busca métricas diárias do período necessário
  6. Normaliza (Meta e Google no mesmo formato, dinheiro em micros)
  7. Grava no Firestore em lotes (só o que mudou)
  8. Recalcula rollups dos dias afetados
  9. Avalia alertas (saldo baixo, conta restrita, sem entrega...)
 10. Grava o LOG (syncRuns) e atualiza syncState (última/próxima sync)
 11. Destrava a conta
```

Se algo falhar, a fila tenta de novo com **espera crescente** (1 min, 2 min, 4 min...).
Erro de token expirado **não** é repetido: vira alerta "reconectar conta".

## 2. Quanto buscar em cada rodada (economia de custo)

| Frequência | O que busca | Por quê |
|---|---|---|
| A cada hora | Status/cobrança da conta + métricas de **hoje** nos níveis conta e campanha | Dashboard "ao vivo" e alertas rápidos |
| 1–2× por dia | Últimos **7 dias** em todos os níveis (até anúncio) + alcance de períodos | Números de dias anteriores ainda mudam (atribuição) |
| 1× por semana | Últimos **28–30 dias** | Conversões atrasadas do Google |
| Ao conectar conta nova | **Backfill**: histórico o mais antigo que a API permitir, em pedaços | Começar já com histórico |

## 3. "SINCRONIZAR AGORA"

Botão chama uma função do servidor que confere a permissão, aplica **limite** (ex.:
1 vez a cada 5 minutos por conta) e coloca a conta no início da fila. A tela mostra em
tempo real: sucesso/erro, registros atualizados, duração, última tentativa.

## 4. Cache (evitar chamadas desnecessárias)

Três níveis de "memória":

1. **Firestore** é o cache principal. Cada conta tem `syncState.lastSuccessAt`.
   - Dado com menos de 60 min → usa o que está salvo.
   - Dado antigo → mostra o salvo **com aviso "atualizado há X"** e agenda sync.
2. **Rollups** evitam somar milhares de fichas a cada tela.
3. **TanStack Query no navegador** evita pedir de novo o que foi pedido segundos antes.

O usuário **nunca** dispara chamadas diretas à API ao trocar filtros: ele sempre lê do
Firebase. Isso protege contra limites de uso e deixa tudo rápido.

## 5. Estratégia de histórico

| O quê | Onde | Frequência |
|---|---|---|
| Métricas diárias (todos os níveis) | `metricsDaily` | Todo sync (atualiza a ficha do dia) |
| Fotografia diária do cliente | `dailySummaries` | Fechamento do dia (fuso do cliente) |
| Histórico de saldo/limite/status | `accountSnapshots` | Todo sync + fechamento diário |
| Histórico de campanhas (status, orçamento) | `entityChanges` | Quando muda |
| Alterações feitas nas plataformas | `entityChanges` (origem `activities` / `change_event`) | Diário |
| Logs de sincronização | `syncRuns` | Todo sync |

Com isso dá para perguntar ao sistema (Etapa 23): *"Quanto a conta gastou em agosto?"*
→ lê `rollupsMonthly` de agosto. *"Qual o CPL de 01/07 a 15/07?"* → soma
`rollupsDaily` do período e aplica a fórmula. Tudo vem do Firebase.

## 6. Fluxo dos períodos

Períodos rápidos (Hoje, Ontem, 7/14/30 dias, Mês atual, Mês anterior, Personalizado)
são calculados **no fuso da conta**. O "período anterior" tem o mesmo tamanho logo
antes (ex.: 01/09–23/09 vs 09/08–31/08). "Ano contra ano" usa as mesmas datas do ano
anterior e só aparece se houver dados salvos.
