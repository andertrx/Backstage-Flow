-- =============================================================================
-- Etapa 19.1 — Dashboard do cliente (modelo por cliente)
--
-- client_report_settings: como o dashboard/relatório de cada cliente é montado
--   (título, resultado principal, métricas escolhidas, seções, análise da agência).
--   Um por cliente. Sem linha = o CRM usa um modelo padrão.
--
-- Funções de leitura (com o RLS de quem pergunta; nada de tabela nova de números):
--   client_report_accounts(cliente, de, até)  → por conta de anúncio: totais do
--       período e do período anterior (mesmo tamanho), alcance/frequência do
--       período EXATO quando a plataforma informou, e as ações por tipo (Meta).
--   client_report_daily(cliente, de, até)     → dia a dia por conta.
--   client_report_campaigns(cliente, de, até) → campanhas com gasto ou resultado.
--
-- Remoção: supabase/rollback/remover_dashboard_cliente.sql
-- =============================================================================

create table public.client_report_settings (
  client_id      uuid primary key references public.clients (id) on delete cascade,
  title          text not null check (char_length(title) between 1 and 120),
  subtitle       text check (char_length(subtitle) <= 160),
  -- Resultado principal do cliente: {source: leads|messages|conversions|action, action_type?, label}
  main_result    jsonb not null default '{"source":"leads","label":"Leads"}'::jsonb
                 check (main_result ->> 'source' in ('leads', 'messages', 'conversions', 'action')
                        and char_length(coalesce(main_result ->> 'label', '')) between 1 and 60
                        and (main_result ->> 'source' <> 'action' or (main_result ->> 'action_type') ~ '^[a-z0-9_.:-]{1,120}$')),
  -- Métricas dos cartões, na ordem escolhida
  kpis           text[] not null default array['spend', 'main_result', 'cost_per_result', 'impressions', 'reach', 'clicks', 'ctr', 'cpc', 'cpm']
                 check (cardinality(kpis) between 1 and 20
                        and kpis <@ array['spend', 'main_result', 'cost_per_result', 'impressions', 'reach', 'frequency', 'clicks',
                                          'link_clicks', 'ctr', 'link_ctr', 'cpc', 'cpm', 'leads', 'cpl', 'messages',
                                          'cost_per_message', 'conversions', 'cpa', 'conversion_value', 'roas', 'video_views']),
  -- Seções ligadas/desligadas
  sections       jsonb not null default '{"summary":true,"kpis":true,"funnel":true,"daily":true,"actions":true,"campaigns":true,"notes":true}'::jsonb
                 check (jsonb_typeof(sections) = 'object'),
  default_period text not null default 'last_7_days'
                 check (default_period in ('last_7_days', 'last_14_days', 'last_30_days', 'this_month', 'last_month')),
  agency_notes   text check (char_length(agency_notes) <= 4000),
  next_steps     text check (char_length(next_steps) <= 4000),
  updated_at     timestamptz not null default now(),
  updated_by     uuid references auth.users (id) on delete set null
);
comment on table public.client_report_settings is
  'Etapa 19: modelo do dashboard/relatório de cada cliente (métricas, resultado principal, seções, análise da agência).';
create index client_report_settings_updated_by_idx on public.client_report_settings (updated_by);
create trigger client_report_settings_touch_updated_at
  before update on public.client_report_settings
  for each row execute function private.touch_updated_at();

alter table public.client_report_settings enable row level security;
revoke all on public.client_report_settings from anon, authenticated;
grant select on public.client_report_settings to authenticated;
grant insert, update on public.client_report_settings to authenticated;
-- Todos que veem o cliente (inclusive o próprio cliente) leem o modelo.
create policy "Vê o modelo dos clientes liberados" on public.client_report_settings for select to authenticated
  using (client_id in (select private.visible_client_ids()));
create policy "Admin e gestor criam o modelo" on public.client_report_settings for insert to authenticated
  with check (client_id in (select private.visible_client_ids()) and (select private.current_user_role()) in ('admin', 'gestor'));
create policy "Admin e gestor editam o modelo" on public.client_report_settings for update to authenticated
  using (client_id in (select private.visible_client_ids()) and (select private.current_user_role()) in ('admin', 'gestor'))
  with check (client_id in (select private.visible_client_ids()) and (select private.current_user_role()) in ('admin', 'gestor'));

-- Soma as ações do Meta ({actions:[{action_type, value}]}) de várias linhas → {"tipo": total}
create function private.sum_actions(p_rows jsonb[])
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(t, v), '{}'::jsonb)
    from (select a ->> 'action_type' as t, sum((a ->> 'value')::numeric) as v
            from unnest(p_rows) r
            cross join lateral jsonb_array_elements(coalesce(r -> 'actions', '[]'::jsonb)) a
           where (a ->> 'value') ~ '^-?[0-9]+(\.[0-9]+)?$' and a ->> 'action_type' is not null
           group by 1) x
$$;
revoke all on function private.sum_actions(jsonb[]) from public, anon;
grant execute on function private.sum_actions(jsonb[]) to authenticated, service_role;

create function public.client_report_accounts(p_client_id uuid, p_from date, p_to date)
returns table (
  ad_account_id uuid, platform_id text, name text, external_id text, currency text,
  cur jsonb, prev jsonb, prev_from date, prev_to date, last_synced_at timestamptz
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_pfrom date := p_from - (p_to - p_from + 1);
  v_pto date := p_from - 1;
begin
  if p_from is null or p_to is null or p_to < p_from then raise exception 'Período inválido'; end if;
  if p_to - p_from > 400 then raise exception 'Período longo demais (máx. 400 dias)'; end if;

  return query
  with accts as (
    select a.id, a.platform_id, a.name, a.external_id, a.currency
      from public.ad_accounts a
     where a.client_id = p_client_id and a.unlinked_at is null
  ),
  tot as (
    select m.ad_account_id, (m.date >= p_from) as is_cur,
           sum(m.spend_micros)::bigint as spend, sum(m.impressions)::bigint as impressions, sum(m.clicks)::bigint as clicks,
           sum(m.link_clicks)::bigint as link_clicks, count(m.link_clicks) as link_clicks_days,
           sum(m.leads) as leads, count(m.leads) as leads_days, sum(m.messages) as messages, count(m.messages) as messages_days,
           sum(m.conversions) as conversions, sum(m.conversion_value_micros)::bigint as conversion_value,
           sum(m.video_views)::bigint as video_views, count(m.video_views) as video_views_days,
           count(*) as days, max(m.synced_at) as synced,
           private.sum_actions(array_agg(m.raw_actions) filter (where m.raw_actions is not null)) as actions
      from public.metrics_daily m
     where m.level = 'account' and m.ad_account_id in (select id from accts)
       and m.date between v_pfrom and p_to
     group by 1, 2
  )
  select a.id, a.platform_id, a.name, a.external_id, a.currency,
         case when c.ad_account_id is null then null else jsonb_build_object(
           'spend_micros', c.spend, 'impressions', c.impressions, 'clicks', c.clicks,
           'link_clicks', case when c.link_clicks_days > 0 then c.link_clicks end,
           'leads', case when c.leads_days > 0 then c.leads end,
           'messages', case when c.messages_days > 0 then c.messages end,
           'conversions', c.conversions, 'conversion_value_micros', c.conversion_value,
           'video_views', case when c.video_views_days > 0 then c.video_views end,
           'days', c.days, 'reach', rc.reach, 'frequency', rc.frequency, 'actions', c.actions) end,
         case when p.ad_account_id is null then null else jsonb_build_object(
           'spend_micros', p.spend, 'impressions', p.impressions, 'clicks', p.clicks,
           'link_clicks', case when p.link_clicks_days > 0 then p.link_clicks end,
           'leads', case when p.leads_days > 0 then p.leads end,
           'messages', case when p.messages_days > 0 then p.messages end,
           'conversions', p.conversions, 'conversion_value_micros', p.conversion_value,
           'video_views', case when p.video_views_days > 0 then p.video_views end,
           'days', p.days, 'reach', rp.reach, 'frequency', rp.frequency, 'actions', p.actions) end,
         v_pfrom, v_pto, greatest(c.synced, p.synced)
    from accts a
    left join tot c on c.ad_account_id = a.id and c.is_cur
    left join tot p on p.ad_account_id = a.id and not p.is_cur
    left join public.period_reach rc on rc.ad_account_id = a.id and rc.level = 'account' and rc.entity_external_id = a.external_id
                                    and rc.period_start = p_from and rc.period_end = p_to
    left join public.period_reach rp on rp.ad_account_id = a.id and rp.level = 'account' and rp.entity_external_id = a.external_id
                                    and rp.period_start = v_pfrom and rp.period_end = v_pto
   order by coalesce(c.spend, 0) desc, a.platform_id, a.name;
end;
$$;
revoke all on function public.client_report_accounts(uuid, date, date) from public, anon;
grant execute on function public.client_report_accounts(uuid, date, date) to authenticated, service_role;

create function public.client_report_daily(p_client_id uuid, p_from date, p_to date)
returns table (
  ad_account_id uuid, date date, spend_micros bigint, impressions bigint, clicks bigint, link_clicks bigint,
  leads numeric, messages numeric, conversions numeric, conversion_value_micros bigint, actions jsonb
)
language sql
stable
security invoker
set search_path = ''
as $$
  select m.ad_account_id, m.date, m.spend_micros, m.impressions, m.clicks, m.link_clicks, m.leads, m.messages, m.conversions,
         m.conversion_value_micros, case when m.raw_actions is null then null else private.sum_actions(array[m.raw_actions]) end
    from public.metrics_daily m
    join public.ad_accounts a on a.id = m.ad_account_id
   where a.client_id = p_client_id and a.unlinked_at is null and m.level = 'account'
     and m.date between p_from and p_to and p_to >= p_from and p_to - p_from <= 400
   order by m.ad_account_id, m.date
$$;
revoke all on function public.client_report_daily(uuid, date, date) from public, anon;
grant execute on function public.client_report_daily(uuid, date, date) to authenticated, service_role;

create function public.client_report_campaigns(p_client_id uuid, p_from date, p_to date)
returns table (
  campaign_id uuid, ad_account_id uuid, name text, status public.entity_status, objective text,
  spend_micros bigint, impressions bigint, clicks bigint, link_clicks bigint,
  leads numeric, messages numeric, conversions numeric, conversion_value_micros bigint, actions jsonb
)
language sql
stable
security invoker
set search_path = ''
as $$
  select c.id, c.ad_account_id, c.name, c.status, c.objective,
         sum(m.spend_micros)::bigint, sum(m.impressions)::bigint, sum(m.clicks)::bigint, sum(m.link_clicks)::bigint,
         sum(m.leads), sum(m.messages), sum(m.conversions), sum(m.conversion_value_micros)::bigint,
         private.sum_actions(array_agg(m.raw_actions) filter (where m.raw_actions is not null))
    from public.metrics_daily m
    join public.campaigns c on c.id = m.campaign_id
    join public.ad_accounts a on a.id = c.ad_account_id
   where a.client_id = p_client_id and a.unlinked_at is null and m.level = 'campaign'
     and m.date between p_from and p_to and p_to >= p_from and p_to - p_from <= 400
   group by c.id, c.ad_account_id, c.name, c.status, c.objective
  having sum(m.spend_micros) > 0 or sum(m.leads) > 0 or sum(m.messages) > 0 or sum(m.conversions) > 0
   order by sum(m.spend_micros) desc nulls last
   limit 200
$$;
revoke all on function public.client_report_campaigns(uuid, date, date) from public, anon;
grant execute on function public.client_report_campaigns(uuid, date, date) to authenticated, service_role;
