# 05 — Segurança, permissões, erros e logs

## 1. Fluxo de autenticação

```
Usuário digita e-mail e senha
   ▼
Firebase Authentication confere e devolve um "crachá" digital (ID token)
   ▼
O crachá tem o PAPEL do usuário (custom claim: role) — só o servidor consegue escrever isso
   ▼
Toda leitura no Firestore → regras conferem o crachá
Toda chamada ao servidor → função confere o crachá + App Check
   ▼
Sessão persiste no navegador; logout apaga a sessão
```

- **Recuperar senha**: e-mail oficial do Firebase.
- **Não há cadastro aberto**: só o administrador cria usuários (evita estranhos).
- **Primeiro administrador**: criado uma única vez por um script seguro.

## 2. Papéis e permissões

| Papel | Vê | Pode fazer |
|---|---|---|
| **Administrador** | Tudo | Gerenciar usuários e permissões, conectar contas, configurações, ver logs técnicos |
| **Gestor** | Só clientes autorizados (`clientIds`) | Editar esses clientes, vincular contas, sincronizar, tratar alertas, relatórios |
| **Operador** | Clientes autorizados | Acompanhar, sincronizar, marcar alertas, gerar relatórios (sem editar cadastro nem conexões) |
| **Visualizador** | Clientes autorizados | Somente leitura |
| **Cliente** | Apenas o próprio cliente, na visão simplificada | Somente leitura; sem logs, tokens, configurações ou dados internos |

As permissões são verificadas em **três lugares** (nunca só na tela):
1. **Regras do Firestore** (o banco recusa leitura não autorizada).
2. **Funções do servidor** (recusam ações não autorizadas).
3. **Interface** (apenas esconde botões — conveniência, não segurança).

## 3. Proteção das credenciais

- Client secrets, App Secret do Meta, Developer Token do Google e a **chave de
  criptografia** ficam no **Secret Manager** (cofre do Google Cloud).
- Tokens das conexões são **criptografados (AES-256-GCM)** antes de ir para a coleção
  `connections`, que é **bloqueada para todos os usuários** nas regras.
- O site só recebe a configuração **pública** do Firebase (que é feita para ser
  pública). Nenhum token vai para o navegador, nem para logs.
- `.env.example` terá só nomes de variáveis, nunca valores. Arquivos `.env` reais ficam
  no `.gitignore`.

## 4. Outras proteções

- **Validação de entrada** com Zod em todo formulário e toda função do servidor.
- **Rate limiting** no "sincronizar agora", na criação de usuários e nas buscas.
- **App Check** nas funções chamadas pelo site.
- **Auditoria**: `auditLogs` registra quem criou/alterou usuários, clientes e conexões.

## 5. Tratamento de erros (nada quebra o dashboard)

Cada erro técnico é "traduzido" para uma **categoria** e uma **mensagem amigável**:

| Categoria | O usuário vê | O admin vê no log |
|---|---|---|
| `AUTH_EXPIRED` | "A conexão com esta conta expirou. Peça a um administrador para reconectar." | código e mensagem original da API |
| `PERMISSION_DENIED` | "Não temos permissão para acessar esta conta." | idem |
| `RATE_LIMITED` | "A plataforma pediu uma pausa. Tentaremos de novo em instantes." | idem |
| `PLATFORM_UNAVAILABLE` | "Não conseguimos atualizar os dados desta conta." | idem |
| `DATA_INVALID` | "Recebemos dados incompletos desta conta." | payload resumido (sem token) |
| `UNKNOWN` | "Algo deu errado. A equipe foi avisada." | stack trace |

Na tela, cada bloco (card, gráfico, tabela) é isolado: se um falhar, os outros
continuam aparecendo, com a última informação salva.

## 6. Estratégia de logs

| Tipo | Onde | Quem vê |
|---|---|---|
| Log de sincronização | `syncRuns` (Firestore) | Admin (completo), gestor/operador (resumo) |
| Log técnico detalhado | Cloud Logging (JSON estruturado, com `syncRunId`) | Admin |
| Auditoria de ações | `auditLogs` | Admin |
| Alertas | `alerts` | Conforme papel e cliente |

Nenhum log grava tokens, senhas ou segredos (há um filtro que remove campos sensíveis).
