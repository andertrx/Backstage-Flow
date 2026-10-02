-- Etapa 37.3 — motor (3/4): normaliza os alertas abertos de contas avaliadas que não apareceram de novo.
create or replace function private.monitor_normalize()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_open public.monitor_alerts;
  v_n integer := 0;
begin
  for v_open in
    select a.* from public.monitor_alerts a
      join pg_temp._mon_acc acc on acc.id = a.ad_account_id and acc.reason is null
     where a.resolved_at is null
       and not exists (select 1 from pg_temp._mon_cand cd where cd.key = a.dedupe_key)
     for update of a
  loop
    update public.monitor_alerts set resolved_at = now(), resolution = 'automatica',
           status = case when status = 'ignorado' then 'ignorado' else 'resolvido' end
     where id = v_open.id;
    insert into public.monitor_alert_events (alert_id, kind, from_value, to_value, note)
    values (v_open.id, 'normalizado', v_open.severity, 'normal',
            'O indicador voltou para dentro do limite (ou deixou de ter volume suficiente para comparar).');
    v_n := v_n + 1;
  end loop;
  insert into public.monitor_account_state (ad_account_id, last_evaluated_at, last_data_at)
  select id, now(), data_at from pg_temp._mon_acc where reason is null
  on conflict (ad_account_id) do update set last_evaluated_at = excluded.last_evaluated_at, last_data_at = excluded.last_data_at;
  return v_n;
end;
$$;
revoke all on function private.monitor_normalize() from public, anon, authenticated;
