-- T5.38 (fase A) — WhatsApp de cada cliente por QR Code (servidor não oficial), dentro do Tracking.
-- Cada conexão `nao_oficial` passa a ter a sua instância própria no servidor de WhatsApp ("bf-..."), separada da instância
-- fixa da agência ("backstage"). Aqui só entra o banco; as rotas do servidor ficam na Edge Function `wa-instance`.
-- Quem pode usar: administrador, gestor com acesso ao cliente e o Account Manager daquele cliente (decisão do Ander, 16/11/2026).
-- Nada é apagado: remover a instância não apaga contatos nem conversas já guardados.

alter table public.tracking_whatsapp_connections
  add column instance_name    text,
  add column gateway_state    text check (gateway_state in ('conectado', 'desconectado', 'aguardando_leitura', 'erro', 'desconhecido')),
  add column gateway_state_at timestamptz;
create unique index tracking_whatsapp_connections_instance_key on public.tracking_whatsapp_connections (instance_name) where instance_name is not null;
comment on column public.tracking_whatsapp_connections.instance_name is 'T5.38: nome da instância deste cliente no servidor de WhatsApp (bf-...). Nunca é a instância da agência.';
comment on column public.tracking_whatsapp_connections.gateway_state is 'T5.38: último estado conhecido da instância deste cliente (conferido pela função wa-instance).';

-- Pode usar o QR Code desta conexão? (a Edge Function confere o login e passa o id da pessoa)
create function private.wa_instance_can(p_user uuid, p_connection uuid)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare c public.tracking_whatsapp_connections; v_role text;
begin
  select * into c from public.tracking_whatsapp_connections where id = p_connection;
  if c.id is null or c.mode <> 'nao_oficial' then return false; end if;
  select role::text into v_role from public.profiles where id = p_user and active;
  if v_role is null then return false; end if;
  if v_role = 'admin' then return true; end if;
  if v_role = 'gestor' and exists (select 1 from public.user_client_access a where a.user_id = p_user and a.client_id = c.client_id) then return true; end if;
  -- Account Manager do cliente (Etapa 51: ops_client_ops.am_user_id)
  return exists (select 1 from public.ops_client_ops o where o.client_id = c.client_id and o.am_user_id = p_user);
end;
$$;

-- Prepara a conexão: confere quem pode, dá o nome da instância e troca a chave do aviso (a chave nunca é mostrada).
create function private.wa_instance_prepare_impl(p_user uuid, p_connection uuid)
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

-- Guarda o estado. p_enable: true liga a conexão (ao conectar), false desliga (ao desconectar), null não mexe.
create function private.wa_instance_state_set_impl(p_user uuid, p_connection uuid, p_state text, p_enable boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare c public.tracking_whatsapp_connections;
begin
  if not private.wa_instance_can(p_user, p_connection) then raise exception 'Você não pode conectar o WhatsApp deste cliente.' using errcode = '42501'; end if;
  if p_state not in ('conectado', 'desconectado', 'aguardando_leitura', 'erro', 'desconhecido') then raise exception 'Estado inválido.' using errcode = '22023'; end if;
  select * into c from public.tracking_whatsapp_connections where id = p_connection for update;
  update public.tracking_whatsapp_connections
     set gateway_state = p_state, gateway_state_at = now(), enabled = coalesce(p_enable, enabled)
   where id = c.id;
  if p_enable is not null and p_enable is distinct from c.enabled then
    insert into public.audit_logs (actor_id, action, target_type, target_id, details)
    values (p_user, case when p_enable then 'wa_instance.ligar' else 'wa_instance.desligar' end, 'tracking_whatsapp_connection', c.id::text,
            jsonb_build_object('estado', p_state));
  end if;
end;
$$;

-- Depois de remover a instância do servidor: a conexão fica desligada e sem instância (o cadastro e o histórico continuam).
create function private.wa_instance_clear_impl(p_user uuid, p_connection uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.wa_instance_can(p_user, p_connection) then raise exception 'Você não pode conectar o WhatsApp deste cliente.' using errcode = '42501'; end if;
  update public.tracking_whatsapp_connections
     set instance_name = null, gateway_state = null, gateway_state_at = null, enabled = false, updated_by = p_user, updated_at = now()
   where id = p_connection;
  insert into public.audit_logs (actor_id, action, target_type, target_id, details)
  values (p_user, 'wa_instance.remover', 'tracking_whatsapp_connection', p_connection::text, jsonb_build_object('observacao', 'instância removida do servidor; contatos e conversas ficam guardados'));
end;
$$;

-- Dados para a função: nome da instância (só se a pessoa pode)
create function private.wa_instance_get_impl(p_user uuid, p_connection uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare c public.tracking_whatsapp_connections;
begin
  if not private.wa_instance_can(p_user, p_connection) then raise exception 'Você não pode conectar o WhatsApp deste cliente.' using errcode = '42501'; end if;
  select * into c from public.tracking_whatsapp_connections where id = p_connection;
  return jsonb_build_object('instance', c.instance_name, 'phone', c.display_phone, 'state', c.gateway_state, 'enabled', c.enabled);
end;
$$;

-- Só o servidor (service_role) executa estas funções.
revoke all on function private.wa_instance_can(uuid, uuid), private.wa_instance_prepare_impl(uuid, uuid), private.wa_instance_state_set_impl(uuid, uuid, text, boolean),
  private.wa_instance_clear_impl(uuid, uuid), private.wa_instance_get_impl(uuid, uuid) from public, anon, authenticated;
grant execute on function private.wa_instance_can(uuid, uuid), private.wa_instance_prepare_impl(uuid, uuid), private.wa_instance_state_set_impl(uuid, uuid, text, boolean),
  private.wa_instance_clear_impl(uuid, uuid), private.wa_instance_get_impl(uuid, uuid) to service_role;

create function public.wa_instance_prepare(p_user uuid, p_connection uuid) returns jsonb language sql set search_path = '' as $$ select private.wa_instance_prepare_impl(p_user, p_connection) $$;
create function public.wa_instance_state_set(p_user uuid, p_connection uuid, p_state text, p_enable boolean default null) returns void language sql set search_path = '' as $$ select private.wa_instance_state_set_impl(p_user, p_connection, p_state, p_enable) $$;
create function public.wa_instance_clear(p_user uuid, p_connection uuid) returns void language sql set search_path = '' as $$ select private.wa_instance_clear_impl(p_user, p_connection) $$;
create function public.wa_instance_get(p_user uuid, p_connection uuid) returns jsonb language sql stable set search_path = '' as $$ select private.wa_instance_get_impl(p_user, p_connection) $$;
revoke all on function public.wa_instance_prepare(uuid, uuid), public.wa_instance_state_set(uuid, uuid, text, boolean), public.wa_instance_clear(uuid, uuid), public.wa_instance_get(uuid, uuid) from public, anon, authenticated;
grant execute on function public.wa_instance_prepare(uuid, uuid), public.wa_instance_state_set(uuid, uuid, text, boolean), public.wa_instance_clear(uuid, uuid), public.wa_instance_get(uuid, uuid) to service_role;
