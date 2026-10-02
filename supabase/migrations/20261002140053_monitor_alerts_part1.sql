-- Etapa 37.3 — Motor de alertas de desempenho (parte 1: tabelas e regras de cálculo).
-- Nada é apagado: alertas, eventos e execuções ficam para sempre.

-- ------------------------------------------------------------ configuração (uma linha)
create table public.monitor_settings (
  id smallint primary key default 1 check (id = 1),
  enabled boolean not null default true,
  eval_interval_minutes integer not null default 60 check (eval_interval_minutes in (15, 30, 60, 180, 360, 1440)),
  stale_hours integer not null default 3 check (stale_hours between 1 and 48),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id)
);
comment on table public.monitor_settings is 'Etapa 37: liga/desliga e frequência da avaliação automática dos alertas de desempenho.';
insert into public.monitor_settings (id) values (1);
alter table public.monitor_settings enable row level security;
create policy monitor_settings_select on public.monitor_settings for select to authenticated using ((select private.monitor_can('view')));
revoke insert, update, delete on public.monitor_settings from anon, authenticated;
grant select on public.monitor_settings to authenticated;

-- ------------------------------------------------------------ execuções
create table public.monitor_runs (
  id bigint generated always as identity primary key,
  trigger text not null check (trigger in ('agendada', 'manual')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  accounts_evaluated integer not null default 0,
  accounts_skipped integer not null default 0,
  skipped jsonb not null default '[]',
  alerts_created integer not null default 0,
  alerts_updated integer not null default 0,
  alerts_resolved integer not null default 0,
  error text,
  requested_by uuid references auth.users (id)
);
comment on table public.monitor_runs is 'Etapa 37: cada avaliação dos alertas de desempenho (contas avaliadas, puladas e por quê, alertas criados/atualizados/normalizados). Guardada para sempre.';
create index monitor_runs_started_idx on public.monitor_runs (started_at desc);
create index monitor_runs_requested_idx on public.monitor_runs (requested_by);
alter table public.monitor_runs enable row level security;
create policy monitor_runs_select on public.monitor_runs for select to authenticated using ((select private.monitor_can('view')));
revoke insert, update, delete on public.monitor_runs from anon, authenticated;
grant select on public.monitor_runs to authenticated;

-- Por conta: até que dado a última avaliação viu (para não reavaliar o que não mudou).
create table public.monitor_account_state (
  ad_account_id uuid primary key references public.ad_accounts (id),
  last_evaluated_at timestamptz not null,
  last_data_at timestamptz
);
comment on table public.monitor_account_state is 'Etapa 37: última avaliação de cada conta e o dado mais novo que ela viu. Uma linha por conta.';
alter table public.monitor_account_state enable row level security;
create policy monitor_account_state_select on public.monitor_account_state for select to authenticated
  using ((select private.monitor_can('view')));
revoke insert, update, delete on public.monitor_account_state from anon, authenticated;
grant select on public.monitor_account_state to authenticated;

-- ------------------------------------------------------------ alertas
create table public.monitor_alerts (
  id bigint generated always as identity primary key,
  dedupe_key text not null,
  kind text not null check (kind in ('limite', 'anomalia', 'sem_resultados')),
  level text not null check (level in ('campaign', 'ad')),
  metric text not null,
  severity text not null check (severity in ('critico', 'atencao', 'informativo')),
  status text not null default 'novo' check (status in ('novo', 'visualizado', 'em_analise', 'aguardando_acao', 'resolvido', 'ignorado')),
  client_id uuid not null references public.clients (id),
  platform_id text not null,
  ad_account_id uuid not null references public.ad_accounts (id),
  campaign_id uuid references public.campaigns (id),
  ad_group_id uuid references public.ad_groups (id),
  ad_id uuid references public.ads (id),
  currency text,
  current_value numeric,
  previous_value numeric,
  variation_pct numeric,
  period_from date not null,
  period_to date not null,
  prev_from date,
  prev_to date,
  rule_id uuid references public.monitor_rules (id),
  attention_pct numeric,
  critical_pct numeric,
  explanation text not null,
  context jsonb not null default '[]',
  details jsonb not null default '{}',
  detections integer not null default 1,
  first_detected_at timestamptz not null default now(),
  last_detected_at timestamptz not null default now(),
  recurrence_of bigint references public.monitor_alerts (id),
  recurrence_count integer not null default 0,
  resolved_at timestamptz,
  resolution text check (resolution in ('automatica', 'manual')),
  resolved_by uuid references auth.users (id)
);
comment on table public.monitor_alerts is 'Etapa 37: alertas de desempenho (limite, anomalia, anúncio sem resultados). Um aberto por chave; reincidência liga ao anterior. Guardados para sempre.';
create unique index monitor_alerts_open_uq on public.monitor_alerts (dedupe_key) where resolved_at is null;
create index monitor_alerts_client_idx on public.monitor_alerts (client_id, resolved_at);
create index monitor_alerts_account_idx on public.monitor_alerts (ad_account_id) where resolved_at is null;
create index monitor_alerts_key_idx on public.monitor_alerts (dedupe_key, resolved_at desc);
create index monitor_alerts_detected_idx on public.monitor_alerts (last_detected_at desc);
create index monitor_alerts_recurrence_idx on public.monitor_alerts (recurrence_of);
create index monitor_alerts_campaign_idx on public.monitor_alerts (campaign_id);
create index monitor_alerts_ad_idx on public.monitor_alerts (ad_id);
create index monitor_alerts_group_idx on public.monitor_alerts (ad_group_id);
create index monitor_alerts_rule_idx on public.monitor_alerts (rule_id);
create index monitor_alerts_resolved_by_idx on public.monitor_alerts (resolved_by);
alter table public.monitor_alerts enable row level security;
create policy monitor_alerts_select on public.monitor_alerts for select to authenticated
  using ((select private.monitor_can('view')) and (select private.can_view_client(client_id)));
revoke insert, update, delete on public.monitor_alerts from anon, authenticated;
grant select on public.monitor_alerts to authenticated;

create table public.monitor_alert_events (
  id bigint generated always as identity primary key,
  alert_id bigint not null references public.monitor_alerts (id),
  kind text not null check (kind in ('criado', 'piorou', 'melhorou', 'normalizado', 'estado', 'atribuido', 'comentario', 'providencia', 'tarefa', 'avaliacao')),
  from_value text,
  to_value text,
  note text,
  actor uuid references auth.users (id),
  created_at timestamptz not null default now()
);
comment on table public.monitor_alert_events is 'Etapa 37: linha do tempo de cada alerta (criação, piora, melhora, normalização e, a partir da 37.4, ações das pessoas). Guardada para sempre.';
create index monitor_alert_events_alert_idx on public.monitor_alert_events (alert_id, created_at);
create index monitor_alert_events_actor_idx on public.monitor_alert_events (actor);
alter table public.monitor_alert_events enable row level security;
create policy monitor_alert_events_select on public.monitor_alert_events for select to authenticated
  using (exists (select 1 from public.monitor_alerts a where a.id = alert_id
                  and (select private.monitor_can('view')) and (select private.can_view_client(a.client_id))));
revoke insert, update, delete on public.monitor_alert_events from anon, authenticated;
grant select on public.monitor_alert_events to authenticated;

-- ------------------------------------------------------------ regras de cálculo (iguais a packages/shared/src/monitoring)

create or replace function private.monitor_result_kind(p_objective text)
returns text language sql immutable set search_path = '' as $$
  select case
    when coalesce(p_objective, '') = '' then 'mixed'
    when upper(p_objective) in ('OUTCOME_LEADS', 'LEAD_GENERATION') then 'leads'
    when upper(p_objective) = 'MESSAGES' then 'messages'
    when upper(p_objective) in ('OUTCOME_SALES', 'CONVERSIONS', 'PRODUCT_CATALOG_SALES') then 'conversions'
    when upper(p_objective) in ('OUTCOME_TRAFFIC', 'LINK_CLICKS') then 'link_clicks'
    when upper(p_objective) in ('OUTCOME_AWARENESS', 'OUTCOME_ENGAGEMENT', 'POST_ENGAGEMENT', 'REACH', 'BRAND_AWARENESS', 'VIDEO_VIEWS') then 'none'
    else 'conversions'
  end
$$;

create or replace function private.monitor_results(p_kind text, p_leads numeric, p_msgs numeric, p_conv numeric, p_link numeric)
returns numeric language sql immutable set search_path = '' as $$
  select case p_kind
    when 'leads' then p_leads
    when 'messages' then p_msgs
    when 'conversions' then p_conv
    when 'link_clicks' then p_link
    when 'mixed' then case when p_leads is null and p_msgs is null and p_conv is null then null
                           else coalesce(p_leads, 0) + coalesce(p_msgs, 0) + coalesce(p_conv, 0) end
    else null
  end
$$;

create or replace function private.monitor_value(p_metric text, p_kind text, p_spend bigint, p_impr bigint, p_clk bigint,
                                                 p_link bigint, p_leads numeric, p_msgs numeric, p_conv numeric, p_value bigint)
returns numeric language sql immutable set search_path = '' as $$
  with r as (select private.monitor_results(p_kind, p_leads, p_msgs, p_conv, p_link) as res, p_spend / 1000000.0 as spend)
  select case p_metric
    when 'spend' then r.spend
    when 'results' then r.res
    when 'cost_per_result' then case when r.res > 0 then r.spend / r.res end
    when 'cpc' then case when p_clk > 0 then r.spend / p_clk end
    when 'cpm' then case when p_impr > 0 then r.spend / p_impr * 1000 end
    when 'ctr' then case when p_impr > 0 then p_clk::numeric / p_impr * 100 end
    when 'roas' then case when p_value > 0 and p_spend > 0 then p_value::numeric / p_spend end
  end
  from r
$$;

create or replace function private.monitor_volume_base(p_metric text, p_kind text, p_impr bigint, p_clk bigint,
                                                       p_link bigint, p_leads numeric, p_msgs numeric, p_conv numeric)
returns numeric language sql immutable set search_path = '' as $$
  select case p_metric
    when 'cost_per_result' then coalesce(private.monitor_results(p_kind, p_leads, p_msgs, p_conv, p_link), 0)
    when 'results' then coalesce(private.monitor_results(p_kind, p_leads, p_msgs, p_conv, p_link), 0)
    when 'cpc' then coalesce(p_clk, 0)
    when 'ctr' then coalesce(p_impr, 0)
    when 'cpm' then coalesce(p_impr, 0)
    when 'roas' then coalesce(p_conv, 0)
    else null
  end
$$;

create or replace function private.monitor_default_min_volume(p_metric text)
returns integer language sql immutable set search_path = '' as $$
  select case p_metric when 'cost_per_result' then 10 when 'results' then 10 when 'cpc' then 20
                       when 'ctr' then 1000 when 'cpm' then 1000 when 'roas' then 5 else 0 end
$$;

create or replace function private.monitor_classify(p_cur numeric, p_prev numeric, p_direction text, p_att numeric, p_crit numeric, p_volume_ok boolean)
returns table (severity text, variation_pct numeric)
language sql immutable set search_path = '' as $$
  with v as (
    select case when p_cur is null or p_prev is null or p_prev = 0 then null
                else round((p_cur - p_prev) / abs(p_prev) * 100, 6) end as pct
  ),
  w as (
    select v.pct, case p_direction when 'up' then v.pct when 'down' then -v.pct else abs(v.pct) end as worse from v
  )
  select case
           when w.pct is null or not p_volume_ok or p_direction = 'both' or w.worse < p_att then null
           when w.worse >= p_crit then 'critico'
           else 'atencao'
         end,
         w.pct
  from w
$$;

create or replace function private.monitor_rule_for(p_metric text, p_client uuid, p_account uuid, p_campaign uuid, p_ad uuid)
returns setof public.monitor_rules
language sql stable security definer set search_path = '' as $$
  select r.* from public.monitor_rules r
   where r.archived_at is null and r.metric = p_metric
     and ((r.scope = 'ad' and r.scope_id = p_ad) or (r.scope = 'campaign' and r.scope_id = p_campaign)
          or (r.scope = 'account' and r.scope_id = p_account) or (r.scope = 'client' and r.scope_id = p_client)
          or r.scope = 'global')
   order by array_position(array['ad', 'campaign', 'account', 'client', 'global'], r.scope)
   limit 1
$$;

create or replace function private.monitor_fmt(p_metric text, p_value numeric, p_currency text)
returns text language sql stable security definer set search_path = '' as $$
  select case
    when p_value is null then '—'
    when p_metric in ('spend', 'cost_per_result', 'cpc', 'cpm') then private.format_money(round(p_value * 1000000)::bigint, p_currency)
    when p_metric = 'ctr' then replace(to_char(p_value, 'FM999999990.00'), '.', ',') || '%'
    when p_metric = 'roas' then replace(to_char(p_value, 'FM999999990.00'), '.', ',') || 'x'
    else replace(rtrim(rtrim(to_char(p_value, 'FM999999990.99'), '0'), '.'), '.', ',')
  end
$$;

create or replace function private.monitor_metric_label(p_metric text)
returns text language sql immutable set search_path = '' as $$
  select case p_metric when 'cost_per_result' then 'Custo por resultado' when 'results' then 'Resultados' when 'cpc' then 'CPC'
                       when 'cpm' then 'CPM' when 'ctr' then 'CTR' when 'roas' then 'ROAS' when 'spend' then 'Investimento' else p_metric end
$$;

revoke all on function private.monitor_result_kind(text) from public, anon;
revoke all on function private.monitor_results(text, numeric, numeric, numeric, numeric) from public, anon;
revoke all on function private.monitor_value(text, text, bigint, bigint, bigint, bigint, numeric, numeric, numeric, bigint) from public, anon;
revoke all on function private.monitor_volume_base(text, text, bigint, bigint, bigint, numeric, numeric, numeric) from public, anon;
revoke all on function private.monitor_default_min_volume(text) from public, anon;
revoke all on function private.monitor_classify(numeric, numeric, text, numeric, numeric, boolean) from public, anon;
revoke all on function private.monitor_rule_for(text, uuid, uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function private.monitor_fmt(text, numeric, text) from public, anon, authenticated;
revoke all on function private.monitor_metric_label(text) from public, anon;
