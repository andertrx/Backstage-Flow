-- Teste T5.11: nova venda de quem já está na etapa "Venda" (ganha). Transação desfeita ("R: N verificações OK").
-- Precisa de: 1 admin ativo e o contato 20 (ou ajuste o id) já na etapa "ganha".
do $$
declare v_admin uuid; v_stage uuid; v_before_h int; v_before_q int; v_after_h int; v_after_q int; r jsonb; v_ok int := 0;
begin
  select id into v_admin from public.profiles where role = 'admin' limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select stage_id into v_stage from public.tracking_contacts where id = 20;
  select count(*) into v_before_h from public.tracking_contact_history where kind = 'venda';
  select count(*) into v_before_q from public.tracking_capi_queue;
  r := public.contact_update(20, v_stage, null, 7.50, 'BRL', 'TESTE-T511-A');
  select count(*) into v_after_h from public.tracking_contact_history where kind = 'venda';
  select count(*) into v_after_q from public.tracking_capi_queue;
  if v_after_h <> v_before_h + 1 then raise exception 'FALHA 1: venda não registrada'; end if;
  if v_after_q <> v_before_q + 1 then raise exception 'FALHA 1b: fila do Meta não recebeu'; end if;
  v_ok := v_ok + 1;
  begin
    perform public.contact_update(20, v_stage, null, 7.50, 'BRL', 'TESTE-T511-A');
    raise exception 'FALHA 2: aceitou pedido repetido';
  exception when sqlstate '23505' then v_ok := v_ok + 1; end;
  select count(*) into v_before_h from public.tracking_contact_history;
  perform public.contact_update(20, v_stage, null, null, null, null);
  select count(*) into v_after_h from public.tracking_contact_history;
  if v_after_h <> v_before_h then raise exception 'FALHA 3: mexeu sem valor'; end if;
  v_ok := v_ok + 1;
  raise exception 'R: % verificações OK (desfeito)', v_ok;
end $$;
