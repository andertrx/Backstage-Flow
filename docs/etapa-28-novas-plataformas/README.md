# ETAPA 28 — Preparação para novas plataformas

> Status: **concluída e validada** ✅

## 1. O que fizemos (explicado de forma simples)

Deixamos o sistema **pronto para receber** TikTok Ads, LinkedIn Ads, Pinterest Ads ou outra plataforma no futuro. **Nenhuma integração nova foi criada**, como o roteiro pede. Nada muda na tela.

Pense no sistema como uma casa com duas tomadas (Meta e Google). Arrumamos a fiação para que a próxima tomada seja só **encaixar**, sem quebrar parede.

| Camada | Antes | Agora |
|---|---|---|
| **Banco de dados** | Já pronto: plataforma é uma **linha** na tabela `platforms` | Conferido por teste: todas as 10 colunas de plataforma apontam para essa tabela; nenhuma lista fixa |
| **Servidor** | Já tinha a "tomada universal" (adaptador por plataforma) | Teste garante que servidor e site conhecem **as mesmas** plataformas, e que cada adaptador cumpre o contrato |
| **Site** | "Meta" e "Google" escritos em cerca de 15 telas | **Catálogo único** de plataformas; menu, telas, filtros, busca, saldos e contas leem dele |
| **Proteção** | — | Teste automático **falha** se alguém voltar a escrever "meta"/"google" fixo numa tela |

### O catálogo único (`packages/shared/src/platforms/catalog.ts`)
Cada plataforma tem uma "ficha" com tudo o que muda de uma para outra:
- nome e endereço da tela (ex.: "Meta Ads", `/meta-ads`);
- como mostrar o ID da conta (`act_123…` no Meta, `123-456-7890` no Google);
- nome do nível do meio (Conjunto no Meta, Grupo no Google);
- agrupador de contas (Business Manager, MCC);
- o que a plataforma oferece (alcance, leads, mensagens, páginas, conta administradora);
- dinheiro da conta ("saldo" ou "orçamento");
- indicadores da tela e resultado principal.

Uma plataforma **desconhecida** nunca quebra a tela: aparece com o próprio nome técnico e com visual neutro.

## 2. Por que fizemos
Sem isso, cada plataforma nova exigiria mexer em muitas telas, com risco de esquecer alguma e de quebrar Meta e Google. Agora o trabalho fica concentrado em poucos lugares e os testes apontam o que faltar.

## 3. Banco de dados
**Nenhuma tabela nova e nenhuma alteração.** A tabela `public.platforms` (Etapa 2) já foi criada para isso. O teste `supabase/tests/etapa28_platforms.sql` comprova, sem gravar nada, que:
- só Meta e Google estão ativas;
- toda coluna de plataforma está ligada à tabela `platforms`;
- não há tipo fixo (enum) com nome de plataforma;
- uma plataforma de teste inserida só como linha já aceita conexão, conta e números;
- plataforma inexistente ou com nome fora do padrão é recusada.

## 4. Guia: como plugar uma plataforma nova no futuro
Exemplo: TikTok Ads. **Só fazer quando você pedir.**

1. **Banco:** migração com `insert into public.platforms (id, name, sort_order) values ('tiktok', 'TikTok Ads', 3);`.
   - Se a plataforma informar saldo de outro jeito, acrescentar o novo tipo em `account_snapshots.available_basis`.
2. **Servidor:** criar `supabase/functions/_shared/platforms/tiktok/` com o adaptador (mesmo contrato de `adapter.ts`: validar credencial, listar contas, saldo, estrutura, números diários) e registrar em `registry.ts`.
   - Credenciais **só no Vault / segredos do servidor**.
   - Sempre pela **API oficial**.
3. **Conexão:** no `ad-accounts`, o jeito de conectar (token ou login OAuth); no site, um cartão em `features/integrations/` registrado em `IntegrationsPage.tsx`.
4. **Catálogo:** uma ficha em `catalog.ts` e, se quiser, ícone e cor em `features/platforms/look.ts`.
   - O menu ganha o item "TikTok Ads" logo após "Google Ads" (grupo Anúncios).
   - Dashboard, filtros, busca, relatórios, alertas e histórico passam a incluir a plataforma.
5. **Testes:** rodar tudo.
   - Os testes da Etapa 28 avisam se faltar o adaptador, a ficha ou a linha no banco.

Regras que continuam valendo: nunca inventar dado ("Informação não disponível pela API."), moedas nunca somadas e fuso de cada conta respeitado.

## 5. Arquivos
- `packages/shared/src/platforms/catalog.ts` (novo) e `catalog.test.ts`.
  - Substitui `accounts/format.ts` e a lista `PLATFORM_LABELS` antiga.
- Site:
  - `features/platforms/look.ts` (novo, ícone e cor) e `features/platforms/logic.ts` (telas a partir do catálogo);
  - `navigation.ts` e `router.tsx` (menu e rotas a partir do catálogo);
  - filtros, Alertas, Saldo, Contas do cliente, Integrações e Busca.
- `features/platforms/architecture.test.ts` (novo): impede "meta"/"google" fixo nas telas.
- Servidor: `_shared/platforms/registry.ts` e `registry_test.ts` (novo).
- Banco: `supabase/tests/etapa28_platforms.sql` (novo).

## 6. Testes
| Teste | Resultado |
|---|---|
| Catálogo (ids, ordem, indicadores, plataforma desconhecida) | ✅ 97 testes compartilhados |
| Site, incluindo o teste de arquitetura e a ordem do menu inalterada | ✅ 126 testes |
| Servidor: catálogo = adaptadores; contrato comum | ✅ 70 testes |
| Banco: plataforma nova só com uma linha | ✅ PASSOU (nada gravado) |
| Todas as 26 suítes de navegador (Meta e Google funcionando igual) | ✅ |
| Build e varredura de segredos | ✅ |

## 7. Como testar você mesmo
Nada muda visualmente. Confira que:
1. O menu continua: Dashboard, Clientes, Contas, **Meta Ads, Google Ads**, Campanhas, Relatórios, Alertas, Sincronização, Logs, Configurações.
2. As telas Meta Ads e Google Ads, Contas do cliente, Saldo, Alertas e a Busca mostram o mesmo de antes.

## 8. Resultado esperado
Tudo igual para você. Por dentro, adicionar uma plataforma nova passa a ser um trabalho pequeno, guiado e protegido por testes.
