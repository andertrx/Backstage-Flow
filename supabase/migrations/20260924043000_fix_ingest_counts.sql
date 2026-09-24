-- Correção da Etapa 5: em tabelas particionadas o PostgreSQL não permite ler a
-- coluna de sistema "xmax" no RETURNING (usada para separar inserido x
-- atualizado). Agora contamos antes quantas linhas do lote já existiam.
create or replace function public.ingest_metrics_daily(p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  month_start date;
  total       integer;
  existing    integer;
  affected    integer;
  inserted    integer;
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

  -- Quantas linhas do lote já existiam antes (para separar novas x atualizadas).
  select count(*) into existing
  from jsonb_to_recordset(p_rows) as r(date date, ad_account_id uuid, level public.entity_level, entity_external_id text)
  join public.metrics_daily m
    on m.ad_account_id = r.ad_account_id and m.level = r.level
   and m.entity_external_id = r.entity_external_id and m.date = r.date;

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
    returning 1
  )
  select count(*) into affected from upserted;

  inserted := total - existing;
  return jsonb_build_object(
    'received', total,
    'inserted', inserted,
    'updated', affected - inserted,
    'unchanged', existing - (affected - inserted)
  );
end;
$$;

revoke all on function public.ingest_metrics_daily(jsonb) from public, anon, authenticated;
grant execute on function public.ingest_metrics_daily(jsonb) to service_role;
