# Estado atual do projeto (29/09/2026)

> Atualize este arquivo ao fim de cada fase: o que ficou pronto, o que ficou pendente e a próxima decisão do Ander.

## 1. Última entrega
- **Correção do saldo (28/09/2026):**
  - disponível = dinheiro real;
  - cartão = R$ 0,00;
  - saldo pré-pago (PIX/boleto) = valor informado pelo Meta;
  - etiqueta da forma de pagamento em cada conta.
  - Commit `c0042bd`. Documento: `docs/etapa-07-verificacao-saldo/CORRECAO-2026-09-28-FORMA-DE-PAGAMENTO.md`.
- **Etapa 36 (Central de Operações) concluída** (36.1 a 36.7). Relatório final: `docs/etapa-36-central-operacoes/36.16-RELATORIO-FINAL.md`.
- **Etapa 37 (Monitoramento de Desempenho):** auditoria 37.0 aprovada ("pode avançar" = propostas aceitas: menu em Análise antes de Alertas, azul, alerta antigo desligado na 37.3, só link oficial). **37.1 pronta** (30/09/2026): `docs/etapa-37-monitoramento/37.1-BASE.md`. **37.2 pronta** (01/10/2026): `37.2-COMPARATIVOS.md`. Próxima: 37.3 (motor de alertas; desligar o alerta antigo "Queda de resultados" depois de validar).

## 2. Etapas: situação
| Etapa | Situação |
|---|---|
| 0 a 32 | ✅ concluídas (ver README) |
| 33 — Agente de IA | ⏸️ **em espera, a pedido do Ander**. Auditoria e plano prontos, nada implementado. Existe um ponto de restauração (`docs/PONTO-DE-RESTAURACAO.md`). |
| 34 — Tracking & CAPI | 🔄 em andamento: feitas 34.1, 34.2, 34.3, 34.4, 34.5-W e 34.5-W2 |
| 35 — Campaign Builder do Meta | ⏸️ **em espera**: o pedido foi enviado por engano; a auditoria está guardada |
| 36 — Central de Operações | ✅ concluída |
| 37 — Monitoramento de Desempenho | 🔄 em andamento: 37.1 e 37.2 feitas; próximas 37.3 a 37.6 (plano na auditoria) |

### Próximas fases possíveis (Etapa 34, ver `docs/etapa-34-tracking/ANALISE-E-PLANO.md`)
| Fase | O que entrega | Depende do Ander? |
|---|---|---|
| **34.5** | Vendas fora do site (manual ou webhook), ligadas à origem e enviadas ao Meta como conversão | não (**recomendada**) |
| 34.6 | Links rastreáveis: gerador com padrão de nomes e `/go/...` | não |
| 34.7 | Tracking "estilo GTM" simplificado: eventos, gatilhos, destinos, teste, versões | não |
| 34.8 | Conversões para o Google (Google Ads + GA4) | sim: Google Ads conectado |
| 34.9 | Monitoramento do tracking | melhor por último |

## 3. Pendências técnicas (para o Claude)
1. **Edge Functions `sync` e `ad-accounts` desatualizadas.**
   - O GitHub tem a regra nova do saldo (`_shared/platforms/meta/funding.ts`), mas as versões publicadas no Supabase são as antigas.
   - Não há risco: um gatilho no banco (`account_snapshots_meta_payment`) e a função `account_balances()` aplicam a regra a tudo que chega.
   - Publique as duas na próxima mudança de servidor (como fazer: COMO-TRABALHAR, seção 5).
   - **Atualização 30/09 (37.1):** elas também levam o ID do criativo (`creative{id}`). Não foi publicado porque o pacote tem 62–178 mil caracteres e a ferramenta exige colar à mão. Proposta ao Ander em PENDENCIAS: publicação automática pelo GitHub (token só nos segredos do GitHub).
2. **Google Ads:** nenhuma conta conectada ainda.
   - Quando a primeira for conectada, confira o que a API informa sobre a forma de pagamento (cartão, PIX ou boleto) e o saldo. Hoje o disponível do Google é "orçamento − veiculado", só quando existe orçamento com limite.
3. **Saúde das contas:** a tela mostra o disponível da função `account_health`, que não traz a origem do saldo. Conta no cartão aparece como "—" (não como R$ 0,00). É aceitável; melhorar se o Ander pedir.
4. **Testes de navegador com falha conhecida:**
   - `charts.mjs` às segundas-feiras;
   - `tracking.mjs` entre 00h00 e 00h20 UTC.

   Não é regressão, mas pode ser corrigido um dia.
5. **Avisos de segurança do Supabase que já existiam e são aceitos:**
   - tabelas internas (`history.tracking_events_*`, `private.rate_limits`, `private.track_limits`) sem regra de leitura, de propósito;
   - "proteção contra senhas vazadas" desligada: é item do Ander, no painel.

## 4. Pendências do Ander
A lista completa está em [`docs/PENDENCIAS.md`](../PENDENCIAS.md). Lembre nos relatórios:
- **Google Cloud:** URIs de redirecionamento do domínio novo, quando for conectar o Google Ads.
- **GitHub:** deixar o repositório privado.
- **Tracking:**
  - escolher o cliente piloto;
  - passar o ID do Pixel;
  - colar o token da CAPI **no CRM**;
  - pegar o código de teste do Meta.
- **Supabase (segurança do login):**
  - desligar o cadastro aberto;
  - ligar a proteção contra senhas vazadas;
  - ligar a verificação em duas etapas (MFA).
- **Resend:** verificar o domínio e colar a chave no CRM (e-mail semanal da Etapa 19.4).

## 5. Números de referência (28/09/2026)
- **Testes unitários:** web 147 e shared 166.
- **Edge Functions:** 115 testes.
- **Navegador:** 42 roteiros, 1.267 verificações (30/09/2026).
- **Testes SQL da Central:** 178 verificações (36.1 a 36.7).
- **Contas reais do Meta:** 28 (17 no cartão e 11 pré-pagas). Nenhuma conta Google conectada.
