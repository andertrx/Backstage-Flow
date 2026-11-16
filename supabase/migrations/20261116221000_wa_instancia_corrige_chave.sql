-- T5.38 (fase A) — correção: has_inbound_key é uma coluna calculada pelo banco e não pode ser gravada. Achado pelo teste SQL.
create or replace function private.wa_instance_prepare_impl(p_user uuid, p_connection uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  c public.tracking_whatsapp_connections;
  v_key text := encode(extensions.gen_random_bytes(24), 'hex');
  v_name text;
begin
  if not private.wa_instance_can(p_user, p_connection) then raise exception 'Você não pode conectar o WhatsApp deste cliente.' using errcode = '42501'; end if;
  select * into c from public.tracking_whatsapp_connections where id = p_connection for update;
  if not private.client_is_active(c.client_id) then raise exception 'Cliente desativado.' using errcode = '22023'; end if;
  v_name := coalesce(c.instance_name, 'bf-' || substr(replace(c.id::text, '-', ''), 1, 12));
  update public.tracking_whatsapp_connections
     set instance_name = v_name, inbound_key_hash = encode(extensions.digest(v_key, 'sha256'), 'hex'), inbound_key_hint = right(v_key, 4),
         updated_by = p_user, updated_at = now()
   where id = c.id;
  insert into public.audit_logs (actor_id, action, target_type, target_id, details)
  values (p_user, 'wa_instance.preparar', 'tracking_whatsapp_connection', c.id::text, jsonb_build_object('observacao', 'chave do aviso trocada automaticamente'));
  return jsonb_build_object('instance', v_name, 'key', v_key, 'phone', c.display_phone);
end;
$$;
