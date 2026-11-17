-- Teste: excluir o WhatsApp (servidor próprio) de UM cliente. Transação desfeita (termina com "R: N verificações OK").
do $$
declare
  v_admin uuid; v_gestor uuid := '00000000-0000-0000-0000-000000400001'; v_semacesso uuid := '00000000-0000-0000-0000-000000400002';
  c record; v_ok integer := 0; v_r jsonb; v_conv_antes integer; v_conv_depois integer; v_outras integer;
begin
  select id into v_admin from public.profiles where role = 'admin' and active order by created_at limit 1;
  select w.id, w.client_id, w.container_id, w.display_phone into c from public.tracking_whatsapp_connections w where w.mode = 'nao_oficial' and w.excluded_at is null order by w.created_at limit 1;
  if c.id is null then raise exception 'sem conexão para testar'; end if;
  insert into auth.users (id, instance_id, aud, role, email) values
    (v_gestor, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'g@t400.local'),
    (v_semacesso, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 's@t400.local');
  update public.profiles set active = true, role = 'gestor', full_name = 'G T400' where id = v_gestor;
  update public.profiles set active = true, role = 'gestor', full_name = 'S T400' where id = v_semacesso;
  insert into public.user_client_access (user_id, client_id) values (v_gestor, c.client_id);
  update public.tracking_whatsapp_connections set enabled = true, last_webhook_at = now(), instance_name = 'bf-teste400', gateway_state = 'conectado', store_messages = true where id = c.id;
  select count(*) into v_conv_antes from public.tracking_whatsapp_conversations where connection_id = c.id;
  select count(*) into v_outras from public.tracking_whatsapp_connections where id <> c.id and excluded_at is null;

  -- gestor sem acesso ao cliente não exclui
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_semacesso, 'role', 'authenticated')::text, true);
  begin perform public.tracking_whatsapp_exclude(c.id, 'EXCLUIR'); raise exception 'gestor sem acesso não exclui';
  exception when sqlstate '42501' then null; end;
  v_ok := v_ok + 1;
  -- gestor com acesso: precisa digitar EXCLUIR
  perform set_config('request.jwt.claims', json_build_object('sub', v_gestor, 'role', 'authenticated')::text, true);
  begin perform public.tracking_whatsapp_exclude(c.id, 'excluir ja'); raise exception 'sem a palavra não exclui';
  exception when sqlstate '22023' then null; end;
  perform public.tracking_whatsapp_exclude(c.id, 'excluir');
  v_ok := v_ok + 1;
  perform set_config('role', 'postgres', true);
  if not exists (select 1 from public.tracking_whatsapp_connections where id = c.id and excluded_at is not null and not enabled and instance_name is null
                   and gateway_state is null and inbound_key_hash is null and not store_messages and phone_number_id ~ '^9\d{20}$' and display_phone = c.display_phone) then
    raise exception 'depois de excluir: desligada, sem instância/chave, número liberado, número de exibição mantido';
  end if;
  v_ok := v_ok + 1;
  select count(*) into v_conv_depois from public.tracking_whatsapp_conversations where connection_id = c.id;
  if v_conv_depois <> v_conv_antes then raise exception 'o histórico (conversas) não pode ser apagado'; end if;
  if (select count(*) from public.tracking_whatsapp_connections where id <> c.id and excluded_at is null) <> v_outras then raise exception 'mexeu em outro cliente'; end if;
  if (select count(*) from public.audit_logs where action = 'wa_cliente.excluir_whatsapp' and target_id = c.id::text) <> 1 then raise exception 'fica na auditoria'; end if;
  v_ok := v_ok + 1;
  -- excluir de novo é recusado
  perform set_config('role', 'authenticated', true);
  begin perform public.tracking_whatsapp_exclude(c.id, 'EXCLUIR'); raise exception 'já excluído';
  exception when sqlstate '22023' then null; end;
  -- ligar de novo (mesmo container) reaproveita o cadastro, começa desligado e com chave nova
  v_r := public.wa_unofficial_save(c.container_id, '11 91234-5678');
  perform set_config('role', 'postgres', true);
  if (v_r ->> 'id')::uuid <> c.id or (v_r ->> 'key') is null then raise exception 'religar reaproveita o cadastro e dá chave nova: %', v_r; end if;
  if not exists (select 1 from public.tracking_whatsapp_connections where id = c.id and excluded_at is null and not enabled and phone_number_id = '5511912345678' and inbound_key_hash is not null) then raise exception 'religada: sem exclusão, desligada, número novo'; end if;
  if (select count(*) from public.tracking_whatsapp_conversations where connection_id = c.id) <> v_conv_antes then raise exception 'histórico volta junto'; end if;
  v_ok := v_ok + 1;
  raise exception 'R: % verificações OK', v_ok;
end $$;
