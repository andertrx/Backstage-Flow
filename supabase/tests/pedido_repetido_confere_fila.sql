-- Teste T5.12: pedido já enviado ao Meta (por qualquer caminho) não pode ser marcado de novo. Transação desfeita.
-- Precisa de: 1 admin ativo, contato 20 na etapa "ganha", pedidos b-01 (fila) e ct20-1 (histórico) existentes.
do $$
declare v_admin uuid; v_stage uuid; v_ok int := 0; v_h int; v_q int;
begin
  select id into v_admin from public.profiles where role = 'admin' limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select stage_id into v_stage from public.tracking_contacts where id = 20;
  begin
    perform public.contact_update(20, v_stage, null, 2.99, 'BRL', 'b-01');
    raise exception 'FALHA 1: aceitou b-01 repetido';
  exception when sqlstate '23505' then v_ok := v_ok + 1; end;
  begin
    perform public.contact_update(20, v_stage, null, 1.02, 'BRL', 'ct20-1');
    raise exception 'FALHA 2: aceitou ct20-1 repetido';
  exception when sqlstate '23505' then v_ok := v_ok + 1; end;
  select count(*) into v_h from public.tracking_contact_history where kind='venda';
  select count(*) into v_q from public.tracking_capi_queue;
  perform public.contact_update(20, v_stage, null, 5.00, 'BRL', 'TESTE-T512-NOVO');
  if (select count(*) from public.tracking_contact_history where kind='venda') <> v_h + 1 or (select count(*) from public.tracking_capi_queue) <> v_q + 1 then raise exception 'FALHA 3'; end if;
  v_ok := v_ok + 1;
  raise exception 'R: % verificações OK (desfeito)', v_ok;
end $$;
