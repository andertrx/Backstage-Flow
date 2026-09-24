# ETAPA 16 — Sincronização

> Status: **concluída e testada**, aguardando sua validação.

## 1. O que fizemos (explicado de forma simples)

Agora o sistema **busca os dados sozinho**, direto das APIs oficiais do Meta e do Google, e guarda tudo no histórico.

**A cada 1 hora, para cada conta vinculada, ele busca:**
1. **Saldo, status e cobrança** da conta (como o botão da Etapa 7);
2. **Estrutura:** campanhas, conjuntos/grupos e anúncios (nome, status, orçamento, objetivo, criativo);
3. **Métricas de cada dia:** investimento, impressões, cliques, cliques no link, leads, mensagens, conversões e valor de conversão, nos níveis conta, campanha, conjunto/grupo e anúncio;
4. **Alcance** (só no Meta): para os períodos prontos do painel (hoje, ontem, 7, 14, 30 dias, este mês, mês passado…) e para os períodos de comparação. O alcance não pode ser somado dia a dia, por isso é buscado já pronto para cada período.

Depois de cada sincronização, os **alertas** são verificados de novo.

**A tela Sincronização** (no menu, antes "em breve") mostra:
- **Última sincronização** e **Próxima sincronização**;
- o botão **SINCRONIZAR AGORA** (todas as contas) e um botão **Sincronizar** em cada conta;
- para cada conta: situação (**Sucesso**, **Erro**, **Sincronizando…**, **Aguardando a primeira**), **última tentativa**, último sucesso, próxima, **registros atualizados**, **duração** e o erro, em português simples;
- o **histórico de sincronizações** (o log): início, conta, cliente, origem (automática ou manual), resultado, registros, duração e erro.

## 2. Por que assim

- **Nada inventado:** só entra o que a API devolve. Se a plataforma não informa uma métrica, ela fica vazia. O Google não informa alcance, leads nem mensagens, então esses campos ficam vazios nas contas Google.
- **Primeira sincronização:** busca os **últimos 30 dias**. **As seguintes:** os **últimos 7 dias**, porque as plataformas corrigem conversões atrasadas por alguns dias. A data segue o **fuso horário da conta**.
- **Intervalo:** 1 hora depois de um sucesso. Depois de um erro, uma nova tentativa acontece em **30 minutos**.
- **Nunca em dobro:** cada conta fica "travada" enquanto sincroniza. Dois pedidos ao mesmo tempo não duplicam nada.
- **Uma conta com erro não atrapalha as outras.**
- **Token expirado ou conexão cancelada:** a conexão é marcada com erro, e aparece o aviso para conectar de novo.
- **Contas de teste do Google** não entram na sincronização automática (dá para sincronizar manualmente).
- **Moedas:** cada métrica é gravada na moeda da própria conta. Nada é convertido.
- **Definições:**
  - **Leads (Meta)** = ação "lead" informada pelo Meta;
  - **Mensagens (Meta)** = conversas iniciadas;
  - **Conversões (Meta)** = compras;
  - **Conversões (Google)** = coluna "Conversões" da conta.
  - Tudo com a janela de atribuição configurada em cada conta.
- **Segurança:**
  - os tokens ficam no cofre e só são lidos no servidor (a função `sync`);
  - o site nunca vê um token;
  - o agendador do banco usa uma **senha interna** guardada no cofre;
  - sem ela, a função responde "Acesso negado";
  - só administrador, gestor e operador podem sincronizar manualmente, e só as contas dos clientes que podem ver;
  - o perfil cliente não vê o histórico.

## 3. O que mudou no banco

**Tabela nova `sync_runs`** (o log de sincronização; explicada antes de ser criada):

| Campo | Tipo | Para quê |
|---|---|---|
| id | número | Identificação |
| ad_account_id, client_id, platform_id | ligações | Conta, cliente e plataforma |
| trigger | texto | `agendada` (automática) ou `manual` |
| requested_by | pessoa | Quem clicou (vazio se automática) |
| status | texto | executando → sucesso ou erro |
| started_at, finished_at, duration_ms | data e hora, número | Início, fim e duração |
| date_from, date_to | data | Período buscado |
| records_updated | número | Registros gravados ou atualizados |
| details | JSON | Registros por parte (saldo, estrutura, métricas, alcance) |
| error_code, error_message | texto | Erro, em português simples |

- **Índices:** por conta + data, por cliente + data, por data, por plataforma e por quem pediu.
- **Guarda dos dados:** permanente. Nada é apagado automaticamente.
- **Funções:**
  - `sync_claim_due` escolhe as contas da vez e as trava;
  - `sync_lock` trava as contas pedidas no "Sincronizar agora";
  - `sync_cron_secret_ok` confere a senha interna;
  - `sync_overview` alimenta a tela (respeitando o que cada pessoa pode ver).
- **Agendamento:** `scheduled-sync` roda a cada 5 minutos, mas só chama a função quando alguma conta está na vez. Por conta, isso dá **1 vez por hora**.
- **Edge Function nova:** `sync`. As funções do servidor ganharam a busca de estrutura, métricas diárias e alcance para o Meta e o Google.

## 4. Testes realizados

| Teste | Resultado |
|---|---|
| **Banco** (`supabase/tests/etapa16_sync.sql`) | ✅ |
| ↳ escolhe só as contas da vez; deixa de fora a conta de teste, a conexão revogada, a conta sem conexão e a desvinculada | ✅ |
| ↳ conta travada não é escolhida duas vezes; "Sincronizar agora" pula a que já está rodando | ✅ |
| ↳ senha interna errada ou vazia é recusada; a certa é aceita | ✅ |
| ↳ gestor só vê os próprios clientes; cliente não vê o log; visitante bloqueado; ninguém grava no log pelo site | ✅ |
| ↳ agendamento de 5 minutos existe | ✅ |
| **Função no servidor (real, no Supabase)**: sem senha → "Acesso negado"; com senha → responde certo (nenhuma conta na vez) | ✅ |
| **Servidor (testes automáticos)**: 21 novos, 50 no total | ✅ |
| ↳ conversão das respostas do Meta e do Google: status, orçamentos, criativos, leads, mensagens, compras, valores | ✅ |
| ↳ ordem saldo → estrutura → métricas → alcance; próxima em 1 hora; erro → nova tentativa em 30 minutos | ✅ |
| ↳ 30 dias na primeira, 7 nas seguintes, no fuso da conta; token expirado marca a conexão; erro inesperado vira mensagem simples | ✅ |
| **Cálculos da tela** | ✅ compartilhado 78 testes, site 68 testes |
| **Navegador:** 32 verificações novas | ✅ |
| ↳ última e próxima sincronização; contagens; sucesso, erro, aguardando, conta de teste, sem conexão | ✅ |
| ↳ registros, duração e última tentativa; erro em português; histórico | ✅ |
| ↳ sincronizar uma conta; SINCRONIZAR AGORA (todas); log atualizado; próxima em 30 minutos depois de erro | ✅ |
| ↳ visualizador sem botões; perfil cliente sem acesso; tela vazia explicando o que fazer; celular | ✅ |
| **Navegador:** as 426 verificações anteriores continuam passando (458 no total) | ✅ |
| **Segurança** (verificador do Supabase) | ✅ só o aviso conhecido da senha vazada (ajuste no painel) |

**Problemas encontrados e corrigidos**
1. O arquivo empacotado da função tinha linhas longas demais e a ferramenta de envio cortava o conteúdo. Ele foi reorganizado em linhas menores antes do envio. O código-fonte continua organizado em `supabase/functions/`.

**Limite importante:** ainda **não há nenhuma conta do Meta ou do Google conectada** no sistema. Por isso a sincronização real com dados de verdade ainda não pôde ser vista. Todos os testes acima usam contas simuladas, e a função real no servidor foi chamada e respondeu certo.

## 5. Como testar manualmente

1. Vá em **Configurações → Integrações** e conecte o **Meta Ads** e/ou o **Google Ads**.
2. Em **Clientes**, vincule pelo menos uma conta de anúncio a um cliente.
3. No menu, clique em **Sincronização**.
4. Espere até 5 minutos (a primeira acontece sozinha) ou clique em **SINCRONIZAR AGORA**.
5. Veja a conta mudar para **Sucesso**, com registros atualizados e duração.
6. Abra o **Dashboard** e as **Campanhas**: os números dos últimos 30 dias devem aparecer.

### Resultado esperado
Os dados das contas atualizados sozinhos a cada hora. Na tela de Sincronização aparecem a última e a próxima sincronização, o resultado de cada conta e o histórico completo. Se der erro, aparece uma mensagem clara e uma nova tentativa em 30 minutos.

## 6. Arquivos

**Criados**
```
supabase/migrations/20260925080000_sync.sql                 → tabela sync_runs, funções, agendamento
supabase/tests/etapa16_sync.sql
supabase/functions/sync/index.ts                            → a função de sincronização
supabase/functions/_shared/sync/{runner.ts, store.ts, runner_test.ts}
supabase/functions/_shared/platforms/meta/sync.ts           → estrutura, métricas e alcance do Meta
supabase/functions/_shared/platforms/google/sync.ts         → estrutura e métricas do Google (GAQL)
supabase/functions/_shared/platforms/sync_test.ts
apps/web/src/features/sync/{SyncPage.tsx, api.ts, logic.ts, logic.test.ts}
apps/web/e2e/sync.mjs
docs/etapa-16-sincronizacao/README.md
```

**Modificados**
```
supabase/functions/_shared/platforms/{types.ts, adapter.ts, meta/adapter.ts, google/adapter.ts}
apps/web/src/app/router.tsx, apps/web/src/components/layout/navigation.ts → /sincronizacao deixa de ser "em breve"
apps/web/e2e/support.mjs, apps/web/package.json, README.md, docs/etapa-15-central-alertas/README.md
```

**Configuração no banco (dado, não código):** endereço das funções em `private.app_settings` (`functions_url`). A senha interna do agendador foi criada no cofre pela própria migração e não aparece em nenhum arquivo.

**Como a função foi publicada:** empacotada com `deno bundle` (bibliotecas `npm:` externas) em um único arquivo, e enviada ao Supabase como `sync` (sem verificação automática de login, porque ela mesma confere o login ou a senha interna).
