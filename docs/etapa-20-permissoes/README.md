# ETAPA 20 — Permissões

> Status: **concluída e testada**, aguardando sua validação.
> A Etapa 19 (Dashboard do cliente) ficou para depois, a seu pedido. Quando ela for feita, o teste geral de permissões desta etapa roda de novo, incluindo as telas novas do cliente.

## 1. O que fizemos (explicado de forma simples)

Fizemos uma **revisão completa de quem pode ver e fazer o quê**, em todas as tabelas e funções do banco e em todas as páginas do site.

| Papel | O que pode |
|---|---|
| **Administrador** | Tudo |
| **Gestor** | Só os clientes liberados para ele: editar cadastro, vincular contas, sincronizar, tratar alertas, relatórios e o log de sincronizações |
| **Operador** | Trabalho do dia a dia nos clientes liberados: acompanhar, sincronizar, tratar alertas e gerar relatórios |
| **Visualizador** | Só olhar os clientes liberados |
| **Cliente** | Só os dados da própria empresa, sem informações internas da agência |

**O que mudou:**
1. **Uma brecha fechada:** o perfil **cliente** ainda conseguia ler três informações internas da agência. Agora não consegue mais:
   - as fotografias de saldo, que incluem a descrição do cartão de pagamento;
   - o histórico de alterações das campanhas;
   - o estado da sincronização, que inclui mensagens de erro técnicas.
2. **Camada extra de segurança:** as funções internas do banco que rodam sozinhas (os "gatilhos") não podem mais ser chamadas pela internet.
3. **Tela nova** em **Configurações → Papéis e permissões**. Ela mostra:
   - uma tabela com o que cada papel pode fazer;
   - quais clientes cada papel enxerga;
   - a lista do que ninguém consegue fazer pelo site.

## 2. Por que assim

- **Regra no banco, não só na tela:** o plano pedia "nas regras do Firebase". Nós usamos o **Supabase**, que faz o mesmo papel: cada tabela tem sua regra. Mesmo que alguém tente burlar o site, o banco recusa.
- **Usuário desativado** perde todo o acesso na hora, até os dados que ele já tinha liberados.
- **Ninguém, nem o administrador, consegue pelo site:**
  - ver os tokens de conexão;
  - mudar o próprio papel;
  - apagar o histórico ou a auditoria;
  - gravar métricas ou alterar contas de anúncio direto (isso só acontece pelo servidor, que confere a permissão).
- **Nada foi apagado.** Só as regras de leitura mudaram.

## 3. O que mudou no banco

**Nenhuma tabela nova.**

- As regras de `account_snapshots`, `entity_changes` e `sync_state` passaram a exigir papel da equipe (não cliente), sempre limitado aos clientes liberados.
- As funções de gatilho (`audit_row_change`, `touch_updated_at`, `track_entity_changes` e outras) deixaram de poder ser chamadas pela API. Os gatilhos continuam funcionando.

## 4. Testes realizados

| Teste | Resultado |
|---|---|
| **Banco — matriz geral** (`supabase/tests/etapa20_permissions.sql`) | ✅ |
| ↳ **Leitura:** 6 perfis (admin, gestor, operador, visualizador, cliente, desativado) × 13 informações, cada uma no cliente liberado e no bloqueado | ✅ |
| ↳ **Ações:** 6 perfis × 13 ações (cadastrar e editar cliente, liberar acesso, mudar o próprio papel, gravar métricas, ler token, tratar alertas, apagar auditoria…) | ✅ |
| ↳ Visitante sem login bloqueado em 10 tabelas e no resumo | ✅ |
| **Banco — Etapa 3** atualizado para a regra nova | ✅ |
| **Navegador:** 21 verificações novas | ✅ |
| ↳ tela de papéis e permissões (tabela, escopo, lista do que ninguém faz, celular) | ✅ |
| ↳ **matriz perfil × página:** 5 perfis × 11 páginas, com o menu e o acesso certos para cada um | ✅ |
| **Navegador:** 538 verificações no total, todas passando | ✅ |
| **Segurança** (verificador do Supabase) | ✅ só o aviso conhecido da senha vazada (ajuste no painel) |

**Problemas encontrados e corrigidos**
1. **Brecha do perfil cliente** (item 1 acima).
2. **Gráfico no celular:** às vezes, ao estreitar a tela, o gráfico do Dashboard mantinha a largura antiga e criava uma rolagem para o lado. O teste da Etapa 7 pegou isso de vez em quando. Agora o gráfico sempre se ajusta à tela, e o teste confere isso.
3. **Teste antigo da Etapa 3** contava as conexões do banco inteiro e quebrou quando a sua conexão real com o Meta passou a existir. Agora ele conta só a conexão de teste.

## 5. Como testar manualmente

1. Vá em **Configurações → Papéis e permissões** e confira a tabela.
2. **Opcional:** em **Configurações → Usuários**, crie um usuário **Operador**, libere para ele um cliente e entre com esse usuário em outra janela anônima. Ele não vê **Logs** nem **Configurações**, e só vê o cliente liberado.

### Resultado esperado
Cada pessoa vê e faz só o que o papel dela permite. Quem tenta burlar é barrado pelo banco.

## 6. Arquivos

**Criados**
```
supabase/migrations/20260925100000_permissions.sql
supabase/tests/etapa20_permissions.sql
apps/web/src/features/settings/PermissionsPage.tsx
apps/web/e2e/permissions.mjs
docs/etapa-20-permissoes/README.md
```

**Modificados**
```
packages/shared/src/constants/permissions.ts (+ teste)   → explicação de cada permissão e do escopo de cada papel
apps/web/src/features/settings/SettingsLayout.tsx, apps/web/src/app/router.tsx → aba nova
apps/web/src/components/charts/TimeSeriesChart.tsx       → gráfico se ajusta ao celular
apps/web/e2e/balance.mjs, supabase/tests/etapa03_rls_ad_accounts.sql, apps/web/package.json, README.md
docs/etapa-18-relatorios/README.md
```
