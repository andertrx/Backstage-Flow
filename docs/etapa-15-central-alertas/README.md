# ETAPA 15 — Central de alertas

> Status: **concluída e testada**, aguardando sua validação.

## 1. O que fizemos (explicado de forma simples)

O item **Alertas** do menu (antes "em breve") virou a central de problemas. O sistema procura problemas sozinho **a cada 15 minutos** e mostra cada um como um cartão:

| Gravidade | Tipos |
|---|---|
| 🔴 Crítica | Conta sem saldo · Conta restrita · Conta desativada · Problema de pagamento · Problema na cobrança · Erro na API |
| 🟠 Alta | Saldo baixo · Sincronização atrasada · Sem forma de pagamento |
| 🟡 Média | Campanha sem entrega · Queda significativa de resultados |

**Cada alerta mostra:** data, cliente, plataforma, conta, tipo, gravidade, descrição e status. Mostra também a **ação recomendada**, mas só quando existe uma orientação técnica objetiva (por exemplo, "Adicionar saldo ou aumentar o limite de gastos"). Para "campanha sem entrega" e "queda de resultados" as causas variam, então nenhuma ação é inventada.

**O que dá para fazer:**
- Filtrar por situação (abertos, resolvidos, todos), gravidade, tipo, cliente e plataforma.
- Clicar em 🔴 / 🟠 / 🟡 no topo para ver só aquela gravidade.
- **Marcar como visto**, **Reabrir** ou **Resolver** (administrador, gestor e operador).
- **Verificar agora**, sem esperar os 15 minutos.
- Ver no menu **quantos alertas ainda não foram vistos** (número vermelho ao lado de "Alertas").

## 2. Por que assim

- **Nada inventado:** os alertas só usam dados que as plataformas informaram e que já estão guardados. Sem dado, não há alerta.
- **Sem repetição:** enquanto o problema existir, ele continua sendo **o mesmo alerta**. Só a data da última verificação muda.
- **Resolução automática:** quando o problema some (por exemplo, o saldo foi recarregado), o alerta é marcado como "resolvido automaticamente" e vira histórico.
- **Histórico permanente:** alerta resolvido nunca é apagado.
- **Regras cuidadosas para não gerar alarme falso:**
  - **Saldo baixo:** o saldo acaba antes do número de dias configurado na conta (padrão 3), ou fica abaixo do valor mínimo que você definiu.
  - **Sincronização atrasada:** a conta já sincronizou antes e está há mais de 48 horas sem sucesso. Uma conta que ainda nunca sincronizou não gera esse alerta.
  - **Campanha sem entrega:** campanha ativa, criada há mais de 2 dias, sem nenhuma impressão ontem e anteontem, e só quando as outras campanhas da conta foram sincronizadas nesses dias (senão seria falta de dado, não falta de entrega). Se a conta está sem saldo ou bloqueada, o alerta da conta já explica a causa e as campanhas não repetem o aviso.
  - **Queda de resultados:** leads (Meta) ou conversões (Google e contas do Meta sem leads) caíram **40% ou mais** nos últimos 7 dias, comparados aos 7 dias anteriores, com base mínima de 10 e dados em pelo menos 5 dos 7 dias.
- **Segurança:**
  - cada pessoa só vê alertas dos clientes liberados para ela;
  - o perfil cliente não vê a central interna;
  - só administrador, gestor e operador mudam o status ou verificam;
  - a tabela não aceita alteração direta, só pelas funções do sistema.

## 3. O que mudou no banco

**Tabela nova `alerts`** (explicada antes de ser criada):

| Campo | Tipo | Para quê |
|---|---|---|
| id | número | Identificação |
| alert_key | texto | Identifica o problema (tipo + conta/campanha). Evita duplicar |
| type / severity | texto | Tipo e gravidade (crítica, alta, média) |
| client_id, platform_id, ad_account_id, campaign_id | ligações | Cliente, plataforma, conta e campanha |
| description / recommended_action | texto | Descrição e ação recomendada (opcional) |
| details | JSON | Números usados na regra (ex.: saldo, previsão) |
| status | texto | aberto → visto → resolvido |
| first_seen_at / last_seen_at | data e hora | Quando apareceu e quando foi visto pela última vez |
| seen_at/by, resolved_at/by, resolution | data, pessoa | Quem viu e quem resolveu, e se foi automático ou manual |

- **Índices:** por status + gravidade + data, por cliente, conta, campanha e plataforma. Um índice único impede dois alertas abertos para o mesmo problema.
- **Guarda dos dados:** permanente.
- **Funções:**
  - `refresh_alerts` faz a verificação (cria, atualiza e resolve);
  - `set_alert_status` muda o status;
  - as regras ficam na parte privada do banco.
- **Agendamento:** `refresh-alerts` roda a cada 15 minutos (pg_cron).

## 4. Testes realizados

| Teste | Resultado |
|---|---|
| **Banco** (`supabase/tests/etapa15_alerts.sql`) | ✅ |
| ↳ cada tipo de alerta com um caso real (sem saldo, saldo baixo com previsão, pagamento, cobrança, restrita com motivo, erro na API, sincronização atrasada, campanha sem entrega, queda de 67%) | ✅ |
| ↳ campanha nova e campanha entregando não geram alerta; conta desvinculada não gera alerta | ✅ |
| ↳ verificar de novo não duplica; problema resolvido na plataforma → resolvido automaticamente | ✅ |
| ↳ visto, reabrir, resolver; resolvido não muda mais; status inválido recusado | ✅ |
| ↳ gestor só vê e altera os próprios clientes; visualizador só vê; visitante bloqueado; alteração direta bloqueada | ✅ |
| ↳ agendamento de 15 minutos existe | ✅ |
| **Cálculos** (nomes, ordem, contagem) | ✅ compartilhado 78 testes, site 63 testes |
| **Navegador:** 33 verificações novas | ✅ |
| ↳ número no menu; resumo 🔴 🟠 🟡; ordem por gravidade; todos os campos do alerta | ✅ |
| ↳ ação recomendada só quando existe; link para a campanha | ✅ |
| ↳ filtros; histórico de resolvidos; visto, reabrir e resolver; "Verificar agora" | ✅ |
| ↳ visualizador sem botões; perfil cliente sem acesso; tela vazia; celular | ✅ |
| **Navegador:** as 393 verificações anteriores continuam passando | ✅ |
| **Segurança** (verificador do Supabase) | ✅ só o aviso conhecido da senha vazada (ajuste no painel) |

**Problemas encontrados e corrigidos**
1. **Sincronização atrasada não aparecia** para contas sem registro de conexão: um valor vazio fazia a regra pular a conta. O teste do banco pegou, e foi corrigido.
2. **Número com vírgula sobrando** na descrição da queda ("de 21, para 7,"). Corrigido.
3. **Aviso de segurança do Supabase:** as funções com privilégio estavam expostas diretamente na API. Elas foram para a parte privada do banco, e a API só repassa a chamada. O aviso sumiu.
4. **Texto confuso:** "Visto pela última vez" se confundia com o status "Visto". Agora diz "Problema ainda presente na verificação de…".
5. **Teste do Dashboard no celular** media a tela antes de o gráfico se ajustar. Agora espera.
6. **Contagem errada na Etapa 14:** o total anterior era 362 verificações, e não 342. O documento foi corrigido.

## 5. Como testar manualmente

> Como as contas ainda não sincronizam sozinhas (Etapa 16), por enquanto os alertas vêm do saldo e do status das contas verificadas na Etapa 7.

1. No menu, clique em **Alertas**.
2. Clique em **Verificar agora**.
3. Se aparecer algum alerta, experimente **Marcar como visto** e **Resolver**.
4. Use os filtros e a **Situação → Resolvidos** para ver o histórico.

### Resultado esperado
Uma lista clara dos problemas, do mais grave para o menos grave, com o que fazer quando existe uma orientação objetiva, sem alertas inventados e sem repetição.

## 6. Arquivos

**Criados**
```
supabase/migrations/20260925070000_alerts.sql                 → tabela, regras, verificação, status, agendamento
supabase/migrations/20260925071000_alerts_fix_empty_connection.sql → correções 1 e 2
supabase/migrations/20260925072000_alerts_private_impl.sql    → correção 3 (segurança)
supabase/tests/etapa15_alerts.sql
packages/shared/src/alerts/labels.ts (+ teste)                → nomes, gravidades, ordem
apps/web/src/features/alerts/{AlertsPage.tsx, api.ts}         → a central de alertas
apps/web/e2e/alerts.mjs
```

**Modificados**
```
packages/shared/src/index.ts
apps/web/src/components/layout/{AppLayout.tsx, navigation.ts} → número de alertas no menu; /alertas deixa de ser "em breve"
apps/web/src/app/router.tsx
apps/web/e2e/{support,dashboard}.mjs, apps/web/package.json, README.md
docs/etapa-14-visao-google-ads/README.md                      → contagem corrigida
```
