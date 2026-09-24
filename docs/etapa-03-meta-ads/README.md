# ETAPA 3 — Integração com o Meta Ads

> Status: **concluída e testada**, aguardando sua validação manual.
> Para usar com contas reais, falta **um token do Meta** (item 7).

## 1. O que fizemos (explicado de forma simples)

Construímos a **ponte oficial** entre o sistema e o Meta Ads:

1. **Conectar:** o administrador cola o token de um "usuário do sistema" do Business Manager.
   O sistema confirma com o Meta que o token funciona e guarda o token num **cofre
   criptografado**. Depois de salvo, nem a tela nem os usuários conseguem vê-lo de novo.
2. **Vincular:** na página de cada cliente, o botão **Vincular conta** pergunta ao Meta
   quais contas de anúncio o token enxerga. Você escolhe as contas daquele cliente.
3. **Guardar:** para cada conta vinculada, o sistema grava nome, ID, **moeda**, **fuso horário**,
   **status**, **Business Manager**, **páginas** e **perfis do Instagram**.
4. **Preparar a sincronização:** cada conta ganha uma ficha de sincronização, que a Etapa 16 usará para buscar os números automaticamente.

A **tomada universal** (adaptador) foi criada aqui. O Google (Etapa 4) e as futuras
plataformas (TikTok, LinkedIn...) vão encaixar no mesmo lugar.

## 2. Por que assim

- **Só a API oficial** (Marketing API / Graph API). Nada de copiar dados de telas.
- **Versão da API:** usamos a **v26.0**, a atual. A v23.0 parou de funcionar em junho de 2026.
  Como cada versão dura cerca de um ano, a versão é configurável sem mexer no código.
- **Token no cofre:** o token dá acesso às contas de anúncio. Por isso ele nunca passa pelo
  navegador depois de salvo, nunca vai para logs e fica criptografado no **Supabase Vault**.

## 3. O que o sistema busca no Meta

| Informação | Onde vem na API oficial |
|---|---|
| Quem é o dono do token | `GET /me` |
| Contas de anúncio acessíveis | `GET /me/adaccounts` |
| Nome, moeda, fuso, status, motivo de bloqueio, pré-paga, Business Manager | campos `name`, `currency`, `timezone_name`, `account_status`, `disable_reason`, `is_prepay_account`, `business` |
| Páginas e Instagram | `GET /act_{id}/promote_pages` com `instagram_business_account` |

### Status da conta (tradução)

| Código do Meta | Significado | No sistema |
|---|---|---|
| 1 | ACTIVE | Ativa |
| 2 | DISABLED | Desativada |
| 3 | UNSETTLED | Pagamento pendente |
| 7 | PENDING_RISK_REVIEW | Restrita (em análise) |
| 8 | PENDING_SETTLEMENT | Pagamento pendente |
| 9 | IN_GRACE_PERIOD | Atenção |
| 100 / 101 | PENDING_CLOSURE / CLOSED | Atenção / Encerrada |
| qualquer outro | — | **Status desconhecido (código X)**. Nada é inventado |

O código original do Meta é guardado ao lado (ex.: `account_status=3`), para auditoria.

## 4. Tabelas criadas

| Tabela | Para que serve | Quem pode ver |
|---|---|---|
| `platform_connections` | Cada conexão (ex.: "BM da agência"), com status (ativa, com erro, desconectada), última verificação e último erro. **O token não fica aqui.** | Admin e gestor (sem a coluna que aponta para o cofre) |
| `ad_accounts` | Contas vinculadas a clientes: plataforma, ID, moeda, fuso, status, Business Manager | Quem pode ver o cliente |
| `ad_account_assets` | Páginas e perfis do Instagram de cada conta | Quem pode ver o cliente |
| `sync_state` | Estado de sincronização de cada conta (usado na Etapa 16) | Quem pode ver o cliente |
| **Supabase Vault** | O token, criptografado | **Somente o servidor** |

Regras importantes:
- **O site só lê.** Conectar, vincular, atualizar e desvincular passam pelo servidor, que confere a permissão.
- **Uma conta só pode estar vinculada a um cliente por vez.**
- **Desvincular não apaga nada.** A conta fica marcada com a data do desvínculo e o histórico continua disponível.
- Toda mudança vai para a **auditoria**, com o autor.
- Se o Meta recusar o token, a conexão é marcada automaticamente como **"Com erro"**, com a explicação.

## 5. Quem pode fazer o quê

| Ação | Admin | Gestor | Operador / Visualizador / Cliente |
|---|---|---|---|
| Conectar / desconectar o Meta | ✅ | ❌ | ❌ |
| Ver as conexões (sem o token) | ✅ | ✅ | ❌ |
| Vincular, atualizar, desvincular contas | ✅ | ✅ nos clientes liberados | ❌ |
| Ver as contas vinculadas | ✅ | ✅ | ✅ nos clientes liberados |

## 6. Testes realizados

| Teste | Resultado |
|---|---|
| **Servidor real + API real do Meta:** token falso → o Meta recusou → mensagem amigável | ✅ |
| Servidor real: gestor tentando conectar (bloqueado), visualizador tentando listar contas (bloqueado), conexão inexistente, cliente sem acesso, ID malicioso (`../me`) | ✅ |
| Servidor real: conexão marcada "Com erro" automaticamente e auditoria com o autor | ✅ |
| Cofre: token guardado criptografado, lido só pelo servidor, apagado ao desconectar | ✅ |
| Banco: 16 verificações de permissão (visualizador, cliente, gestor), conta duplicada, histórico no desvínculo, coluna do cofre invisível | ✅ |
| Adaptador Meta: 10 testes (status, campos ausentes, páginas e Instagram, paginação, assinatura `appsecret_proof`, erros) | ✅ |
| Navegador: 21 verificações novas (conectar, token inválido, vincular, atualizar, desvincular, visualizador). **Total com as etapas anteriores: 56** | ✅ |
| Supabase Advisor (segurança) | ✅ Nenhum aviso |

**Problemas encontrados e corrigidos**
1. **Validação de identificadores rígida demais e em inglês:** o servidor recusava alguns
   identificadores válidos com a mensagem "Invalid UUID". Agora aceita todos os formatos válidos e responde
   "Identificador inválido." Corrigido nas duas funções do servidor.
2. **Acessibilidade:** as janelas tinham dois botões chamados "Fechar". O "X" agora se chama "Fechar janela".
3. **Ícone do Instagram:** a biblioteca de ícones não tem mais logotipos de marcas. Usamos um ícone
   genérico com o rótulo "Instagram".

Todos os dados de teste foram apagados do banco.

## 7. O que você precisa fazer para conectar contas reais

### 7.1 Gerar o token (no Meta)
1. Entre no **Meta Business Suite** da agência → **Configurações do negócio** → **Usuários** → **Usuários do sistema**.
2. **Adicionar** → nome "Backstage Flow" → função **Funcionário** (ou Administrador).
3. **Atribuir ativos** → **Contas de anúncios** → marque as contas dos clientes com permissão de **visualização**.
   Faça o mesmo com as **Páginas**, se quiser ver o Instagram vinculado.
4. **Gerar novo token** → escolha o **app** da agência → marque `ads_read` e `business_management`
   (e, se quiser páginas e Instagram, também `pages_show_list` e `instagram_basic`) → gere e **copie**.
   - Não tem um app? Em **developers.facebook.com → Meus apps → Criar app**, tipo **Empresa**, ligado ao seu Business Manager.
   - Para acessar contas de **outros** Business Managers (de clientes), o Meta pode exigir
     **verificação da empresa** e **App Review**. Para contas do **seu próprio BM** isso não é necessário.

### 7.2 Colar no sistema
**Configurações → Integrações → Meta Ads** → cole o token → **Conectar Meta**.

### 7.3 (Recomendado) App Secret no servidor
No painel do Supabase: **Edge Functions → Secrets → Add new secret**:
- `META_APP_SECRET` = o "Chave secreta do app" (em developers.facebook.com → seu app → Configurações → Básico).

Com ele, toda chamada ao Meta vai **assinada** (`appsecret_proof`). É uma proteção extra recomendada
pelo próprio Meta. Opcional: `META_GRAPH_VERSION` troca a versão da API sem mexer no código.

## 8. Como testar manualmente

1. **Configurações → Integrações**: aparece o cartão **Meta Ads**, com o passo a passo.
2. Cole um texto qualquer como token → aparece **"O token do Meta é inválido ou expirou"**.
3. Cole o **token real** → aparece **"Conectado como ..."** e a conexão fica **Ativa** na lista.
   O campo do token fica vazio de novo.
4. **Clientes → (um cliente) → Contas Meta Ads → Vincular conta**: aparecem as contas que o token enxerga, com status.
5. Clique em **Vincular** na conta do cliente. A ficha mostra ID, moeda, fuso, Business Manager, páginas e Instagram.
6. Abra **Vincular conta** de novo: a conta aparece como **"Já vinculada aqui"**.
   Em outro cliente, ela aparece como **"Vinculada a outro cliente"**.
7. **Atualizar** busca os dados de novo no Meta. **Desvincular** remove a conta da ficha, mas o histórico fica guardado.
8. Entre como **visualizador**: ele vê as contas do cliente liberado, sem os botões de vincular, atualizar e desvincular.

### Resultado esperado
Cada cliente mostra suas contas Meta com dados **vindos do Meta**. Quando o Meta não informa algo, aparece
**"Informação não disponível pela API."** O token nunca aparece na tela.

## 9. O que fica para as próximas etapas

- **Números (investimento, leads, CPL...):** chegam com a sincronização (Etapas 5 e 16).
- **Saldo e cobrança:** Etapa 7. Lembrete do planejamento: o **saldo pré-pago disponível não
  existe como campo na API**, e o sistema vai mostrar "Informação não disponível pela API.".
- **Atualização automática do status das contas:** Etapa 16. Hoje ela acontece no vínculo e no botão **Atualizar**.

## 10. Arquivos

**Criados**
```
supabase/migrations/20260924020000_ad_accounts_meta.sql
supabase/tests/etapa03_rls_ad_accounts.sql
supabase/functions/ad-accounts/index.ts                    → conectar, listar, vincular, atualizar, desvincular
supabase/functions/_shared/platforms/types.ts              → formato comum às plataformas
supabase/functions/_shared/platforms/adapter.ts            → "tomada universal"
supabase/functions/_shared/platforms/registry.ts           → plataformas disponíveis
supabase/functions/_shared/platforms/meta/config.ts        → versão da API, App Secret
supabase/functions/_shared/platforms/meta/client.ts        → chamadas HTTP, appsecret_proof, erros
supabase/functions/_shared/platforms/meta/mapping.ts       → tradução de campos e status
supabase/functions/_shared/platforms/meta/adapter.ts
supabase/functions/_shared/platforms/meta/meta_test.ts     → 10 testes
packages/shared/src/accounts/status.ts                     → nomes de status e plataformas
apps/web/src/features/ad-accounts/                         → contas do cliente, janela de vínculo
apps/web/src/features/integrations/                        → Configurações → Integrações
apps/web/src/features/settings/SettingsLayout.tsx          → abas Usuários | Integrações
apps/web/e2e/meta.mjs                                      → teste de navegador desta etapa
```

**Modificados**
```
supabase/functions/_shared/auth.ts          → verificação por papel + consulta "com o crachá do usuário"
supabase/functions/admin-users/index.ts     → validação de identificador em português
apps/web/src/app/router.tsx                 → Configurações com abas
apps/web/src/features/clients/ClientDetailPage.tsx → seção real de contas Meta
apps/web/src/components/ui/badge.tsx        → cor de "atenção"
apps/web/src/components/ui/modal.tsx        → botão "Fechar janela"
apps/web/e2e/support.mjs, clients.mjs       → simulação do Meta e ajuste do teste
package.json                                → npm run test:functions / check:functions
```
