# ETAPA 26 — Segurança

> Status: **concluída e testada**, aguardando sua validação.

## 1. O que fizemos (explicado de forma simples)

Fizemos uma **auditoria completa** das camadas de proteção do sistema e reforçamos o que faltava. Cada item pedido na etapa:

| Item pedido | Como está | Novo nesta etapa? |
|---|---|---|
| **Autenticação** | Login do Supabase: senha mínima de 8 letras, sessão com renovação automática e login/logout registrados na auditoria | já existia |
| **Autorização / controle de acesso** | 5 papéis (administrador, gestor, operador, visualizador, cliente). O **banco** confere o papel e os clientes liberados em toda consulta, não só a tela | já existia (Etapa 20) |
| **"Regras Firestore"** (no nosso caso, RLS do Supabase) | **Todas as tabelas** têm regra de acesso por linha. Um visitante sem login não lê nenhuma tabela nem executa nenhuma função | reforçado + teste automático |
| **Proteção de credenciais** | Tokens do Meta e do Google ficam **só no cofre (Vault)**; nem o administrador logado consegue lê-los pelo site | já existia; agora testado |
| **Variáveis de ambiente** | O site só conhece 2 valores **públicos** (endereço e chave pública). As chaves secretas ficam só nos segredos do servidor | já existia; agora com varredura |
| **Validação de entrada** | Todo pedido ao servidor é conferido (formato, tamanho, ids) antes de qualquer ação; o banco também tem regras de formato | já existia |
| **Logs** | Auditoria (quem fez o quê), sincronizações e erros técnicos, sem tokens nem senhas | Etapas 17 e 25 |
| **Rate limiting (limite de requisições)** | Cada pessoa tem um limite por ação em 10 minutos. Passou? Mensagem: *"Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo."* | **novo** |
| **Proteção de endpoints** | Funções só aceitam quem está logado e com o papel certo. **CORS** restrito: só o site oficial pode chamá-las pelo navegador | **novo (CORS)** |
| **Tratamento de erros** | Mensagem amigável para a pessoa; detalhe técnico só no log | Etapa 25 |

### Limites de requisições (por pessoa, a cada 10 minutos)
| Ação | Limite |
|---|---|
| Sincronizar agora (inclui a atualização automática das telas) | 30 |
| Conectar/desconectar Meta ou Google | 10 |
| Verificar saldo | 30 |
| Outras ações de contas (vincular, atualizar, listar) | 120 |
| Gerenciar usuários | 30 |

Os limites ficam bem acima do uso normal: só barram abuso ou um robô usando uma sessão roubada. O login também tem o limite próprio do Supabase contra tentativas de senha.

### Proteções novas do site (cabeçalhos de segurança)
- **CSP (política de conteúdo):** o navegador só roda scripts do próprio site e só conversa com o nosso servidor. Um script "injetado" por um invasor é **bloqueado** (testado).
- **Contra clickjacking:** o site não pode ser aberto dentro de outro site.
- **HTTPS obrigatório (HSTS)**, janela isolada, sem acesso a câmera, microfone ou localização.

### Nunca expor (conferido)
| O quê | Onde fica | Conferência |
|---|---|---|
| Access tokens e refresh tokens (Meta/Google) | Cofre do banco (Vault) | teste do banco: nem usuário logado lê |
| Client secret do Google, App Secret do Meta | Segredos das Edge Functions | varredura: não estão no código nem no site |
| Chave secreta (service role) do Supabase | Segredos das Edge Functions | varredura + teste no navegador |
| Chaves privadas | não usamos nenhuma | varredura |

## 2. Por que fizemos
Um sistema com tokens de acesso às contas de anúncio de vários clientes precisa de **várias camadas**. Se uma falhar, as outras seguram: a tela esconde, o servidor confere, o banco bloqueia e o cofre guarda.

## 3. Banco de dados
Tabela nova **`private.rate_limits`** (explicada antes de criar):

| Campo | Tipo | Para quê |
|---|---|---|
| `bucket` | texto | qual ação (ex.: `sync.run`) |
| `subject` | ligação com o usuário | quem |
| `window_start` | data e hora | início da janela atual |
| `hits` | número | quantas vezes na janela |

- **Chave:** (ação, pessoa). **Uma linha por pessoa e ação**, sobrescrita a cada janela. Não cresce e não guarda histórico.
- **Schema `private`:** o site não enxerga; só o servidor usa (função `rate_limit_hit`).
- Reforço: nenhuma função interna pode ser executada por visitante sem login, nem hoje nem no futuro.
- Migração: `supabase/migrations/20260926100000_security_hardening.sql`.

## 4. Arquivos
- `supabase/functions/_shared/ratelimit.ts`: limite de requisições (se o contador falhar, o site continua funcionando e o problema vai para o log).
- `supabase/functions/_shared/http.ts`: CORS restrito (site oficial, versões de teste da Vercel e computador local; outros domínios via `ALLOWED_ORIGINS`).
- `sync`, `ad-accounts`, `admin-users`: limites aplicados.
- `apps/web/vercel.json`: cabeçalhos de segurança; `vite.config.ts` usa os mesmos nos testes.
- `scripts/check-secrets.mjs` (`npm run check:secrets`): procura tokens e chaves no código e no site gerado.
- Testes: `supabase/tests/etapa26_security.sql`, `apps/web/e2e/security.mjs`, `_shared/ratelimit_test.ts`.

## 5. Testes
| Teste | Resultado |
|---|---|
| **Auditoria automática do banco:** RLS em todas as tabelas, visitante sem acesso, funções privilegiadas só no servidor, search_path fixo, cofre fechado, limite de requisições | ✅ TODOS OS TESTES PASSARAM |
| Servidor (Deno): limite, CORS, erros | ✅ 67 testes |
| Site | ✅ 113 testes · Compartilhado ✅ 91 testes |
| Navegador — `security.mjs`: cabeçalhos, script injetado bloqueado, aviso do limite, nenhum segredo no navegador | ✅ 10 verificações |
| **Todas as 25 suítes de navegador rodando sob a CSP** (nenhum bloqueio indevido) | ✅ 668 verificações |
| Varredura de segredos (348 arquivos + 69 do site) | ✅ nenhum segredo (e detecta um segredo falso plantado) |
| **Produção:** cabeçalhos ativos no site oficial; sincronização automática funcionando com as novas funções | ✅ |

## 6. O que só você pode fazer (painel do Supabase)
Estas opções ficam no painel e não podem ser ligadas por código:
1. **Authentication → Sign In / Providers → Email:** desligar **"Allow new users to sign up"** (só o administrador cria usuários).
2. **Authentication → Password security:** ligar **"Leaked password protection"** (bloqueia senhas que já vazaram na internet).
3. (Recomendado) **Autenticação em dois fatores (MFA)** para o seu usuário administrador.

## 7. Como testar você mesmo
1. Abra o site normalmente: tudo deve funcionar igual (as proteções são invisíveis).
2. Em **Logs → Erros técnicos**, nada novo relacionado a segurança deve aparecer.
3. Se clicar em "Sincronizar agora" dezenas de vezes seguidas, a partir da 31ª aparece o aviso amigável do limite.

## 8. Resultado esperado
- Nenhum token, senha ou chave visível no site, no código ou nos logs.
- Cada pessoa só vê e faz o que o papel dela permite, conferido pelo banco.
- Abuso é barrado com mensagem amigável; o site continua funcionando.
