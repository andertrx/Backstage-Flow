-- Teste: destino desligado não envia; religado envia. Transação desfeita ("R: N verificações OK").
do $$
declare d record; v1 bigint; n int; v_ok int := 0;
begin
  select id, container_id, client_id into d from public.tracking_destinations limit 1;
  if d.id is null then raise exception 'Sem destino para testar'; end if;
  insert into public.tracking_capi_queue (destination_id, container_id, client_id, event_id, event_name, occurred_at, visitor_id, status, attempts, next_attempt_at)
  values (d.id, d.container_id, d.client_id, 'teste.desl.1', 'Lead', now(), 'v-teste', 'pendente', 0, now() - interval '1 minute') returning id into v1;

  update public.tracking_destinations set enabled = false where id = d.id;
  select count(*) into n from public.tracking_capi_claim(500) c where c.id = v1;
  if n <> 0 then raise exception 'FALHA 1: destino desligado enviou'; end if;
  if (select status from public.tracking_capi_queue where id = v1) <> 'pendente' then raise exception 'FALHA 1b: evento mudou de estado'; end if;
  v_ok := v_ok + 1;

  update public.tracking_destinations set enabled = true where id = d.id;
  select count(*) into n from public.tracking_capi_claim(500) c where c.id = v1;
  if n <> 1 then raise exception 'FALHA 2: destino ligado não enviou'; end if;
  v_ok := v_ok + 1;
  raise exception 'R: % verificações OK (desfeito)', v_ok;
end $$;
