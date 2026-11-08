-- Teste da fase Tracking T5.6a (conversas do WhatsApp guardadas por 15/30 dias). Roda numa transação desfeita
-- (termina com "R: N verificações OK", que desfaz tudo).
do $$
declare
  v_admin uuid; v_visu uuid; v_oper uuid; v_a uuid; v_ct uuid; v_r jsonb; v_id uuid; v_ok integer := 0; v_n integer; v_res text;
  v_wa text := encode(extensions.digest('5545999998888', 'sha256'), 'hex');
  k1 text := left(encode(extensions.digest('msg1', 'sha256'), 'hex'), 40);
  k2 text := left(encode(extensions.digest('msg2', 'sha256'), 'hex'), 40);
  k3 text := left(encode(extensions.digest('msg3', 'sha256'), 'hex'), 40);
begin
  select id into v_admin from public.profiles where role = 'admin' and active order by created_at limit 1;
  select id into v_visu from public.profiles where role = 'visualizador' and active order by created_at limit 1;
  select id into v_oper from public.profiles where role = 'visualizador' and active order by created_at offset 1 limit 1;
  if v_oper is null or v_oper = v_visu then raise exception 'precisa de dois visualizadores ativos'; end if;
  select id into v_a from public.clients where status <> 'encerrado' and excluded_at is null order by created_at limit 1;
  insert into public.tracking_containers (client_id, name, allowed_domains, test_mode) values (v_a, 'teste-conversas', '{conv.test}', false) returning id into v_ct;

  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  v_r := public.wa_unofficial_save(v_ct, '45999991111');
  v_id := (v_r ->> 'id')::uuid;
  perform public.wa_unofficial_set_enabled(v_id, true);
  if (select store_messages from public.tracking_whatsapp_connections where id = v_id) is not false then raise exception 'guardar conversas nasce DESLIGADO'; end if;
  v_ok := v_ok + 1;

  -- Servidor: com a opção desligada, nada é guardado
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'postgres', true);
  v_res := public.wa_message_store(jsonb_build_object('connection_id', v_id, 'wa_hash', v_wa, 'direction', 'recebida', 'message_key', k1, 'at', now(), 'body', 'Oi, quero comprar', 'push_name', 'João', 'phone_tail', '8888'));
  if v_res <> 'desligado' or (select count(*) from public.tracking_wa_messages) <> 0 then raise exception 'opção desligada não guarda: %', v_res; end if;
  v_ok := v_ok + 1;

  -- Admin liga; gestor/visualizador não ligam (visualizador barrado)
  perform set_config('request.jwt.claims', json_build_object('sub', v_visu, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  begin perform public.wa_unofficial_set_store(v_id, true); raise exception 'visualizador não liga a guarda'; exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  perform public.wa_unofficial_set_store(v_id, true);
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'postgres', true);
  v_ok := v_ok + 1;

  -- Guarda a mensagem recebida e a enviada; repetida não duplica; sem texto/chave inválida é recusada; prazo de 30 dias
  if public.wa_message_store(jsonb_build_object('connection_id', v_id, 'wa_hash', v_wa, 'direction', 'recebida', 'message_key', k1, 'at', now(), 'body', 'Oi, quero comprar', 'push_name', 'João', 'phone_tail', '8888')) <> 'guardada'
     or public.wa_message_store(jsonb_build_object('connection_id', v_id, 'wa_hash', v_wa, 'direction', 'enviada', 'message_key', k2, 'at', now(), 'body', 'Parabéns pela sua compra de R$ 297')) <> 'guardada' then
    raise exception 'guarda recebida e enviada';
  end if;
  perform public.wa_message_store(jsonb_build_object('connection_id', v_id, 'wa_hash', v_wa, 'direction', 'recebida', 'message_key', k1, 'at', now(), 'body', 'Oi, quero comprar'));
  if (select count(*) from public.tracking_wa_messages) <> 2 then raise exception 'repetida não duplica'; end if;
  if public.wa_message_store(jsonb_build_object('connection_id', v_id, 'wa_hash', v_wa, 'direction', 'recebida', 'message_key', k3, 'body', '   ')) <> 'invalido'
     or public.wa_message_store(jsonb_build_object('connection_id', v_id, 'wa_hash', 'xx', 'direction', 'recebida', 'message_key', k3, 'body', 'oi')) <> 'invalido' then raise exception 'inválidas'; end if;
  if (select min(expires_at) from public.tracking_wa_messages) < now() + interval '29 days 23 hours' or (select max(expires_at) from public.tracking_wa_messages) > now() + interval '30 days 1 hour' then
    raise exception 'prazo padrão de 30 dias';
  end if;
  v_ok := v_ok + 1;

  -- Quem lê: admin vê; operador (sem ser AM) não vê; o Account Manager do cliente vê; ninguém grava pela tela
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  select count(*) into v_n from public.tracking_wa_messages;
  if v_n <> 2 then raise exception 'admin vê as conversas: %', v_n; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_oper, 'role', 'authenticated')::text, true);
  select count(*) into v_n from public.tracking_wa_messages;
  if v_n <> 0 then raise exception 'visualizador que não é AM não vê: %', v_n; end if;
  begin insert into public.tracking_wa_messages (client_id, connection_id, wa_hash, direction, message_key, at, body, expires_at) values (v_a, v_id, v_wa, 'recebida', k3, now(), 'x', now()); raise exception 'ninguém grava pela tela';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'postgres', true);
  insert into public.ops_client_ops (client_id, am_user_id, stage_id) values (v_a, v_oper, 'acompanhamento')
    on conflict (client_id) do update set am_user_id = excluded.am_user_id;
  perform set_config('request.jwt.claims', json_build_object('sub', v_oper, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  select count(*) into v_n from public.tracking_wa_messages;
  if v_n <> 2 then raise exception 'o Account Manager do cliente vê: %', v_n; end if;
  v_ok := v_ok + 1;

  -- Prazo: só o admin troca (para 15 dias); encurta também o que já está guardado
  begin perform public.wa_messages_settings(15); raise exception 'visualizador (AM) não troca o prazo'; exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  if public.wa_messages_settings(15) <> 15 or public.wa_messages_settings(null) <> 15 then raise exception 'prazo 15'; end if;
  begin perform public.wa_messages_settings(7); raise exception 'só 15 ou 30'; exception when sqlstate '22023' then null; end;
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'postgres', true);
  if (select max(expires_at) from public.tracking_wa_messages) > now() + interval '15 days 1 hour' then raise exception 'prazo encurtado vale para o já guardado'; end if;
  v_ok := v_ok + 1;

  -- Limpeza diária: apaga o que passou do prazo e deixa o resto; fica no histórico
  update public.tracking_wa_messages set expires_at = now() - interval '1 minute' where message_key = k1;
  if private.wa_messages_purge() < 1 or (select count(*) from public.tracking_wa_messages) <> 1
     or not exists (select 1 from public.audit_logs where action = 'wa_messages.purge' and created_at > now() - interval '1 minute') then
    raise exception 'limpeza por prazo';
  end if;
  v_ok := v_ok + 1;

  -- Apagar agora: só admin
  perform set_config('request.jwt.claims', json_build_object('sub', v_visu, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  begin perform public.wa_messages_delete_all(v_id); raise exception 'visualizador não apaga'; exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  if public.wa_messages_delete_all(v_id) <> 1 then raise exception 'apagar agora'; end if;
  perform set_config('role', 'postgres', true);
  if (select count(*) from public.tracking_wa_messages) <> 0 then raise exception 'nada sobra'; end if;
  v_ok := v_ok + 1;

  raise exception 'R: % verificações OK', v_ok;
end $$;
