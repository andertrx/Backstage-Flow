# ETAPA 17 — Logs

> Status: **concluída e testada**, aguardando sua validação.

## 1. O que fizemos (explicado de forma simples)

O item **Logs** do menu (antes "em breve") virou o "livro de registros" do sistema. Ele tem duas abas.

**Aba "Ações dos usuários"** (só administrador): quem fez o quê e quando.

| O que é registrado | Exemplo na tela |
|---|---|
| Entradas e saídas | "Maria Gestora · Entrou no sistema" |
| Usuários | "Ander · Alterou usuário · Maria — Papel: Operador → Gestor" |
| Clientes e acessos | "Ander · Cadastrou cliente · Excalibur Fitness" |
| Contas de anúncio | "Sistema (automático) · Conta de anúncio alterada · CA - Shineray — Status: Ativa → Pagamento pendente" |
| Conexões com plataformas | "Ander · Conectou plataforma · BM - STG" |

- **Filtros:** período (24 horas, 7, 30 ou 90 dias, ou tudo), pessoa e tipo.
- **Ordem:** o mais recente vem primeiro, 100 de cada vez, com o botão **Carregar mais**.
- **Baixar planilha:** abre no Excel ou no Google Planilhas.

**Aba "Sincronizações"** (administrador e gestor): todas as sincronizações, com resultado, registros atualizados, duração e erro.
- Filtros por período, resultado (sucesso ou erro) e cliente.
- **Baixar planilha** também.
- O gestor vê só os clientes liberados para ele.

## 2. Por que assim

- **Nada é apagado:** os registros são permanentes.
- **Sem ruído:** antes, cada sincronização de hora em hora gravava "conta alterada" só porque a data da verificação mudava. Isso enchia o registro sem motivo. Agora só entram **mudanças de verdade**, como status, nome ou vínculo. Os registros antigos foram mantidos.
- **"Sistema (automático)"** aparece quando a mudança veio da sincronização, e não de uma pessoa.
- **Segurança:**
  - dados de credencial (token, senha, segredo, cofre) **nunca** aparecem na tela nem na planilha;
  - só o administrador vê as ações dos usuários (regra do banco, não só da tela);
  - o gestor vê só as sincronizações dos clientes dele;
  - operador, visualizador e cliente não acessam os logs;
  - ninguém consegue escrever direto no registro. O login só pode registrar "entrou" ou "saiu" da própria pessoa, uma vez por minuto no máximo.
- **Detalhes técnicos das falhas** (a resposta original da API) continuam nos logs do servidor, no painel do Supabase. Na tela aparece a mensagem em português simples.

## 3. O que mudou no banco

**Nenhuma tabela nova.** Usamos as que já existiam: `audit_logs` (Etapa 1) e `sync_runs` (Etapa 16).

- **Registro automático de alterações:** passa a ignorar as datas de verificação (`details_updated_at`, `last_checked_at`).
- **Função nova `log_auth_event`:** registra a entrada e a saída da própria pessoa, sem repetir o mesmo evento dentro de 1 minuto.
- **Função nova `audit_log_list`:** a lista da tela, com o nome de quem fez e do que mudou, sem campos sensíveis. Só o administrador recebe linhas.
- **Índice novo:** por pessoa + ação + data.

## 4. Testes realizados

| Teste | Resultado |
|---|---|
| **Banco** (`supabase/tests/etapa17_logs.sql`) | ✅ |
| ↳ sincronização que só atualiza a data de verificação não gera registro; mudança de status gera | ✅ |
| ↳ login e logout registrados; repetição em menos de 1 minuto não duplica; evento inválido recusado | ✅ |
| ↳ gestor não lê as ações e ninguém grava direto no registro; visitante bloqueado | ✅ |
| ↳ nomes certos (pessoa, conta, conexão); categoria "Usuários" não mistura logins; credencial nunca aparece; "carregar mais" não repete | ✅ |
| **Cálculos** (nomes em português, antes → depois, planilha) | ✅ compartilhado 83 testes, site 73 testes |
| **Navegador:** 29 verificações novas | ✅ |
| ↳ login e logout registrados; ações com quem, o quê, onde e o que mudou; "Sistema (automático)" | ✅ |
| ↳ filtros de período, pessoa e tipo; "Carregar mais"; planilha em português | ✅ |
| ↳ aba de sincronizações com filtros; gestor só vê sincronizações; operador e cliente sem acesso; celular | ✅ |
| **Navegador:** as 464 verificações anteriores continuam passando (493 no total) | ✅ |
| **Segurança** (verificador do Supabase) | ✅ só o aviso conhecido da senha vazada (ajuste no painel) |

**Problemas encontrados e corrigidos**
1. **Registros repetidos a cada hora:** a sincronização gravava "conta alterada" toda hora, sem mudança real. Corrigido (item 2 acima).
2. **Nome repetido no login:** "Maria Gestora · Entrou no sistema · Maria Gestora". Agora aparece uma vez só.
3. **Dois campos com o mesmo nome** ("Tipo") confundiam o leitor de tela. As abas agora se chamam "Escolha o log".

## 5. Como testar manualmente

1. Clique em **Sair** e entre de novo.
2. No menu, clique em **Logs**. Suas entradas e saídas aparecem no topo.
3. Mude o **Período** para "Tudo" e veja o histórico completo.
4. Em **Tipo**, escolha "Contas de anúncio".
5. Clique em **Baixar planilha** e abra o arquivo.
6. Abra a aba **Sincronizações** e filtre por **Erro**.

### Resultado esperado
Um histórico claro de quem fez o quê e quando, e de cada sincronização, sem nenhum dado sensível, em português simples.

## 6. Arquivos

**Criados**
```
supabase/migrations/20260925090000_logs.sql        → auditoria sem ruído, login/logout, lista da tela
supabase/tests/etapa17_logs.sql
packages/shared/src/logs/labels.ts (+ teste)       → nomes em português e "antes → depois"
apps/web/src/features/logs/{LogsPage.tsx, api.ts, logic.ts, logic.test.ts}
apps/web/src/features/sync/RunsTable.tsx           → histórico de sincronizações (usado em 2 telas)
apps/web/e2e/logs.mjs
docs/etapa-17-logs/README.md
```

**Modificados**
```
apps/web/src/features/auth/{LoginPage.tsx, AuthProvider.tsx} → registram entrada e saída
apps/web/src/features/sync/SyncPage.tsx
apps/web/src/app/router.tsx, apps/web/src/components/layout/navigation.ts → /logs deixa de ser "em breve"
packages/shared/src/index.ts, apps/web/e2e/support.mjs, apps/web/package.json, README.md
docs/etapa-16-sincronizacao/README.md
```
