# ETAPA 1 — Estrutura inicial: login e usuários

> Status: **concluída e testada**, aguardando sua validação manual.

## 1. O que fizemos (explicado de forma simples)

Construímos a **porta de entrada** do sistema e o **porteiro**:

- **A porta** é a tela de login, com e-mail, senha, "Esqueci minha senha" e botão "Sair".
  A sessão fica guardada no navegador. Se você fechar e abrir de novo, continua logado.
- **O porteiro** é o banco de dados. Ele confere, a cada pedido, quem você é e o que pode ver.
  Mesmo que alguém mexa na tela, o banco recusa o que não é permitido.
- **O crachá** é o papel de cada pessoa: administrador, gestor, operador, visualizador ou cliente.
- **A sala do síndico** é a tela de usuários. Só o administrador entra nela para criar
  pessoas, trocar papéis, desativar e redefinir senhas.

## 2. Por que começamos por aqui

Todas as próximas telas (clientes, contas, campanhas) dependem de saber **quem está usando**
e **o que pode ver**. Construir a fechadura depois da casa pronta sempre deixa alguma porta aberta.

## 3. O que foi criado no Supabase (projeto `backstage-flow-dev`, região São Paulo)

### Tabela `profiles` (perfil de cada usuário)

| Campo | Tipo | Para que serve |
|---|---|---|
| `id` | uuid | Mesmo identificador do login (ligado a `auth.users`) |
| `email` | texto | E-mail (copiado do login automaticamente) |
| `full_name` | texto (até 120) | Nome exibido |
| `role` | `user_role` | admin, gestor, operador, visualizador ou cliente |
| `active` | sim/não | Usuário novo nasce **inativo**; só entra depois que um admin ativa |
| `created_at` / `updated_at` | data e hora | Quando foi criado e alterado |
| `created_by` | uuid | Qual admin criou |

- **Relacionamento:** 1 perfil para cada login.
- **Índices:** por papel (usuários ativos) e por quem criou.
- **Retenção:** permanente. Usuários são **desativados**, nunca apagados.

### Tabela `audit_logs` (quem fez o quê)

| Campo | Tipo | Para que serve |
|---|---|---|
| `actor_id` | uuid | Quem fez a ação |
| `action` | texto | Ex.: `user.create`, `user.update`, `user.set_password`, `user.bootstrap_admin` |
| `target_type` / `target_id` | texto | Em quem ou no que a ação foi feita |
| `details` | JSON | Antes e depois da mudança. **Senhas nunca são gravadas.** |
| `created_at` | data e hora | Quando aconteceu |

- **Índices:** por data (mais recentes primeiro), por alvo e por autor.
- **Retenção:** permanente.
- Só o servidor grava. Só o administrador lê.

### Regras de segurança (RLS)

| Quem | Pode ver | Pode alterar |
|---|---|---|
| Visitante sem login | Nada | Nada |
| Usuário ativo | Só o próprio perfil | Só o próprio **nome** |
| Usuário inativo | Só o próprio perfil (para ver "acesso pendente") | Nada |
| Administrador ativo | Todos os perfis e a auditoria | Papel, status e senha **somente pelo servidor** (Edge Function) |

O papel é conferido **na tabela a cada pedido**, e não só no crachá do login.
Assim, ao desativar alguém, o acesso cai **na hora**.

### O primeiro administrador

Existe uma configuração interna e invisível (`private.app_settings`) com o e-mail
**que você me informou**. Quando uma conta com esse e-mail é criada **e ainda não
existe nenhum administrador**, ela já nasce administradora e ativa. Depois disso, a regra
não vale mais para ninguém. O e-mail **não** está no código nem na documentação do GitHub.

### Função do servidor `admin-users`

Recebe os pedidos da tela de usuários: **criar**, **editar** (nome, papel, ativo/inativo)
e **definir nova senha**. Antes de qualquer coisa, ela confere se quem pediu é um
administrador ativo. Travas extras:
- ninguém consegue tirar o próprio acesso de administrador;
- o sistema nunca fica sem pelo menos um administrador ativo;
- ao desativar alguém, o **login** dessa pessoa também é bloqueado.

## 4. Arquivos criados

```
package.json, .npmrc, .gitignore, .nvmrc           → configuração do monorepo
packages/shared/src/constants/roles.ts             → os 5 papéis e seus nomes em português
packages/shared/src/constants/permissions.ts       → o que cada papel pode fazer (para a tela)
supabase/migrations/20260923230000_auth_profiles.sql          → tabelas, gatilhos e regras
supabase/migrations/20260923231000_auth_profiles_fk_indexes.sql → índices extras
supabase/migrations/20260924000000_enable_pg_net.sql          → chamadas HTTP pelo banco
supabase/tests/etapa01_rls_profiles.sql            → testes de segurança do banco
supabase/functions/_shared/http.ts                 → respostas, CORS e erros amigáveis
supabase/functions/_shared/auth.ts                 → confere se é administrador
supabase/functions/admin-users/index.ts            → gestão de usuários
apps/web/                                          → o site (React)
  src/features/auth/      → login, recuperar/redefinir senha, sessão, "acesso pendente"
  src/features/users/     → tela de usuários (somente admin)
  src/features/account/   → "Minha conta": trocar nome e senha
  src/features/dashboard/ → página inicial provisória
  src/components/layout/  → menu lateral (com versão para celular) e topo
  src/components/ui/      → botões, campos, cartões, avisos, janela modal
  e2e/smoke.mjs           → teste automático no navegador
```

Arquivos modificados: `README.md` (raiz).

## 5. Testes realizados

| Teste | Resultado |
|---|---|
| 8 testes das regras de segurança no banco (visitante, gestor, inativo, admin, admin desativado, auto-promoção, configurações privadas) | ✅ Passaram |
| Teste negativo (confirmar que o teste detecta falhas) | ✅ Detectou |
| Função `admin-users` no servidor real: criar, gestor tentando criar (403), sem login (401), dados inválidos (400), admin tentando se desativar (400), desativar (login bloqueado), reativar, trocar senha e entrar com a nova senha | ✅ Todos corretos |
| Auditoria registrou criação e alterações | ✅ |
| Avisos de segurança do Supabase | ✅ Nenhum |
| 19 testes unitários (papéis, permissões, menu, senhas, mensagens de erro) | ✅ Passaram |
| Verificação de tipos (site e servidor) e montagem do site | ✅ Sem erros |
| 15 verificações no navegador (Chromium), incluindo celular | ✅ Passaram |

**Defeito encontrado e corrigido:** depois do login, o sistema sempre ia para o Dashboard,
em vez de voltar para a página que a pessoa tentou abrir. Corrigido e coberto pelo teste.

Os usuários de teste criados no servidor foram **apagados** no final. O banco está vazio,
pronto para você criar o seu administrador.

## 6. Configurações que VOCÊ precisa fazer no painel do Supabase (5 minutos)

Abra https://supabase.com/dashboard → projeto **backstage-flow-dev**.

1. **Bloquear cadastro aberto**
   *Authentication → Sign In / Providers → Email* → desligue **"Allow new users to sign up"** → Salvar.
   (Mesmo se ficar ligado, quem se cadastrar sozinho nasce **inativo** e não vê nada. Mas é melhor fechar a porta.)
2. **Endereços permitidos para o link de recuperação de senha**
   *Authentication → URL Configuration*:
   - **Site URL:** o endereço onde o site estiver publicado (veja o passo 7).
   - **Redirect URLs:** adicione `http://localhost:5173/**` e o endereço publicado seguido de `/**`.
3. **Criar o seu administrador**
   *Authentication → Users → Add user → Create new user*:
   - E-mail: o mesmo que você me informou para ser o administrador
   - Senha: escolha uma (mínimo 8 caracteres, com letras e números)
   - Marque **"Auto Confirm User"** → **Create user**.
   Você já nasce **Administrador** e ativo.

## 7. Como testar manualmente

Para testar, o site precisa estar publicado na internet. O caminho previsto no planejamento é
a **Vercel**. Assim que ele estiver publicado:

1. Abra o endereço do site → deve aparecer **"Entrar no Backstage Flow"**.
2. Digite uma senha errada → deve aparecer **"E-mail ou senha incorretos."** (e nenhum código técnico).
3. Entre com o e-mail e a senha do passo 6.3 → aparece **"Olá, Ander!"** e **"Você entrou como Administrador"**.
4. Feche o navegador, abra de novo o site → você **continua logado**.
5. Menu **Configurações** → tela **Usuários** → **Novo usuário**:
   crie alguém com papel **Gestor** e uma senha inicial.
6. Numa janela anônima, entre com esse gestor → o menu **não** mostra "Configurações".
   Digitar `/configuracoes/usuarios` no endereço leva de volta ao Dashboard.
7. De volta como admin, clique **Desativar** no gestor → na janela anônima, recarregue:
   aparece **"Acesso pendente"**. Tentar entrar de novo mostra **"Seu acesso está desativado"**.
8. **Reativar** o gestor → ele volta a conseguir entrar.
9. Na sua linha, o botão **Desativar** fica apagado: você não consegue se trancar para fora.
10. **Minha conta** (clique no seu nome, no topo) → troque o nome e a senha.
11. Clique **Sair** → volta para o login. **Esqueci minha senha** → informe seu e-mail →
    chega um e-mail com link → abra **no mesmo navegador** → crie a nova senha.
12. No celular: o menu vira um botão ☰ no canto superior esquerdo.

### Resultado esperado

Todas as telas em português e sem mensagens técnicas. Cada pessoa vê só o que o papel dela permite.
O administrador controla quem entra, e tudo o que ele faz fica registrado na auditoria.

## 8. Limitações conhecidas (serão tratadas nas etapas indicadas)

- **E-mails de recuperação de senha:** o servidor de e-mail padrão do Supabase envia poucos
  e-mails por hora e é só para testes. Para produção, vamos configurar um serviço de e-mail
  próprio (SMTP) na Etapa 26. Enquanto isso, o administrador pode definir uma nova senha
  pela tela de usuários.
- **Clientes vinculados a usuários** (quais clientes cada gestor vê) chegam na **Etapa 2**,
  junto com o cadastro de clientes.
- **A visão do cliente** (papel "Cliente") hoje mostra só o Dashboard. A versão completa vem na **Etapa 19**.
- **Tamanho do site:** o pacote principal tem cerca de 180 KB compactado. A otimização
  (carregar páginas sob demanda) está prevista na **Etapa 30**.

## 9. Como rodar localmente (para programadores)

```bash
npm install
cp apps/web/.env.example apps/web/.env.local   # preencher URL e chave pública do Supabase
npm run dev                                    # http://localhost:5173
npm test                                       # testes unitários
npm run typecheck
npm run e2e -w @backstage/web                  # com o site rodando
```

Testes do banco: cole `supabase/tests/etapa01_rls_profiles.sql` no **SQL Editor** do Supabase.
Deve aparecer `TODOS OS TESTES PASSARAM`. Nada fica gravado.
