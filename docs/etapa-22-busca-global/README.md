# ETAPA 22 — Busca global

> Status: **concluída e testada**, aguardando sua validação.

## 1. O que fizemos (explicado de forma simples)

Um **campo de busca no topo de todas as páginas**. Você digita e ele acha, na hora:

- **Clientes**: pelo nome, pelo nome da empresa ou pelo CNPJ;
- **Contas de anúncio** (Meta e Google): pelo nome ou pelo ID da conta (com ou sem `act_`);
- **Campanhas**, **conjuntos/grupos** e **anúncios**: pelo nome ou pelo ID da plataforma.

Exemplo pedido: digitar **"Excalibur"** mostra:
- o **cliente** Excalibur, já com atalhos para o **Dashboard**, o **Meta Ads**, o **Google Ads**, as **Campanhas** e os **Relatórios** dele;
- as **contas** Meta e Google;
- as **campanhas**, os **conjuntos** e os **anúncios** com esse nome.

Cuidados:
- **Acentos e maiúsculas não importam**: "promocao" acha "Promoção".
- **Pedaço do nome também serve**: "calibur" acha "Excalibur".
- Cada pessoa **só acha o que já pode ver**. O perfil **cliente** não tem busca.
- Até **5 resultados de cada tipo**, com o nome do cliente, da plataforma e de onde o item fica.

Como abrir a busca: clique em **Buscar…** no topo, aperte **Ctrl+K** (⌘K no Mac) ou a tecla **/**.
Dentro dela: **↑ ↓** para escolher, **Enter** para abrir e **Esc** para fechar.

## 2. Por que fizemos

Com dezenas de clientes e milhares de campanhas e anúncios, achar algo pelo menu leva vários cliques. Com a busca, basta digitar parte do nome.

## 3. Banco de dados (nenhuma tabela nova)

| O quê | Para quê |
|---|---|
| Extensões `unaccent` e `pg_trgm` | Ignorar acentos e achar pedaços de texto rapidamente |
| Função `private.search_norm` | Deixa o texto minúsculo e sem acento (o mesmo para busca e índice) |
| 6 índices de busca por trecho | Nomes de clientes (e empresa), contas, campanhas, conjuntos e anúncios |
| 4 índices por ID da plataforma | Colar o ID de uma conta, campanha, conjunto ou anúncio |
| Função `public.global_search(texto, limite)` | A busca em si. Roda com a permissão de quem pergunta; perfil cliente e usuário desativado recebem vazio |

Nada é apagado nem alterado: os índices só aceleram a leitura.
Com os dados reais (14.645 anúncios), a busca responde em cerca de **9 milissegundos**.

## 4. Arquivos

| Arquivo | Para que serve |
|---|---|
| `supabase/migrations/20260925110000_global_search.sql` | Extensões, índices e a função de busca |
| `supabase/tests/etapa22_search.sql` | Teste no banco (acentos, IDs, CNPJ, limites, permissões) |
| `apps/web/src/features/search/logic.ts` (+ teste) | Para onde cada resultado leva, textos e atalhos do cliente |
| `apps/web/src/features/search/api.ts` | Pergunta ao banco (só depois de a pessoa parar de digitar) |
| `apps/web/src/features/search/GlobalSearch.tsx` | Botão no topo e janela de busca |
| `apps/web/src/lib/useDebouncedValue.ts` | Espera a pessoa parar de digitar antes de buscar |
| `apps/web/src/components/layout/AppLayout.tsx` | Coloca a busca no topo |
| `apps/web/e2e/search.mjs` | Teste de navegador desta etapa |

## 5. Testes

- **Banco** (`etapa22_search.sql`): passou. Cobre "excalibur" achando "Excálibur"; contas Meta e Google; conta desvinculada que não aparece; "promocao de verao"; pedaço do nome; ID de campanha; ID de conta com `act_`; CNPJ com pontuação; nome da empresa; limite de 5 e máximo de 20; 1 letra não busca; `%` e `_` tratados como texto; gestor não acha cliente não liberado; perfil cliente, usuário desativado e visitante sem login não acham nada.
- **Navegador** (`search.mjs`): 30 verificações, entre elas Ctrl+K, a tecla /, as setas, Enter, Esc, cada tipo de resultado abrindo a página certa, atalhos do cliente, celular e perfis visualizador e cliente.
- **Todos os testes de navegador**: 586 verificações passando.
- **Testes automáticos**: 88 (site) + 84 (regras compartilhadas); verificação de tipos e build sem erros.
- **Segurança do banco**: sem avisos novos.

## 6. Como testar você mesmo

1. Em qualquer página, aperte **Ctrl+K** (ou clique em **Buscar…** no topo).
2. Digite o nome de um cliente, por exemplo **Shineray**.
3. Veja o cliente, com os atalhos, e as contas, campanhas e anúncios dele.
4. Clique em **Relatórios**: abre a página de relatórios já filtrada nesse cliente.
5. Teste sem acento e só com um pedaço do nome.

## 7. Resultado esperado

Achar qualquer cliente, conta, campanha ou anúncio em segundos, de qualquer página.
