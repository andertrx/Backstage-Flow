# ETAPA 23 — Banco histórico

> Status: **concluída e validada**.

## 1. O que fizemos (explicado de forma simples)

Agora dá para perguntar ao sistema:

- "Quanto a conta gastou em **agosto**?"
- "Quantos **leads** tivemos em **julho**?"
- "Qual foi o **CPL** em determinado período?"

As respostas vêm do **histórico guardado no banco de dados**, e não da API do Meta/Google na hora.

### A nova tela: **Histórico**
Para abrir, clique em **"Histórico por mês"** no Dashboard, ao lado de "Comparar períodos".

1. Escolha **cliente**, **plataforma** e **conta** (ou deixe "Todos").
2. Escolha **um mês** ou **um período** (de/até).
3. A resposta aparece **numa frase**, por exemplo:
   *"Em agosto de 2026, Excalibur Fitness investiu R$ 1.234,56, teve 120 leads e CPL de R$ 10,29."*
4. Embaixo da frase vêm os cards com investimento, leads, CPL, mensagens, conversões, CPA, impressões, cliques, CTR, CPC, CPM e ROAS, comparados com o mês anterior.
5. **Mês a mês**: tabela dos últimos 13 meses. Clique num mês para ver os detalhes dele.
6. **Histórico guardado**: mostra até onde vai o histórico de cada conta e o andamento da importação.

### Importação do passado (automática)
Até agora o sistema buscava **só os últimos 30 dias** quando uma conta era conectada: o histórico começava em 26/08/2026.
A partir de agora:
- o sistema **importa sozinho os meses anteriores**, até **13 meses para trás** (desde 01/09/2025), 30 dias por vez, no tempo livre entre as sincronizações;
- dá para acompanhar o andamento na tela Histórico (barra de progresso) e no Log de sincronizações (origem **"Importação do histórico"**);
- se uma conta ficar dias sem sincronizar, o sistema **recupera os dias que faltaram** (até 90 dias).

### Nunca inventa números
- Se um mês **ainda não foi importado**, a tela diz **"informação ainda não disponível no histórico"**, e não "R$ 0,00".
- Se só parte do período estiver guardada, aparece o aviso **"Resposta parcial"**, com o nome da conta e a data a partir da qual ela tem dados.

## 2. Problema real encontrado e corrigido: gasto contado em dobro

A conta **CA - Cravina Motos** foi vinculada duas vezes: pela BM antiga e pela nova ("v.2"). As duas cópias trouxeram os mesmos dias, de 26/08 a 24/09.
O total do cliente somava as duas: **R$ 13.223 em vez de R$ 6.698**.

**Correção:** quando a mesma conta da plataforma é vinculada de novo, os dias repetidos da vinculação antiga ficam marcados como **"substituídos"** e deixam de entrar nas somas.
**Nada foi apagado**: as linhas continuam guardadas (1.805 linhas marcadas).
Com a correção, o total da Cravina Motos voltou a R$ 6.698, o valor certo.

Também corrigimos: sincronizações que o servidor interrompia por tempo ficavam "Sincronizando…" para sempre. Agora, depois de 30 minutos, são fechadas como "interrompidas".

## 3. Banco de dados (nenhuma tabela nova)

| O quê | Para quê |
|---|---|
| `sync_state.history_from` / `history_to` | Até onde vai o histórico de cada conta, sem buracos. Sem isso não dá para diferenciar "gastou zero" de "ainda não temos esse mês" |
| `sync_state.backfill_*` | Controle da importação do passado: trava, próxima tentativa, último erro |
| `metrics_daily.superseded` | Marca dias repetidos de uma conta vinculada de novo (guardados, mas não somados) |
| `history_target()` | Meta do histórico: dia 1 do mês, 12 meses atrás (13 meses contando o atual) |
| `sync_mark_coverage()` | Soma à cobertura cada período buscado com sucesso (só o servidor usa) |
| `sync_claim_backfill()` | Fila da importação do passado (só o servidor usa) |
| `history_coverage()` | Cobertura por conta, para a tela (cada um só vê as contas que pode ver) |
| `sync_runs.trigger = 'historico'` | As importações aparecem no log com origem própria |

**Retenção: permanente.** Nada é apagado automaticamente.

## 4. Arquivos

| Arquivo | Para que serve |
|---|---|
| `supabase/migrations/20260925120000_history_coverage.sql` | Cobertura, importação, contas repetidas, sincronizações interrompidas |
| `supabase/tests/etapa23_history.sql` | Teste no banco |
| `supabase/functions/_shared/sync/runner.ts` (+ teste) | Importação do passado em blocos de 30 dias e recuperação de dias que faltaram |
| `supabase/functions/_shared/sync/store.ts` | Grava cobertura e resultado da importação |
| `supabase/functions/sync/index.ts` | O agendador usa o tempo que sobra para importar o passado |
| `apps/web/src/features/history/*` (+ teste) | Tela Histórico |
| `apps/web/e2e/history.mjs` | Teste de navegador desta etapa |

## 5. Testes

- **Banco** (`etapa23_history.sql`): passou. Cobre:
  - conta vinculada duas vezes: o total é 70 em vez de 100, e passa a 80 depois de importar o dia que faltava;
  - nada é apagado;
  - cobertura crescendo para os dois lados, período solto no passado, buraco e período inválido;
  - fila da importação: pega as contas certas, não pega duas vezes, respeita a espera depois de erro;
  - tela de Sincronização ignora a importação;
  - sincronização interrompida é fechada;
  - permissões.
- **Servidor**: 57 testes, entre eles 5 novos (blocos de 30 dias, parar na meta, erro sem mexer na cobertura, recuperação de dias que faltaram).
- **Com dados reais**: a importação já está rodando, com 6 blocos importados sem erro (27/07 a 25/08/2026).
- **Navegador** (`history.mjs`): 23 verificações, entre elas:
  - a frase da resposta;
  - o aviso de resposta parcial;
  - o mês sem histórico que não mostra zero;
  - o período livre;
  - os 13 meses da tabela;
  - o celular;
  - os perfis visualizador e cliente.
- **Todos os testes de navegador**: 609 verificações passando. Testes automáticos: 99 (site) + 84 (regras). Tipos e build sem erros.

## 6. Como testar você mesmo

1. Abra o **Dashboard** e clique em **Histórico por mês**.
2. Escolha um cliente e o mês de **agosto**. Veja a frase com investimento, leads e CPL.
3. Escolha **julho**: enquanto a importação não chega nele, aparece o aviso de que o histórico ainda está sendo importado.
4. Volte mais tarde: a barra "Importação do passado" avança sozinha até 100%.
5. Em **Logs → Sincronizações**, veja as linhas com origem **"Importação do histórico"**.

## 7. Resultado esperado

Perguntas por mês e por período respondidas em segundos, com o histórico de 13 meses guardado no banco, sem números inventados e sem contar nada em dobro.
