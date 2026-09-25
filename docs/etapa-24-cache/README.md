# ETAPA 24 — Cache

> Status: **concluída e testada**, aguardando sua validação.

## 1. O que fizemos (explicado de forma simples)

O "cache" é **usar o que já está guardado no banco, em vez de perguntar de novo ao Meta e ao Google** quando os dados ainda são recentes.
Isso deixa o site mais rápido e evita esbarrar nos limites de consultas das plataformas.

O fluxo pedido, do jeito que ficou:

```
Você abre uma página
   ↓
O sistema olha no banco de quando são os dados de cada conta
   ↓
Dados recentes (sincronizados há até 90 min)  →  mostra o que está guardado
   ↓
Dados antigos (mais de 90 min ou nunca)      →  busca SÓ essas contas nas APIs
   ↓
Guarda no banco
   ↓
Mostra na tela
```

| Onde | Antes | Agora |
|---|---|---|
| **Abrir Dashboard, Meta Ads, Google Ads, Campanhas e Relatórios** | Mostrava o que estava guardado, sem dizer de quando | Mostra **"Dados atualizados há X minutos"**. Se alguma conta estiver com dados de mais de 90 min, **atualiza sozinho só essa conta** |
| **"Sincronizar agora"** | Chamava a API para todas as contas, mesmo as atualizadas há 1 minuto | Conta sincronizada há **menos de 10 minutos** usa o guardado. A tela avisa: *"2 contas já estavam atualizadas: usamos os dados guardados, sem chamar as APIs."* |
| **"Verificar status e saldo"** | Consultava todas | Saldo de **menos de 10 minutos** é reaproveitado, e a tela diz quantas foram consultadas e quantas vieram do guardado |
| **Lista de contas da BM/MCC** (ao vincular contas) | Buscada de novo a cada vez que a janela abria | Guardada por **5 minutos**, com "Lista buscada há X · **Atualizar lista**" para buscar na hora |
| **"Sincronizar agora" com mais de 20 contas** | Só as 20 primeiras eram consideradas (você tem 29) | Todas entram: 20 agora e o resto **na fila**, sincronizado em poucos minutos |

### Quem vê o quê
- **Administrador, gestor e operador**: veem a idade dos dados e disparam a atualização automática das contas atrasadas.
- **Visualizador**: vê o aviso "a atualização automática está atrasada", mas não dispara sincronização (não tem essa permissão).
- **Cliente**: não vê avisos técnicos.

### As regras ficam num lugar só
`packages/shared/src/sync/freshness.ts`:
- **menos de 10 minutos** = recente;
- **mais de 90 minutos** = desatualizada.

O site e o servidor usam as mesmas regras.

## 2. Por que fizemos

As APIs do Meta e do Google têm **limite de consultas**. No teste real da etapa anterior, o Meta chegou a pedir "uma pausa nas consultas".
Pedir de novo o que acabou de ser buscado gasta esse limite à toa, e deixa as telas mais lentas.

## 3. Banco de dados

**Nenhuma tabela nova.** O cache usa o que já existe:
- de quando é a última sincronização de cada conta (`sync_state.last_success_at`);
- a última fotografia de saldo (`account_snapshots.captured_at`).

## 4. Arquivos

| Arquivo | Para que serve |
|---|---|
| `packages/shared/src/sync/freshness.ts` (+ teste) | Regras de "recente" e "desatualizada" |
| `supabase/functions/_shared/sync/cache.ts` (+ teste) | Escolhe quais contas vão para a API e quais usam o guardado |
| `supabase/functions/sync/index.ts` | "Sincronizar agora" com cache, modo "só desatualizadas" e fila acima de 20 contas |
| `supabase/functions/ad-accounts/index.ts` | "Verificar saldo" com cache de 10 minutos |
| `apps/web/src/features/sync/DataFreshness.tsx` | Aviso "Dados atualizados há X min" e atualização automática das contas atrasadas |
| `apps/web/src/features/ad-accounts/ListFreshness.tsx` | "Lista buscada há X · Atualizar lista" |
| `apps/web/src/features/sync/logic.ts`, `balance/api.ts` (+ testes) | Mensagens de cache na tela |
| `apps/web/e2e/cache.mjs` | Teste de navegador desta etapa |

## 5. Testes

- **Navegador (`cache.mjs`)**: 16 verificações.
  - Abrir a página pede **uma** sincronização, só da conta atrasada e da nunca sincronizada; a recente e a em dia não vão para a API.
  - Recarregar com tudo em dia **não chama** as APIs.
  - O aviso segue o filtro de conta.
  - "Sincronizar agora" com tudo recente não gera nenhuma sincronização.
  - Saldo: 3 consultados e 1 reaproveitado.
  - Lista de contas buscada uma vez e reaproveitada; "Atualizar lista" busca de novo.
  - Visualizador não dispara nada; cliente não vê o aviso.
- **Testes antigos ajustados à regra nova**, sem esconder nada:
  - "Sincronizar agora" agora mostra 3 contas sincronizadas e 1 reaproveitada, porque ela tinha acabado de ser sincronizada;
  - Sincronização e Logs passam a entrar direto na página que testam.
- **Todos os testes de navegador**: **625 verificações** passando.
- **Automáticos**: 103 (site) + 87 (regras) + 59 (servidor). Tipos e build sem erros.
- **Com dados reais**: as duas funções do servidor foram publicadas, e a sincronização automática segue normal.
  - A importação do histórico já passa de **150 blocos**.
  - Os 2 únicos erros foram pausas pedidas pelo Meta, e o sistema tentou de novo sozinho.

## 6. Como testar você mesmo

1. Abra o **Dashboard**: embaixo dos filtros aparece "Dados atualizados há X minutos".
2. Vá em **Sincronização** e clique em **Sincronizar agora** duas vezes seguidas. Na segunda, a tela avisa que as contas já estavam atualizadas e que os dados guardados foram usados.
3. Em **Contas**, clique duas vezes em **Verificar status e saldo**. Na segunda, a mensagem diz que o saldo de menos de 10 minutos foi reaproveitado.
4. Em **Configurações → Integrações → Ver contas desta conexão**, feche e abra de novo: a lista aparece na hora, com o botão **Atualizar lista**.

## 7. Resultado esperado

Telas mais rápidas, menos consultas às APIs do Meta e do Google, e sempre a indicação de quando os dados foram atualizados.
