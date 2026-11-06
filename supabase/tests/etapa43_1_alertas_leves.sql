-- Teste da Etapa 43.1 — verificação de alertas mais leve (06/11/2026). Transação desfeita: termina com "R: N verificações OK".
do $$
declare v_ok int := 0; v_admin uuid; r jsonb; v_diff int;
begin
  select id into v_admin from public.profiles where role = 'admin' and active order by created_at limit 1;
  perform set_config('request.jwt.claims', '', true);
  -- 1) sistema: a primeira roda, a segunda (logo em seguida) é pulada
  insert into private.app_settings (key, value) values ('alerts_refreshed_at', (now() - interval '1 hour')::text)
    on conflict (key) do update set value = excluded.value;
  r := private.refresh_alerts_impl();
  if r ? 'skipped' then raise exception 'primeira deveria rodar: %', r; end if; v_ok := v_ok + 1;
  r := private.refresh_alerts_impl();
  if not coalesce((r ->> 'skipped')::boolean, false) then raise exception 'segunda deveria ser pulada: %', r; end if; v_ok := v_ok + 1;
  -- 2) depois de 5 minutos o sistema roda de novo
  update private.app_settings set value = (now() - interval '5 minutes')::text where key = 'alerts_refreshed_at';
  r := private.refresh_alerts_impl();
  if r ? 'skipped' then raise exception 'após 5 min deveria rodar: %', r; end if; v_ok := v_ok + 1;
  -- 3) pessoa logada (admin) roda sempre, mesmo logo em seguida
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  r := public.refresh_alerts();
  if r ? 'skipped' then raise exception 'admin nunca deveria ser pulado: %', r; end if; v_ok := v_ok + 1;
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
  -- 4) alertas iguais aos da versão anterior (e só de clientes ativos)
  select count(*) into v_diff from (
    (select * from private.alert_candidates() except select * from private.alert_candidates_antes_2026_10_30() c where private.client_is_active(c.client_id))
    union all
    (select * from private.alert_candidates_antes_2026_10_30() c where private.client_is_active(c.client_id) except select * from private.alert_candidates())) d;
  if v_diff <> 0 then raise exception 'candidatos diferentes: %', v_diff; end if; v_ok := v_ok + 1;
  raise exception 'R: % verificações OK', v_ok;
end $$;
