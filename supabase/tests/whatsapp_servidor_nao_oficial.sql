-- Teste da fase Tracking T5.3 (WhatsApp pelo servidor não oficial). Roda numa transação desfeita
-- (termina com "R: N verificações OK", que desfaz tudo).
do $$
declare
  v_admin uuid; v_visu uuid; v_a uuid; v_b uuid; v_ct uuid; v_ct_b uuid; v_r jsonb; v_id uuid; v_key text; v_ok integer := 0;
  v_wa text := encode(extensions.digest('5545999998888', 'sha256'), 'hex');
  v_mk text := left(encode(extensions.digest('m1', 'sha256'), 'hex'), 40);
  v_res text; v_auth jsonb;
begin
  select id into v_admin from public.profiles where role = 'admin' and active order by created_at limit 1;
  select id into v_visu from public.profiles where role = 'visualizador' and active order by created_at limit 1;
  select id into v_a from public.clients where status <> 'encerrado' and excluded_at is null order by created_at limit 1;
  select id into v_b from public.clients where status <> 'encerrado' and excluded_at is null and id <> v_a order by created_at limit 1;
  insert into public.tracking_containers (client_id, name, allowed_domains, test_mode) values (v_a, 'teste-zap', '{zap.test}', false) returning id into v_ct;
  insert into public.tracking_containers (client_id, name, allowed_domains, test_mode) values (v_b, 'teste-zap-b', '{zapb.test}', false) returning id into v_ct_b;

  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  v_r := public.wa_unofficial_save(v_ct, '(45) 99999-1111');
  v_id := (v_r ->> 'id')::uuid; v_key := v_r ->> 'key';
  if v_key !~ '^[0-9a-f]{48}$' or (select mode from public.tracking_whatsapp_connections where id = v_id) <> 'nao_oficial'
     or (select phone_number_id from public.tracking_whatsapp_connections where id = v_id) <> '5545999991111'
     or (select enabled from public.tracking_whatsapp_connections where id = v_id) is not false
     or (select waba_id from public.tracking_whatsapp_connections where id = v_id) is not null then
    raise exception 'conexão nova: modo, número com 55, desligada, sem conta oficial: %', v_r;
  end if;
  begin perform inbound_key_hash from public.tracking_whatsapp_connections; raise exception 'a tela não pode ler o hash da chave';
  exception when insufficient_privilege then null; end;
  if (select has_inbound_key from public.tracking_whatsapp_connections where id = v_id) is not true then raise exception 'has_inbound_key'; end if;
  v_ok := v_ok + 1;

  if (public.wa_unofficial_save(v_ct, '45 99999-2222') ->> 'key') is not null then raise exception 'salvar de novo não gera outra chave'; end if;
  begin perform public.wa_unofficial_save(v_ct_b, '45999992222'); raise exception 'o mesmo número em dois sites não pode';
  exception when sqlstate '22023' then null; end;
  begin perform public.wa_unofficial_save(v_ct, '123'); raise exception 'número curto não vale';
  exception when sqlstate '22023' then null; end;
  perform set_config('request.jwt.claims', json_build_object('sub', v_visu, 'role', 'authenticated')::text, true);
  begin perform public.wa_unofficial_save(v_ct, '45999991111'); raise exception 'visualizador não liga';
  exception when insufficient_privilege then null; end;
  v_ok := v_ok + 1;

  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  perform public.wa_unofficial_set_enabled(v_id, true);
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'postgres', true);
  v_auth := private.wa_unofficial_auth(v_id, v_key);
  if v_auth ->> 'enabled' <> 'true' or (v_auth ->> 'container_id')::uuid <> v_ct or private.wa_unofficial_auth(v_id, 'errada') is not null then
    raise exception 'conferência da chave: %', v_auth;
  end if;
  v_ok := v_ok + 1;

  v_res := public.tracking_whatsapp_inbound(jsonb_build_object('connection_id', v_id, 'wa_hash', v_wa, 'message_key', v_mk, 'at', now(),
    'ref_code', null, 'referral', jsonb_build_object('ctwa_clid', 'ARAk-teste', 'source_id', '120210000000001', 'source_type', 'ad', 'source_url', null)));
  if v_res <> 'anuncio' or (select origin from public.tracking_whatsapp_conversations where connection_id = v_id and wa_hash = v_wa) <> 'anuncio_whatsapp'
     or (select ctwa_clid from public.tracking_whatsapp_conversations where connection_id = v_id and wa_hash = v_wa) <> 'ARAk-teste' then
    raise exception 'mensagem de anúncio pelo servidor não oficial: %', v_res;
  end if;
  v_ok := v_ok + 1;

  if public.tracking_whatsapp_inbound(jsonb_build_object('connection_id', v_id, 'wa_hash', v_wa, 'message_key', v_mk, 'at', now())) <> 'repetido' then raise exception 'reenvio é repetido'; end if;
  if public.tracking_whatsapp_inbound(jsonb_build_object('connection_id', v_id, 'wa_hash', v_wa, 'message_key', left(encode(extensions.digest('m2', 'sha256'), 'hex'), 40), 'at', now())) <> 'mensagem' then raise exception 'mensagem seguinte'; end if;
  if (select messages from public.tracking_whatsapp_conversations where connection_id = v_id and wa_hash = v_wa) <> 2 then raise exception 'contagem de mensagens'; end if;
  v_ok := v_ok + 1;

  update public.tracking_whatsapp_connections set enabled = false where id = v_id;
  if public.tracking_whatsapp_inbound(jsonb_build_object('connection_id', v_id, 'wa_hash', v_wa, 'message_key', left(encode(extensions.digest('m3', 'sha256'), 'hex'), 40), 'at', now())) <> 'desligado' then raise exception 'desligada não registra'; end if;
  v_ok := v_ok + 1;

  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  v_key := public.wa_unofficial_new_key(v_id);
  perform set_config('role', 'postgres', true);
  if private.wa_unofficial_auth(v_id, v_key) is null then raise exception 'chave nova vale'; end if;
  v_ok := v_ok + 1;

  raise exception 'R: % verificações OK', v_ok;
end $$;
