-- Correção 05/10/2026 (mesma fase): desempenho do motor. Em "limites", o tipo de resultado de cada item era recalculado
-- para cada métrica que o usa (a consulta intermediária era "desdobrada"); com "materialized" é calculado uma vez.
-- Avaliação completa: de ~11 s para ~3 s. O resultado é o mesmo.
do $mig$
declare
  v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'private' and p.proname = 'monitor_cand_limits';
  if (length(v_def) - length(replace(v_def, '    z as (', ''))) / length('    z as (') <> 1 then
    raise exception 'Trecho não encontrado (ou repetido) em private.monitor_cand_limits';
  end if;
  execute replace(v_def, '    z as (', '    z as materialized (');
end;
$mig$;
