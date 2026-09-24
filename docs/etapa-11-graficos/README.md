# ETAPA 11 — Gráficos

> Status: **concluída e validada**.

## 1. O que fizemos (explicado de forma simples)

O Dashboard ganhou uma área chamada **Evolução**. Ela mostra num gráfico de linha como um número mudou dia a dia, semana a semana ou mês a mês.

| Controle | O que faz |
|---|---|
| **Métrica** | Investimento, Leads, CPL, Cliques, CTR, CPM, CPC, Conversões, ROAS, Alcance, Impressões e Mensagens |
| **Agrupar por** | Diário, Semanal (de segunda a domingo) ou Mensal |
| **Separar por plataforma** | Uma linha azul para o Meta Ads e uma laranja para o Google Ads, com legenda |
| **Passar o mouse (ou tocar)** | Mostra a data e o valor exato daquele ponto |
| **Teclado** | Setas ← → andam pelos dias; Esc fecha |
| **Ver tabela** | Mostra os mesmos números em tabela, para quem prefere ler |

Os filtros do Dashboard (cliente, plataforma, conta, campanha, status e período) também valem para o gráfico. As escolhas ficam no endereço da página, então recarregar ou mandar o link mantém tudo.

## 2. Por que assim

- **Nada inventado:** um dia sem dados **interrompe a linha**. Ele não vira zero. No tooltip aparece "sem dados".
- **Moedas nunca se misturam:** o gráfico usa a moeda escolhida nos filtros, como os cartões do Dashboard.
- **Alcance honesto:** o alcance não pode ser somado entre dias ou contas, porque a mesma pessoa seria contada duas vezes. Por isso ele só aparece no **agrupamento diário e com uma única conta**. Nos outros casos o gráfico explica o motivo.
- **Taxas calculadas do jeito certo:** CPL, CTR, CPC, CPM e ROAS de uma semana são calculados com os totais da semana, e não pela média dos dias.
- **Visual limpo e acessível:** linhas finas, grade clara, cores que pessoas daltônicas conseguem diferenciar (verificado com ferramenta), legenda escrita e versão em tabela.
- **Leve:** o gráfico foi feito sem biblioteca extra, então o site continua rápido.
- **Limite de segurança:** o agrupamento diário vai até 400 dias. Para períodos maiores, use semanal ou mensal.

## 3. O que mudou no banco

**Nenhuma tabela nova.**
- Consulta nova `dashboard_timeseries`: devolve os totais por dia, semana ou mês, com os mesmos filtros do Dashboard.
  - Roda **com a permissão de quem pergunta**: o gestor só vê os clientes liberados.
  - Separa por plataforma e por moeda quando pedido.
  - Recusa agrupamentos inválidos e o diário acima de 400 dias.

## 4. Testes realizados

| Teste | Resultado |
|---|---|
| **Banco** (`supabase/tests/etapa11_timeseries.sql`) | ✅ |
| ↳ totais por dia, semana e mês; separação por plataforma e moeda | ✅ |
| ↳ alcance só no diário com uma conta; dia sem dados não vira zero | ✅ |
| ↳ gestor não vê cliente não liberado; visitante sem login bloqueado | ✅ |
| **Cálculos** (semanas, meses, métricas, escala e rótulos) | ✅ |
| ↳ compartilhado 61 testes, site 51 testes | ✅ |
| **Navegador:** 27 verificações novas | ✅ |
| ↳ linha interrompida no dia sem dados; tooltip com data e valor exato | ✅ |
| ↳ teclado; troca de métrica (CPL, CTR); semanal e mensal | ✅ |
| ↳ separar por plataforma com legenda; versão em tabela; alcance | ✅ |
| ↳ filtros do Dashboard; recarregar mantém as escolhas; celular | ✅ |
| **Navegador:** todas as verificações anteriores continuam passando | ✅ |
| **Segurança** (verificador do Supabase) | ✅ só o aviso conhecido da senha vazada (ajuste no painel) |

**Problemas encontrados e corrigidos**
1. **Contador da tabela adiantado:** ao trocar de página nas tabelas de Campanhas, Conjuntos e Anúncios, o texto "Mostrando 51–61" aparecia um instante antes das linhas novas. Agora aparece "Carregando…" até as linhas chegarem.
2. **Ajustes de teste:** alguns testes liam o valor antes de a tela terminar de atualizar. Agora esperam o resultado certo. Um teste antigo confundia o filtro "Plataforma" com a nova opção "Separar por plataforma", e isso também foi corrigido.

## 5. Como testar manualmente

> Os números aparecem depois que a sincronização buscar os dados (Etapa 16).

1. Abra o **Dashboard** e role até **Evolução**.
2. Passe o mouse sobre a linha e veja a data e o valor.
3. Troque a **Métrica** (por exemplo, CPL).
4. Clique em **Semanal** e depois em **Mensal**.
5. Marque **Separar por plataforma**.
6. Clique em **Ver tabela**.
7. Mude o cliente ou o período nos filtros do topo: o gráfico acompanha.

### Resultado esperado
Um gráfico claro que mostra a evolução do número escolhido, com os valores exatos ao passar o mouse e sem nenhum número inventado.

## 6. Arquivos

**Criados**
```
supabase/migrations/20260925050000_dashboard_timeseries.sql
supabase/tests/etapa11_timeseries.sql
packages/shared/src/metrics/series.ts (+ teste)             → métricas do gráfico, semanas e meses
apps/web/src/components/charts/scale.ts (+ teste)           → escala e marcações dos eixos
apps/web/src/components/charts/TimeSeriesChart.tsx          → o gráfico de linha
apps/web/src/features/dashboard/ChartsSection.tsx           → área "Evolução" do Dashboard
apps/web/src/features/dashboard/chartLabels.ts (+ teste)    → datas dos eixos e do tooltip
apps/web/e2e/charts.mjs
```

**Modificados**
```
packages/shared/src/index.ts
apps/web/src/lib/format.ts (+ teste)                        → números curtos no eixo (ex.: 1,2 mil)
apps/web/src/features/dashboard/{api.ts,DashboardPage.tsx}  → busca a série; mostra a área Evolução
apps/web/src/components/data/MetricsTable.tsx               → "Carregando…" ao trocar de página
apps/web/src/features/{campaigns/CampaignsPage,structure/EntityDetailPage}.tsx
apps/web/e2e/{support,dashboard,campaigns}.mjs, apps/web/package.json, README.md
```
