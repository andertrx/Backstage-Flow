-- Teste da fase Tracking T5.6 (texto das conversas em buffer de 2 dias + vendas sugeridas pela IA + chave da IA).
-- Roda numa transação desfeita (termina com "R: N verificações OK", que desfaz tudo).
-- Precisa de: 1 admin ativo, 2 visualizadores ativos e 1 cliente ativo.
do $$
declare
  v_admin uuid; v_visu uuid; v_am uuid; v_a uuid; v_ct uuid; v_r jsonb; v_id uuid; v_ok integer := 0; v_n integer; v_res text; v_sg uuid; v_batch jsonb;
  v_wa text := encode(extensions.digest('5545999998888', 'sha256'), 'hex');
  k1 text := left(encode(extensions.digest('msg1', 'sha256'), 'hex'), 40);
  k2 text := left(encode(extensions.digest('msg2', 'sha256'), 'hex'), 40);
  k3 text := left(encode(extensions.digest('msg3', 'sha256'), 'hex'), 40);
  v_key text := 'sk-ant-api03-ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
begin
  select id into v_admin from public.profiles where role = 'admin' and active order by created_at limit 1;
  select id into v_visu from public.profiles where role = 'visualizador' and active order by created_at limit 1;
  select id into v_am from public.profiles where role = 'visualizador' and active order by created_at offset 1 limit 1;
  if v_am is null or v_am = v_visu then raise exception 'precisa de dois visualizadores ativos'; end if;
  select id into v_a from public.clients where status <> 'encerrado' and excluded_at is null order by created_at limit 1;
  insert into public.tracking_containers (client_id, name, allowed_domains, test_mode) values (v_a, 'teste-conversas', '{conv.test}', false) returning id into v_ct;

  -- 1. Guardar o texto nasce DESLIGADO; com a opção desligada nada é guardado
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  v_r := public.wa_unofficial_save(v_ct, '45999991111');
  v_id := (v_r ->> 'id')::uuid;
  perform public.wa_unofficial_set_enabled(v_id, true);
  if (select store_messages from public.tracking_whatsapp_connections where id = v_id) is not false then raise exception 'guardar texto nasce DESLIGADO'; end if;
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'postgres', true);
  v_res := public.wa_message_store(jsonb_build_object('connection_id', v_id, 'wa_hash', v_wa, 'direction', 'recebida', 'message_key', k1, 'at', now(), 'body', 'Oi, quero comprar', 'push_name', 'João', 'phone_tail', '8888'));
  if v_res <> 'desligado' or (select count(*) from public.tracking_wa_messages) <> 0 then raise exception 'opção desligada não guarda: %', v_res; end if;
  v_ok := v_ok + 1;

  -- 2. Visualizador não liga a guarda; admin liga
  perform set_config('request.jwt.claims', json_build_object('sub', v_visu, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  begin perform public.wa_unofficial_set_store(v_id, true); raise exception 'visualizador não liga a guarda'; exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  perform public.wa_unofficial_set_store(v_id, true);
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'postgres', true);
  v_ok := v_ok + 1;

  -- 3. Guarda recebida e enviada; repetida não duplica; inválida é recusada; prazo de 2 dias
  if public.wa_message_store(jsonb_build_object('connection_id', v_id, 'wa_hash', v_wa, 'direction', 'recebida', 'message_key', k1, 'at', now(), 'body', 'Oi, quero comprar', 'push_name', 'João', 'phone_tail', '8888')) <> 'guardada'
     or public.wa_message_store(jsonb_build_object('connection_id', v_id, 'wa_hash', v_wa, 'direction', 'enviada', 'message_key', k2, 'at', now(), 'body', 'Parabéns pela sua compra de R$ 297')) <> 'guardada' then
    raise exception 'guarda recebida e enviada';
  end if;
  perform public.wa_message_store(jsonb_build_object('connection_id', v_id, 'wa_hash', v_wa, 'direction', 'recebida', 'message_key', k1, 'at', now(), 'body', 'Oi, quero comprar'));
  if (select count(*) from public.tracking_wa_messages) <> 2 then raise exception 'repetida não duplica'; end if;
  if public.wa_message_store(jsonb_build_object('connection_id', v_id, 'wa_hash', v_wa, 'direction', 'recebida', 'message_key', k3, 'body', '   ')) <> 'invalido'
     or public.wa_message_store(jsonb_build_object('connection_id', v_id, 'wa_hash', 'xx', 'direction', 'recebida', 'message_key', k3, 'body', 'oi')) <> 'invalido' then raise exception 'inválidas'; end if;
  if (select min(expires_at) from public.tracking_wa_messages) < now() + interval '1 day 23 hours' or (select max(expires_at) from public.tracking_wa_messages) > now() + interval '2 days 1 hour' then
    raise exception 'prazo do texto é de 2 dias';
  end if;
  v_ok := v_ok + 1;

  -- 4. A IA lê o lote do dia (só o servidor): 1 conversa com 2 mensagens, em ordem
  v_batch := public.wa_ai_batch(24);
  if jsonb_array_length(v_batch) <> 1 or jsonb_array_length(v_batch -> 0 -> 'messages') <> 2 or v_batch -> 0 -> 'messages' -> 0 ->> 'd' <> 'recebida' then raise exception 'lote da IA: %', v_batch; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  begin perform public.wa_ai_batch(24); raise exception 'ninguém da tela lê o lote'; exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'postgres', true);
  v_ok := v_ok + 1;

  -- 5. Quem lê o texto: admin vê; visualizador que não é AM não; ninguém grava pela tela; o Account Manager vê
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  select count(*) into v_n from public.tracking_wa_messages;
  if v_n <> 2 then raise exception 'admin vê as conversas: %', v_n; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_am, 'role', 'authenticated')::text, true);
  select count(*) into v_n from public.tracking_wa_messages;
  if v_n <> 0 then raise exception 'quem não é AM não vê: %', v_n; end if;
  begin insert into public.tracking_wa_messages (client_id, connection_id, wa_hash, direction, message_key, at, body, expires_at) values (v_a, v_id, v_wa, 'recebida', k3, now(), 'x', now()); raise exception 'ninguém grava pela tela';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'postgres', true);
  insert into public.ops_client_ops (client_id, am_user_id, stage_id) values (v_a, v_am, 'acompanhamento')
    on conflict (client_id) do update set am_user_id = excluded.am_user_id;
  perform set_config('request.jwt.claims', json_build_object('sub', v_am, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  select count(*) into v_n from public.tracking_wa_messages;
  if v_n <> 2 then raise exception 'o Account Manager do cliente vê: %', v_n; end if;
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'postgres', true);
  v_ok := v_ok + 1;

  -- 6. Sugestões: a IA grava (sem texto), repetida no mesmo dia não duplica, inválida é recusada
  v_res := public.wa_suggestion_add(jsonb_build_object('connection_id', v_id, 'wa_hash', v_wa, 'push_name', 'João', 'phone_tail', '8888', 'reason', 'Atendente agradeceu a compra de R$ 297.', 'confidence', 'alta'));
  if v_res <> 'criada' then raise exception 'sugestão criada: %', v_res; end if;
  if public.wa_suggestion_add(jsonb_build_object('connection_id', v_id, 'wa_hash', v_wa, 'reason', 'de novo', 'confidence', 'media')) <> 'repetida' then raise exception 'sugestão repetida no dia'; end if;
  if public.wa_suggestion_add(jsonb_build_object('connection_id', v_id, 'wa_hash', 'xx', 'reason', 'x', 'confidence', 'alta')) <> 'invalido'
     or public.wa_suggestion_add(jsonb_build_object('connection_id', v_id, 'wa_hash', v_wa, 'reason', '  ', 'confidence', 'alta', 'day', '2026-01-01')) <> 'invalido'
     or public.wa_suggestion_add(jsonb_build_object('connection_id', v_id, 'wa_hash', v_wa, 'reason', 'x', 'confidence', 'baixa2')) <> 'invalido' then raise exception 'sugestões inválidas'; end if;
  select id into v_sg from public.tracking_wa_suggestions where client_id = v_a;
  if (select status from public.tracking_wa_suggestions where id = v_sg) <> 'pendente' or (select expires_at from public.tracking_wa_suggestions where id = v_sg) is not null then raise exception 'nasce pendente e sem prazo'; end if;
  v_ok := v_ok + 1;

  -- 7. Quem vê e decide as sugestões: admin e o AM; quem não é AM não vê nem decide; ninguém grava direto
  perform set_config('request.jwt.claims', json_build_object('sub', v_visu, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  select count(*) into v_n from public.tracking_wa_suggestions;
  if v_n <> 0 then raise exception 'quem não é AM não vê sugestões: %', v_n; end if;
  begin perform public.wa_suggestion_decide(v_sg, 'confirmada'); raise exception 'quem não é AM não decide'; exception when insufficient_privilege then null; end;
  begin insert into public.tracking_wa_suggestions (client_id, wa_hash, day, reason) values (v_a, v_wa, current_date, 'x'); raise exception 'ninguém grava direto';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claims', json_build_object('sub', v_am, 'role', 'authenticated')::text, true);
  select count(*) into v_n from public.tracking_wa_suggestions;
  if v_n <> 1 then raise exception 'o AM vê a sugestão: %', v_n; end if;
  begin perform public.wa_suggestion_decide(v_sg, 'qualquer'); raise exception 'situação inválida'; exception when sqlstate '22023' then null; end;
  perform public.wa_suggestion_decide(v_sg, 'confirmada');
  if (select expires_at from public.tracking_wa_suggestions where id = v_sg) < now() + interval '29 days 23 hours'
     or (select decided_by from public.tracking_wa_suggestions where id = v_sg) <> v_am then raise exception 'decidida: some em 30 dias, com quem decidiu'; end if;
  perform public.wa_suggestion_decide(v_sg, 'pendente');
  if (select expires_at from public.tracking_wa_suggestions where id = v_sg) is not null or (select decided_by from public.tracking_wa_suggestions where id = v_sg) is not null then raise exception 'voltar para pendente tira o prazo'; end if;
  perform public.wa_suggestion_decide(v_sg, 'descartada');
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'postgres', true);
  if not exists (select 1 from public.audit_logs where action = 'wa_suggestion.decide' and target_id = v_sg::text) then raise exception 'decisão fica no histórico'; end if;
  v_ok := v_ok + 1;

  -- 8. Limpeza diária: texto vencido e sugestão decidida vencida somem; pendente nunca some
  update public.tracking_wa_messages set expires_at = now() - interval '1 minute' where message_key = k1;
  v_n := private.wa_messages_purge(); -- (em passo separado: dentro de um mesmo SELECT a contagem enxergaria o estado de antes)
  if v_n <> 1 or (select count(*) from public.tracking_wa_messages) <> 1
     or not exists (select 1 from public.audit_logs where action = 'wa_messages.purge' and created_at > now() - interval '1 minute') then raise exception 'limpeza do texto'; end if;
  update public.tracking_wa_suggestions set expires_at = now() - interval '1 minute' where id = v_sg;
  v_n := private.wa_suggestions_purge();
  if v_n <> 1 or exists (select 1 from public.tracking_wa_suggestions where id = v_sg) then raise exception 'limpeza das sugestões decididas'; end if;
  insert into public.tracking_wa_suggestions (client_id, wa_hash, day, reason) values (v_a, v_wa, current_date - 40, 'antiga e pendente');
  v_n := private.wa_suggestions_purge();
  if v_n <> 0 or (select count(*) from public.tracking_wa_suggestions) <> 1 then raise exception 'pendente nunca some sozinha'; end if;
  v_ok := v_ok + 1;

  -- 9. Apagar o texto agora: só admin
  perform set_config('request.jwt.claims', json_build_object('sub', v_visu, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  begin perform public.wa_messages_delete_all(v_id); raise exception 'visualizador não apaga'; exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  if public.wa_messages_delete_all(v_id) <> 1 then raise exception 'apagar agora'; end if;
  perform set_config('role', 'postgres', true);
  if (select count(*) from public.tracking_wa_messages) <> 0 then raise exception 'nada sobra'; end if;
  v_ok := v_ok + 1;

  -- 10. Chave da IA: só admin; formato conferido; não liga sem chave; fica no cofre; só o servidor lê; remover desliga
  perform set_config('request.jwt.claims', json_build_object('sub', v_visu, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  begin perform public.wa_ai_save(v_key, true); raise exception 'visualizador não configura a IA'; exception when insufficient_privilege then null; end;
  select count(*) into v_n from public.wa_ai_settings;
  if v_n <> 0 then raise exception 'visualizador não vê a configuração da IA'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  begin perform public.wa_ai_save('chave-errada', null); raise exception 'chave inválida'; exception when sqlstate '22023' then null; end;
  begin perform public.wa_ai_save(null, true); raise exception 'não liga sem chave'; exception when sqlstate '22023' then null; end;
  v_r := public.wa_ai_save(v_key, true);
  if (v_r ->> 'enabled')::boolean is not true or (v_r ->> 'has_key')::boolean is not true then raise exception 'chave salva e IA ligada: %', v_r; end if;
  if exists (select 1 from public.wa_ai_settings where to_jsonb(wa_ai_settings)::text like '%sk-ant%') then raise exception 'a chave não fica na configuração'; end if;
  begin perform public.wa_ai_key_get(); raise exception 'só o servidor lê a chave'; exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'postgres', true);
  if public.wa_ai_key_get() is distinct from v_key then raise exception 'o servidor lê a chave do cofre'; end if;
  perform public.wa_ai_report(jsonb_build_object('ok', true, 'count', 3));
  if (select last_run_count from public.wa_ai_settings) <> 3 then raise exception 'resultado da rodada'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  perform public.wa_ai_remove_key();
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'postgres', true);
  if public.wa_ai_key_get() is not null or (select enabled or has_key from public.wa_ai_settings) then raise exception 'remover tira a chave e desliga a IA'; end if;
  if not exists (select 1 from public.audit_logs where action = 'wa_ai.update') then raise exception 'configuração da IA fica no histórico'; end if;
  v_ok := v_ok + 1;

  raise exception 'R: % verificações OK', v_ok;
end $$;
