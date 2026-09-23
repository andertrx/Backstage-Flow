# 05 — Segurança, permissões, erros e logs

## 1. Fluxo de autenticação

```
Usuário digita e-mail e senha
   ▼
Supabase Auth confere e devolve um "crachá" digital (JWT) + sessão persistente
   ▼
Toda leitura no banco → o RLS confere o crachá e o papel (tabela profiles)
Toda chamada ao servidor → a Edge Function confere o crachá e o papel
   ▼
Logout encerra a sessão
```

- **Recuperar senha**: e-mail oficial do Supabase Auth (texto em português).
- **Cadastro aberto desligado**: só o administrador cria usuários (evita estranhos).
- **Primeiro administrador**: criado uma única vez por um script seguro.
- O papel é lido **da tabela `profiles` a cada consulta**, e não só do crachá. Assim,
  se um usuário for desativado ou rebaixado, o acesso muda **na hora**.

## 2. Papéis e permissões

| Papel | Vê | Pode fazer |
|---|---|---|
| **Administrador** | Tudo | Gerenciar usuários e permissões, conectar contas, configurações, ver logs técnicos |
| **Gestor** | Só clientes autorizados (`user_client_access`) | Editar esses clientes, vincular contas, sincronizar, tratar alertas, relatórios |
| **Operador** | Clientes autorizados | Acompanhar, sincronizar, marcar alertas, gerar relatórios (sem editar cadastro nem conexões) |
| **Visualizador** | Clientes autorizados | Somente leitura |
| **Cliente** | Apenas o próprio cliente, na visão simplificada | Somente leitura; sem logs, tokens, configurações ou dados internos |

As permissões são verificadas em **três lugares** (nunca só na tela):
1. **RLS no PostgreSQL** — o banco nem devolve linhas que o usuário não pode ver.
2. **Edge Functions** — recusam ações não autorizadas.
3. **Interface** — só esconde botões (conveniência, não segurança).

As regras de RLS terão **testes automáticos (pgTAP)**: "um cliente tenta ler dados de
outro cliente → deve receber zero linhas".

## 3. Proteção das credenciais

| Segredo | Onde fica |
|---|---|
| App Secret do Meta, Client Secret e Developer Token do Google | **Edge Function Secrets** (variáveis de ambiente do servidor) |
| Token de cada conexão (System User do Meta, refresh token do Google) | **Supabase Vault** (criptografado); a tabela `private.platform_connections` guarda só a referência |
| Chave secreta do Supabase (`service_role` / secret key) | Somente nas Edge Functions |
| Chave pública do Supabase (publishable/anon key) | No site — ela é feita para ser pública e **não abre nada sem o RLS** |

- O schema `private` e o Vault **não são expostos** pela API do Supabase.
- Nenhum token vai para o navegador nem para logs.
- `.env.example` terá só nomes de variáveis, nunca valores; `.env` real fica no `.gitignore`.

## 4. Outras proteções

- **Validação de entrada** com Zod em todo formulário e toda Edge Function, e
  restrições (`CHECK`, tipos) no próprio banco.
- **Rate limiting** no "sincronizar agora", na criação de usuários e nas buscas.
- **CORS** restrito ao domínio do site.
- **Auditoria**: `audit_logs` registra quem criou/alterou usuários, clientes e conexões.
- **Backups diários** (plano Pro) e migrações versionadas no Git.

## 5. Tratamento de erros (nada quebra o dashboard)

Cada erro técnico é "traduzido" para uma **categoria** e uma **mensagem amigável**:

| Categoria | O usuário vê | O admin vê no log |
|---|---|---|
| `AUTH_EXPIRED` | "A conexão com esta conta expirou. Peça a um administrador para reconectar." | código e mensagem original da API |
| `PERMISSION_DENIED` | "Não temos permissão para acessar esta conta." | idem |
| `RATE_LIMITED` | "A plataforma pediu uma pausa. Tentaremos de novo em instantes." | idem |
| `PLATFORM_UNAVAILABLE` | "Não conseguimos atualizar os dados desta conta." | idem |
| `DATA_INVALID` | "Recebemos dados incompletos desta conta." | resumo do dado (sem token) |
| `UNKNOWN` | "Algo deu errado. A equipe foi avisada." | detalhes técnicos completos |

Na tela, cada bloco (card, gráfico, tabela) é isolado: se um falhar, os outros
continuam aparecendo, com a última informação salva.

## 6. Estratégia de logs

| Tipo | Onde | Quem vê |
|---|---|---|
| Log de sincronização | `sync_runs` | Admin (completo), gestor/operador (resumo) |
| Log técnico detalhado | Logs das Edge Functions (JSON estruturado, com `sync_run_id`) | Admin |
| Auditoria de ações | `audit_logs` | Admin |
| Alertas | `alerts` | Conforme papel e cliente |

Nenhum log grava tokens, senhas ou segredos (há um filtro que remove campos sensíveis).
