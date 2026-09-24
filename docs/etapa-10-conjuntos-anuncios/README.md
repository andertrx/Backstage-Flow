# ETAPA 10 — Conjuntos e Anúncios

> Status: **concluída e testada**, aguardando sua validação.

## 1. O que fizemos (explicado de forma simples)

Agora dá para **descer pela estrutura** das campanhas, como numa pasta com subpastas:

- **Meta:** Campanha → **Conjunto de anúncios** → Anúncio
- **Google:** Campanha → **Grupo de anúncios** → Anúncio

(Cada plataforma usa o seu próprio nome para o nível do meio, e o sistema segue esse nome.)

Na tela **Campanhas**, o nome da campanha virou um link. Cada página de detalhe tem:

| Parte | O que mostra |
|---|---|
| **Caminho no topo** | *Campanhas › Leads Setembro › Público Frio › Vídeo Depoimento*. Cada nome é clicável para voltar |
| **Cabeçalho** | Nome, status, plataforma e ID. Campanha: objetivo e orçamento. Conjunto/grupo: otimização e orçamento. Anúncio: tipo (vídeo, imagem...), **revisão** (aprovado, reprovado, em análise) e **miniatura** |
| **Período** | Hoje, ontem, 7/14/30 dias, mês atual ou anterior, personalizado. O período escolhido vai junto quando você navega |
| **Números do período** | Investimento, leads, mensagens, conversões, CPL, CPC, CPM, CTR e ROAS, com a comparação com o período anterior |
| **Itens de dentro** | Campanha → lista dos conjuntos/grupos. Conjunto/grupo → lista dos anúncios. Mesma tabela da tela Campanhas: ordenar por qualquer coluna, pesquisar, filtrar por status e navegar por páginas |
| **Histórico de alterações** | *"Orçamento: R$ 30,00 → R$ 50,00"*, *"Status: Pausada → Ativa"*, *"Revisão: Aprovado → Reprovado"*, com data e hora |

## 2. Por que assim

- **Uma página só para os três níveis:** a mesma tela serve para campanha, conjunto/grupo e anúncio. Isso garante o mesmo visual e as mesmas regras, e deixa a manutenção mais simples.
- **A mesma tabela da tela Campanhas:** foi transformada num componente único, reaproveitado. Uma melhoria feita num lugar vale para todos.
- **Mesmas regras de cálculo:** nada inventado. Sem dados aparece "—" com o motivo. O alcance só aparece quando é do período exato.
- **Histórico automático:** as mudanças de status, orçamento, nome e revisão são registradas pelo banco (tabela criada na Etapa 5).
- **Segurança:** o gestor só abre itens dos clientes liberados. Para qualquer outro endereço, aparece "Item não encontrado ou você não tem acesso a ele.".
- **Miniaturas:** só endereços seguros (`https`) são aceitos pelo banco, e a imagem é carregada sem enviar dados do painel.

## 3. O que mudou no banco

**Nenhuma tabela nova.**
- Consulta nova `entity_rows`: os números do período para campanhas, conjuntos/grupos ou anúncios.
  - Aceita os "filhos" de um item ou itens específicos.
  - **Nunca lista todos os anúncios de uma vez**: é obrigatório informar de quem são.
  - Recusa ordenações fora da lista.
  - Roda **com a permissão de quem pergunta**.
- **2 índices novos** (atalhos de busca) nas métricas diárias, por conjunto/grupo e por anúncio. Mantêm as páginas rápidas mesmo com muito histórico.

## 4. Testes realizados

| Teste | Resultado |
|---|---|
| **Banco** (`supabase/tests/etapa10_structure.sql`) | ✅ |
| ↳ conjuntos de uma campanha e anúncios de um conjunto, com todos os números | ✅ |
| ↳ resumo de cada nível; alcance do período exato; sem dados não vira zero | ✅ |
| ↳ filtros, pesquisa e ordenação | ✅ |
| ↳ recusa listar tudo sem filtro, campanha com "pai", nível inválido e ordenação arbitrária | ✅ |
| ↳ gestor não vê cliente não liberado; visitante sem login bloqueado | ✅ |
| **Textos** (conjunto x grupo, otimização, criativo, revisão, histórico) | ✅ |
| ↳ compartilhado 54 testes, site 46 testes | ✅ |
| **Navegador:** 35 verificações novas | ✅ |
| ↳ navegar campanha → conjunto → anúncio e voltar pelo caminho | ✅ |
| ↳ números, comparação, tipo, revisão, miniatura e histórico | ✅ |
| ↳ filtros, pesquisa e ordem dos filhos; período que acompanha a navegação | ✅ |
| ↳ nomes do Google; item sem dados; item inexistente; celular | ✅ |
| **Navegador:** as 218 verificações anteriores continuam passando | ✅ |

**Problemas encontrados e corrigidos**
1. **Tabela duplicada:** a tabela da tela Campanhas foi transformada num componente único, em vez de copiar o código para conjuntos e anúncios.
2. **Um campo "Conta" sem utilidade** que eu tinha colocado no cabeçalho foi removido antes da entrega.
3. **Ajustes de teste:** o teste esperava por textos que ainda estavam carregando (caminho e pesquisa). Agora espera o resultado certo.

## 5. Como testar manualmente

> Os conjuntos e anúncios aparecem depois que a sincronização buscar a estrutura (Etapa 16).

1. **Campanhas** → clique no nome de uma campanha.
2. Veja o cabeçalho, os números e a lista de **conjuntos** (Meta) ou **grupos** (Google).
3. Clique num conjunto/grupo → veja os **anúncios**, com tipo, revisão e miniatura.
4. Clique num anúncio → números dele e histórico.
5. Use o **caminho no topo** para voltar.
6. Troque o **período** e navegue: ele vai junto.

### Resultado esperado
Você desce e sobe pela estrutura inteira, com os números certos de cada nível e o histórico de mudanças.

## 6. Arquivos

**Criados**
```
supabase/migrations/20260925040000_entity_rows.sql
supabase/tests/etapa10_structure.sql
apps/web/src/components/data/MetricsTable.tsx              → tabela única (campanhas, conjuntos, anúncios)
apps/web/src/features/structure/EntityDetailPage.tsx        → página de detalhe dos três níveis
apps/web/src/features/structure/{api,types,changes}.ts (+ teste), PeriodPicker.tsx
apps/web/src/features/campaigns/links.ts                    → leva o período ao navegar
apps/web/e2e/structure.mjs
```

**Modificados**
```
packages/shared/src/campaigns/labels.ts (+ teste)           → conjunto x grupo, otimização, criativo, revisão
apps/web/src/features/campaigns/{CampaignsPage,columns,types,table}.ts(x) (+ teste) → usa a tabela única; nome vira link
apps/web/src/app/router.tsx                                 → /campanhas/:id, /conjuntos/:id, /anuncios/:id
apps/web/e2e/{support,campaigns}.mjs, apps/web/package.json, README.md
```
