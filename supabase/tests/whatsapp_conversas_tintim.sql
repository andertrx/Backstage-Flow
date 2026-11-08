-- Teste da fase Tracking T5.7 (conversas do WhatsApp estilo Tintim: telefone completo, sem prazo, lista e leitura, apagar).
-- Roda numa transação desfeita (termina com "R: N verificações OK", que desfaz tudo).
-- Precisa de: 1 admin ativo, 2 visualizadores ativos e 1 cliente ativo.
do $$
declare
  v_admin uuid; v_visu uuid; v_am uuid; v_a uuid; v_ct uuid; v_r jsonb; v_id uuid; v_ok integer := 0; v_n integer; v_pid bigint;
  v_wa text := encode(extensions.digest('5545999998888', 'sha256'), 'hex');
  v_wa2 text := encode(extensions.digest('5511977776666', 'sha256'), 'hex');
  k1 text := left(encode(extensions.digest('t1', 'sha256'), 'hex'), 40);
  k2 text := left(encode(extensions.digest('t2', 'sha256'), 'hex'), 40);
  k3 text := left(encode(extensions.digest('t3', 'sha256'), 'hex'), 40);
  k4 text := left(encode(extensions.digest('t4', 'sha256'), 'hex'), 40);
begin
  select id into v_admin from public.profiles where role = 'admin' and active order by created_at limit 1;
  select id into v_visu from public.profiles where role = 'visualizador' and active order by created_at limit 1;
  select id into v_am from public.profiles where role = 'visualizador' and active order by created_at offset 1 limit 1;
  if v_am is null or v_am = v_visu then raise exception 'precisa de dois visualizadores ativos'; end if;
  select id into v_a from public.clients where status <> 'encerrado' and excluded_at is null and id not in (select client_id from public.tracking_wa_people) order by created_at limit 1; -- um cliente sem conversas reais
  insert into public.tracking_containers (client_id, name, allowed_domains, test_mode) values (v_a, 'teste-tintim', '{tintim.test}', false) returning id into v_ct;

  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  v_r := public.wa_unofficial_save(v_ct, '45999991111');
  v_id := (v_r ->> 'id')::uuid;
  perform public.wa_unofficial_set_enabled(v_id, true);

  -- 1. Sem confirmar o aviso não liga; sem aviso nada é guardado; confirmando, grava quem e quando
  begin perform public.wa_unofficial_set_store(v_id, true, false); raise exception 'sem o aviso não liga'; exception when sqlstate '22023' then null; end;
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'postgres', true);
  if public.wa_message_store(jsonb_build_object('connection_id', v_id, 'wa_hash', v_wa, 'direction', 'recebida', 'message_key', k1, 'at', now(), 'body', 'oi')) <> 'desligado' then raise exception 'desligado não guarda'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  perform public.wa_unofficial_set_store(v_id, true, true);
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'postgres', true);
  if (select store_ack_at is null or store_ack_by is distinct from v_admin or not store_messages from public.tracking_whatsapp_connections where id = v_id) then raise exception 'aviso registrado com quem e quando'; end if;
  v_ok := v_ok + 1;

  -- 2. Guardar: sem prazo, telefone completo, uma linha por pessoa, contagem e última mensagem
  if public.wa_message_store(jsonb_build_object('connection_id', v_id, 'wa_hash', v_wa, 'direction', 'recebida', 'message_key', k1, 'at', now() - interval '2 hours', 'body', 'Oi, vi o anúncio', 'push_name', 'João', 'phone', '5545999998888')) <> 'guardada'
     or public.wa_message_store(jsonb_build_object('connection_id', v_id, 'wa_hash', v_wa, 'direction', 'enviada', 'message_key', k2, 'at', now() - interval '1 hour', 'body', 'Olá João! Tudo bem?', 'phone', '5545999998888')) <> 'guardada'
     or public.wa_message_store(jsonb_build_object('connection_id', v_id, 'wa_hash', v_wa, 'direction', 'recebida', 'message_key', k3, 'at', now(), 'body', 'Fechado, vou pagar', 'push_name', 'João', 'phone', '5545999998888')) <> 'guardada' then raise exception 'guardar'; end if;
  if public.wa_message_store(jsonb_build_object('connection_id', v_id, 'wa_hash', v_wa, 'direction', 'recebida', 'message_key', k3, 'at', now(), 'body', 'Fechado, vou pagar', 'phone', '5545999998888')) <> 'repetida' then raise exception 'repetida'; end if;
  if (select count(*) from public.tracking_wa_messages where expires_at is not null) <> 0 then raise exception 'sem prazo'; end if;
  select id into v_pid from public.tracking_wa_people where connection_id = v_id and wa_hash = v_wa;
  if (select messages from public.tracking_wa_people where id = v_pid) <> 3 or (select phone from public.tracking_wa_people where id = v_pid) <> '5545999998888'
     or (select last_preview from public.tracking_wa_people where id = v_pid) <> 'Fechado, vou pagar' or (select push_name from public.tracking_wa_people where id = v_pid) <> 'João'
     or (select last_direction from public.tracking_wa_people where id = v_pid) <> 'recebida' then raise exception 'pessoa: contagem, telefone e última mensagem'; end if;
  -- mensagem mais antiga que chega depois não troca a "última"
  perform public.wa_message_store(jsonb_build_object('connection_id', v_id, 'wa_hash', v_wa, 'direction', 'enviada', 'message_key', k4, 'at', now() - interval '3 hours', 'body', 'mensagem velha'));
  if (select last_preview from public.tracking_wa_people where id = v_pid) <> 'Fechado, vou pagar' or (select messages from public.tracking_wa_people where id = v_pid) <> 4 then raise exception 'ordem das mensagens'; end if;
  perform public.wa_message_store(jsonb_build_object('connection_id', v_id, 'wa_hash', v_wa2, 'direction', 'recebida', 'message_key', left(encode(extensions.digest('t5', 'sha256'), 'hex'), 40), 'at', now() - interval '1 day', 'body', 'Quanto custa?', 'push_name', 'Maria', 'phone', '5511977776666'));
  v_ok := v_ok + 1;

  -- 3. Quem lê a lista e as mensagens: admin e o AM; outros não; ninguém grava pela tela
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  select count(*) into v_n from public.wa_conversations_list(v_a);
  if v_n <> 2 then raise exception 'admin vê 2 conversas: %', v_n; end if;
  if (select person_id from public.wa_conversations_list(v_a) limit 1) <> v_pid then raise exception 'mais recente primeiro'; end if;
  if (select count(*) from public.wa_conversations_list(v_a, 'maria')) <> 1 or (select count(*) from public.wa_conversations_list(v_a, '99999-8888')) <> 1
     or (select count(*) from public.wa_conversations_list(v_a, 'ninguem')) <> 0 then raise exception 'busca por nome e telefone'; end if;
  if (select count(*) from public.wa_conversations_list(v_a, null, 1, now() - interval '1 hour')) <> 1 or (select push_name from public.wa_conversations_list(v_a, null, 1, now() - interval '1 hour')) <> 'Maria' then raise exception 'paginação'; end if;
  select count(*) into v_n from public.wa_conversation_messages(v_pid, null, 60);
  if v_n <> 4 then raise exception 'mensagens da conversa: %', v_n; end if;
  if (select body from public.wa_conversation_messages(v_pid, null, 60) limit 1) <> 'Fechado, vou pagar' then raise exception 'mais nova primeiro'; end if;
  if (select count(*) from public.wa_conversation_messages(v_pid, now() - interval '90 minutes', 60)) <> 2 then raise exception 'mensagens mais antigas'; end if;
  begin insert into public.tracking_wa_people (client_id, connection_id, wa_hash, first_at, last_at) values (v_a, v_id, v_wa2, now(), now()); raise exception 'ninguém grava pela tela';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claims', json_build_object('sub', v_visu, 'role', 'authenticated')::text, true);
  begin perform * from public.wa_conversations_list(v_a); raise exception 'quem não é AM não lista'; exception when insufficient_privilege then null; end;
  begin perform * from public.wa_conversation_messages(v_pid, null, 60); raise exception 'quem não é AM não lê'; exception when insufficient_privilege then null; end;
  select count(*) into v_n from public.tracking_wa_people where client_id = v_a;
  if v_n <> 0 then raise exception 'quem não é AM não vê pessoas: %', v_n; end if;
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'postgres', true);
  insert into public.ops_client_ops (client_id, am_user_id, stage_id) values (v_a, v_am, 'acompanhamento')
    on conflict (client_id) do update set am_user_id = excluded.am_user_id;
  perform set_config('request.jwt.claims', json_build_object('sub', v_am, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  if (select count(*) from public.wa_conversations_list(v_a)) <> 2 then raise exception 'o Account Manager vê'; end if;
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'postgres', true);
  v_ok := v_ok + 1;

  -- 4. Sugestão da IA aparece junto da conversa
  perform public.wa_suggestion_add(jsonb_build_object('connection_id', v_id, 'wa_hash', v_wa, 'reason', 'Cliente disse que vai pagar.', 'confidence', 'alta'));
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  if (select suggestion_confidence from public.wa_conversations_list(v_a) where person_id = v_pid) <> 'alta' then raise exception 'sugestão junto da conversa'; end if;
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'postgres', true);
  v_ok := v_ok + 1;

  -- 5. Apagar uma conversa: só administrador; some mensagens e pessoa; fica no histórico (sem o texto)
  perform set_config('request.jwt.claims', json_build_object('sub', v_am, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  begin perform public.wa_conversation_delete(v_pid); raise exception 'AM não apaga'; exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  if public.wa_conversation_delete(v_pid) <> 4 then raise exception 'apagou 4 mensagens'; end if;
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'postgres', true);
  if exists (select 1 from public.tracking_wa_messages where wa_hash = v_wa) or exists (select 1 from public.tracking_wa_people where id = v_pid) then raise exception 'conversa some'; end if;
  if not exists (select 1 from public.audit_logs where action = 'wa_conversation.delete' and target_id = v_pid::text and details::text not like '%vou pagar%') then raise exception 'apagar fica no histórico, sem texto'; end if;
  if (select count(*) from public.tracking_wa_people where client_id = v_a) <> 1 then raise exception 'a outra pessoa continua'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  if public.wa_messages_delete_all(v_id) <> 1 then raise exception 'apagar tudo do site'; end if;
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'postgres', true);
  if (select count(*) from public.tracking_wa_people where client_id = v_a) <> 0 then raise exception 'apagar tudo limpa as pessoas'; end if;
  v_ok := v_ok + 1;

  raise exception 'R: % verificações OK', v_ok;
end $$;
