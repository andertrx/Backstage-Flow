# ETAPA 6 — Dashboard principal

> Status: **concluída e testada**, aguardando sua validação.

## 1. O que fizemos (explicado de forma simples)

A página inicial virou um **painel de controle**. No topo fica o **Resumo geral**, com 10 cartões:

| Cartão | O que mostra |
|---|---|
| **Investimento** | Quanto foi gasto em anúncios |
| **Saldo** | Chega na **Etapa 7** (verificação de saldo). Até lá, o cartão avisa isso e não mostra número inventado |
| **Leads** | Cadastros recebidos |
| **Mensagens** | Conversas iniciadas (o Google Ads não tem essa informação) |
| **Conversões** | Ações valiosas registradas pela plataforma |
| **CPL** | Custo por lead = investimento ÷ leads |
| **CPC** | Custo por clique = investimento ÷ cliques |
| **CPM** | Custo por mil impressões |
| **CTR** | Taxa de cliques = cliques ÷ impressões |
| **ROAS** | Retorno = valor das conversões ÷ investimento |

Cada cartão tem:
- o **valor atual**;
- a **comparação com o período anterior** (ex.: `+50,0%`) e o valor de antes;
- uma **cor que indica se a mudança foi boa ou ruim**:
  - **verde** quando melhorou (mais leads, custo menor);
  - **vermelho** quando piorou (custo maior);
  - **cinza** quando depende do objetivo (investimento);
- um **ícone "i"** que explica a métrica. Ele abre com o mouse, com a tecla Tab ou com um toque no celular.

Acima dos cartões ficam os **filtros globais**:
- **Período:** Hoje, Ontem, Últimos 7, 14 ou 30 dias, Mês atual, Mês anterior e Personalizado.
- **Cliente, Plataforma, Conta, Campanha e Status da campanha.**

Qualquer filtro atualiza todos os números na hora.

## 2. Por que assim

| Decisão | Motivo |
|---|---|
| **Filtros no endereço da página** | Ao recarregar, os filtros continuam. Dá também para mandar o link com os filtros para outra pessoa da equipe (ela só vê o que tem permissão). |
| **"Últimos 7 dias" sem contar hoje** | O dia de hoje ainda está incompleto e distorceria as médias. "Hoje" continua disponível como opção própria. |
| **Comparação justa** | Nos períodos comuns, a comparação é com o mesmo número de dias imediatamente antes. No "Mês atual" (1º a 23), compara com 1º a 23 do mês passado. No "Mês anterior", compara com o mês antes dele. |
| **Fuso horário** | As datas seguem o fuso do cliente escolhido. Sem cliente escolhido, vale o horário de Brasília. |
| **Moedas separadas** | Se houver contas em BRL e em USD, aparecem **abas por moeda**. Os valores nunca são somados nem convertidos. |
| **Filtro de campanha/status** | Sem esse filtro, os números são o **total oficial da conta**. Com ele, somamos as campanhas escolhidas, e o painel avisa: "soma das campanhas filtradas". |
| **Nunca inventar** | Tudo que falta aparece com o motivo: "Informação não disponível pela API.", "Sem leads no período." ou "Sem dados no período.". |
| **Trocar o cliente limpa conta e campanha** | Evita combinações impossíveis, como a conta de um cliente com a campanha de outro. |

## 3. O que mudou no banco

**Nenhuma tabela nova.** Criamos só a consulta `dashboard_summary`, que soma os números do período com os filtros.
Ela roda **com a permissão de quem pergunta**:
- o gestor só recebe números dos clientes liberados para ele, mesmo que tente filtrar outro cliente;
- visitante sem login não consegue usar.

## 4. Testes realizados

| Teste | Resultado |
|---|---|
| Banco (`supabase/tests/etapa06_dashboard.sql`) | ✅ |
| ↳ moedas separadas e total pelo nível conta | ✅ |
| ↳ filtros por conta, campanha e status | ✅ |
| ↳ "não disponível" continua vazio | ✅ |
| ↳ período vazio e período invertido recusado | ✅ |
| ↳ gestor não vê cliente não liberado; visitante sem login bloqueado | ✅ |
| Cálculos (compartilhado): indicadores, cores de variação, período de comparação. Total: 34 testes | ✅ |
| Site: formatação brasileira, filtros no endereço, motivos de "sem valor". Total: 28 testes | ✅ |
| Navegador: **39 verificações novas**, com todos os cartões, cores, dicas, abas de moeda, cada filtro, recarregar, limpar, período personalizado, celular e banco vazio | ✅ |
| Navegador: as 73 verificações anteriores continuam passando | ✅ |
| Supabase Advisor (segurança) | ✅ Nenhum aviso |

**Problemas encontrados e corrigidos**
1. **Dois filtros trocados em sequência:** quando alguém mudava dois filtros muito rápido, o segundo "esquecia" o
   primeiro. Agora cada mudança parte sempre do filtro mais recente.
2. **Filtros espremidos:** em tela larga, os 6 filtros numa linha cortavam o texto ("Todos os clien..."). Passaram para 3 por linha.

## 5. Como testar manualmente

> Ainda **não há números reais**. Eles chegam com a sincronização, que busca os dados no Meta e no Google (Etapa 16).
> Por enquanto, o painel deve mostrar o aviso de "sem dados", **sem nenhum número inventado**.

1. Entre no sistema. A página inicial mostra os filtros e os 10 cartões.
2. Cada cartão mostra **"Sem dados no período."** e aparece o aviso azul explicando que os números virão da sincronização.
3. Passe o mouse no **"i"** de qualquer cartão: aparece a explicação da métrica.
4. Troque o **Período** para "Mês anterior": a linha abaixo dos filtros mostra as datas e com qual período será comparado.
5. Escolha **Personalizado**: aparecem os campos **De** e **Até**.
6. Escolha um **Cliente**: a lista de **Contas** mostra só as contas dele, e **Campanha** fica disponível.
7. Recarregue a página (F5): os filtros continuam iguais.
8. Clique em **Limpar filtros**: volta tudo, menos o período.

Para ver o painel **com números simulados** (sem tocar no banco real), rode o teste de navegador:
`npm run dev` e, em outro terminal, `node apps/web/e2e/dashboard.mjs`.
A captura de tela fica em `apps/web/test-results/60-dashboard.png`.

### Resultado esperado
- Os filtros funcionam e ficam no endereço da página.
- Sem dados sincronizados, nenhum número aparece: só avisos claros.
- Com dados, cada cartão mostra valor, variação colorida e o valor anterior.
- Moedas diferentes aparecem em abas, sem conversão.

## 6. Arquivos

**Criados**
```
supabase/migrations/20260925000000_dashboard_summary.sql   → consulta do resumo com filtros
supabase/tests/etapa06_dashboard.sql
packages/shared/src/metrics/kpis.ts (+ teste)             → cartões: explicação, cálculo, cor da variação
apps/web/src/lib/format.ts (+ teste)                      → R$ 1.250,00 · 2,00% · 2,57x
apps/web/src/components/ui/tooltip.tsx                    → ícone "i" com explicação
apps/web/src/features/dashboard/filters.ts                → filtros no endereço, períodos
apps/web/src/features/dashboard/useDashboardFilters.ts
apps/web/src/features/dashboard/api.ts                    → busca contas, campanhas e resumo
apps/web/src/features/dashboard/summary.ts (+ teste)      → motivo de "sem valor", escolha da moeda
apps/web/src/features/dashboard/types.ts
apps/web/src/features/dashboard/FiltersBar.tsx
apps/web/src/features/dashboard/KpiCard.tsx
apps/web/e2e/dashboard.mjs
```

**Modificados**
```
apps/web/src/features/dashboard/DashboardPage.tsx   → painel completo
packages/shared/src/metrics/periods.ts               → período de comparação
packages/shared/src/index.ts
apps/web/e2e/support.mjs                             → simulação de campanhas, métricas e resumo
apps/web/package.json                                → novo teste no "npm run e2e"
README.md
```
