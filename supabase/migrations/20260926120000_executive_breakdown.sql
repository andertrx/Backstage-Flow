-- =============================================================================
-- Etapa 29 — Dashboard executivo
--
-- public.executive_breakdown() devolve os totais do período separados por
-- cliente, plataforma e moeda. O site soma por cliente ou por plataforma
-- DENTRO de cada moeda (nunca soma BRL com USD) e mostra o consolidado.
--
-- Mesma regra do Dashboard principal (public.dashboard_summary): números do
-- nível "conta", período inclusivo, só leitura. Nenhuma tabela nova.
-- security invoker: cada pessoa só recebe os clientes liberados para ela (RLS).
-- =============================================================================

create function public.executive_breakdown(
  p_from date,
  p_to date,
  p_client_ids uuid[] default null,
  p_platforms text[] default null
)
returns table (
  client_id uuid,
  client_name text,
  platform_id text,
  currency text,
  spend_micros bigint,
  leads numeric,
  messages numeric,
  conversions numeric,
  conversion_value_micros bigint,
  accounts integer
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
  select m.client_id, cl.name, m.platform_id, m.currency,
         sum(m.spend_micros)::bigint,
         sum(m.leads), sum(m.messages), sum(m.conversions),
         sum(m.conversion_value_micros)::bigint,
         count(distinct m.ad_account_id)::integer
  from public.metrics_daily m
  join public.clients cl on cl.id = m.client_id
  where m.level = 'account'
    and m.date between p_from and p_to
    and (p_client_ids is null or m.client_id = any (p_client_ids))
    and (p_platforms is null or m.platform_id = any (p_platforms))
  group by m.client_id, cl.name, m.platform_id, m.currency
  order by sum(m.spend_micros) desc, cl.name, m.platform_id, m.currency;
end;
$$;

comment on function public.executive_breakdown(date, date, uuid[], text[]) is
  'Dashboard executivo: totais do período por cliente, plataforma e moeda (nível conta). Só leitura; respeita a RLS.';

revoke all on function public.executive_breakdown(date, date, uuid[], text[]) from public, anon;
grant execute on function public.executive_breakdown(date, date, uuid[], text[]) to authenticated, service_role;
