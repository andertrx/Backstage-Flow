-- Excluir o WhatsApp (servidor próprio) de UM cliente: a conexão some de todas as telas, o número fica livre e o histórico NÃO é apagado
-- (conversas, vendas e contagens continuam guardadas, como nos sites excluídos). Dá para ligar de novo depois: o cadastro antigo é reaproveitado.
-- Só administrador e gestor do cliente. Confirma digitando EXCLUIR. Fica no histórico de auditoria.

alter table public.tracking_whatsapp_connections
  add column excluded_at timestamptz,
  add column excluded_by uuid;
grant select (excluded_at) on public.tracking_whatsapp_connections to authenticated;

create function private.tracking_whatsapp_exclude_impl(p_id uuid, p_confirmar text)
returns void language plpgsql security definer set search_path = '' as $$
declare c public.tracking_whatsapp_connections;
begin
  select * into c from public.tracking_whatsapp_connections where id = p_id and mode = 'nao_oficial';
  if (select private.current_user_role()) not in ('admin', 'gestor') or c.id is null or c.client_id not in (select private.visible_client_ids()) then
    raise exception 'Só administrador e gestor excluem o WhatsApp de um cliente.' using errcode = '42501';
  end if;
  if c.excluded_at is not null then raise exception 'Este WhatsApp já está excluído.' using errcode = '22023'; end if;
  if upper(btrim(coalesce(p_confirmar, ''))) <> 'EXCLUIR' then raise exception 'Confirmação inválida: digite EXCLUIR.' using errcode = '22023'; end if;
  update public.tracking_whatsapp_connections set
    excluded_at = now(), excluded_by = (select auth.uid()),
    enabled = false,
    -- o número fica livre para outro cliente (o número de verdade continua em display_phone); a chave do aviso deixa de valer
    phone_number_id = '9' || lpad((extract(epoch from clock_timestamp()) * 1000000)::bigint::text, 20, '0'),
    inbound_key_hash = null, inbound_key_hint = null,
    instance_name = null, gateway_state = null, gateway_state_at = null,
    last_webhook_at = null, last_error_at = null, last_error_message = null,
    store_messages = false, store_ack_at = null, store_ack_by = null, ai_suggest = false,
    updated_by = (select auth.uid()), updated_at = now()
  where id = c.id;
  insert into public.audit_logs (actor_id, action, target_type, target_id, details)
  values ((select auth.uid()), 'wa_cliente.excluir_whatsapp', 'tracking_whatsapp_connection', c.id::text,
          jsonb_build_object('client_id', c.client_id, 'numero', c.display_phone, 'observacao', 'conversas, vendas e contagens ficam guardadas'));
end;
$$;
revoke all on function private.tracking_whatsapp_exclude_impl(uuid, text) from public, anon, authenticated;
grant execute on function private.tracking_whatsapp_exclude_impl(uuid, text) to authenticated;
create function public.tracking_whatsapp_exclude(p_id uuid, p_confirmar text)
returns void language sql set search_path = '' as $$ select private.tracking_whatsapp_exclude_impl(p_id, p_confirmar) $$;
revoke all on function public.tracking_whatsapp_exclude(uuid, text) from public, anon;
grant execute on function public.tracking_whatsapp_exclude(uuid, text) to authenticated;

-- Ligar o WhatsApp de novo num cliente que tem uma conexão excluída: reaproveita o cadastro antigo (histórico volta junto), começando desligado e com chave nova.
create or replace function private.wa_unofficial_save_impl(p_container uuid, p_phone text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  k        public.tracking_containers;
  c        public.tracking_whatsapp_connections;
  v_digits text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_key    text := encode(extensions.gen_random_bytes(24), 'hex');
begin
  select * into k from public.tracking_containers where id = p_container;
  if k.id is null or (select private.current_user_role()) not in ('admin', 'gestor') or k.client_id not in (select private.visible_client_ids()) then
    raise exception 'Só administrador e gestor ligam o WhatsApp de um site.' using errcode = '42501';
  end if;
  if not private.client_is_active(k.client_id) then raise exception 'Cliente desativado.' using errcode = '22023'; end if;
  if char_length(v_digits) < 10 or char_length(v_digits) > 15 then
    raise exception 'Informe o número do WhatsApp do cliente com DDD (só números).' using errcode = '22023';
  end if;
  if char_length(v_digits) in (10, 11) then v_digits := '55' || v_digits; end if;
  select * into c from public.tracking_whatsapp_connections where container_id = p_container;
  if c.id is not null and c.mode <> 'nao_oficial' then
    raise exception 'Este site já tem WhatsApp pela API oficial. Desligue e remova essa conexão antes.' using errcode = '22023';
  end if;
  if exists (select 1 from public.tracking_whatsapp_connections x where x.phone_number_id = v_digits and x.container_id <> p_container) then
    raise exception 'Este número já está ligado a outro site.' using errcode = '22023';
  end if;
  if c.id is null then
    insert into public.tracking_whatsapp_connections (container_id, client_id, phone_number_id, waba_id, enabled, mode, display_phone,
                                                      inbound_key_hash, inbound_key_hint, created_by)
    values (p_container, k.client_id, v_digits, null, false, 'nao_oficial', v_digits,
            encode(extensions.digest(v_key, 'sha256'), 'hex'), right(v_key, 4), (select auth.uid()))
    returning * into c;
    return jsonb_build_object('id', c.id, 'key', v_key);
  end if;
  if c.excluded_at is not null then
    update public.tracking_whatsapp_connections set
      excluded_at = null, excluded_by = null, enabled = false, phone_number_id = v_digits, display_phone = v_digits,
      inbound_key_hash = encode(extensions.digest(v_key, 'sha256'), 'hex'), inbound_key_hint = right(v_key, 4),
      updated_by = (select auth.uid()), updated_at = now()
    where id = c.id;
    insert into public.audit_logs (actor_id, action, target_type, target_id, details)
    values ((select auth.uid()), 'wa_cliente.religar_whatsapp', 'tracking_whatsapp_connection', c.id::text, jsonb_build_object('client_id', k.client_id));
    return jsonb_build_object('id', c.id, 'key', v_key);
  end if;
  update public.tracking_whatsapp_connections set phone_number_id = v_digits, display_phone = v_digits where id = c.id;
  return jsonb_build_object('id', c.id, 'key', null);
end;
$$;
