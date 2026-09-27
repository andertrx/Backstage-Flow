-- =============================================================================
-- REMOÇÃO do Dashboard do cliente (Etapa 19).
--
-- Apaga o modelo de relatório de cada cliente (título, métricas escolhidas,
-- análise da agência) e as funções de leitura do dashboard. NÃO mexe nas
-- métricas, campanhas, contas nem clientes. Só rodar com decisão explícita,
-- no SQL Editor. Depois: reverter o commit da Etapa 19 no GitHub.
-- =============================================================================
begin;

drop function if exists public.client_report_campaigns(uuid, date, date);
drop function if exists public.client_report_daily(uuid, date, date);
drop function if exists public.client_report_accounts(uuid, date, date);
drop function if exists private.sum_actions(jsonb[]);
drop table if exists public.client_report_settings;

commit;
