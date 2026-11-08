-- Teste das otimizações do banco (Auditoria de desempenho, 08/11/2026). Transação desfeita ("R: N verificações OK").
-- 1) ingest_breakdowns: a mesma carga duas vezes não regrava; mudança grava só a linha mudada; linha que some é marcada e volta reativada.
do $$
declare v_acc uuid; v_n integer; v_ok integer := 0; v_xmin1 xid; v_xmin2 xid; v_day date := current_date - 3; v_rows jsonb;
begin
  select id into v_acc from public.ad_accounts limit 1;
  v_rows := jsonb_build_array(
    jsonb_build_object('date', v_day, 'dimension', 'age', 'value', '99-99', 'spend_micros', 1000000, 'impressions', 100, 'clicks', 5, 'leads', 1),
    jsonb_build_object('date', v_day, 'dimension', 'age', 'value', '98-98', 'spend_micros', 2000000, 'impressions', 200, 'clicks', 9, 'leads', 2));
  v_n := public.ingest_breakdowns(v_acc, v_day, v_day, array['age'], v_rows);
  if v_n <> 2 then raise exception '1ª carga grava as 2 linhas: %', v_n; end if;
  select xmin into v_xmin1 from public.metrics_breakdown_daily where ad_account_id = v_acc and dimension = 'age' and date = v_day and value = '99-99';
  v_n := public.ingest_breakdowns(v_acc, v_day, v_day, array['age'], v_rows);
  select xmin into v_xmin2 from public.metrics_breakdown_daily where ad_account_id = v_acc and dimension = 'age' and date = v_day and value = '99-99';
  if v_n <> 0 or v_xmin1 is distinct from v_xmin2 then raise exception '2ª carga igual não regrava'; end if;
  v_ok := v_ok + 1;
  v_rows := jsonb_set(v_rows, '{1,spend_micros}', '2500000');
  v_n := public.ingest_breakdowns(v_acc, v_day, v_day, array['age'], v_rows);
  if v_n <> 1 or (select spend_micros from public.metrics_breakdown_daily where ad_account_id = v_acc and dimension = 'age' and date = v_day and value = '98-98') <> 2500000 then raise exception 'mudança grava só a linha mudada'; end if;
  v_ok := v_ok + 1;
  v_n := public.ingest_breakdowns(v_acc, v_day, v_day, array['age'], jsonb_build_array(v_rows -> 0));
  if (select superseded from public.metrics_breakdown_daily where ad_account_id = v_acc and dimension = 'age' and date = v_day and value = '98-98') is not true then raise exception 'linha que sumiu é marcada como substituída'; end if;
  v_n := public.ingest_breakdowns(v_acc, v_day, v_day, array['age'], v_rows);
  if (select superseded from public.metrics_breakdown_daily where ad_account_id = v_acc and dimension = 'age' and date = v_day and value = '98-98') is not false or v_n <> 1 then raise exception 'linha que voltou é reativada'; end if;
  v_ok := v_ok + 1;
  raise exception 'R: % verificações OK', v_ok;
end $$;
