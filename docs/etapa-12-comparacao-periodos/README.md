# ETAPA 12 — Comparação de períodos

> Status: **concluída e testada**, aguardando sua validação.

## 1. O que fizemos (explicado de forma simples)

Nova tela **Comparar períodos**. Ela abre pelo botão **"Comparar períodos"** do Dashboard, ao lado de "Resumo geral", e já leva os filtros que estavam escolhidos.

A tela coloca dois períodos lado a lado:

```
Período atual            vs   Comparado com
01/09/2026 a 23/09/2026       09/08/2026 a 31/08/2026
23 dias                       23 dias
```

Para cada métrica pedida (**Investimento, Leads, CPL, CTR, CPC, CPM, Conversões e ROAS**), a tela mostra:

| Coluna | Exemplo | O que é |
|---|---|---|
| Atual | R$ 300,00 | Valor no período escolhido |
| Comparação | R$ 200,00 | Valor no período de comparação |
| **Diferença** | +R$ 100,00 | Atual − comparação (**diferença absoluta**) |
| **Variação** | +50,0% | Diferença ÷ comparação (**diferença percentual**) |
| Visual | barras | Barra azul (atual) contra barra cinza (comparação), só no computador |

**Com o que comparar** (você escolhe):
- **Período anterior** (padrão): os dias logo antes, com a mesma quantidade de dias. É exatamente o exemplo do pedido.
- **Mesmos dias do mês anterior:** 01/09 a 23/09 → 01/08 a 23/08.
- **Mesmo período do ano anterior:** ano contra ano, quando o histórico tiver esses dias.
- **Outro período (personalizado):** você escolhe as datas.

**Cores:** verde = melhorou, vermelho = piorou, cinza = depende do objetivo (por exemplo, investimento). Para custos (CPL, CPC, CPM), **subir é piorar**.

## 2. Por que assim

- **Nada inventado:** se um dos períodos não tem dados, aparece "—" com o motivo. A variação em % também não é calculada quando a base é zero (não existe "% de aumento sobre zero").
- **CTR em pontos percentuais:** de 2,50% para 2,00%, a diferença é **−0,50 p.p.**, e a variação é **−20%**. São duas coisas diferentes, e a tela mostra as duas.
- **Avisos automáticos:**
  - períodos de tamanhos diferentes (o total de um período mais longo tende a ser maior);
  - períodos com dias em comum;
  - falta de dados no período de comparação.
- **Moedas nunca se misturam:** com contas em real e em dólar, você escolhe a moeda, e não há conversão.
- **Mesmos cálculos do Dashboard:** usa a mesma consulta do banco e as mesmas fórmulas. Os números batem com os cards.
- **Tudo no endereço da página:** recarregar ou enviar o link mantém os filtros e a comparação escolhida.
- **Menu lateral inalterado:** o menu segue a lista pedida na Etapa 21, então a tela é aberta pelo Dashboard.
- **Celular:** no telefone, cada métrica vira um bloco com atual, antes, diferença e variação, sem rolar para o lado.

## 3. O que mudou no banco

**Nada.** A comparação usa a consulta `dashboard_summary` (Etapa 6), que já calcula os totais de qualquer período com a permissão de quem pergunta.

## 4. Testes realizados

| Teste | Resultado |
|---|---|
| **Cálculos** (escolha do período, diferença, variação, cores) | ✅ |
| ↳ exemplo do pedido: 01/09–23/09 contra 09/08–31/08 | ✅ |
| ↳ mês anterior (31/03 → 28/02), ano anterior (29/02 → 28/02), personalizado | ✅ |
| ↳ CTR em p.p.; sem base não inventa; anterior zero não gera % | ✅ |
| ↳ compartilhado 72 testes, site 56 testes | ✅ |
| **Navegador:** 38 verificações novas | ✅ |
| ↳ abrir pelo Dashboard mantendo os filtros | ✅ |
| ↳ as 8 métricas com atual, comparação, diferença e variação corretas | ✅ |
| ↳ cores de melhora e piora; ano contra ano; mês anterior; personalizado | ✅ |
| ↳ avisos de tamanho diferente e de dias em comum | ✅ |
| ↳ recarregar mantém a escolha; moeda USD sem conversão; sem dados | ✅ |
| ↳ celular sem rolagem lateral | ✅ |
| **Navegador:** as 280 verificações anteriores continuam passando | ✅ |

**Problemas encontrados e corrigidos**
1. **Mudanças rápidas se perdiam:** ao trocar a comparação e logo em seguida o período, a segunda mudança apagava a primeira. A causa era um detalhe do React Router. Foi corrigido com um ajudante único, usado em todas as telas que guardam escolhas no endereço (Dashboard, gráfico, Campanhas, detalhes e Comparar).
2. **Data inicial depois da final:** no personalizado, a comparação voltava sozinha para o período anterior. Agora a outra data acompanha e o período nunca fica inválido.
3. **Página mais larga que o celular:** textos invisíveis, usados só por leitores de tela, esticavam a página. Foi corrigido, e o celular ganhou a versão em blocos.

## 5. Como testar manualmente

> Os números aparecem depois que a sincronização buscar os dados (Etapa 16).

1. No **Dashboard**, clique em **Comparar períodos**, ao lado de "Resumo geral".
2. Veja as datas dos dois períodos e a tabela com diferença e variação.
3. Clique em **Mesmo período do ano anterior** e em **Mesmos dias do mês anterior**.
4. Clique em **Outro período** e escolha as datas.
5. Troque o período ou o cliente nos filtros: a comparação acompanha.

### Resultado esperado
Você vê, lado a lado, quanto cada número mudou, em valor e em porcentagem, e se a mudança é boa ou ruim.

## 6. Arquivos

**Criados**
```
packages/shared/src/metrics/comparison.ts (+ teste)           → períodos de comparação, diferença e variação
apps/web/src/features/comparison/ComparisonPage.tsx           → tela Comparar períodos
apps/web/src/features/comparison/compareParams.ts (+ teste)   → escolha guardada no endereço
apps/web/src/features/dashboard/CurrencyTabs.tsx              → escolha de moeda (reaproveitada)
apps/web/src/lib/useSearchParamsUpdater.ts                    → mudanças rápidas no endereço não se perdem
apps/web/e2e/comparison.mjs
```

**Modificados**
```
packages/shared/src/index.ts
apps/web/src/lib/format.ts (+ teste)                          → diferença com sinal (+R$ 20,00, −0,50 p.p.)
apps/web/src/components/ui/alert.tsx                          → aviso amarelo
apps/web/src/app/router.tsx                                   → /comparar
apps/web/src/features/dashboard/{DashboardPage,ChartsSection,useDashboardFilters}.ts(x)
apps/web/src/features/{campaigns/CampaignsPage,structure/EntityDetailPage}.tsx
apps/web/package.json, README.md
```
