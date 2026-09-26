# ETAPA 30 — Performance

> Status: **concluída, aguardando validação**

## 1. O que fizemos (explicado de forma simples)

Primeiro **medimos** (com os dados reais: 144 mil linhas de números diários, 28 clientes), depois corrigimos só o que estava lento, e medimos de novo.

### Banco de dados: de segundos para centésimos de segundo
Tempos medidos como administrador, com os dados reais (melhor e pior de várias repetições):

| Consulta (tela) | Antes | Depois |
|---|---|---|
| Resumo do Dashboard — 1 ano | 4,8 a **13,4 s** | **0,02 s** |
| Resumo do Dashboard — 30 dias | 0,36 a 3,3 s | **0,003 s** |
| Gráficos — 1 ano (por mês) | 1,4 a 2,2 s | **0,02 s** |
| Tabela de Campanhas — 1 ano | 8 a **22 s** | **0,04 s** |
| Tabela de Campanhas — 30 dias | 0,08 a 2 s | **0,025 s** |
| Visão executiva — 1 ano | 2 a 4,3 s | **0,025 s** |
| Histórico (resumo de 1 ano) | 14 s | **0,02 s** |
| Estrutura (telas Meta Ads / Google Ads) | 0,8 a 2,5 s | **0,02 s** |
| Saldos das contas | 0,6 a 7,5 s | **0,03 s** |

**O que era o problema:**
1. **Consultas lendo a tabela inteira.** Para somar 1 ano, o banco lia linhas completas (com todos os detalhes), e o servidor tem pouca memória (≈1 GB).
   - **Solução:** índices "resumo". São cópias compactas, mantidas pelo próprio banco, com só as colunas que as telas somam (nível conta e nível campanha).
   - O banco passa a ler o índice pequeno em vez da tabela.
2. **Tempo que variava sem motivo** (0,04 s numa vez e 9 s na outra). Depois de 5 usos, o banco trocava para um "plano genérico" que consultava todos os meses guardados.
   - **Solução:** as funções de leitura passam a planejar sempre para o período pedido.
3. **Dashboard e gráficos** escolhiam o nível (conta ou campanha) com uma fórmula, e o banco não conseguia aproveitar o índice.
   - **Solução:** dois caminhos explícitos, com **resultado idêntico**, comprovado com "impressão digital" (md5) dos resultados antes e depois em 9 consultas diferentes.
4. **Contagem de campanhas/conjuntos/anúncios** lia a tabela de anúncios inteira (23 MB).
   - **Solução:** índice compacto por conta e status.

### Site: o que foi conferido (e já estava certo)
| Pedido | Como está |
|---|---|
| Sem chamadas repetidas | Nenhuma tela pede a mesma informação duas vezes (teste automático) |
| Cache | Voltar a uma tela não chama o servidor. Dados guardados por 30 s e mostrados na hora ao trocar filtros |
| Buscar só o necessário | Trocar o período busca só resumo e gráfico (3 chamadas), não clientes nem saldos |
| Paginação | Tabela de Campanhas: 50 por página (máx. 200). Logs, conjuntos e anúncios também paginados. Busca limitada |
| Carregamento sob demanda | Cada tela só é baixada quando aberta. PDF/Excel (as partes mais pesadas) só ao exportar. Início do site: 200 KB compactados |
| Gráficos sem recálculo | Os dados do gráfico só são recalculados quando mudam. Passar o mouse redesenha só a linha vertical e o tooltip |
| Agregações | As somas são feitas no banco (só os totais chegam ao site), agora apoiadas nos índices resumo |
| "Índices Firestore" | No nosso caso, índices do Supabase (Postgres): os 4 novos acima, além dos que já existiam |

## 2. Por que fizemos
Com 1 ano de histórico, algumas telas levavam de 5 a 20 segundos. Agora respondem quase na hora. Isso vale também para quando o histórico crescer: o índice resumo cresce muito devagar.

## 3. Banco de dados
**Nenhuma tabela nova.** Só índices (que o banco mantém sozinho e que podem ser removidos) e ajustes nas funções de leitura, sem mudar o que elas devolvem.
- Espaço usado pelos índices novos: ≈ 7 MB.
- Migração: `supabase/migrations/20260926140000_performance.sql`.

## 4. Arquivos
- `supabase/migrations/20260926140000_performance.sql`: índices e funções.
- `apps/web/src/components/charts/TimeSeriesChart.tsx` e `features/dashboard/ChartsSection.tsx`: gráfico sem recálculo à toa.
- Testes: `supabase/tests/etapa30_performance.sql`, `apps/web/e2e/performance.mjs`.
- `e2e/history.mjs`: um teste que às vezes falhava por pressa (procurava o campo "De" antes da tela trocar). Agora procura o nome exato.

## 5. Testes
| Teste | Resultado |
|---|---|
| Resultados idênticos antes e depois (9 consultas do Dashboard e gráficos) | ✅ mesmas "impressões digitais" |
| Banco (`etapa30_performance.sql`): índices, plano sob medida, consulta usando o índice | ✅ PASSOU |
| Navegador (`performance.mjs`): sem repetição, cache ao voltar, troca de período, paginação | ✅ |
| Todas as 28 suítes de navegador | ✅ |
| Site 126 · Compartilhado 103 · Servidor 70 · build · segredos | ✅ |

## 6. Observação honesta
- O servidor do banco é pequeno (≈1 GB de memória). As consultas agora são leves, mas a **primeira** consulta depois de um tempo parado pode levar alguns décimos de segundo a mais.
- Se a carteira crescer bastante, aumentar o plano do Supabase (Compute) é a próxima alavanca. Isso é decisão sua, porque tem custo.
- Enquanto eu criava os índices, **uma** sincronização falhou por tempo (às 19h41, horário de Brasília) e foi refeita sozinha em seguida.

## 7. Como testar você mesmo
1. No Dashboard, escolha **Personalizado** com 1 ano. Os números aparecem quase na hora.
2. Abra **Campanhas** com "Mês anterior" e depois com 1 ano: a tabela carrega rápido.
3. Vá para outra tela e volte ao Dashboard: aparece na hora (cache).

## 8. Resultado esperado
Telas rápidas mesmo com 1 ano de dados, sem esperas aleatórias e com os mesmos números de antes.
