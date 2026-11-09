-- Teste T5.17: aviso quando o WhatsApp dos envios cai (e quando volta). Transação desfeita ("R: N verificações OK").
-- Simula a resposta do servidor numa linha falsa de net._http_response.
do $$
declare v_ok int := 0; n1 int; n2 int; n3 int;
begin
  insert into net._http_response (id, status_code, content_type, headers, content, timed_out, error_msg, created)
    values (-1, 200, 'application/json', '{}'::jsonb, '[{"connectionStatus":"close"}]', false, null, now());
  update public.wa_gateway_settings set health_state = 'desconectado', health_since = now() - interval '30 minutes', alert_sent = false, health_req_id = -1 where id;
  perform private.wa_health_tick();
  select count(*) into n1 from public.ops_notifications where kind = 'whatsapp.caiu';
  if n1 < 1 then raise exception 'FALHA 1: não avisou os administradores'; end if;
  v_ok := v_ok + 1;
  update public.wa_gateway_settings set health_req_id = -1 where id;
  perform private.wa_health_tick();
  select count(*) into n2 from public.ops_notifications where kind = 'whatsapp.caiu';
  if n2 <> n1 then raise exception 'FALHA 2: repetiu o aviso'; end if;
  v_ok := v_ok + 1;
  update net._http_response set content = '[{"connectionStatus":"open","ownerJid":"5545999996623@s.whatsapp.net","profileName":"Ander"}]' where id = -1;
  update public.wa_gateway_settings set health_req_id = -1 where id;
  perform private.wa_health_tick();
  select count(*) into n3 from public.ops_notifications where kind = 'whatsapp.voltou';
  if n3 < 1 or (select alert_sent from public.wa_gateway_settings) then raise exception 'FALHA 3: aviso de volta'; end if;
  v_ok := v_ok + 1;
  raise exception 'R: % verificações OK (desfeito)', v_ok;
end $$;
