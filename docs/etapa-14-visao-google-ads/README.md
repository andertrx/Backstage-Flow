# ETAPA 14 — Visão Google Ads

> Status: **concluída e validada**.

## 1. O que fizemos (explicado de forma simples)

O item **Google Ads** do menu (antes "em breve") virou uma área completa, só com dados do Google:

| Parte | O que mostra |
|---|---|
| **Estrutura** | Quantas **contas**, **campanhas**, **grupos** e **anúncios** existem, com ativos, pausados e com erro |
| **Desempenho** | Investimento, Impressões, Cliques, CTR, CPC, CPM, Conversões, **Custo/conversão**, **Valor de conversão** e ROAS, cada um comparado com o período anterior |
| **Contas** | Para cada conta: **status**, **orçamento** (e até quando vale), quanto **já foi veiculado**, quanto está **disponível** e **problemas de cobrança** |
| **Campanhas com mais investimento** | As 5 maiores do período, com conversões e custo por conversão. Cada uma abre o detalhe com grupos e anúncios |

## 2. Por que assim

- **Mesma tela do Meta, com os nomes do Google:** a área foi construída na Etapa 13 para servir às duas plataformas. Aqui mudam:
  - a lista de indicadores;
  - "Custo/conversão" em vez de "CPA";
  - "Grupos" em vez de "Conjuntos";
  - orçamento em vez de saldo.
- **Conversões fracionadas:** o Google pode informar 40,5 conversões (quando divide o crédito entre anúncios). Mostramos exatamente como vem.
- **Nada inventado:**
  - sem orçamento informado, aparece "Não informado pela API";
  - sem valor de conversão configurado na conta, o card explica o motivo;
  - campos que só existem no Meta (forma de pagamento, valor devido) não aparecem no Google.
- **Problemas de cobrança:** agora aparecem numa linha própria, nas duas plataformas:
  - "Nenhum informado" para uma conta verificada sem problemas;
  - o problema em vermelho, quando há um.
- **Alcance:** não faz parte da lista pedida para o Google, então a tela nem consulta.

## 3. O que mudou no banco

**Nada.** A tela usa as consultas já existentes: resumo (Etapa 6), saldo e orçamento (Etapa 7), campanhas (Etapa 9) e estrutura (Etapa 13).

## 4. Testes realizados

| Teste | Resultado |
|---|---|
| **Cálculos** (valor de conversão, indicadores e nomes do Google) | ✅ |
| ↳ compartilhado 74 testes, site 63 testes | ✅ |
| **Navegador:** 31 verificações novas | ✅ |
| ↳ menu abre a área; os 10 indicadores na ordem, com os nomes do Google | ✅ |
| ↳ só dados do Google (o Meta fica de fora); conversões fracionadas | ✅ |
| ↳ custo/conversão, valor de conversão e ROAS calculados certo; comparação | ✅ |
| ↳ estrutura com "Grupos"; anúncios com erro destacados | ✅ |
| ↳ orçamento, validade, já veiculado, disponível e problemas de cobrança | ✅ |
| ↳ campanhas com conversões e custo/conversão; filtro de conta | ✅ |
| ↳ o Meta continua com os próprios indicadores; celular; perfil cliente não acessa | ✅ |
| **Navegador:** todas as verificações anteriores continuam passando (362) | ✅ |

**Problemas encontrados e corrigidos**
1. **Cartões de conta atrasados:** depois de trocar o filtro de conta, os cartões levavam um instante para atualizar. O teste agora espera a atualização.

## 5. Como testar manualmente

> Os números de desempenho aparecem depois que a sincronização buscar os dados (Etapa 16). O orçamento aparece para as contas verificadas na Etapa 7.

1. No menu, clique em **Google Ads**.
2. Veja a estrutura, os indicadores e os cartões das contas com o orçamento.
3. Clique numa campanha para ver os grupos e anúncios.

### Resultado esperado
Uma visão completa do Google Ads, no mesmo padrão da do Meta, com os nomes e as informações próprios do Google.

## 6. Arquivos

**Criados**
```
apps/web/e2e/google-view.mjs
```

**Modificados**
```
packages/shared/src/metrics/kpis.ts (+ teste)             → indicador "Valor de conversão"
apps/web/src/features/platforms/logic.ts (+ teste)        → configuração do Google (indicadores, nomes, "Grupos")
apps/web/src/features/platforms/PlatformPage.tsx          → ícone/cor por plataforma, cartão de conta com orçamento, problemas de cobrança
apps/web/src/features/dashboard/summary.ts                → motivo quando falta valor de conversão
apps/web/src/app/router.tsx, components/layout/navigation.ts → /google-ads deixa de ser "em breve"
apps/web/e2e/meta-view.mjs, apps/web/package.json, README.md
```
