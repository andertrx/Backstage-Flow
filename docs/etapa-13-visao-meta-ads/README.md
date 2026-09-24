# ETAPA 13 — Visão Meta Ads

> Status: **concluída e validada**.

## 1. O que fizemos (explicado de forma simples)

O item **Meta Ads** do menu (antes "em breve") virou uma área completa, só com dados do Meta:

| Parte | O que mostra |
|---|---|
| **Estrutura** | Quantas **contas**, **campanhas**, **conjuntos** e **anúncios** existem, com quantos estão ativos, pausados ou com erro |
| **Desempenho** | Investimento, **Alcance**, Impressões, **Frequência**, Cliques, CTR, CPC, CPM, Leads, Mensagens, Conversões, CPL, **CPA** e ROAS, cada um comparado com o período anterior |
| **Contas** | Para cada conta: **status**, **saldo disponível**, **cobrança** (pré ou pós-paga), forma de pagamento, valor devido e alertas (ex.: pagamento pendente) |
| **Campanhas com mais investimento** | As 5 maiores do período. Cada uma abre o detalhe com conjuntos e anúncios (Etapa 10) |

Os filtros (período, cliente, conta, campanha e status) funcionam como no Dashboard. A plataforma fica fixa no Meta.

## 2. Por que assim

- **Alcance honesto:** o alcance conta **pessoas diferentes**. Se a mesma pessoa viu anúncios de duas contas, somar contaria essa pessoa duas vezes. Por isso:
  - com **uma conta** (ou uma campanha) escolhida, mostramos o alcance **pronto da API do Meta** para o período exato;
  - com várias contas ou várias campanhas, o card explica o motivo e pede para escolher uma;
  - a **frequência** segue a mesma regra (impressões ÷ alcance).
- **Nada inventado:**
  - o saldo só aparece quando o Meta informa o limite e o valor gasto;
  - sem isso, aparece "Não informado pela API";
  - a forma de pagamento é mostrada exatamente como o Meta envia.
- **Sem repetição:** quando o status da conta já diz "Pagamento pendente", o mesmo aviso não aparece duas vezes.
- **Moedas separadas:** contas em dólar aparecem numa aba própria, sem conversão.
- **Reaproveitamento:** a tela foi feita para servir também ao Google Ads (Etapa 14). Muda só a lista de indicadores e o nome "grupos".
- **Menu:** só a equipe interna vê esta área. O perfil cliente não acessa.

## 3. O que mudou no banco

**Nenhuma tabela nova.**
- Consulta nova `platform_structure`: conta campanhas, conjuntos/grupos e anúncios por status, só de contas vinculadas. Ela roda **com a permissão de quem pergunta**.
- O alcance vem da tabela `period_reach` (Etapa 5), que guarda o alcance que a plataforma calculou para cada período.

## 4. Testes realizados

| Teste | Resultado |
|---|---|
| **Banco** (`supabase/tests/etapa13_platform_structure.sql`) | ✅ |
| ↳ contagem por status; Google separado do Meta; conta desvinculada fora | ✅ |
| ↳ filtros de cliente, conta e campanha | ✅ |
| ↳ gestor não vê cliente não liberado; visitante sem login bloqueado | ✅ |
| **Cálculos** (alcance, frequência, CPA, regra do alcance, estrutura) | ✅ |
| ↳ compartilhado 74 testes, site 62 testes | ✅ |
| **Navegador:** 43 verificações novas | ✅ |
| ↳ menu abre a área; os 14 indicadores na ordem; só dados do Meta | ✅ |
| ↳ CTR, CPC, CPM, CPL, CPA e ROAS calculados certo; comparação | ✅ |
| ↳ alcance: várias contas (explica), uma conta (12.000), campanha (8.000), sem dado (explica) | ✅ |
| ↳ estrutura com ativos, pausados e com erro | ✅ |
| ↳ saldo, cobrança, forma de pagamento, valor devido e alertas das contas | ✅ |
| ↳ campanhas com mais investimento; links; dólar separado; celular | ✅ |
| ↳ perfil cliente não acessa | ✅ |
| **Navegador:** as 318 verificações anteriores continuam passando | ✅ |
| **Segurança** (verificador do Supabase) | ✅ só o aviso conhecido da senha vazada (ajuste no painel) |

**Problemas encontrados e corrigidos**
1. **Aviso repetido:** "Pagamento pendente" aparecia duas vezes no cartão da conta (no status e no alerta). Agora aparece uma vez.
2. **Textos longos:** a explicação do alcance ocupava o card inteiro. Foi encurtada.
3. **Celular:** o nome da campanha ficava cortado ("Le..."). Agora ocupa a linha inteira.

## 5. Como testar manualmente

> Os números aparecem depois que a sincronização buscar os dados (Etapa 16). Saldo e status já aparecem para as contas verificadas na Etapa 7.

1. No menu, clique em **Meta Ads**.
2. Veja a estrutura, os indicadores e os cartões das contas.
3. Escolha **uma conta** no filtro **Conta**: o alcance e a frequência aparecem, quando o Meta já enviou esse período.
4. Clique numa campanha em "Campanhas com mais investimento" para ver os conjuntos e anúncios.

### Resultado esperado
Uma visão completa do Meta Ads: estrutura, desempenho, saldo, status e cobrança, sem números inventados.

## 6. Arquivos

**Criados**
```
supabase/migrations/20260925060000_platform_structure.sql
supabase/tests/etapa13_platform_structure.sql
apps/web/src/features/platforms/PlatformPage.tsx          → a área da plataforma (Meta agora, Google na Etapa 14)
apps/web/src/features/platforms/logic.ts (+ teste)        → indicadores da plataforma, regra do alcance, estrutura
apps/web/src/features/platforms/api.ts                    → estrutura e alcance do período
apps/web/e2e/meta-view.mjs
```

**Modificados**
```
packages/shared/src/metrics/kpis.ts (+ teste)             → Alcance, Impressões, Frequência, Cliques e CPA
apps/web/src/features/dashboard/{FiltersBar.tsx,summary.ts} → plataforma fixa; motivo do CPA sem dado
apps/web/src/app/router.tsx, components/layout/navigation.ts → /meta-ads deixa de ser "em breve"
apps/web/e2e/support.mjs, apps/web/package.json, README.md
```
