-- Teste: "Apagar tudo deste cliente" (WhatsApp pelo servidor). Transação desfeita (termina com "R: N verificações OK").
do $$
declare
  v_admin uuid; v_gestor uuid := '00000000-0000-0000-0000-000000399001';
  c record; v_cont uuid; v_vis text; v_ses text; v_outro_cliente uuid; v_ok integer := 0; v_j jsonb;
begin
  select id into v_admin from public.profiles where role = 'admin' and active order by created_at limit 1;
  select w.id, w.client_id into c from public.tracking_whatsapp_connections w where w.mode = 'nao_oficial' order by w.created_at limit 1;
  if c.id is null then raise exception 'sem conexão não oficial para testar'; end if;
  select container_id, visitor_id, session_id into v_cont, v_vis, v_ses from public.tracking_whatsapp_conversations where client_id = c.client_id limit 1;
  if v_cont is null then raise exception 'sem conversa existente para copiar visitante'; end if;
  select client_id into v_outro_cliente from public.tracking_wa_messages where client_id <> c.client_id limit 1;
  insert into auth.users (id, instance_id, aud, role, email) values (v_gestor, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'g@t399.local');
  update public.profiles set active = true, role = 'gestor', full_name = 'G T399' where id = v_gestor;
  insert into public.user_client_access (user_id, client_id) values (v_gestor, c.client_id);
  update public.tracking_whatsapp_connections set enabled = true, last_webhook_at = now() where id = c.id;
  -- dados de teste: 2 conversas (uma sem venda, uma com venda)
  insert into public.tracking_whatsapp_conversations (connection_id, container_id, client_id, wa_hash, visitor_id, session_id, origin, first_message_at, last_message_at, messages, status, sales)
  values (c.id, v_cont, c.client_id, repeat('a', 64), v_vis, v_ses, 'desconhecida', now(), now(), 3, 'conversa', 0),
         (c.id, v_cont, c.client_id, repeat('b', 64), v_vis, v_ses, 'desconhecida', now(), now(), 2, 'venda', 1);

  -- Como administrador
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  v_j := public.wa_unofficial_apagar_tudo_contagem(c.id);
  if (v_j ->> 'conversas_apagar')::int < 1 or (v_j ->> 'conversas_com_venda_mantidas')::int < 1 then raise exception 'contagem: %', v_j; end if;
  v_ok := v_ok + 1;
  begin perform public.wa_unofficial_apagar_tudo(c.id, 'apagar'); raise exception 'sem a palavra APAGAR não apaga';
  exception when sqlstate '22023' then null; end;
  v_ok := v_ok + 1;
  v_j := public.wa_unofficial_apagar_tudo(c.id, 'APAGAR');
  if (v_j ->> 'conversas')::int < 1 then raise exception 'apagou conversas sem venda: %', v_j; end if;
  perform set_config('role', 'postgres', true);
  if exists (select 1 from public.tracking_whatsapp_conversations where client_id = c.client_id and coalesce(sales, 0) = 0) then raise exception 'sobrou conversa sem venda'; end if;
  if not exists (select 1 from public.tracking_whatsapp_conversations where client_id = c.client_id and wa_hash = repeat('b', 64)) then raise exception 'a conversa com venda tem que ficar'; end if;
  if exists (select 1 from public.tracking_wa_messages where client_id = c.client_id) or exists (select 1 from public.tracking_wa_people where client_id = c.client_id) then raise exception 'sobrou mensagem/pessoa'; end if;
  if exists (select 1 from public.tracking_whatsapp_connections where client_id = c.client_id and mode = 'nao_oficial' and (enabled or last_webhook_at is not null)) then raise exception 'a conexão devia ficar desligada e zerada'; end if;
  if (select count(*) from public.audit_logs where action = 'wa_cliente.apagar_tudo' and target_id = c.client_id::text) <> 1 then raise exception 'fica no histórico de auditoria'; end if;
  v_ok := v_ok + 1;
  -- Outro cliente não é tocado
  if v_outro_cliente is not null and not exists (select 1 from public.tracking_wa_messages where client_id = v_outro_cliente) then raise exception 'apagou dado de OUTRO cliente'; end if;
  v_ok := v_ok + 1;

  -- Gestor (mesmo com acesso) não pode
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_gestor, 'role', 'authenticated')::text, true);
  begin perform public.wa_unofficial_apagar_tudo(c.id, 'APAGAR'); raise exception 'gestor não apaga tudo';
  exception when sqlstate '42501' then null; end;
  begin perform public.wa_unofficial_apagar_tudo_contagem(c.id); raise exception 'gestor não vê a contagem';
  exception when sqlstate '42501' then null; end;
  v_ok := v_ok + 1;
  perform set_config('role', 'postgres', true);
  raise exception 'R: % verificações OK', v_ok;
end $$;
