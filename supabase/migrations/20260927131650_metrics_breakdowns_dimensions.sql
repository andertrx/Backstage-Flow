-- =============================================================================
-- Etapa 19.3 (ajuste) — a gravação das divisões recebe quais dimensões vieram
-- nesta busca: se uma delas falhar (ex.: horário), os números antigos dela não
-- são marcados como substituídos.
-- =============================================================================

drop function public.ingest_breakdowns(uuid, date, date, jsonb);

create function public.ingest_breakdowns(p_ad_account_id uuid, p_from date, p_to date, p_dimensions text[], p_rows jsonb)
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
  if p_dimensions is null or cardinality(p_dimensions) = 0 then return 0; end if;
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
     where (r ->> 'date')::date between p_from and p_to and r ->> 'dimension' = any (p_dimensions);

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
   where m.ad_account_id = v_acc.id and m.date between p_from and p_to and not m.superseded and m.dimension = any (p_dimensions)
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
revoke all on function public.ingest_breakdowns(uuid, date, date, text[], jsonb) from public, anon, authenticated;
grant execute on function public.ingest_breakdowns(uuid, date, date, text[], jsonb) to service_role;
