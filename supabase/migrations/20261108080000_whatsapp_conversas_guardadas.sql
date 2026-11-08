-- =============================================================================
-- Tracking T5.6a (08/11/2026): conversas do WhatsApp guardadas por tempo curto (padrão 30 dias, ou 15)
--
-- DECISÃO DO ANDER (08/11/2026): para a IA sugerir vendas (T5.6b), o texto das conversas passa a ser guardado, por
-- tempo curto, SÓ nos sites em que a agência ligar a opção "Guardar as conversas". Isso muda a regra antiga
-- "o texto do WhatsApp nunca é guardado". Travas:
--   * desligado por padrão em cada site (opt-in);
--   * só administrador, gestor (dos clientes liberados) e o Account Manager do cliente leem; ninguém grava pela tela;
--   * apagado sozinho todo dia, quando passa do prazo (30 ou 15 dias); botão "Apagar agora" para o administrador;
--   * só conversas individuais (grupos nunca entram); nunca vai para log, histórico, relatório ou MCP;
--   * o número completo NÃO é guardado: só o final (4 dígitos) e o nome que o WhatsApp mostra, para a equipe achar a pessoa.
-- =============================================================================

alter table public.tracking_whatsapp_connections add column store_messages boolean not null default false;
grant select (store_messages) on public.tracking_whatsapp_connections to authenticated;

create table public.tracking_wa_messages (
  id            bigint generated always as identity primary key,
  client_id     uuid not null references public.clients (id),
  connection_id uuid not null references public.tracking_whatsapp_connections (id),
  wa_hash       text not null check (wa_hash ~ '^[0-9a-f]{64}$'),
  direction     text not null check (direction in ('recebida', 'enviada')),
  message_key   text not null check (message_key ~ '^[0-9a-f]{16,64}$'),
  at            timestamptz not null,
  body          text not null check (char_length(body) between 1 and 4000),
  push_name     text check (char_length(push_name) <= 80),
  phone_tail    text check (phone_tail ~ '^\d{2,4}$'),
  expires_at    timestamptz not null,
  created_at    timestamptz not null default now(),
  unique (connection_id, message_key)
);
comment on table public.tracking_wa_messages is 'T5.6a: texto das conversas de WhatsApp (só em sites com a opção ligada), guardado por 15 ou 30 dias e apagado sozinho. Só admin, gestor e o Account Manager do cliente leem.';
create index tracking_wa_messages_conv_idx on public.tracking_wa_messages (connection_id, wa_hash, at);
create index tracking_wa_messages_expires_idx on public.tracking_wa_messages (expires_at);
create index tracking_wa_messages_client_idx on public.tracking_wa_messages (client_id, at desc);

-- Quem lê: admin; gestor dos clientes liberados; Account Manager do cliente. Cliente e demais papéis não.
create function private.wa_messages_can_read(p_client uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select private.current_user_role()) is not null and (select private.current_user_role()) <> 'cliente'
     and (
       ((select private.current_user_role()) in ('admin', 'gestor') and p_client in (select private.visible_client_ids()))
       or exists (select 1 from public.ops_client_ops o where o.client_id = p_client and o.am_user_id = (select auth.uid()))
     )
$$;
revoke all on function private.wa_messages_can_read(uuid) from public, anon;
grant execute on function private.wa_messages_can_read(uuid) to authenticated;

alter table public.tracking_wa_messages enable row level security;
revoke all on public.tracking_wa_messages from anon, authenticated;
grant select (id, client_id, connection_id, wa_hash, direction, at, body, push_name, phone_tail, expires_at) on public.tracking_wa_messages to authenticated;
create policy "Admin, gestor e Account Manager leem as conversas" on public.tracking_wa_messages for select to authenticated
  using ((select private.wa_messages_can_read(client_id)));

-- Prazo de guarda (15 ou 30 dias), uma configuração só
insert into private.app_settings (key, value) values ('wa_messages_retention_days', '30') on conflict (key) do nothing;

create function private.wa_messages_retention_days()
returns integer
language sql
stable
security definer
set search_path = ''
as $$ select coalesce((select value::integer from private.app_settings where key = 'wa_messages_retention_days' and value in ('15', '30')), 30) $$;
revoke all on function private.wa_messages_retention_days() from public, anon, authenticated;

create function private.wa_messages_settings_impl(p_days integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select private.current_user_role()) <> 'admin' then
    raise exception 'Só o administrador muda o prazo de guarda das conversas.' using errcode = '42501';
  end if;
  if p_days is not null then
    if p_days not in (15, 30) then raise exception 'O prazo é de 15 ou 30 dias.' using errcode = '22023'; end if;
    update private.app_settings set value = p_days::text where key = 'wa_messages_retention_days';
    -- Encurtar o prazo vale também para o que já está guardado.
    update public.tracking_wa_messages set expires_at = least(expires_at, at + make_interval(days => p_days));
    insert into public.audit_logs (actor_id, action, target_type, target_id, details)
    values ((select auth.uid()), 'wa_messages.retention', 'app_settings', 'wa_messages_retention_days', jsonb_build_object('dias', p_days));
  end if;
  return private.wa_messages_retention_days();
end;
$$;
revoke all on function private.wa_messages_settings_impl(integer) from public, anon;
grant execute on function private.wa_messages_settings_impl(integer) to authenticated;
create function public.wa_messages_settings(p_days integer default null)
returns integer language sql set search_path = '' as $$ select private.wa_messages_settings_impl(p_days) $$;
revoke all on function public.wa_messages_settings(integer) from public, anon;
grant execute on function public.wa_messages_settings(integer) to authenticated;

-- Ligar/desligar a guarda das conversas de um site (admin e gestor). Desligar não apaga: o que já foi guardado vence sozinho.
create function private.wa_unofficial_set_store_impl(p_id uuid, p_on boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select private.current_user_role()) not in ('admin', 'gestor')
     or not exists (select 1 from public.tracking_whatsapp_connections c where c.id = p_id and c.mode = 'nao_oficial' and c.client_id in (select private.visible_client_ids())) then
    raise exception 'Só administrador e gestor ligam ou desligam a guarda das conversas.' using errcode = '42501';
  end if;
  update public.tracking_whatsapp_connections set store_messages = p_on where id = p_id;
  insert into public.audit_logs (actor_id, action, target_type, target_id, details)
  values ((select auth.uid()), 'wa_messages.store', 'tracking_whatsapp_connection', p_id::text, jsonb_build_object('guardar', p_on));
end;
$$;
revoke all on function private.wa_unofficial_set_store_impl(uuid, boolean) from public, anon;
grant execute on function private.wa_unofficial_set_store_impl(uuid, boolean) to authenticated;
create function public.wa_unofficial_set_store(p_id uuid, p_on boolean)
returns void language sql set search_path = '' as $$ select private.wa_unofficial_set_store_impl(p_id, p_on) $$;
revoke all on function public.wa_unofficial_set_store(uuid, boolean) from public, anon;
grant execute on function public.wa_unofficial_set_store(uuid, boolean) to authenticated;

-- Apagar agora (só administrador): todas as conversas guardadas de um site
create function private.wa_messages_delete_all_impl(p_connection uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare v_n integer;
begin
  if (select private.current_user_role()) <> 'admin' then
    raise exception 'Só o administrador apaga as conversas guardadas.' using errcode = '42501';
  end if;
  delete from public.tracking_wa_messages where connection_id = p_connection;
  get diagnostics v_n = row_count;
  insert into public.audit_logs (actor_id, action, target_type, target_id, details)
  values ((select auth.uid()), 'wa_messages.delete_all', 'tracking_whatsapp_connection', p_connection::text, jsonb_build_object('apagadas', v_n));
  return v_n;
end;
$$;
revoke all on function private.wa_messages_delete_all_impl(uuid) from public, anon;
grant execute on function private.wa_messages_delete_all_impl(uuid) to authenticated;
create function public.wa_messages_delete_all(p_connection uuid)
returns integer language sql set search_path = '' as $$ select private.wa_messages_delete_all_impl(p_connection) $$;
revoke all on function public.wa_messages_delete_all(uuid) from public, anon;
grant execute on function public.wa_messages_delete_all(uuid) to authenticated;

-- Para o servidor (wa-inbound): guardar uma mensagem. Só se a opção do site estiver ligada, a conexão ligada e o cliente ativo.
create function private.wa_message_store(p jsonb)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  c       public.tracking_whatsapp_connections;
  v_wa    text := p ->> 'wa_hash';
  v_key   text := p ->> 'message_key';
  v_body  text := left(btrim(coalesce(p ->> 'body', '')), 4000);
  v_dir   text := p ->> 'direction';
  v_at    timestamptz := coalesce((p ->> 'at')::timestamptz, now());
begin
  select * into c from public.tracking_whatsapp_connections where id = (p ->> 'connection_id')::uuid;
  if c.id is null or not c.enabled or not c.store_messages or not private.client_is_active(c.client_id) then return 'desligado'; end if;
  if v_wa is null or v_wa !~ '^[0-9a-f]{64}$' or v_key is null or v_key !~ '^[0-9a-f]{16,64}$' or v_dir not in ('recebida', 'enviada') or v_body = '' then return 'invalido'; end if;
  if v_at < now() - interval '3 days' or v_at > now() + interval '1 hour' then v_at := now(); end if;
  insert into public.tracking_wa_messages (client_id, connection_id, wa_hash, direction, message_key, at, body, push_name, phone_tail, expires_at)
  values (c.client_id, c.id, v_wa, v_dir, v_key, v_at, v_body,
          nullif(left(btrim(coalesce(p ->> 'push_name', '')), 80), ''),
          case when p ->> 'phone_tail' ~ '^\d{2,4}$' then p ->> 'phone_tail' end,
          now() + make_interval(days => private.wa_messages_retention_days()))
  on conflict (connection_id, message_key) do nothing;
  return 'guardada';
end;
$$;
revoke all on function private.wa_message_store(jsonb) from public, anon, authenticated;
grant execute on function private.wa_message_store(jsonb) to service_role;
create function public.wa_message_store(p jsonb)
returns text language sql set search_path = '' as $$ select private.wa_message_store(p) $$;
revoke all on function public.wa_message_store(jsonb) from public, anon, authenticated;
grant execute on function public.wa_message_store(jsonb) to service_role;

-- Limpeza diária: apaga o que passou do prazo (cada dia, às 03h de Brasília)
create function private.wa_messages_purge()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare v_n integer;
begin
  delete from public.tracking_wa_messages where expires_at < now();
  get diagnostics v_n = row_count;
  if v_n > 0 then
    insert into public.audit_logs (actor_id, action, target_type, target_id, details)
    values (null, 'wa_messages.purge', 'tracking_wa_messages', 'prazo', jsonb_build_object('apagadas', v_n));
  end if;
  return v_n;
end;
$$;
revoke all on function private.wa_messages_purge() from public, anon, authenticated;
select cron.schedule('wa-messages-purge', '7 6 * * *', 'select private.wa_messages_purge()');

-- A conferência da chave do servidor passa a informar se este site guarda as conversas.
create or replace function private.wa_unofficial_auth(p_id uuid, p_key text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('id', c.id, 'enabled', c.enabled, 'container_id', c.container_id, 'client_id', c.client_id,
                            'client_active', private.client_is_active(c.client_id), 'store_messages', c.store_messages)
    from public.tracking_whatsapp_connections c
   where c.id = p_id and c.mode = 'nao_oficial' and c.inbound_key_hash = encode(extensions.digest(coalesce(p_key, ''), 'sha256'), 'hex')
$$;
