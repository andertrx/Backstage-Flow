-- Teste T5.14: IA de vendas por WhatsApp. Transação desfeita ("R: N verificações OK"). Precisa de 1 admin e 1 conexão "nao_oficial" com conversas guardadas.
do $$
declare v_admin uuid; v_conn uuid; v_ok int := 0; v_ai boolean;
begin
  select id into v_admin from public.profiles where role = 'admin' limit 1;
  select id into v_conn from public.tracking_whatsapp_connections where mode='nao_oficial' limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.wa_unofficial_set_ai(v_conn, false);
  select ai_suggest into v_ai from public.tracking_whatsapp_connections where id = v_conn;
  if v_ai then raise exception 'FALHA 1a: não desligou'; end if;
  perform public.wa_unofficial_set_ai(v_conn, true);
  select ai_suggest into v_ai from public.tracking_whatsapp_connections where id = v_conn;
  if not v_ai then raise exception 'FALHA 1b: não ligou'; end if;
  v_ok := v_ok + 1;
  perform public.wa_unofficial_set_store(v_conn, false, true);
  begin
    perform public.wa_unofficial_set_ai(v_conn, true);
    raise exception 'FALHA 2: ligou a IA sem conversas guardadas';
  exception when sqlstate '22023' then v_ok := v_ok + 1; end;
  raise exception 'R: % verificações OK (desfeito)', v_ok;
end $$;
