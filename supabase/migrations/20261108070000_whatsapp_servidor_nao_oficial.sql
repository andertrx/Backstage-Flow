-- =============================================================================
-- Tracking T5.3 (08/11/2026): WhatsApp do cliente pelo SERVIDOR NÃO OFICIAL (estilo Evolution API)
--
-- O servidor de conexão avisa o CRM, por webhook, a cada mensagem recebida (e enviada pela agência).
-- Reaproveita a conexão de WhatsApp por site (tracking_whatsapp_connections), com um modo novo "nao_oficial":
-- o CRM conta a conversa, lê o código do botão do site e a origem do anúncio (ctwa_clid) e marca vendas pelas frases.
-- O texto da conversa NUNCA é guardado: é lido só na memória do servidor. O número vira hash.
-- A chave do endereço aparece UMA vez; o banco guarda só o hash dela.
-- Sem conta oficial (WABA), o Meta recebe a venda como "conversa" (chat) com o telefone cifrado, não como business_messaging.
-- =============================================================================

do $$
declare v_name text;
begin
  select conname into v_name from pg_constraint
   where conrelid = 'public.tracking_whatsapp_connections'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%coexistencia%';
  if v_name is not null then execute 'alter table public.tracking_whatsapp_connections drop constraint ' || quote_ident(v_name); end if;
end $$;
alter table public.tracking_whatsapp_connections
  add constraint tracking_whatsapp_connections_mode_check check (mode in ('manual', 'coexistencia', 'nao_oficial'));
alter table public.tracking_whatsapp_connections alter column waba_id drop not null;
alter table public.tracking_whatsapp_connections
  add column inbound_key_hash text check (inbound_key_hash ~ '^[0-9a-f]{64}$'),
  add column inbound_key_hint text,
  add column has_inbound_key boolean generated always as (inbound_key_hash is not null) stored;
grant select (has_inbound_key, inbound_key_hint) on public.tracking_whatsapp_connections to authenticated;

-- Liga o número de um site pelo servidor não oficial. Cria a conexão (desligada) e devolve a chave UMA vez.
create function private.wa_unofficial_save_impl(p_container uuid, p_phone text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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
  update public.tracking_whatsapp_connections set phone_number_id = v_digits, display_phone = v_digits where id = c.id;
  return jsonb_build_object('id', c.id, 'key', null);
end;
$$;

create function private.wa_unofficial_new_key_impl(p_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare v_key text := encode(extensions.gen_random_bytes(24), 'hex');
begin
  if (select private.current_user_role()) not in ('admin', 'gestor')
     or not exists (select 1 from public.tracking_whatsapp_connections c where c.id = p_id and c.mode = 'nao_oficial' and c.client_id in (select private.visible_client_ids())) then
    raise exception 'Só administrador e gestor trocam a chave.' using errcode = '42501';
  end if;
  update public.tracking_whatsapp_connections set inbound_key_hash = encode(extensions.digest(v_key, 'sha256'), 'hex'), inbound_key_hint = right(v_key, 4) where id = p_id;
  insert into public.audit_logs (actor_id, action, target_type, target_id, details)
  values ((select auth.uid()), 'wa_unofficial.new_key', 'tracking_whatsapp_connection', p_id::text, jsonb_build_object('observacao', 'chave trocada; a antiga parou de valer'));
  return v_key;
end;
$$;

create function private.wa_unofficial_set_enabled_impl(p_id uuid, p_enabled boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select private.current_user_role()) not in ('admin', 'gestor')
     or not exists (select 1 from public.tracking_whatsapp_connections c where c.id = p_id and c.mode = 'nao_oficial' and c.client_id in (select private.visible_client_ids())) then
    raise exception 'Só administrador e gestor ligam ou desligam o WhatsApp.' using errcode = '42501';
  end if;
  update public.tracking_whatsapp_connections set enabled = p_enabled where id = p_id;
end;
$$;

-- Para o servidor (Edge Function wa-inbound): conferir a chave
create function private.wa_unofficial_auth(p_id uuid, p_key text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('id', c.id, 'enabled', c.enabled, 'container_id', c.container_id, 'client_id', c.client_id,
                            'client_active', private.client_is_active(c.client_id))
    from public.tracking_whatsapp_connections c
   where c.id = p_id and c.mode = 'nao_oficial' and c.inbound_key_hash = encode(extensions.digest(coalesce(p_key, ''), 'sha256'), 'hex')
$$;

revoke all on function private.wa_unofficial_save_impl(uuid, text) from public, anon;
revoke all on function private.wa_unofficial_new_key_impl(uuid) from public, anon;
revoke all on function private.wa_unofficial_set_enabled_impl(uuid, boolean) from public, anon;
grant execute on function private.wa_unofficial_save_impl(uuid, text) to authenticated;
grant execute on function private.wa_unofficial_new_key_impl(uuid) to authenticated;
grant execute on function private.wa_unofficial_set_enabled_impl(uuid, boolean) to authenticated;
revoke all on function private.wa_unofficial_auth(uuid, text) from public, anon, authenticated;
grant execute on function private.wa_unofficial_auth(uuid, text) to service_role;

create function public.wa_unofficial_save(p_container uuid, p_phone text)
returns jsonb language sql set search_path = '' as $$ select private.wa_unofficial_save_impl(p_container, p_phone) $$;
create function public.wa_unofficial_new_key(p_id uuid)
returns text language sql set search_path = '' as $$ select private.wa_unofficial_new_key_impl(p_id) $$;
create function public.wa_unofficial_set_enabled(p_id uuid, p_enabled boolean)
returns void language sql set search_path = '' as $$ select private.wa_unofficial_set_enabled_impl(p_id, p_enabled) $$;
create function public.wa_unofficial_auth(p_id uuid, p_key text)
returns jsonb language sql stable set search_path = '' as $$ select private.wa_unofficial_auth(p_id, p_key) $$;
revoke all on function public.wa_unofficial_save(uuid, text), public.wa_unofficial_new_key(uuid), public.wa_unofficial_set_enabled(uuid, boolean) from public, anon;
grant execute on function public.wa_unofficial_save(uuid, text), public.wa_unofficial_new_key(uuid), public.wa_unofficial_set_enabled(uuid, boolean) to authenticated;
revoke all on function public.wa_unofficial_auth(uuid, text) from public, anon, authenticated;
grant execute on function public.wa_unofficial_auth(uuid, text) to service_role;
