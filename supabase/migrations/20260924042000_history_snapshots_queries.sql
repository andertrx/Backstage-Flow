-- =============================================================================
-- ETAPA 5 (parte 3) — Fotografias, alcance por período, resumo diário e
-- consultas históricas prontas.
--
--   * account_snapshots → status/saldo/limites COMO A API INFORMOU em cada sync.
--   * period_reach      → alcance e frequência de um período (não dá para somar
--                         alcance de dias, então buscamos pronto da API).
--   * daily_summaries   → "fotografia do dia" por cliente (ex.: Excalibur,
--                         23/09: R$ 1.250, 350 leads...), separada por moeda.
--   * metrics_summary / metrics_timeseries → respostas para "quanto gastou em
--     agosto?", "quantos leads em julho?", gráficos diários/semanais/mensais.
--     Rodam COM A PERMISSÃO DO USUÁRIO: o RLS continua valendo.
--
-- Retenção: permanente.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Fotografias das contas
-- -----------------------------------------------------------------------------
create table public.account_snapshots (
  id                  bigint generated always as identity primary key,
  ad_account_id       uuid not null references public.ad_accounts (id),
  client_id           uuid not null references public.clients (id),
  platform_id         text not null references public.platforms (id),
  captured_at         timestamptz not null default now(),
  is_daily_close      boolean not null default false,
  status              public.ad_account_status not null,
  raw_status          text,
  currency            text check (currency is null or currency ~ '^[A-Z]{3}$'),
  amount_spent_micros bigint,
  balance_micros      bigint,
  spend_cap_micros    bigint,
  budget_micros       bigint,
  payload             jsonb not null default '{}'::jsonb
);

comment on table public.account_snapshots is 'Fotografia do status e dos valores financeiros da conta a cada sincronização. NULL = não informado pela API. Permanente.';
comment on column public.account_snapshots.balance_micros is 'Meta: valor devido (balance). NÃO é saldo pré-pago disponível — esse a API não fornece.';
comment on column public.account_snapshots.is_daily_close is 'true = fotografia de fechamento do dia (fuso do cliente).';

create index account_snapshots_account_time_idx on public.account_snapshots (ad_account_id, captured_at desc);
create index account_snapshots_client_time_idx on public.account_snapshots (client_id, captured_at desc);

-- -----------------------------------------------------------------------------
-- Alcance por período
-- -----------------------------------------------------------------------------
create table public.period_reach (
  ad_account_id      uuid not null references public.ad_accounts (id),
  level              public.entity_level not null,
  entity_external_id text not null,
  period_start       date not null,
  period_end         date not null check (period_end >= period_start),
  client_id          uuid not null references public.clients (id),
  reach              bigint check (reach is null or reach >= 0),
  impressions        bigint check (impressions is null or impressions >= 0),
  frequency          numeric(12, 4),
  synced_at          timestamptz not null default now(),
  primary key (ad_account_id, level, entity_external_id, period_start, period_end)
);

comment on table public.period_reach is 'Alcance/frequência de um período, como a plataforma calcula (pessoas únicas). Permanente.';

create index period_reach_client_idx on public.period_reach (client_id, period_start, period_end);

-- -----------------------------------------------------------------------------
-- Resumo diário por cliente (fotografia do dia)
-- -----------------------------------------------------------------------------
create table public.daily_summaries (
  client_id               uuid not null references public.clients (id),
  date                    date not null,
  currency                text not null check (currency ~ '^[A-Z]{3}$'),
  spend_micros            bigint not null default 0,
  impressions             bigint not null default 0,
  clicks                  bigint not null default 0,
  link_clicks             bigint,
  leads                   numeric(18, 4),
  messages                numeric(18, 4),
  conversions             numeric(18, 4),
  conversion_value_micros bigint,
  accounts_count          integer not null default 0,
  platforms               text[] not null default '{}',
  computed_at             timestamptz not null default now(),
  primary key (client_id, date, currency)
);

comment on table public.daily_summaries is 'Fotografia diária por cliente, somando as contas no nível "conta". Uma linha por moeda (nunca soma BRL com USD). Permanente.';

-- Recalcula os resumos de um cliente num intervalo (chamado pela sincronização).
create function public.refresh_daily_summaries(p_client_id uuid, p_from date, p_to date)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected integer;
begin
  if p_to < p_from or p_to - p_from > 1100 then raise exception 'Intervalo inválido'; end if;

  -- Dias/moedas que deixaram de ter dados não ficam com números velhos.
  delete from public.daily_summaries s
  where s.client_id = p_client_id and s.date between p_from and p_to
    and not exists (
      select 1 from public.metrics_daily m
      where m.client_id = p_client_id and m.level = 'account' and m.date = s.date and m.currency = s.currency
    );

  insert into public.daily_summaries as s (
    client_id, date, currency, spend_micros, impressions, clicks, link_clicks, leads, messages,
    conversions, conversion_value_micros, accounts_count, platforms, computed_at
  )
  select m.client_id, m.date, m.currency, sum(m.spend_micros), sum(m.impressions), sum(m.clicks), sum(m.link_clicks),
         sum(m.leads), sum(m.messages), sum(m.conversions), sum(m.conversion_value_micros),
         count(distinct m.ad_account_id), array_agg(distinct m.platform_id order by m.platform_id), now()
  from public.metrics_daily m
  where m.client_id = p_client_id and m.level = 'account' and m.date between p_from and p_to
  group by m.client_id, m.date, m.currency
  on conflict (client_id, date, currency) do update set
    spend_micros = excluded.spend_micros, impressions = excluded.impressions, clicks = excluded.clicks,
    link_clicks = excluded.link_clicks, leads = excluded.leads, messages = excluded.messages,
    conversions = excluded.conversions, conversion_value_micros = excluded.conversion_value_micros,
    accounts_count = excluded.accounts_count, platforms = excluded.platforms, computed_at = excluded.computed_at;
  get diagnostics affected = row_count;
  return affected;
end;
$$;

revoke all on function public.refresh_daily_summaries(uuid, date, date) from public, anon, authenticated;
grant execute on function public.refresh_daily_summaries(uuid, date, date) to service_role;

-- -----------------------------------------------------------------------------
-- Consultas históricas prontas (com a permissão do usuário → RLS vale)
-- Somam só as linhas de nível "conta" (evita contar a mesma coisa 2x) e
-- agrupam por moeda. SUM de valores NULL continua NULL = "não disponível".
-- -----------------------------------------------------------------------------
create function public.metrics_summary(
  p_from date,
  p_to date,
  p_client_ids uuid[] default null,
  p_platforms text[] default null,
  p_ad_account_ids uuid[] default null
)
returns table (
  currency text,
  spend_micros bigint,
  impressions bigint,
  clicks bigint,
  link_clicks bigint,
  leads numeric,
  messages numeric,
  conversions numeric,
  conversion_value_micros bigint,
  accounts integer,
  first_date date,
  last_date date
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if p_from is null or p_to is null or p_to < p_from then raise exception 'Período inválido'; end if;
  if p_to - p_from > 3700 then raise exception 'Período longo demais (máx. ~10 anos)'; end if;

  return query
  select m.currency,
         sum(m.spend_micros)::bigint, sum(m.impressions)::bigint, sum(m.clicks)::bigint, sum(m.link_clicks)::bigint,
         sum(m.leads), sum(m.messages), sum(m.conversions), sum(m.conversion_value_micros)::bigint,
         count(distinct m.ad_account_id)::integer, min(m.date), max(m.date)
  from public.metrics_daily m
  where m.level = 'account'
    and m.date between p_from and p_to
    and (p_client_ids is null or m.client_id = any (p_client_ids))
    and (p_platforms is null or m.platform_id = any (p_platforms))
    and (p_ad_account_ids is null or m.ad_account_id = any (p_ad_account_ids))
  group by m.currency
  order by sum(m.spend_micros) desc;
end;
$$;

create function public.metrics_timeseries(
  p_from date,
  p_to date,
  p_granularity text default 'day',
  p_client_ids uuid[] default null,
  p_platforms text[] default null,
  p_ad_account_ids uuid[] default null
)
returns table (
  bucket date,
  currency text,
  spend_micros bigint,
  impressions bigint,
  clicks bigint,
  link_clicks bigint,
  leads numeric,
  messages numeric,
  conversions numeric,
  conversion_value_micros bigint
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if p_granularity not in ('day', 'week', 'month') then raise exception 'Agrupamento inválido (use day, week ou month)'; end if;
  if p_from is null or p_to is null or p_to < p_from then raise exception 'Período inválido'; end if;
  if p_to - p_from > 3700 then raise exception 'Período longo demais (máx. ~10 anos)'; end if;

  return query
  select (case p_granularity
            when 'day' then m.date
            when 'week' then date_trunc('week', m.date)::date   -- semana começa na segunda-feira
            else date_trunc('month', m.date)::date
          end) as bucket,
         m.currency,
         sum(m.spend_micros)::bigint, sum(m.impressions)::bigint, sum(m.clicks)::bigint, sum(m.link_clicks)::bigint,
         sum(m.leads), sum(m.messages), sum(m.conversions), sum(m.conversion_value_micros)::bigint
  from public.metrics_daily m
  where m.level = 'account'
    and m.date between p_from and p_to
    and (p_client_ids is null or m.client_id = any (p_client_ids))
    and (p_platforms is null or m.platform_id = any (p_platforms))
    and (p_ad_account_ids is null or m.ad_account_id = any (p_ad_account_ids))
  group by 1, m.currency
  order by 1, m.currency;
end;
$$;

revoke all on function public.metrics_summary(date, date, uuid[], text[], uuid[]) from public, anon;
revoke all on function public.metrics_timeseries(date, date, text, uuid[], text[], uuid[]) from public, anon;
grant execute on function public.metrics_summary(date, date, uuid[], text[], uuid[]) to authenticated, service_role;
grant execute on function public.metrics_timeseries(date, date, text, uuid[], text[], uuid[]) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Permissões e RLS
-- -----------------------------------------------------------------------------
revoke all on public.account_snapshots, public.period_reach, public.daily_summaries from anon, authenticated;
grant select on public.account_snapshots, public.period_reach, public.daily_summaries to authenticated;

alter table public.account_snapshots enable row level security;
alter table public.period_reach enable row level security;
alter table public.daily_summaries enable row level security;

create policy "Vê fotografias dos clientes liberados" on public.account_snapshots for select to authenticated
  using (client_id in (select private.visible_client_ids()));
create policy "Vê alcance dos clientes liberados" on public.period_reach for select to authenticated
  using (client_id in (select private.visible_client_ids()));
create policy "Vê resumos dos clientes liberados" on public.daily_summaries for select to authenticated
  using (client_id in (select private.visible_client_ids()));
