-- =============================================================================
-- Testes da Etapa 30 — Performance
-- Garante que as otimizações continuam no lugar: índices "resumo", plano sob
-- medida nas funções de leitura e o banco usando o índice (sem ler a tabela).
-- Rodar inteiro no SQL Editor. Nada é gravado.
-- =============================================================================
begin;

do $$
declare
  v_list text;
  r record;
  found boolean := false;
begin
  -- 1) Índices da Etapa 30 existem.
  select string_agg(n, ', ') into v_list
  from unnest(array['metrics_daily_account_totals_idx', 'metrics_daily_campaign_totals_idx',
                    'ads_account_status_idx', 'ad_groups_account_status_idx']) n
  where to_regclass('public.' || n) is null;
  if v_list is not null then raise exception 'FALHOU: índices ausentes: %', v_list; end if;

  -- 2) Funções de leitura com plano sob medida (evita o plano genérico lento).
  select string_agg(p.proname, ', ') into v_list
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('dashboard_summary', 'dashboard_timeseries', 'campaign_table', 'entity_rows',
                      'executive_breakdown', 'metrics_summary', 'metrics_timeseries')
    and not coalesce('plan_cache_mode=force_custom_plan' = any (p.proconfig), false);
  if v_list is not null then raise exception 'FALHOU: funções sem plan_cache_mode=force_custom_plan: %', v_list; end if;

  -- 3) A soma do nível conta lê só o índice resumo (index-only scan), não a tabela.
  for r in execute 'explain (costs off) select currency, sum(spend_micros) from public.metrics_daily
                    where level = ''account'' and date between current_date - 365 and current_date - 1 group by currency' loop
    if r."QUERY PLAN" ilike '%Index Only Scan%date_client_id%' then found := true; end if;
  end loop;
  if not found then raise exception 'FALHOU: a soma do nível conta não usa o índice resumo'; end if;
end $$;

select 'Etapa 30: TODOS OS TESTES PASSARAM' as resultado;
rollback;
