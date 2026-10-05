-- Correção 05/10/2026 (mesma fase): desempenho do motor depois da regra "resultado pela meta do conjunto".
-- Nas anomalias, o tipo de resultado era calculado de novo para cada um dos 29 dias de cada campanha;
-- agora é calculado uma vez por campanha. O resultado é o mesmo.
do $mig$
declare
  v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'private' and p.proname = 'monitor_cand_anomalies';
  if position('select distinct x.campaign_id, a.id as acc_id, a.client_id, a.platform_id, a.currency, a.today' in v_def) = 0
     or position('cp.name as camp_name, private.monitor_result_kind_for(cp.id, null) as rkind' in v_def) = 0
     or position('private.monitor_results(private.monitor_result_kind_for(cp.id, null),' in v_def) = 0
     or position('c.today, g.d, cp.id, cp.name' in v_def) = 0 then
    raise exception 'Trecho não encontrado em private.monitor_cand_anomalies';
  end if;
  v_def := replace(v_def, 'select distinct x.campaign_id, a.id as acc_id, a.client_id, a.platform_id, a.currency, a.today',
                          'select distinct x.campaign_id, a.id as acc_id, a.client_id, a.platform_id, a.currency, a.today, private.monitor_result_kind_for(x.campaign_id, null) as ckind');
  v_def := replace(v_def, 'cp.name as camp_name, private.monitor_result_kind_for(cp.id, null) as rkind', 'cp.name as camp_name, c.ckind as rkind');
  v_def := replace(v_def, 'private.monitor_results(private.monitor_result_kind_for(cp.id, null),', 'private.monitor_results(c.ckind,');
  v_def := replace(v_def, 'c.today, g.d, cp.id, cp.name', 'c.today, c.ckind, g.d, cp.id, cp.name');
  execute v_def;
end;
$mig$;
