# Estado atual do projeto (18/10/2026)

> Atualize este arquivo ao fim de cada fase: o que ficou pronto, o que ficou pendente e a próxima decisão do Ander.

## 1. Última entrega
- **Etapa 39 (Inteligência de Resultados, Google Sheets):** plano `docs/etapa-39-inteligencia-de-resultados/39.0-PLANO.md`, aprovado com mudanças (planilha é o banco; leitura 8h/12h/16h + botão; sem guardar contatos). **39.1 pronta** (17/10): chave da conta de serviço no Vault (`google_sheets_key`, `sheets_settings`), planilha por cliente (`ri_sources`), Edge Function `sheets` publicada (verify_jwt true), menu e assistente. **39.2 pronta** (17/10): leitura 8h/12h/16h (cron `sheets-read`, 11/15/19 UTC) + botão "Atualizar agora"; só a última leitura fica em `ri_snapshots` (sem dados pessoais legíveis, contato em hash); situação/falhas em `ri_sources`; Edge Function `sheets` agora com verify_jwt **false** (ela confere login ou segredo do cron). Falta a chave real do Ander (nada testado com planilha real). **39.3 pronta** (17/10): `ri_results`/`ri_records` + `private.ri_rows` (perfil pelas regras na hora da consulta; origem por ID anúncio→conjunto→campanha, ou nome único; contato único por hash), regras de ranking em `packages/shared/src/results/ranking.ts`. **39.4 pronta** (17/10): abas Visão geral/Lojistas/Sacoleiros/Consumidores/Planilha em `features/results` (ResultsDashboard, RecordsModal, look.ts), `ri_daily`, atalho na ficha do cliente, mock com a mesma regra de ligação (`riRows`). **39.5 pronta** (18/10): aba Qualidade dos dados (`ri_quality`, `ri_records` sem período), exportação CSV/Excel por perfil (`features/results/export.ts`, reaproveita `reportXlsx` com abas Conjuntos/Anúncios). **Etapa 39 completa no código; falta a primeira leitura real** (chave do Google do Ander). **19/10:** parâmetros da planilha refeitos (`39.6-PARAMETROS-DA-PLANILHA.md`): Nome (não guardado), Número, SQL (era "Perfil comercial"), Data, utm_source/medium/campaign/content/term, IDs, gclid/fbclid (só a marcação), personalizados `x:<nome>` (até 20); `ri_records_extra`; Edge Function `sheets` v3.
- **Frase do resumo dos relatórios (13/10/2026):** editável por cliente com marcadores (`client_report_settings.summary_template`), desligável também no e-mail semanal; nome do resultado como foi escrito. Edge Function `client-report-email` publicada (versão 2). Documento: `docs/etapa-19-dashboard-cliente/CORRECAO-2026-10-13-FRASE-DO-RESUMO.md`.
- **Correção do saldo PIX (13/10/2026):** a conta "CA - Estilo de Ser Kids" (cartão cadastrado, campanhas rodando com PIX) usa saldo **informado no CRM**: recargas registradas − gasto que o Meta informa depois. Só contas com `ad_accounts.manual_prepaid` (ligado só nela). Tabela `account_manual_balance_entries`. Documento: `docs/etapa-07-verificacao-saldo/CORRECAO-2026-10-13-SALDO-PIX-INFORMADO.md`.
- **Correção do saldo (28/09/2026):**
  - disponível = dinheiro real;
  - cartão = R$ 0,00;
  - saldo pré-pago (PIX/boleto) = valor informado pelo Meta;
  - etiqueta da forma de pagamento em cada conta.
  - Commit `c0042bd`. Documento: `docs/etapa-07-verificacao-saldo/CORRECAO-2026-09-28-FORMA-DE-PAGAMENTO.md`.
- **Etapa 36 (Central de Operações) concluída** (36.1 a 36.7). Relatório final: `docs/etapa-36-central-operacoes/36.16-RELATORIO-FINAL.md`.
- **Etapa 37 (Monitoramento de Desempenho):** auditoria 37.0 aprovada ("pode avançar" = propostas aceitas: menu em Análise antes de Alertas, azul, alerta antigo desligado na 37.3, só link oficial). **37.1 pronta** (30/09/2026): `docs/etapa-37-monitoramento/37.1-BASE.md`. **37.2 pronta** (01/10/2026): `37.2-COMPARATIVOS.md`. **37.3 pronta** (02/10/2026): `37.3-MOTOR-DE-ALERTAS.md` — motor agendado (`monitor-evaluate`, a cada 15 min, respeita a frequência configurada), alerta antigo "Queda de resultados" desligado (reativação em `supabase/rollback/reativar_queda_resultados.sql`). **37.4 pronta** (03/10/2026): `37.4-TRATAR-ALERTAS.md` — tratar alertas no painel do alerta; a lista passou a usar `monitor_alerts_query` (jsonb). **37.5 pronta** (03/10/2026): `37.5-NOTIFICACOES.md` — ícone de avisos próprio do Monitoramento no topo (o sino da Central não mudou), preferências por pessoa, e-mail pela Edge Function `monitor-email` (agendamentos `monitor-emails` a cada 5 min e `monitor-digest` de hora em hora), WhatsApp só "preparado". **37.6 pronta** (03/10/2026): `37.6-VISAO-GERAL-E-INTEGRACAO.md` — resumo (`monitor_summary`) e histórico (`monitor_history`); Visão geral completa, aba Histórico, faixa no dashboard e nas visões Meta/Google, bloco na ficha do cliente. **Etapa 37 concluída**: relatório final em `37.7-RELATORIO-FINAL.md`. **Pedido extra (03/10):** filtro de objetivo da campanha no Monitoramento (`37.8-FILTRO-DE-OBJETIVO.md`): vários objetivos, salvo por pessoa em `monitor_view_prefs`, vale para todas as abas; `monitor_compare/summary/history` ganharam versão com `p_objectives`. **Correção 04/10:** só alertas críticos (`monitor_settings.min_severity`, padrão `critico`; 54 de atenção encerrados com `closed_reason = abaixo_do_minimo`), abas de comparação só com itens ativos (opção para pausados), janela (`Modal`) corrigida no celular; 2ª parte: painéis dos sininhos (`MonitorBell`, `NotificationBell`) em largura de tela no celular (teste `e2e/mobile-panels.mjs`). **3ª parte (04/10):** abas Comparativos/Campanhas/Criativos viraram níveis dentro de Alertas (Alertas · Campanhas · Conjuntos · Anúncios · Criativos · Contas, `?nivel=`), filtro Gravidade, endereços antigos redirecionados (`37.10-NIVEIS-DENTRO-DE-ALERTAS.md`). **05/10:** resultado pela meta de otimização do conjunto (Conversas → conversas etc.), no motor e na tela; `private.monitor_result_kind_for` (`37.11-RESULTADO-PELA-META.md`). Botão "Resolver" com confirmação direto na lista de alertas (`37.12-BOTAO-RESOLVIDO.md`). Doc: `37.9-CORRECAO-SO-CRITICOS-E-CELULAR.md`.
- **Etapa 38 (Comercial separado da Operação):** plano `docs/etapa-38-comercial-e-operacao/38.0-PLANO.md` aprovado em 05/10 (aba "Clientes" da Central virou "Operação"; Operação vai começar em Onboarding Pendente). **38.1 pronta** (05/10): abas reorganizadas (Equipe/Configurações à parte), Comercial com Funil / Ganhos e perdidos / Configurações do comercial (`38.1-ABAS-E-COMERCIAL.md`), só telas. **38.2 pronta** (05/10): botão "Liberar para a operação" no cartão em Contrato Pago, etapa `contrato_pago` da operação desativada (Operação começa em Onboarding Pendente), Filas dentro da aba Operação (papel Equipe vê só as Filas) (`38.2-LIBERAR-E-OPERACAO.md`). **Etapa 38 concluída.**
- **Armadilha (ferramenta do banco):** `execute_sql`/`apply_migration` ficam esperando uma confirmação que nunca aparece (e dão "timeout") quando o SQL tem `TRUNCATE`, `DELETE` ou `DROP`. Use alternativas (ex.: renomear tabelas temporárias) ou peça ao Ander para rodar no SQL Editor. Sobrou uma função vazia de teste, `private.monitor_probe_tmp()` (não faz nada; remover no SQL Editor quando der).

## 2. Etapas: situação
| Etapa | Situação |
|---|---|
| 0 a 32 | ✅ concluídas (ver README) |
| 33 — Agente de IA | ⏸️ **em espera, a pedido do Ander**. Auditoria e plano prontos, nada implementado. Existe um ponto de restauração (`docs/PONTO-DE-RESTAURACAO.md`). |
| 34 — Tracking & CAPI | 🔄 em andamento: feitas 34.1, 34.2, 34.3, 34.4, 34.5-W e 34.5-W2 |
| 35 — Campaign Builder do Meta | ⏸️ **em espera**: o pedido foi enviado por engano; a auditoria está guardada |
| 36 — Central de Operações | ✅ concluída |
| 37 — Monitoramento de Desempenho | ✅ concluída (37.1 a 37.6) |
| 38 — Comercial separado da Operação | ✅ concluída (38.1 e 38.2) |
| 39 — Inteligência de Resultados (Google Sheets) | ✅ concluída no código (39.1 a 39.5); falta a primeira leitura real com a chave do Google do Ander |

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

6. **Saldo PIX da Estilo de Ser Kids:** resolvido em 13/10/2026 (ver Última entrega). O Meta não informa esse saldo pela API (conferido no dado bruto): o Ander registra as recargas no CRM.

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
- **Navegador:** 43 roteiros, 1.300 verificações (02/10/2026).
- **Testes SQL da Central:** 178 verificações (36.1 a 36.7).
- **Contas reais do Meta:** 28 (17 no cartão e 11 pré-pagas). Nenhuma conta Google conectada.
