-- Teste T5.38 fase C: conferência do WhatsApp de cada cliente. Transação desfeita ("R: N verificações OK").
do $$
declare c record; v_adm uuid; v_ges uuid; r text; n int; v_ok int := 0;
begin
  select * into c from public.tracking_whatsapp_connections limit 1;
  if c.id is null then raise exception 'Sem conexão de WhatsApp para testar'; end if;
  select id into v_adm from public.profiles where role = 'admin' and active limit 1;
  update public.tracking_whatsapp_connections
     set mode = 'nao_oficial', enabled = true, instance_name = 'bf-teste-saude', gateway_state = 'conectado', health_since = now() - interval '1 hour', health_alert_sent = false
   where id = c.id;
  delete from public.ops_notifications where kind in ('whatsapp.caiu', 'whatsapp.voltou') and user_id = v_adm;
  -- um gestor com acesso a este cliente: NÃO pode receber (decisão do Ander, 21/11)
  select p.id into v_ges from public.profiles p where p.role = 'gestor' and p.active limit 1;
  if v_ges is not null then
    insert into public.user_client_access (user_id, client_id) values (v_ges, c.client_id) on conflict do nothing;
    delete from public.ops_notifications where kind in ('whatsapp.caiu', 'whatsapp.voltou') and user_id = v_ges;
  end if;

  -- 1) a lista inclui a conexão ligada
  if not exists (select 1 from jsonb_array_elements(public.wa_client_health_list()) e where e ->> 'id' = c.id::text) then raise exception 'FALHA 1: conexão ligada fora da lista'; end if;
  v_ok := v_ok + 1;

  -- 2) conectada e sem queda: nada de aviso
  r := public.wa_client_health_apply(c.id, 'conectado');
  if r <> 'ok' then raise exception 'FALHA 2: %', r; end if;
  v_ok := v_ok + 1;

  -- 3) caiu agora: ainda não avisa (menos de 10 minutos)
  r := public.wa_client_health_apply(c.id, 'desconectado');
  if r <> 'ok' then raise exception 'FALHA 3: avisou cedo demais (%)', r; end if;
  if (select health_since from public.tracking_whatsapp_connections where id = c.id) < now() - interval '1 minute' then raise exception 'FALHA 3b: início da queda não anotado'; end if;
  v_ok := v_ok + 1;

  -- 4) fora há 11 minutos: avisa UMA vez
  update public.tracking_whatsapp_connections set health_since = now() - interval '11 minutes' where id = c.id;
  r := public.wa_client_health_apply(c.id, 'desconectado');
  if r <> 'avisou_caiu' then raise exception 'FALHA 4: não avisou (%)', r; end if;
  select count(*) into n from public.ops_notifications where kind = 'whatsapp.caiu' and user_id = v_adm;
  if v_adm is not null and private.ops_member_ok(v_adm) and n <> 1 then raise exception 'FALHA 4b: administrador deveria ter 1 aviso (tem %)', n; end if;
  if v_ges is not null and exists (select 1 from public.ops_notifications where kind = 'whatsapp.caiu' and user_id = v_ges) then raise exception 'FALHA 4c: o gestor recebeu o aviso'; end if;
  v_ok := v_ok + 1;

  -- 5) continua fora: não repete
  r := public.wa_client_health_apply(c.id, 'desconectado');
  if r <> 'ok' then raise exception 'FALHA 5: repetiu o aviso (%)', r; end if;
  v_ok := v_ok + 1;

  -- 6) voltou: um aviso de "voltou" e libera novo aviso futuro
  r := public.wa_client_health_apply(c.id, 'conectado');
  if r <> 'avisou_voltou' then raise exception 'FALHA 6: não avisou a volta (%)', r; end if;
  if (select health_alert_sent from public.tracking_whatsapp_connections where id = c.id) then raise exception 'FALHA 6b: aviso não foi zerado'; end if;
  v_ok := v_ok + 1;

  -- 7) conexão desligada de propósito não é conferida nem avisa
  update public.tracking_whatsapp_connections set enabled = false where id = c.id;
  if exists (select 1 from jsonb_array_elements(public.wa_client_health_list()) e where e ->> 'id' = c.id::text) then raise exception 'FALHA 7: conexão desligada na lista'; end if;
  if public.wa_client_health_apply(c.id, 'desconectado') <> 'ignorado' then raise exception 'FALHA 7b: tratou conexão desligada'; end if;
  v_ok := v_ok + 1;

  -- 8) estado inválido é recusado
  begin perform public.wa_client_health_apply(c.id, 'qualquer'); raise exception 'FALHA 8: aceitou estado inválido';
  exception when sqlstate '22023' then null; end;
  v_ok := v_ok + 1;

  raise exception 'R: % verificações OK (desfeito)', v_ok;
end $$;
