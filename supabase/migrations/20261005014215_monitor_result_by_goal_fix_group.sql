-- Correção 05/10/2026 (mesma fase): a mudança anterior (monitor_result_by_goal) passou a usar cp.id no cálculo do tipo de
-- resultado das anomalias e do "sem resultados", mas o agrupamento ainda era por cp.objective → o motor falhava.
-- Agora agrupa também por cp.id. Nada mais muda.
do $mig$
declare
  v_def text;
  r record;
begin
  for r in
    select * from (values
      ('monitor_cand_anomalies', 'g.d, cp.name, cp.objective, cp.start_date', 'g.d, cp.id, cp.name, cp.objective, cp.start_date'),
      ('monitor_cand_no_results', 'a.today, cp.name, cp.objective', 'a.today, cp.id, cp.name, cp.objective')
    ) as t(fn, old_text, new_text)
  loop
    select pg_get_functiondef(p.oid) into v_def
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'private' and p.proname = r.fn;
    if v_def is null or position(r.old_text in v_def) = 0 then
      raise exception 'Trecho não encontrado em private.%', r.fn;
    end if;
    execute replace(v_def, r.old_text, r.new_text);
  end loop;
end;
$mig$;
