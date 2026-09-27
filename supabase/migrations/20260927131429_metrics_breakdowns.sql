-- =============================================================================
-- Etapa 19.3 — Divisões dos números por idade, gênero, horário, aparelho,
-- plataforma (Facebook × Instagram…) e localização.
--
-- metrics_breakdown_daily: números de UM dia de UMA conta, divididos por UMA
--   dimensão (ex.: idade = "25-34"). Só nível conta. Vem da API oficial:
--     Meta:   insights com breakdowns (age,gender · publisher_platform ·
--             device_platform · hourly_stats… · region = estado)
--     Google: age_range_view · gender_view · segments.device · segments.hour ·
--             geographic_view (cidade)
--   Mesma regra de metrics_daily: nada é apagado; o que a plataforma deixou de
--   informar numa nova busca fica marcado como substituído (superseded).
-- breakdown_coverage: de quando a quando cada conta já tem divisões
--   (a tela avisa quando o período pedido não está coberto).
-- =============================================================================

create table public.metrics_breakdown_daily (
  date                    date not null,
  ad_account_id           uuid not null references public.ad_accounts (id) on delete cascade,
  client_id               uuid not null references public.clients (id) on delete cascade,
  platform_id             text not null,
  currency                text not null,
  dimension               text not null check (dimension in ('age', 'gender', 'publisher_platform', 'device', 'hour', 'region', 'city')),
  value                   text not null check (char_length(value) between 1 and 200),
  spend_micros            bigint not null default 0,
  impressions             bigint not null default 0,
  clicks                  bigint not null default 0,
  link_clicks             bigint,
  leads                   numeric,
  messages                numeric,
  conversions             numeric,
  conversion_value_micros bigint,
  -- Ações do Meta já resumidas: {"tipo": total}. null no Google.
  actions                 jsonb check (actions is null or jsonb_typeof(actions) = 'object'),
  superseded              boolean not null default false,
  synced_at               timestamptz not null default now(),
  primary key (ad_account_id, dimension, date, value)
);
comment on table public.metrics_breakdown_daily is
  'Etapa 19.3: números diários por conta divididos por idade, gênero, horário, aparelho, plataforma e localização (API oficial).';
create index metrics_breakdown_daily_client_idx on public.metrics_breakdown_daily (client_id, date);

alter table public.metrics_breakdown_daily enable row level security;
revoke all on public.metrics_breakdown_daily from anon, authenticated;
grant select on public.metrics_breakdown_daily to authenticated;
create policy "Vê divisões dos clientes liberados" on public.metrics_breakdown_daily for select to authenticated
  using (client_id in (select private.visible_client_ids()) and not superseded);

create table public.breakdown_coverage (
  ad_account_id uuid primary key references public.ad_accounts (id) on delete cascade,
  client_id     uuid not null references public.clients (id) on delete cascade,
  date_from     date not null,
  date_to       date not null check (date_to >= date_from),
  synced_at     timestamptz not null default now()
);
comment on table public.breakdown_coverage is 'Etapa 19.3: período já buscado das divisões de cada conta.';
create index breakdown_coverage_client_idx on public.breakdown_coverage (client_id);
alter table public.breakdown_coverage enable row level security;
revoke all on public.breakdown_coverage from anon, authenticated;
grant select on public.breakdown_coverage to authenticated;
create policy "Vê cobertura dos clientes liberados" on public.breakdown_coverage for select to authenticated
  using (client_id in (select private.visible_client_ids()));

-- -----------------------------------------------------------------------------
-- Gravação (só o servidor). p_rows: [{date, dimension, value, spend_micros, …}]
-- Linhas do período que não vieram de novo ficam marcadas como substituídas.
-- -----------------------------------------------------------------------------
create function public.ingest_breakdowns(p_ad_account_id uuid, p_from date, p_to date, p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_acc public.ad_accounts;
  v_count integer;
begin
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 120 then raise exception 'Período inválido'; end if;
  if jsonb_typeof(p_rows) <> 'array' then raise exception 'Linhas inválidas'; end if;
  select * into v_acc from public.ad_accounts where id = p_ad_account_id;
  if not found then raise exception 'Conta não encontrada'; end if;

  create temp table _bd on commit drop as
    select (r ->> 'date')::date as date, r ->> 'dimension' as dimension, left(r ->> 'value', 200) as value,
           coalesce((r ->> 'spend_micros')::bigint, 0) as spend_micros, coalesce((r ->> 'impressions')::bigint, 0) as impressions,
           coalesce((r ->> 'clicks')::bigint, 0) as clicks, (r ->> 'link_clicks')::bigint as link_clicks,
           (r ->> 'leads')::numeric as leads, (r ->> 'messages')::numeric as messages, (r ->> 'conversions')::numeric as conversions,
           (r ->> 'conversion_value_micros')::bigint as conversion_value_micros,
           case when jsonb_typeof(r -> 'actions') = 'object' then r -> 'actions' end as actions
      from jsonb_array_elements(p_rows) r
     where (r ->> 'date')::date between p_from and p_to;

  insert into public.metrics_breakdown_daily as m (date, ad_account_id, client_id, platform_id, currency, dimension, value,
    spend_micros, impressions, clicks, link_clicks, leads, messages, conversions, conversion_value_micros, actions, superseded, synced_at)
  select s.date, v_acc.id, v_acc.client_id, v_acc.platform_id, coalesce(v_acc.currency, 'BRL'), s.dimension, s.value,
         s.spend_micros, s.impressions, s.clicks, s.link_clicks, s.leads, s.messages, s.conversions, s.conversion_value_micros, s.actions, false, now()
    from pg_temp._bd s
  on conflict (ad_account_id, dimension, date, value) do update
    set spend_micros = excluded.spend_micros, impressions = excluded.impressions, clicks = excluded.clicks,
        link_clicks = excluded.link_clicks, leads = excluded.leads, messages = excluded.messages, conversions = excluded.conversions,
        conversion_value_micros = excluded.conversion_value_micros, actions = excluded.actions, currency = excluded.currency,
        superseded = false, synced_at = now();
  get diagnostics v_count = row_count;

  -- O que existia no período e não veio de novo: substituído (não apagado).
  update public.metrics_breakdown_daily m set superseded = true, synced_at = now()
   where m.ad_account_id = v_acc.id and m.date between p_from and p_to and not m.superseded
     and not exists (select 1 from pg_temp._bd s where s.date = m.date and s.dimension = m.dimension and s.value = m.value);
  drop table pg_temp._bd;

  insert into public.breakdown_coverage as c (ad_account_id, client_id, date_from, date_to, synced_at)
  values (v_acc.id, v_acc.client_id, p_from, p_to, now())
  on conflict (ad_account_id) do update
    set date_from = case when p_to >= c.date_from - 1 and p_from <= c.date_to + 1 then least(c.date_from, p_from) else p_from end,
        date_to = case when p_to >= c.date_from - 1 and p_from <= c.date_to + 1 then greatest(c.date_to, p_to) else p_to end,
        synced_at = now();
  return v_count;
end;
$$;
revoke all on function public.ingest_breakdowns(uuid, date, date, jsonb) from public, anon, authenticated;
grant execute on function public.ingest_breakdowns(uuid, date, date, jsonb) to service_role;

-- Soma mapas de ações {"tipo": n}.
create function private.sum_action_maps(p_maps jsonb[])
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(k, v), '{}'::jsonb)
    from (select e.key as k, sum((e.value)::text::numeric) as v
            from unnest(p_maps) m
            cross join lateral jsonb_each(coalesce(m, '{}'::jsonb)) e
           where jsonb_typeof(e.value) = 'number'
           group by 1) x
$$;
revoke all on function private.sum_action_maps(jsonb[]) from public, anon;
grant execute on function private.sum_action_maps(jsonb[]) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Leitura do dashboard: somas do período por conta, dimensão e valor, e a
-- cobertura (para avisar quando o período pedido não está todo buscado).
-- -----------------------------------------------------------------------------
create function public.client_report_breakdowns(p_client_id uuid, p_from date, p_to date)
returns table (
  ad_account_id uuid, dimension text, value text,
  spend_micros bigint, impressions bigint, clicks bigint, link_clicks bigint,
  leads numeric, messages numeric, conversions numeric, conversion_value_micros bigint, actions jsonb
)
language sql
stable
security invoker
set search_path = ''
as $$
  select m.ad_account_id, m.dimension, m.value,
         sum(m.spend_micros)::bigint, sum(m.impressions)::bigint, sum(m.clicks)::bigint, sum(m.link_clicks)::bigint,
         sum(m.leads), sum(m.messages), sum(m.conversions), sum(m.conversion_value_micros)::bigint,
         case when bool_or(m.actions is not null) then private.sum_action_maps(array_agg(m.actions) filter (where m.actions is not null)) end
    from public.metrics_breakdown_daily m
    join public.ad_accounts a on a.id = m.ad_account_id
   where a.client_id = p_client_id and a.unlinked_at is null and not m.superseded
     and m.date between p_from and p_to and p_to >= p_from and p_to - p_from <= 400
   group by m.ad_account_id, m.dimension, m.value
$$;
revoke all on function public.client_report_breakdowns(uuid, date, date) from public, anon;
grant execute on function public.client_report_breakdowns(uuid, date, date) to authenticated, service_role;

create function public.client_report_breakdown_coverage(p_client_id uuid)
returns table (ad_account_id uuid, covered_from date, covered_to date)
language sql
stable
security invoker
set search_path = ''
as $$
  select c.ad_account_id, c.date_from, c.date_to
    from public.breakdown_coverage c
    join public.ad_accounts a on a.id = c.ad_account_id
   where a.client_id = p_client_id and a.unlinked_at is null
$$;
revoke all on function public.client_report_breakdown_coverage(uuid) from public, anon;
grant execute on function public.client_report_breakdown_coverage(uuid) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Link secreto (19.2) passa a devolver as divisões também.
-- -----------------------------------------------------------------------------
create or replace function public.client_report_public(p_token text, p_period text default null, p_from date default null, p_to date default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_portal public.client_portal;
  v_client public.clients;
  v_settings jsonb;
  v_period text;
  v_today date;
  v_from date;
  v_to date;
  v_hits integer;
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{43}$' then
    raise exception 'Link inválido ou desativado.' using errcode = 'P0002';
  end if;
  select * into v_portal from public.client_portal
   where link_token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
     and link_enabled and (link_expires_at is null or link_expires_at > now());
  if not found then raise exception 'Link inválido ou desativado.' using errcode = 'P0002'; end if;
  -- No máximo 300 consultas a cada 10 minutos por link (contador próprio:
  -- o limitador geral só aceita usuários logados).
  update public.client_portal
     set link_window_start = case when link_window_start is null or link_window_start <= now() - interval '10 minutes' then now() else link_window_start end,
         link_window_hits = case when link_window_start is null or link_window_start <= now() - interval '10 minutes' then 1 else link_window_hits + 1 end,
         link_last_used_at = now(), link_uses = link_uses + 1
   where client_id = v_portal.client_id
   returning link_window_hits into v_hits;
  if v_hits > 300 then
    raise exception 'Muitas consultas seguidas. Tente de novo em alguns minutos.' using errcode = '54000';
  end if;

  select * into v_client from public.clients where id = v_portal.client_id;
  select to_jsonb(s) - 'client_id' - 'updated_by' into v_settings from public.client_report_settings s where s.client_id = v_client.id;
  v_today := (now() at time zone v_client.timezone)::date;

  if p_from is not null or p_to is not null then
    if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 400 or p_to > v_today then
      raise exception 'Período inválido (até 400 dias, sem datas futuras).' using errcode = '22023';
    end if;
    v_period := 'custom'; v_from := p_from; v_to := p_to;
  else
    v_period := coalesce(p_period, v_settings ->> 'default_period', 'last_7_days');
    case v_period
      when 'last_7_days' then v_from := v_today - 7; v_to := v_today - 1;
      when 'last_14_days' then v_from := v_today - 14; v_to := v_today - 1;
      when 'last_30_days' then v_from := v_today - 30; v_to := v_today - 1;
      when 'this_month' then v_from := date_trunc('month', v_today)::date; v_to := v_today;
      when 'last_month' then v_from := (date_trunc('month', v_today) - interval '1 month')::date; v_to := date_trunc('month', v_today)::date - 1;
      else raise exception 'Período inválido.' using errcode = '22023';
    end case;
  end if;

  return jsonb_build_object(
    'client', jsonb_build_object('name', v_client.name, 'timezone', v_client.timezone),
    'settings', v_settings,
    'period', v_period, 'from', v_from, 'to', v_to, 'today', v_today,
    'accounts', coalesce((select jsonb_agg(to_jsonb(a)) from public.client_report_accounts(v_client.id, v_from, v_to) a), '[]'::jsonb),
    'daily', coalesce((select jsonb_agg(to_jsonb(d)) from public.client_report_daily(v_client.id, v_from, v_to) d), '[]'::jsonb),
    'campaigns', coalesce((select jsonb_agg(to_jsonb(c)) from public.client_report_campaigns(v_client.id, v_from, v_to) c), '[]'::jsonb),
    'breakdowns', coalesce((select jsonb_agg(to_jsonb(b)) from public.client_report_breakdowns(v_client.id, v_from, v_to) b), '[]'::jsonb),
    'breakdown_coverage', coalesce((select jsonb_agg(to_jsonb(c)) from public.client_report_breakdown_coverage(v_client.id) c), '[]'::jsonb));
end;
$$;
revoke all on function public.client_report_public(text, text, date, date) from public, anon, authenticated;
grant execute on function public.client_report_public(text, text, date, date) to service_role;
