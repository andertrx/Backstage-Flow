-- Teste: erro de credencial não gasta tentativa nem descarta; erro comum continua descartando na 6ª. Transação desfeita ("R: N verificações OK").
do $$
declare d record; v1 bigint; v2 bigint; v3 bigint; q record; v_ok int := 0;
begin
  select id, container_id, client_id into d from public.tracking_destinations limit 1;
  if d.id is null then raise exception 'Sem destino para testar'; end if;
  insert into public.tracking_capi_queue (destination_id, container_id, client_id, event_id, event_name, occurred_at, visitor_id, status, attempts)
  values (d.id, d.container_id, d.client_id, 'teste.cred.1', 'Lead', now(), 'v-teste', 'enviando', 6) returning id into v1;
  insert into public.tracking_capi_queue (destination_id, container_id, client_id, event_id, event_name, occurred_at, visitor_id, status, attempts)
  values (d.id, d.container_id, d.client_id, 'teste.cred.2', 'Lead', now(), 'v-teste', 'enviando', 6) returning id into v2;
  insert into public.tracking_capi_queue (destination_id, container_id, client_id, event_id, event_name, occurred_at, visitor_id, status, attempts)
  values (d.id, d.container_id, d.client_id, 'teste.cred.3', 'Lead', now(), 'v-teste', 'enviando', 2) returning id into v3;

  perform public.tracking_capi_finish(jsonb_build_array(
    jsonb_build_object('id', v1, 'ok', false, 'error', 'Token inválido', 'auth', true),
    jsonb_build_object('id', v2, 'ok', false, 'error', 'Meta instável'),
    jsonb_build_object('id', v3, 'ok', false, 'error', 'Token inválido', 'auth', true)));

  select * into q from public.tracking_capi_queue where id = v1;
  if q.status <> 'erro' or q.attempts <> 5 or q.next_attempt_at < now() + interval '25 minutes' or q.next_attempt_at > now() + interval '35 minutes' then
    raise exception 'FALHA 1: credencial na 6ª tentativa deveria ficar em erro, 5 tentativas, 30 min: % % %', q.status, q.attempts, q.next_attempt_at; end if;
  v_ok := v_ok + 1;
  select * into q from public.tracking_capi_queue where id = v2;
  if q.status <> 'descartado' then raise exception 'FALHA 2: erro comum na 6ª deveria descartar: %', q.status; end if;
  v_ok := v_ok + 1;
  select * into q from public.tracking_capi_queue where id = v3;
  if q.status <> 'erro' or q.attempts <> 1 then raise exception 'FALHA 3: %, %', q.status, q.attempts; end if;
  v_ok := v_ok + 1;
  raise exception 'R: % verificações OK (desfeito)', v_ok;
end $$;
