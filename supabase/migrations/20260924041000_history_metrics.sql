-- =============================================================================
-- ETAPA 5 (parte 2) — Métricas diárias (o coração do histórico)
--
--   * public.metrics_daily → números de UM dia de UMA conta/campanha/grupo/anúncio.
--     Particionada por MÊS: cada mês é uma "gaveta" separada (schema history),
--     então consultar setembro não precisa abrir as gavetas de outros meses.
--   * Gavetas são criadas automaticamente: na ingestão (para o mês dos dados)
--     e todo dia 1º pelo Supabase Cron (12 meses à frente).
--   * public.ingest_metrics_daily() → a sincronização grava por aqui:
--     atualiza se já existe, NÃO regrava se nada mudou (hash).
--
-- Regras de dados:
--   * Dinheiro em micros (bigint): R$ 12,34 = 12.340.000. Sem erro de arredondamento.
--   * NULL = "informação não disponível pela API"; 0 = zero de verdade.
--   * date = dia no fuso da CONTA de anúncio (como a plataforma reporta).
-- Retenção: permanente.
-- =============================================================================

create extension if not exists pg_cron;

-- Gavetas mensais ficam num schema que o site não enxerga.
create schema if not exists history;
revoke all on schema history from public, anon, authenticated;

create table public.metrics_daily (
  date                    date not null,
  ad_account_id           uuid not null references public.ad_accounts (id),
  level                   public.entity_level not null,
  entity_external_id      text not null check (entity_external_id ~ '^[0-9A-Za-z_-]{1,64}$'),
  client_id               uuid not null references public.clients (id),
  platform_id             text not null references public.platforms (id),
  campaign_id             uuid references public.campaigns (id),
  ad_group_id             uuid references public.ad_groups (id),
  ad_id                   uuid references public.ads (id),
  currency                text not null check (currency ~ '^[A-Z]{3}$'),
  spend_micros            bigint not null default 0 check (spend_micros >= 0),
  impressions             bigint not null default 0 check (impressions >= 0),
  reach                   bigint check (reach is null or reach >= 0),
  clicks                  bigint not null default 0 check (clicks >= 0),
  link_clicks             bigint check (link_clicks is null or link_clicks >= 0),
  leads                   numeric(18, 4) check (leads is null or leads >= 0),
  messages                numeric(18, 4) check (messages is null or messages >= 0),
  conversions             numeric(18, 4) check (conversions is null or conversions >= 0),
  conversion_value_micros bigint check (conversion_value_micros is null or conversion_value_micros >= 0),
  video_views             bigint check (video_views is null or video_views >= 0),
  platform_metrics        jsonb not null default '{}'::jsonb,
  raw_actions             jsonb,
  hash                    text not null,
  synced_at               timestamptz not null default now(),
  primary key (ad_account_id, level, entity_external_id, date)
) partition by range (date);

comment on table public.metrics_daily is 'Métricas por dia e por item (conta/campanha/grupo/anúncio). Particionada por mês. Permanente.';
comment on column public.metrics_daily.date is 'Dia no fuso horário da conta de anúncio.';
comment on column public.metrics_daily.reach is 'Alcance DO DIA. Não somar entre dias (mesma pessoa contaria 2x); ver period_reach.';
comment on column public.metrics_daily.messages is 'Conversas iniciadas. NULL no Google Ads (a API não tem essa métrica).';
comment on column public.metrics_daily.platform_metrics is 'Valores oficiais informados pela plataforma (ex.: ctr, cpc) para o dia/item.';
comment on column public.metrics_daily.raw_actions is 'Lista original de ações do Meta (auditoria do que virou lead/mensagem).';

create index metrics_daily_client_level_date_idx on public.metrics_daily (client_id, level, date);
create index metrics_daily_account_level_date_idx on public.metrics_daily (ad_account_id, level, date);
create index metrics_daily_campaign_date_idx on public.metrics_daily (campaign_id, date) where campaign_id is not null;
create index metrics_daily_platform_date_idx on public.metrics_daily (platform_id, level, date);

-- -----------------------------------------------------------------------------
-- Criação das gavetas mensais
-- -----------------------------------------------------------------------------
create function private.ensure_metrics_partition(p_month date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  first_day date := date_trunc('month', p_month)::date;
  next_day  date := (date_trunc('month', p_month) + interval '1 month')::date;
  part_name text := 'metrics_daily_' || to_char(first_day, 'YYYY_MM');
begin
  if to_regclass('history.' || part_name) is not null then return; end if;
  perform pg_advisory_xact_lock(hashtext(part_name)); -- evita duas criações ao mesmo tempo
  if to_regclass('history.' || part_name) is not null then return; end if;

  execute format('create table history.%I partition of public.metrics_daily for values from (%L) to (%L)', part_name, first_day, next_day);
  -- Proteção extra: a gaveta em si não é acessível; o acesso é sempre pela tabela-mãe (com RLS).
  execute format('revoke all on table history.%I from public, anon, authenticated', part_name);
  execute format('alter table history.%I enable row level security', part_name);
end;
$$;

create function private.ensure_metrics_partitions_ahead(p_months integer default 12)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  i integer;
begin
  for i in 0..p_months loop
    perform private.ensure_metrics_partition((date_trunc('month', now()) + make_interval(months => i))::date);
  end loop;
end;
$$;

revoke all on function private.ensure_metrics_partition(date) from public, anon, authenticated;
revoke all on function private.ensure_metrics_partitions_ahead(integer) from public, anon, authenticated;

-- Gavetas iniciais: jan/2024 até 12 meses à frente. Meses mais antigos (backfill)
-- são criados automaticamente pela ingestão quando chegarem dados deles.
do $$
declare
  m date := date '2024-01-01';
begin
  while m <= (date_trunc('month', now()) + interval '12 months')::date loop
    perform private.ensure_metrics_partition(m);
    m := (m + interval '1 month')::date;
  end loop;
end $$;

-- Todo dia 1º, às 03:00 UTC (00:00 em Brasília), garante as gavetas dos próximos 12 meses.
select cron.schedule('metrics-daily-partitions', '0 3 1 * *', $$select private.ensure_metrics_partitions_ahead(12)$$);

-- -----------------------------------------------------------------------------
-- Ingestão (usada pela sincronização — somente o servidor)
-- -----------------------------------------------------------------------------
create function public.ingest_metrics_daily(p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  month_start date;
  total       integer;
  inserted    integer;
  updated     integer;
begin
  if jsonb_typeof(p_rows) is distinct from 'array' then
    raise exception 'p_rows deve ser uma lista JSON';
  end if;
  total := jsonb_array_length(p_rows);
  if total = 0 then return jsonb_build_object('received', 0, 'inserted', 0, 'updated', 0, 'unchanged', 0); end if;
  if total > 5000 then raise exception 'Lote grande demais (máx. 5000 linhas por chamada)'; end if;

  -- Nenhuma linha pode ser descartada em silêncio: conta desconhecida = erro.
  if exists (
    select 1 from jsonb_array_elements(p_rows) e
    left join public.ad_accounts a on a.id = (e ->> 'ad_account_id')::uuid
    where a.id is null
  ) then
    raise exception 'Lote contém conta de anúncio inexistente';
  end if;

  -- Garante as gavetas dos meses presentes no lote (inclui backfill antigo).
  for month_start in
    select distinct date_trunc('month', (e ->> 'date')::date)::date from jsonb_array_elements(p_rows) e
  loop
    perform private.ensure_metrics_partition(month_start);
  end loop;

  with incoming as (
    select r.*, a.client_id, a.platform_id, coalesce(r.currency, a.currency) as final_currency
    from jsonb_to_recordset(p_rows) as r(
      date date, ad_account_id uuid, level public.entity_level, entity_external_id text,
      campaign_id uuid, ad_group_id uuid, ad_id uuid, currency text,
      spend_micros bigint, impressions bigint, reach bigint, clicks bigint, link_clicks bigint,
      leads numeric, messages numeric, conversions numeric, conversion_value_micros bigint,
      video_views bigint, platform_metrics jsonb, raw_actions jsonb
    )
    join public.ad_accounts a on a.id = r.ad_account_id -- cliente e plataforma vêm SEMPRE da conta
  ),
  upserted as (
    insert into public.metrics_daily as m (
      date, ad_account_id, level, entity_external_id, client_id, platform_id, campaign_id, ad_group_id, ad_id,
      currency, spend_micros, impressions, reach, clicks, link_clicks, leads, messages, conversions,
      conversion_value_micros, video_views, platform_metrics, raw_actions, hash, synced_at
    )
    select
      i.date, i.ad_account_id, i.level, i.entity_external_id, i.client_id, i.platform_id, i.campaign_id, i.ad_group_id, i.ad_id,
      i.final_currency, coalesce(i.spend_micros, 0), coalesce(i.impressions, 0), i.reach, coalesce(i.clicks, 0), i.link_clicks,
      i.leads, i.messages, i.conversions, i.conversion_value_micros, i.video_views,
      coalesce(i.platform_metrics, '{}'::jsonb), i.raw_actions,
      md5(jsonb_build_array(
        i.final_currency, i.spend_micros, i.impressions, i.reach, i.clicks, i.link_clicks, i.leads, i.messages,
        i.conversions, i.conversion_value_micros, i.video_views, i.platform_metrics, i.raw_actions,
        i.campaign_id, i.ad_group_id, i.ad_id
      )::text),
      now()
    from incoming i
    on conflict (ad_account_id, level, entity_external_id, date) do update set
      campaign_id = excluded.campaign_id,
      ad_group_id = excluded.ad_group_id,
      ad_id = excluded.ad_id,
      currency = excluded.currency,
      spend_micros = excluded.spend_micros,
      impressions = excluded.impressions,
      reach = excluded.reach,
      clicks = excluded.clicks,
      link_clicks = excluded.link_clicks,
      leads = excluded.leads,
      messages = excluded.messages,
      conversions = excluded.conversions,
      conversion_value_micros = excluded.conversion_value_micros,
      video_views = excluded.video_views,
      platform_metrics = excluded.platform_metrics,
      raw_actions = excluded.raw_actions,
      hash = excluded.hash,
      synced_at = excluded.synced_at
    where m.hash is distinct from excluded.hash -- nada mudou = não regrava
    returning (xmax = 0) as is_insert
  )
  select count(*) filter (where is_insert), count(*) filter (where not is_insert) into inserted, updated from upserted;

  return jsonb_build_object('received', total, 'inserted', inserted, 'updated', updated, 'unchanged', total - inserted - updated);
end;
$$;

revoke all on function public.ingest_metrics_daily(jsonb) from public, anon, authenticated;
grant execute on function public.ingest_metrics_daily(jsonb) to service_role;

-- -----------------------------------------------------------------------------
-- Permissões e RLS (a regra vale para todas as gavetas, pela tabela-mãe)
-- -----------------------------------------------------------------------------
revoke all on public.metrics_daily from anon, authenticated;
grant select on public.metrics_daily to authenticated;
alter table public.metrics_daily enable row level security;

create policy "Vê métricas dos clientes liberados" on public.metrics_daily for select to authenticated
  using (client_id in (select private.visible_client_ids()));
