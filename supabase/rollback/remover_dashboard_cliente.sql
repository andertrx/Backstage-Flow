-- =============================================================================
-- REMOÇÃO do Dashboard do cliente (Etapa 19: 19.1, 19.2, 19.3 e 19.4).
--
-- Apaga o modelo de relatório de cada cliente (título, métricas escolhidas,
-- análise da agência), o acesso do cliente (login e link secreto; todos os
-- links param de funcionar), as divisões por idade/gênero/horário… (19.3) e
-- as funções do dashboard, a logo e o e-mail semanal (19.4: configuração,
-- histórico de envios, chave do Resend e links guardados no cofre). Volta a regra antiga
-- de visibilidade do papel "cliente". NÃO mexe nas
-- métricas, campanhas, contas nem clientes. Só rodar com decisão explícita,
-- no SQL Editor. Depois: apagar as Edge Functions "client-report-link" e
-- "client-report-email" no painel do Supabase, esvaziar e apagar o bucket
-- "client-logos" em Storage (os arquivos só saem pelo painel) e reverter o
-- commit da Etapa 19 no GitHub.
-- =============================================================================
begin;

-- 19.4: e-mail semanal e logo
select cron.unschedule(jobid) from cron.job where jobname = 'report-emails';
drop function if exists private.trigger_report_emails();
drop function if exists public.client_report_email_due(integer);
drop function if exists public.client_report_email_link_get(uuid);
drop function if exists public.client_report_email_link_status(uuid);
drop function if exists private.client_report_email_link_status_impl(uuid);
drop function if exists public.client_report_email_set_link(uuid, text);
drop function if exists private.client_report_email_set_link_impl(uuid, text);
drop table if exists public.client_report_email_log;
drop table if exists public.client_report_email;
drop function if exists private.valid_emails(text[]);
drop function if exists public.email_api_key_get();
drop function if exists public.email_settings_remove_key();
drop function if exists private.email_settings_remove_key_impl();
drop function if exists public.email_settings_save(text, text, text, text);
drop function if exists private.email_settings_save_impl(text, text, text, text);
drop table if exists public.email_settings;
drop function if exists private.valid_email(text);
delete from vault.secrets where name = 'resend_api_key' or name like 'report\_link:%';
drop policy if exists "Admin e gestor enviam a logo do cliente" on storage.objects;
drop policy if exists "Admin e gestor trocam a logo do cliente" on storage.objects;
drop policy if exists "Admin e gestor apagam a logo do cliente" on storage.objects;
drop function if exists private.can_edit_client_folder(text);
alter table if exists public.client_report_settings drop column if exists logo_path;

-- 19.3: divisões. A sincronização continua funcionando sem estas tabelas, mas
-- registraria um aviso a cada rodada: publique antes a versão anterior da
-- Edge Function "sync" (a do commit antes da Etapa 19.3).
drop function if exists public.client_report_breakdown_coverage(uuid);
drop function if exists public.client_report_breakdowns(uuid, date, date);
drop function if exists public.ingest_breakdowns(uuid, date, date, text[], jsonb);
drop function if exists private.sum_action_maps(jsonb[]);
drop table if exists public.breakdown_coverage;
drop table if exists public.metrics_breakdown_daily;

-- 19.2: acesso do cliente
drop function if exists public.client_report_public(text, text, date, date);
drop function if exists public.client_portal_new_link(uuid, integer);
drop function if exists public.client_portal_set(uuid, boolean, boolean);
drop function if exists private.client_portal_new_link_impl(uuid, integer);
drop function if exists private.client_portal_set_impl(uuid, boolean, boolean);

create or replace function private.visible_client_ids()
returns setof uuid language sql stable security definer set search_path = '' as $$
  select c.id from public.clients c where private.current_user_role() = 'admin'
  union
  select a.client_id from public.user_client_access a
  where a.user_id = (select auth.uid()) and private.current_user_role() is not null
$$;
create or replace function private.can_view_client(target uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select case
    when private.current_user_role() is null then false
    when private.current_user_role() = 'admin' then true
    else exists (select 1 from public.user_client_access a where a.user_id = (select auth.uid()) and a.client_id = target)
  end
$$;
drop table if exists public.client_portal;

-- 19.1: modelo e funções do dashboard

drop function if exists public.client_report_campaigns(uuid, date, date);
drop function if exists public.client_report_daily(uuid, date, date);
drop function if exists public.client_report_accounts(uuid, date, date);
drop function if exists private.sum_actions(jsonb[]);
drop table if exists public.client_report_settings;

commit;
