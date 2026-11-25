-- T5.38 Fase C (ajuste, 25/11/2026, pedido do Ander): o aviso de WhatsApp caído chegava de novo a cada 6 horas (vários e-mails da mesma queda).
-- Agora: um aviso quando cai e um lembrete só a cada 24 horas enquanto continuar fora. O aviso de "voltou" não muda.

create or replace function private.wa_client_health_apply_impl(p_connection uuid, p_state text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  c public.tracking_whatsapp_connections;
  v_min integer; v_name text; v_key text; u record; v_result text := 'ok';
begin
  if p_state not in ('conectado', 'desconectado', 'aguardando_leitura', 'erro', 'desconhecido') then raise exception 'Estado inválido.' using errcode = '22023'; end if;
  select * into c from public.tracking_whatsapp_connections where id = p_connection for update;
  if c.id is null or c.mode <> 'nao_oficial' or not c.enabled then return 'ignorado'; end if;

  update public.tracking_whatsapp_connections
     set gateway_state = p_state, gateway_state_at = now(),
         health_since = case when (c.gateway_state = 'conectado') is distinct from (p_state = 'conectado') or c.health_since is null then now() else c.health_since end
   where id = c.id;
  select * into c from public.tracking_whatsapp_connections where id = p_connection;
  select name into v_name from public.clients where id = c.client_id;
  v_min := floor(extract(epoch from (now() - coalesce(c.health_since, now()))) / 60);

  if p_state <> 'conectado' and v_min >= 10 and (not c.health_alert_sent or coalesce(c.health_alert_at, '-infinity') < now() - interval '24 hours') then
    v_key := 'wa.cliente.caiu.' || c.id || '.' || extract(epoch from now())::bigint;
    for u in
      select p.id from public.profiles p where p.active and (
        p.role = 'admin'
        or exists (select 1 from public.ops_client_ops o where o.client_id = c.client_id and o.am_user_id = p.id))
    loop
      perform private.ops_notify(u.id, 'whatsapp.caiu', 'WhatsApp de ' || coalesce(v_name, 'um cliente') || ' sem conexão',
        'Há ' || v_min || ' min desconectado. Enquanto isso, as mensagens e vendas desse cliente não chegam ao CRM. Reconecte por QR Code em Tracking.',
        '/tracking?cliente=' || c.client_id, v_key);
    end loop;
    update public.tracking_whatsapp_connections set health_alert_sent = true, health_alert_at = now() where id = c.id;
    v_result := 'avisou_caiu';
  elsif p_state = 'conectado' and c.health_alert_sent then
    v_key := 'wa.cliente.voltou.' || c.id || '.' || extract(epoch from now())::bigint;
    for u in
      select p.id from public.profiles p where p.active and (
        p.role = 'admin'
        or exists (select 1 from public.ops_client_ops o where o.client_id = c.client_id and o.am_user_id = p.id))
    loop
      perform private.ops_notify(u.id, 'whatsapp.voltou', 'WhatsApp de ' || coalesce(v_name, 'um cliente') || ' voltou',
        'A conexão voltou e as mensagens estão chegando de novo.', '/tracking?cliente=' || c.client_id, v_key);
    end loop;
    update public.tracking_whatsapp_connections set health_alert_sent = false where id = c.id;
    v_result := 'avisou_voltou';
  end if;
  return v_result;
end;
$$;
