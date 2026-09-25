# ETAPA 25 — Tratamento de erros

> Status: **concluída e testada**, aguardando sua validação.

## 1. O que fizemos (explicado de forma simples)

Nenhum erro técnico derruba mais o dashboard. A pessoa vê só uma **mensagem amigável**, e o **detalhe técnico** fica guardado para o administrador analisar.

| Situação | O que a pessoa vê | O que fica guardado (só o administrador vê) |
|---|---|---|
| O Meta ou o Google falham numa sincronização | "Não conseguimos atualizar os dados desta conta. O Meta pediu uma pausa nas consultas." | Código, resposta da API (sem token), conta, cliente, período e em qual passo parou |
| O banco devolve um erro inesperado | "Não conseguimos carregar o resumo." | O erro do banco e a tela onde aconteceu |
| Uma tela quebra (dado inesperado) | Um aviso "Algo não saiu como esperado", com **Tentar de novo** e **Ir para o início**. O menu continua funcionando | O erro e o ponto da tela onde quebrou |
| O site foi atualizado enquanto a pessoa estava com ele aberto | "O sistema foi atualizado. Recarregue a página para continuar." | Um registro "versão nova" |
| Erro solto no navegador | Nada muda na tela | O erro, já sem segredos |

Antes, um erro inesperado podia deixar a **tela branca** ou mostrar textos como `TypeError: Cannot read properties of undefined`. Agora isso nunca aparece.

### Onde ver os erros técnicos
**Logs → aba "Erros técnicos"** (só o administrador):
- filtros por **período** e **origem** (Site, Servidor, Sincronização, Importação do histórico);
- cada linha mostra a mensagem que a pessoa viu e onde aconteceu (cliente, conta, pessoa, tela);
- **Detalhe técnico** abre o texto técnico e o contexto;
- **Baixar planilha** gera um CSV.

### O que NÃO vira log técnico
Erros "esperados", que a própria mensagem já explica: campo inválido, sessão expirada, sem permissão, e-mail já cadastrado, conta já vinculada. Assim a lista mostra só o que precisa de atenção.

## 2. Por que fizemos
- A pessoa não precisa entender códigos técnicos: ela precisa saber o que aconteceu e o que fazer.
- O administrador precisa do detalhe para descobrir a causa, sem depender de alguém tirar print.
- **Segurança:** as mensagens de erro das APIs podem trazer o token na URL. Tudo passa por uma limpeza (tokens, chaves, senhas, "Bearer…", JWT) **antes** de ser gravado ou enviado. A mesma regra existe no banco, no servidor e no site.

## 3. Banco de dados
Tabela nova **`public.error_logs`** (explicada antes de criar):

| Campo | Tipo | Para quê |
|---|---|---|
| `id` | número automático | identificador |
| `occurred_at` | data e hora | quando aconteceu |
| `source` | texto | origem: `site`, `servidor`, `sincronizacao`, `historico` |
| `code` | texto (até 80) | código curto (ex.: `RATE_LIMITED`) |
| `user_message` | texto (até 500) | a mensagem amigável que a pessoa viu |
| `technical` | texto (até 4.000) | o detalhe técnico, **já sem segredos** |
| `context` | JSON (até 8 KB) | tela, função, período, passo… |
| `user_id` / `ad_account_id` / `client_id` | ligação | quem estava usando, qual conta, qual cliente (se apagados, o log fica, sem a ligação) |

- **Índices:** por data, origem + data, conta, cliente e pessoa.
- **Quem lê:** só o administrador (RLS).
- **Quem grava:** o servidor direto; o site só pela função `log_client_error`, logado e ativo, no máximo **30 registros a cada 10 minutos por pessoa**.
- **Retenção:** permanente. Nada é apagado automaticamente.
- Funções: `private.redact_secrets` (limpeza), `public.log_client_error` (site registra), `public.error_log_list` (tela de Logs).

Migração: `supabase/migrations/20260925130000_error_logs.sql`.

## 4. Arquivos
**Servidor (Edge Functions)**
- `supabase/functions/_shared/errorlog.ts`: `recordError` (grava sem nunca travar a função), `describeError`, `EXPECTED_CODES`.
- `_shared/http.ts`: toda função responde com a mensagem amigável e guarda o detalhe técnico.
- `_shared/sync/runner.ts` e `store.ts`: erros da sincronização e da importação do histórico, com conta, cliente, período e passo.
- `ad-accounts/index.ts`: saldo e páginas/Instagram; `sync/index.ts`: alertas; `admin-users/index.ts`: auditoria.

**Compartilhado**
- `packages/shared/src/errors/redact.ts`: a regra de limpeza de segredos e os nomes das origens.

**Site**
- `apps/web/src/lib/errorReporting.ts`: envia o erro ao log (sem repetir o mesmo erro em 5 min, no máximo 20 por visita).
- `lib/errors.ts`: `FriendlyError` e `errorMessage()`. A tela só mostra mensagens amigáveis; um erro técnico vira "Não foi possível concluir a operação…".
- `components/feedback/ErrorBoundary.tsx` e `app/RouteError.tsx`: aviso no lugar de uma tela quebrada.
- `main.tsx`: registra erros soltos do navegador e de carregamentos.
- `features/logs/`: aba **Erros técnicos**.

## 5. Testes
| Teste | Resultado |
|---|---|
| Banco (`supabase/tests/etapa25_errors.sql`): limpeza de segredos, registro pelo site, inativo bloqueado, limite 30/10 min, só administrador lê, visitante sem login bloqueado | ✅ TODOS OS TESTES PASSARAM |
| Servidor (Deno): limpeza, gravação que nunca trava, mensagem amigável + detalhe guardado, erros esperados fora do log | ✅ 63 testes |
| Site (unidade) | ✅ 113 testes (+10) |
| Compartilhado | ✅ 91 testes (+4) |
| Navegador (`e2e/errors.mjs`): erro do banco, tela quebrada + Tentar de novo, versão nova, erro solto, erro do servidor, aba Erros técnicos, gestor sem acesso | ✅ 33 verificações |
| Todos os testes de navegador (24 suítes) | ✅ 658 verificações |
| **Real (produção):** um erro do Meta na importação do histórico ("Service temporarily unavailable") ficou registrado com conta, cliente, período e detalhe, **sem token** | ✅ |

## 6. Como testar você mesmo
1. Entre como administrador e abra **Logs → Erros técnicos**.
2. Veja o erro real do Meta registrado hoje (origem "Importação do histórico").
3. Clique em **Detalhe técnico**: aparece a resposta da API, sem nenhum token.
4. Troque a **Origem** e o **Período** para filtrar.
5. Entre com um usuário gestor: a aba **Erros técnicos** não aparece.

## 7. Resultado esperado
- Nenhuma tela branca, nenhum texto técnico para quem usa o sistema.
- O administrador encontra em Logs o que deu errado, onde e quando.
- Nenhum token, senha ou chave nos registros.
