-- =============================================================================
-- REMOÇÃO do Dashboard do cliente (Etapa 19: 19.1 e 19.2).
--
-- Apaga o modelo de relatório de cada cliente (título, métricas escolhidas,
-- análise da agência), o acesso do cliente (login e link secreto; todos os
-- links param de funcionar) e as funções do dashboard. Volta a regra antiga
-- de visibilidade do papel "cliente". NÃO mexe nas
-- métricas, campanhas, contas nem clientes. Só rodar com decisão explícita,
-- no SQL Editor. Depois: apagar a Edge Function "client-report-link" no painel
-- do Supabase e reverter o commit da Etapa 19 no GitHub.
-- =============================================================================
begin;

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
