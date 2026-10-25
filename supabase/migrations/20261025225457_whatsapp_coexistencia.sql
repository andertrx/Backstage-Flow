-- Tracking T4.2 (25/10/2026): ligar o WhatsApp do cliente pelo cadastro oficial do Meta (Coexistence).
-- O número continua no app WhatsApp Business do celular; o Meta avisa o CRM das mensagens recebidas e das
-- que o atendente manda (para as Frases do WhatsApp da T4.1).
-- Usa o app do Meta DA AGÊNCIA (um só para todos os clientes): ID do app e ID da configuração (não são segredo),
-- segredo do app e token de verificação (só no cofre/Vault). O token de cada número ligado também vai para o cofre.

create table public.wa_app_settings (
  id                    smallint primary key default 1 check (id = 1),
  app_id                text check (app_id ~ '^\d{5,30}$'),
  config_id             text check (config_id ~ '^\d{5,30}$'),
  graph_version         text not null default 'v23.0' check (graph_version ~ '^v\d{2}\.\d$'),
  app_secret_vault_id   uuid,
  verify_token_vault_id uuid,
  updated_at            timestamptz not null default now(),
  updated_by            uuid references auth.users (id)
);
comment on table public.wa_app_settings is 'T4.2: app do Meta da agência para o WhatsApp (Coexistence). Uma linha. Segredos só no Vault. Só pelas funções do banco.';
alter table public.wa_app_settings enable row level security;
revoke all on public.wa_app_settings from anon, authenticated;

alter table public.tracking_whatsapp_connections
  add column mode text not null default 'manual' check (mode in ('manual', 'coexistencia')),
  add column token_vault_id uuid,
  add column display_phone text check (char_length(display_phone) <= 40),
  add column verified_name text check (char_length(verified_name) <= 120),
  add column onboarded_at timestamptz;
grant select (mode, display_phone, verified_name, onboarded_at) on public.tracking_whatsapp_connections to authenticated;

-- Estado do login no Meta (10 min): guarda para qual site o número será ligado.
alter table public.oauth_states add column context jsonb;

-- Admin: ver a configuração (sem o segredo; o token de verificação aparece para colar no app do Meta).
create function private.wa_app_settings_get_impl()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s public.wa_app_settings;
begin
  if (select private.current_user_role()) <> 'admin' then
    raise exception 'Só o administrador configura o app do Meta.' using errcode = '42501';
  end if;
  select * into s from public.wa_app_settings where id = 1;
  return jsonb_build_object(
    'app_id', s.app_id, 'config_id', s.config_id, 'graph_version', coalesce(s.graph_version, 'v23.0'),
    'has_secret', s.app_secret_vault_id is not null,
    'verify_token', (select decrypted_secret from vault.decrypted_secrets where id = s.verify_token_vault_id),
    'ready', s.app_id is not null and s.config_id is not null and s.app_secret_vault_id is not null);
end;
$$;

-- Admin: salvar. Segredo vazio = mantém o atual. O token de verificação é gerado aqui na primeira vez.
create function private.wa_app_settings_save_impl(p_app_id text, p_config_id text, p_app_secret text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.wa_app_settings;
begin
  if (select private.current_user_role()) <> 'admin' then
    raise exception 'Só o administrador configura o app do Meta.' using errcode = '42501';
  end if;
  if coalesce(p_app_id, '') !~ '^\d{5,30}$' then raise exception 'ID do app inválido (só números).' using errcode = '22023'; end if;
  if coalesce(p_config_id, '') !~ '^\d{5,30}$' then raise exception 'ID da configuração inválido (só números).' using errcode = '22023'; end if;
  if p_app_secret is not null and btrim(p_app_secret) <> '' and btrim(p_app_secret) !~ '^[0-9a-f]{32}$' then
    raise exception 'Segredo do app inválido (são 32 letras e números).' using errcode = '22023';
  end if;
  insert into public.wa_app_settings (id, app_id, config_id, updated_by) values (1, p_app_id, p_config_id, (select auth.uid()))
  on conflict (id) do update set app_id = excluded.app_id, config_id = excluded.config_id, updated_at = now(), updated_by = excluded.updated_by;
  select * into s from public.wa_app_settings where id = 1;
  if p_app_secret is not null and btrim(p_app_secret) <> '' then
    if s.app_secret_vault_id is not null then
      perform vault.update_secret(s.app_secret_vault_id, btrim(p_app_secret));
    else
      update public.wa_app_settings set app_secret_vault_id = vault.create_secret(btrim(p_app_secret), 'wa_app_global:secret', 'Segredo do app do Meta da agência (WhatsApp)') where id = 1;
    end if;
  end if;
  if s.verify_token_vault_id is null then
    update public.wa_app_settings
       set verify_token_vault_id = vault.create_secret(encode(extensions.gen_random_bytes(24), 'hex'), 'wa_app_global:verify', 'Token de verificação do webhook do WhatsApp (app da agência)')
     where id = 1;
  end if;
  insert into public.audit_logs (actor_id, action, target_type, target_id, details)
  values ((select auth.uid()), 'wa_app_settings.save', 'wa_app_settings', '1',
          jsonb_build_object('app_id', p_app_id, 'config_id', p_config_id,
                             'segredo', case when p_app_secret is not null and btrim(p_app_secret) <> '' then 'alterado (Vault)' else 'sem alteração' end));
  return private.wa_app_settings_get_impl();
end;
$$;

-- Servidor: credenciais do app (decifradas) para o cadastro oficial e para conferir a assinatura do webhook.
create function private.wa_app_credentials()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('app_id', s.app_id, 'config_id', s.config_id, 'graph_version', s.graph_version,
    'app_secret', (select decrypted_secret from vault.decrypted_secrets where id = s.app_secret_vault_id),
    'verify_token', (select decrypted_secret from vault.decrypted_secrets where id = s.verify_token_vault_id))
    from public.wa_app_settings s where s.id = 1
$$;

-- Servidor: guardar o token do número ligado (no cofre) e marcar a conexão como Coexistence.
create function private.wa_coex_connect(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ct    public.tracking_containers;
  v_id    uuid;
  v_token uuid;
begin
  select * into v_ct from public.tracking_containers where id = (p ->> 'container_id')::uuid;
  if v_ct.id is null then raise exception 'Site não encontrado.' using errcode = 'P0002'; end if;
  if coalesce(p ->> 'phone_number_id', '') !~ '^\d{5,30}$' or coalesce(p ->> 'waba_id', '') !~ '^\d{5,30}$' then
    raise exception 'Número ou conta do WhatsApp inválidos.' using errcode = '22023';
  end if;
  if exists (select 1 from public.tracking_whatsapp_connections w where w.phone_number_id = p ->> 'phone_number_id' and w.container_id <> v_ct.id) then
    raise exception 'Este número já está ligado a outro site.' using errcode = '23505';
  end if;
  select id, token_vault_id into v_id, v_token from public.tracking_whatsapp_connections where container_id = v_ct.id;
  if v_id is null then
    insert into public.tracking_whatsapp_connections (container_id, client_id, phone_number_id, waba_id, enabled, mode, created_by)
    values (v_ct.id, v_ct.client_id, p ->> 'phone_number_id', p ->> 'waba_id', false, 'coexistencia', (p ->> 'user_id')::uuid)
    returning id into v_id;
  end if;
  if v_token is not null then
    perform vault.update_secret(v_token, p ->> 'token');
  else
    update public.tracking_whatsapp_connections
       set token_vault_id = vault.create_secret(p ->> 'token', 'wa_token:' || v_id::text, 'Token do número do WhatsApp (cadastro oficial do Meta)')
     where id = v_id;
  end if;
  update public.tracking_whatsapp_connections
     set phone_number_id = p ->> 'phone_number_id', waba_id = p ->> 'waba_id', mode = 'coexistencia', enabled = true,
         display_phone = left(p ->> 'display_phone', 40), verified_name = left(p ->> 'verified_name', 120), onboarded_at = now(),
         last_error_at = null, last_error_message = null, updated_by = (p ->> 'user_id')::uuid, updated_at = now()
   where id = v_id;
  insert into public.audit_logs (actor_id, action, target_type, target_id, details)
  values ((p ->> 'user_id')::uuid, 'tracking_whatsapp.coexistencia', 'tracking_whatsapp', v_ct.client_id::text,
          jsonb_build_object('phone_number_id', p ->> 'phone_number_id', 'waba_id', p ->> 'waba_id', 'token', 'guardado no Vault'));
  return v_id;
end;
$$;

-- Servidor: conexões Coexistence de um número (o webhook do app recebe todos os números juntos).
create function private.wa_coex_connection_for(p_phone_number_id text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('id', c.id, 'phone_number_id', c.phone_number_id, 'enabled', c.enabled)
    from public.tracking_whatsapp_connections c
   where c.phone_number_id = p_phone_number_id and c.mode = 'coexistencia'
$$;

revoke all on function private.wa_app_settings_get_impl() from public, anon;
revoke all on function private.wa_app_settings_save_impl(text, text, text) from public, anon;
grant execute on function private.wa_app_settings_get_impl() to authenticated;
grant execute on function private.wa_app_settings_save_impl(text, text, text) to authenticated;
revoke all on function private.wa_app_credentials() from public, anon, authenticated;
revoke all on function private.wa_coex_connect(jsonb) from public, anon, authenticated;
revoke all on function private.wa_coex_connection_for(text) from public, anon, authenticated;
grant execute on function private.wa_app_credentials() to service_role;
grant execute on function private.wa_coex_connect(jsonb) to service_role;
grant execute on function private.wa_coex_connection_for(text) to service_role;

create function public.wa_app_settings_get()
returns jsonb language sql stable set search_path = '' as $$ select private.wa_app_settings_get_impl() $$;
create function public.wa_app_settings_save(p_app_id text, p_config_id text, p_app_secret text)
returns jsonb language sql set search_path = '' as $$ select private.wa_app_settings_save_impl(p_app_id, p_config_id, p_app_secret) $$;
create function public.wa_app_credentials()
returns jsonb language sql stable set search_path = '' as $$ select private.wa_app_credentials() $$;
create function public.wa_coex_connect(p jsonb)
returns uuid language sql set search_path = '' as $$ select private.wa_coex_connect(p) $$;
create function public.wa_coex_connection_for(p_phone_number_id text)
returns jsonb language sql stable set search_path = '' as $$ select private.wa_coex_connection_for(p_phone_number_id) $$;
revoke all on function public.wa_app_settings_get() from public, anon;
revoke all on function public.wa_app_settings_save(text, text, text) from public, anon;
grant execute on function public.wa_app_settings_get() to authenticated;
grant execute on function public.wa_app_settings_save(text, text, text) to authenticated;
revoke all on function public.wa_app_credentials() from public, anon, authenticated;
revoke all on function public.wa_coex_connect(jsonb) from public, anon, authenticated;
revoke all on function public.wa_coex_connection_for(text) from public, anon, authenticated;
grant execute on function public.wa_app_credentials() to service_role;
grant execute on function public.wa_coex_connect(jsonb) to service_role;
grant execute on function public.wa_coex_connection_for(text) to service_role;
