# ETAPA 8 — Saúde das contas

> Status: **concluída e testada**, aguardando sua validação.

## 1. O que fizemos (explicado de forma simples)

O item **Contas** do menu agora abre a tela **Saúde das contas**. É uma lista com todas as contas de
anúncio e a situação de cada uma:

| Cliente | Plataforma | Conta | Status | Saldo | Última sincronização |
|---|---|---|---|---|---|

Cada conta recebe **um status**, sempre o mais grave que for encontrado, e a **lista de motivos**:

| Status | Quando aparece |
|---|---|
| 🔴 **Desativada** | A plataforma desativou ou encerrou a conta |
| 🔴 **Pagamento pendente** | Pagamento em aberto ou problema na cobrança |
| 🔴 **Restrita** | Conta restrita, suspensa ou em análise |
| 🔴 **Erro de sincronização** | Conexão com erro ou desconectada, conta sem conexão, ou a última sincronização falhou |
| 🟠 **Atenção** | Saldo baixo, sem saldo, sem forma de pagamento, status não reconhecido, nunca sincronizada ou sincronização atrasada (mais de 48 horas) |
| 🟢 **Ativa** | Nada de errado encontrado |

Cada selo tem **cor + ícone + texto**, para quem não diferencia cores também entender.

**Recursos da tela:**
- **Atalhos no topo:** mostram quantas contas há em cada status. Clicar filtra a lista.
- **Filtros:** busca (nome, cliente ou ID, inclusive `act_...` e `123-456-7890`), cliente e plataforma.
- **Ordem:** as contas com problema aparecem primeiro.
- **Botão "Verificar status e saldo"** (administrador e gestor): consulta as plataformas na hora.
  Se uma conta falhar, as outras continuam e o erro aparece com o nome dela.
- **Nome da conta:** clicar leva à página do cliente.
- **No celular:** a tabela vira cartões.

## 2. Por que assim

- **Uma regra só, compartilhada:** a classificação fica no código compartilhado. A Central de Alertas
  (Etapa 15) vai usar exatamente a mesma regra, sem risco de o alerta dizer uma coisa e a tela outra.
- **Motivos em português:** o status diz a gravidade, e os motivos dizem o que fazer.
- **Nada inventado:** saldo não verificado aparece como "Saldo não verificado". O que a API não informa
  aparece como "Informação não disponível pela API.". Conta que nunca sincronizou mostra **"Nunca"**.
- **"Ainda não sincronizada" = Atenção:** até a sincronização existir (Etapa 16), as contas novas aparecem
  em Atenção. É a verdade: os números delas ainda não estão sendo buscados.
- **Permissões:** o erro da conexão com a plataforma só aparece para administrador e gestor, porque os demais
  papéis não enxergam as conexões. Para eles, isso não vira um falso "erro".

## 3. O que mudou no banco

**Nenhuma tabela nova.** Só uma consulta nova, `account_health`, que junta o saldo, a sincronização e a
conexão de cada conta. Ela roda **com a permissão de quem pergunta**: o gestor só vê as contas dos
clientes liberados, e o visitante sem login é bloqueado.

## 4. Testes realizados

| Teste | Resultado |
|---|---|
| **Banco** (`supabase/tests/etapa08_health.sql`) | ✅ |
| ↳ gestor vê só o cliente liberado e vê o erro da conexão | ✅ |
| ↳ visualizador vê a conta, mas não os dados da conexão | ✅ |
| ↳ visitante sem login bloqueado | ✅ |
| **Regra de saúde:** 7 testes, total do compartilhado 50 | ✅ |
| ↳ ativa, nunca sincronizada, atrasada, erro de conexão, conexão invisível | ✅ |
| ↳ o pior status vence, sem motivos repetidos | ✅ |
| **Site:** lista, ordem, filtros e tempo relativo. Total: 38 testes | ✅ |
| **Navegador:** 33 verificações novas | ✅ |
| ↳ todos os status, motivos, ordem, atalhos, busca pelo ID, filtros, verificação com falha parcial | ✅ |
| ↳ link ao cliente, celular, visualizador sem botão, lista vazia | ✅ |
| **Navegador:** as 140 verificações anteriores continuam passando | ✅ |
| **Supabase Advisor** (segurança) | ✅ Nenhum aviso |

**Problemas encontrados e corrigidos**
1. **Motivos repetidos:** a mesma coisa aparecia duas vezes ("A plataforma informa pagamento pendente." e "Pagamento pendente.").
   Agora, quando a plataforma já disse, o alerta de saldo não repete.
2. **Contagem da Etapa 7:** o teste de navegador de saldo tem **28** verificações, e não 31 como estava escrito.
   Corrigido na documentação da Etapa 7.

## 5. Como testar manualmente

1. No site, clique em **Contas** no menu.
2. Cada conta vinculada aparece com o selo de status e os motivos embaixo.
3. Clique num atalho do topo (ex.: **Atenção**): só essas contas ficam na lista. Clique de novo para voltar.
4. Digite parte do nome ou do ID na busca.
5. Clique em **Verificar status e saldo**: o status e o saldo são consultados nas plataformas.
6. No celular, a lista aparece como cartões.

### Resultado esperado
- As contas com problema ficam no topo, cada uma com o motivo em português.
- Nenhum número inventado.

## 6. Arquivos

**Criados**
```
supabase/migrations/20260925020000_account_health.sql
supabase/tests/etapa08_health.sql
packages/shared/src/accounts/health.ts (+ teste)        → regra de saúde da conta
apps/web/src/features/health/AccountsHealthPage.tsx      → a tela
apps/web/src/features/health/HealthBadge.tsx             → selo com cor + ícone + texto
apps/web/src/features/health/{api,types,rows}.ts (+ teste)
apps/web/e2e/health.mjs
```

**Modificados**
```
apps/web/src/app/router.tsx, apps/web/src/components/layout/navigation.ts → rota /contas ativa
apps/web/src/lib/format.ts (+ teste)                     → "há 2 horas", data e hora
apps/web/e2e/support.mjs, apps/web/package.json
packages/shared/src/index.ts, README.md, docs/etapa-07-verificacao-saldo/README.md
```
