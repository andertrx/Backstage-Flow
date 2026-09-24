# ETAPA 9 — Campanhas

> Status: **concluída e testada**, aguardando sua validação.

## 1. O que fizemos (explicado de forma simples)

O item **Campanhas** do menu agora abre uma tabela com **todas as campanhas** e os números do período escolhido:

| Campanha | Plataforma | Objetivo | Status | Orçamento | Gasto | Impressões | Alcance | Frequência | Cliques | CTR | CPC | CPM | Leads | Mensagens | Conversões | CPL | CPA | ROAS |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|

**Recursos:**
- **Ordenar por qualquer coluna:** clique no título. Clicar de novo inverte a ordem, e a seta mostra o sentido.
- **Pesquisar:** por nome da campanha, nome do cliente ou ID da campanha.
- **Filtros rápidos:** Todas, Ativa, Pausada, Encerrada (inclui as arquivadas) e Com erro.
- **Mesmos filtros do Dashboard:** período, cliente, plataforma e conta.
- **50 campanhas por página**, com "Anterior" e "Próxima".
- **Tudo fica no endereço da página:** recarregar mantém a pesquisa, a ordem e os filtros, e dá para mandar o link.
- **Nome da campanha fixo à esquerda:** a tabela é larga e rola para o lado dentro da caixa (no computador e no celular).
- **Objetivos em português:** "Cadastros (leads)", "Vendas", "Pesquisa", "Performance Max"...

## 2. Por que assim

- **Ordenação, pesquisa e paginação no banco:** mesmo com milhares de campanhas, o site só recebe as 50 da página. Fica rápido.
- **Nada inventado:** quando não há número, a célula mostra **"—"**. Passando o mouse, aparece o motivo:
  - *"Sem dados no período."* (a campanha não rodou no período);
  - *"Informação não disponível pela API."* (ex.: o Google Ads não informa mensagens);
  - CPL com zero leads, ou CTR sem impressões, não é calculado (não existe divisão por zero).
- **Alcance e frequência honestos:** alcance é "pessoas únicas" e **não pode ser somado dia a dia**, porque a mesma pessoa contaria várias vezes.
  Ele só aparece quando a plataforma informa o alcance do **período exato** escolhido.
- **Moedas:** cada campanha aparece na moeda da sua conta. Se houver moedas diferentes, um aviso explica
  que não há conversão e que a ordenação compara os números sem converter.
- **Mesma regra de cálculo** do Dashboard (CTR, CPC, CPM, CPL, CPA, ROAS).

## 3. O que mudou no banco

**Nenhuma tabela nova.** Só uma consulta nova, `campaign_table`:
- recebe período, filtros, pesquisa, coluna de ordenação, sentido e página;
- devolve a página já calculada e o total;
- recusa uma ordenação fora da lista e uma página maior que 200;
- trata "%" e "_" digitados na pesquisa como texto comum;
- roda **com a permissão de quem pergunta**: o gestor só vê as campanhas dos clientes liberados.

## 4. Testes realizados

| Teste | Resultado |
|---|---|
| **Banco** (`supabase/tests/etapa09_campaigns.sql`) | ✅ |
| ↳ ordem padrão; taxas iguais às do código compartilhado | ✅ |
| ↳ alcance só no período exato; zero leads não gera CPL; campanha sem dados não vira zero | ✅ |
| ↳ filtros de status; pesquisa por nome, cliente e ID ("%" e "_" como texto) | ✅ |
| ↳ ordenação por várias colunas; paginação; entradas inválidas recusadas | ✅ |
| ↳ gestor limitado ao cliente liberado; visitante sem login bloqueado | ✅ |
| **Textos e estado da tabela:** compartilhado 52 testes, site 43 testes | ✅ |
| **Navegador:** 41 verificações novas | ✅ |
| ↳ todas as colunas e valores, "—" com motivo, moedas, ordenação acessível, páginas | ✅ |
| ↳ pesquisa por nome e ID, cada filtro, filtros preservam a pesquisa, recarregar, celular, lista vazia | ✅ |
| **Navegador:** as 177 verificações anteriores continuam passando | ✅ |

**Problemas encontrados e corrigidos**
1. **Filtros apagavam a pesquisa:** trocar o período ou o cliente apagava a pesquisa e o status escolhidos na tabela.
   Agora os filtros preservam esses valores e só voltam para a página 1.
2. **Ordenação com moedas diferentes:** o teste mostrou que uma campanha em US$ 1,00 fica acima de uma em R$ 0,80
   (os números são comparados sem conversão). Isso é o esperado, e a tela agora avisa com uma mensagem.
3. O teste antigo de "página em construção" usava a página Campanhas. Agora usa Relatórios (Etapa 18).

## 5. Como testar manualmente

> As campanhas aparecem depois que a sincronização buscar a estrutura das contas (Etapa 16).
> Até lá, a tela mostra *"Nenhuma campanha ainda."*.

1. Clique em **Campanhas** no menu.
2. Clique no título **Gasto** e depois em **CPL**: a ordem muda e a seta indica o sentido.
3. Digite parte de um nome na pesquisa.
4. Clique em **Pausada**, **Encerrada** e **Com erro**.
5. Troque o **Período** e o **Cliente**: a pesquisa continua.
6. Passe o mouse sobre um "—" para ver o motivo.

### Resultado esperado
Uma tabela completa, ordenável e pesquisável, sem nenhum número inventado.

## 6. Arquivos

**Criados**
```
supabase/migrations/20260925030000_campaign_table.sql
supabase/tests/etapa09_campaigns.sql
packages/shared/src/campaigns/labels.ts (+ teste)        → status e objetivos em português
apps/web/src/features/campaigns/CampaignsPage.tsx         → a tela
apps/web/src/features/campaigns/columns.tsx               → colunas, formatos e motivos do "—"
apps/web/src/features/campaigns/table.ts (+ teste)        → ordenação, pesquisa e página no endereço
apps/web/src/features/campaigns/{api,types}.ts, CampaignStatusBadge.tsx
apps/web/e2e/campaigns.mjs
```

**Modificados**
```
apps/web/src/features/dashboard/FiltersBar.tsx            → opção sem os campos de campanha
apps/web/src/features/dashboard/{filters,useDashboardFilters}.ts (+ teste) → filtros preservam a pesquisa
apps/web/src/app/router.tsx, components/layout/navigation.ts → rota /campanhas
apps/web/e2e/{support,smoke}.mjs, apps/web/package.json
packages/shared/src/index.ts, README.md
```
