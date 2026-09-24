# ETAPA 18 — Relatórios

> Status: **concluída e testada**, aguardando sua validação.

## 1. O que fizemos (explicado de forma simples)

O item **Relatórios** do menu (antes "em breve") virou a área de relatórios.

1. **Escolha os filtros:** cliente, plataforma, conta, campanha, status e período. São os mesmos filtros do Dashboard.
2. **Confira a prévia** na tela.
3. **Baixe** em **CSV**, **Excel** ou **PDF**.

**O relatório tem três partes:**

| Parte | O que mostra |
|---|---|
| **Resumo** | Investimento, impressões, cliques, CTR, CPC, CPM, leads, CPL, mensagens, conversões, CPA, valor de conversão e ROAS, com o **período anterior** e a **variação** (+/−) |
| **Campanhas** | Uma linha por campanha, da que mais investiu para a que menos investiu: cliente, plataforma, conta, status e as métricas |
| **Dia a dia** | Os números de cada dia do período |

No alto do relatório aparecem os filtros usados e a data e hora em que ele foi gerado.

**Os três formatos:**
- **CSV:** abre direto no Excel ou no Google Planilhas em português. Os números vêm prontos para fazer contas (1234,56).
- **Excel (.xlsx):** um arquivo com 3 abas (Resumo, Campanhas, Dia a dia). Os números são de verdade, já formatados como dinheiro, porcentagem e "x".
- **PDF:** página deitada (A4), com tabelas coloridas e número de página. Bom para mandar ao cliente.

## 2. Por que assim

- **Moedas nunca se misturam:** com BRL e USD no mesmo filtro, cada moeda tem suas próprias tabelas. Nada é somado entre moedas nem convertido.
- **Nada inventado:**
  - campanha sem dados no período não entra no relatório;
  - número que a plataforma não informa aparece como "—" ou "Informação não disponível pela API.";
  - período sem dados mostra um aviso, e os botões de baixar ficam desligados.
- **Mesmas contas do Dashboard:** o relatório usa as mesmas funções do banco, então os números batem com a tela.
- **Tudo é gerado no seu navegador:** o arquivo não é guardado em nenhum servidor. Por isso **não foi criada nenhuma tabela nova** e não há arquivos antigos para apagar.
- **Quem pode:** administrador, gestor e operador geram relatórios, cada um só com os clientes liberados para ele. Visualizador e cliente não veem o item no menu. O relatório do cliente fica para a Etapa 19.
- **Leve:** as ferramentas do PDF só são carregadas quando você clica em **PDF**.

## 3. O que mudou no banco

**Nada.** Usamos as funções que já existiam: `dashboard_summary`, `dashboard_timeseries` e `campaign_table`.

## 4. Testes realizados

| Teste | Resultado |
|---|---|
| **Cálculos** (6 novos) | ✅ site 79 testes, compartilhado 83 testes |
| ↳ uma tabela por moeda e por parte; variação com sinal; motivo quando falta o valor | ✅ |
| ↳ CSV com números em português; Excel é um .xlsx válido, com 3 abas, números de verdade e porcentagem certa | ✅ |
| **Navegador:** 23 verificações novas | ✅ |
| ↳ prévia com resumo, campanhas (sem linha zerada inventada) e dia a dia; BRL e USD separados | ✅ |
| ↳ filtros de cliente e campanha | ✅ |
| ↳ CSV, Excel e PDF baixados e conferidos por dentro | ✅ |
| ↳ período sem dados: aviso e nada para baixar; operador gera; visualizador e cliente sem acesso; celular | ✅ |
| **Navegador:** as 493 verificações anteriores continuam passando (516 no total) | ✅ |

**Problemas encontrados e corrigidos**
1. **Títulos das colunas do PDF** ficavam à esquerda e os números à direita. Agora estão alinhados.
2. **Sinal "−" no PDF:** a fonte padrão do PDF não tem esse caractere. No PDF ele vira o hífen comum ("-").
3. **Tela:** "Informação não disponível pela API." ficava fora do alinhamento da coluna. Corrigido.

## 5. Como testar manualmente

1. No menu, clique em **Relatórios**.
2. Escolha o cliente **Shineray** e o período **Últimos 30 dias**.
3. Confira a prévia. Os números devem bater com o Dashboard com os mesmos filtros.
4. Clique em **CSV**, **Excel** e **PDF** e abra os três arquivos.
5. Se quiser, escolha uma **Campanha** e baixe de novo.

### Resultado esperado
Um relatório claro, em português, com os mesmos números do Dashboard, nas três versões: CSV, Excel e PDF.

## 6. Arquivos

**Criados**
```
apps/web/src/features/reports/ReportsPage.tsx   → a tela (filtros, prévia e botões)
apps/web/src/features/reports/model.ts          → monta as tabelas do relatório
apps/web/src/features/reports/export.ts         → CSV, Excel (.xlsx) e PDF
apps/web/src/features/reports/api.ts            → busca todas as campanhas do período
apps/web/src/features/reports/report.test.ts
apps/web/src/lib/download.ts                    → baixar arquivo e CSV (usado também nos Logs)
apps/web/e2e/reports.mjs
docs/etapa-18-relatorios/README.md
```

**Modificados**
```
apps/web/package.json                           → bibliotecas jspdf, jspdf-autotable e fflate (todas gratuitas, licença MIT)
apps/web/src/app/router.tsx, apps/web/src/components/layout/navigation.ts → /relatorios deixa de ser "em breve"
apps/web/src/features/logs/logic.ts, apps/web/e2e/smoke.mjs, README.md, docs/etapa-17-logs/README.md
```
