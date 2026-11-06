-- Etapa 44.1 (06/11/2026) — conexão do WhatsApp por API NÃO OFICIAL (envio automático dos envios semanais).
-- Decisão do Ander: usar um chip próprio, conectado por QR Code ou código, e aceitar o risco de banimento do número.
-- Aqui fica só a CONEXÃO: endereço do servidor de conexão, nome da instância, chave (no cofre), aceite do risco,
-- estado da conexão e a TRAVA GERAL (enabled). Nada é enviado nesta fase.
-- Regras: só administrador vê e muda; a chave nunca volta para a tela nem vai para log; a trava volta a "desligada"
-- sempre que o endereço ou a instância mudam e quando o WhatsApp desconecta; ligar só com a conexão ativa.

create table public.wa_gateway_settings (
  id              boolean primary key default true check (id),
  enabled         boolean not null default false,
  base_url        text check (base_url is null or base_url ~ '^https://([A-Za-z0-9-]+\.)+[A-Za-z]{2,}(:[0-9]{2,5})?$'),
  instance_name   text not null default 'backstage' check (instance_name ~ '^[A-Za-z0-9_-]{1,60}$'),
  has_key         boolean not null default false,
  key_updated_at  timestamptz,
  risk_accepted_at timestamptz,
  risk_accepted_by uuid references auth.users (id),
  connection_state text not null default 'desconhecido'
                  check (connection_state in ('desconhecido', 'conectado', 'desconectado', 'aguardando_leitura', 'erro')),
  connected_at    timestamptz,
  last_check_at   timestamptz,
  last_error      text check (char_length(last_error) <= 300),
  updated_at      timestamptz not null default now(),
  updated_by      uuid references auth.users (id)
);
comment on table public.wa_gateway_settings is 'Etapa 44.1: conexão do WhatsApp por API não oficial (uma linha só). A chave fica no Vault (wa_gateway_key). enabled = trava geral dos envios automáticos.';
create index wa_gateway_settings_updated_by_idx on public.wa_gateway_settings (updated_by);
create index wa_gateway_settings_risk_by_idx on public.wa_gateway_settings (risk_accepted_by);
insert into public.wa_gateway_settings (id) values (true);

alter table public.wa_gateway_settings enable row level security;
revoke all on public.wa_gateway_settings from anon, authenticated;
grant select on public.wa_gateway_settings to authenticated;
create policy "Só admin vê a conexão do WhatsApp" on public.wa_gateway_settings for select to authenticated
  using ((select private.current_user_role()) = 'admin');

-- Salvar endereço, instância, chave (opcional) e o aceite do risco.
create function private.wa_gateway_save_impl(p_base_url text, p_instance text, p_api_key text, p_accept_risk boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text := regexp_replace(lower(trim(coalesce(p_base_url, ''))), '/+$', '');
  v_instance text := trim(coalesce(p_instance, ''));
  v_old public.wa_gateway_settings;
  v_secret uuid;
begin
  if private.current_user_role() is distinct from 'admin' then
    raise exception 'Só o administrador configura a conexão do WhatsApp.' using errcode = '42501';
  end if;
  if v_url !~ '^https://([a-z0-9-]+\.)+[a-z]{2,}(:[0-9]{2,5})?$' then
    raise exception 'Endereço inválido. Use o endereço seguro do seu servidor, começando com https:// (ex.: https://whats.seudominio.com.br).' using errcode = '22023';
  end if;
  if v_instance !~ '^[A-Za-z0-9_-]{1,60}$' then
    raise exception 'O nome da instância só pode ter letras, números, - e _ (até 60).' using errcode = '22023';
  end if;
  if p_api_key is not null and p_api_key !~ '^[A-Za-z0-9._~+/=-]{16,200}$' then
    raise exception 'Chave de acesso inválida. Confira e cole de novo.' using errcode = '22023';
  end if;
  select * into v_old from public.wa_gateway_settings where id;
  if v_old.risk_accepted_at is null and not coalesce(p_accept_risk, false) then
    raise exception 'Marque que você entende o risco desta conexão não oficial antes de salvar.' using errcode = '22023';
  end if;

  if p_api_key is not null then
    select id into v_secret from vault.secrets where name = 'wa_gateway_key';
    if v_secret is null then
      perform vault.create_secret(p_api_key, 'wa_gateway_key', 'Chave do servidor de conexão do WhatsApp (API não oficial)');
    else
      perform vault.update_secret(v_secret, p_api_key);
    end if;
  end if;

  update public.wa_gateway_settings
     set base_url = v_url, instance_name = v_instance,
         has_key = has_key or p_api_key is not null,
         key_updated_at = case when p_api_key is not null then now() else key_updated_at end,
         risk_accepted_at = coalesce(risk_accepted_at, case when coalesce(p_accept_risk, false) then now() end),
         risk_accepted_by = coalesce(risk_accepted_by, case when coalesce(p_accept_risk, false) then (select auth.uid()) end),
         -- mudou o servidor, a instância ou a chave: trava desligada e conexão a conferir de novo
         enabled = case when v_old.base_url is distinct from v_url or v_old.instance_name is distinct from v_instance or p_api_key is not null then false else enabled end,
         connection_state = case when v_old.base_url is distinct from v_url or v_old.instance_name is distinct from v_instance or p_api_key is not null then 'desconhecido' else connection_state end,
         connected_at = case when v_old.base_url is distinct from v_url or v_old.instance_name is distinct from v_instance or p_api_key is not null then null else connected_at end,
         last_error = null, updated_at = now(), updated_by = (select auth.uid())
   where id;
  insert into public.audit_logs (actor_id, action, target_type, target_id, details)
  values ((select auth.uid()), 'wa_gateway.update', 'wa_gateway', 'settings',
          jsonb_build_object('base_url', v_url, 'instancia', v_instance, 'nova_chave', p_api_key is not null, 'aceitou_risco', coalesce(p_accept_risk, false)));
end;
$$;
revoke all on function private.wa_gateway_save_impl(text, text, text, boolean) from public, anon;
grant execute on function private.wa_gateway_save_impl(text, text, text, boolean) to authenticated;

-- Trava geral: desligar sempre pode; ligar só com chave, aceite do risco e conexão ativa.
create function private.wa_gateway_set_enabled_impl(p_enabled boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.wa_gateway_settings;
begin
  if private.current_user_role() is distinct from 'admin' then
    raise exception 'Só o administrador liga ou desliga os envios automáticos.' using errcode = '42501';
  end if;
  select * into s from public.wa_gateway_settings where id;
  if p_enabled and (s.base_url is null or not s.has_key or s.risk_accepted_at is null) then
    raise exception 'Configure o endereço e a chave e aceite o risco antes de ligar.' using errcode = '22023';
  end if;
  if p_enabled and s.connection_state <> 'conectado' then
    raise exception 'O WhatsApp precisa estar conectado para ligar os envios automáticos.' using errcode = '22023';
  end if;
  update public.wa_gateway_settings set enabled = p_enabled, updated_at = now(), updated_by = (select auth.uid()) where id;
  insert into public.audit_logs (actor_id, action, target_type, target_id, details)
  values ((select auth.uid()), case when p_enabled then 'wa_gateway.enable' else 'wa_gateway.disable' end, 'wa_gateway', 'settings', '{}'::jsonb);
end;
$$;
revoke all on function private.wa_gateway_set_enabled_impl(boolean) from public, anon;
grant execute on function private.wa_gateway_set_enabled_impl(boolean) to authenticated;

-- Servidor: lê a configuração (com a chave) e anota o estado da conexão. Só o service_role chama.
create function private.wa_gateway_config_get()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('enabled', s.enabled, 'base_url', s.base_url, 'instance_name', s.instance_name,
           'connection_state', s.connection_state,
           'key', (select decrypted_secret from vault.decrypted_secrets where name = 'wa_gateway_key'))
    from public.wa_gateway_settings s where s.id
$$;
revoke all on function private.wa_gateway_config_get() from public, anon, authenticated;
grant execute on function private.wa_gateway_config_get() to service_role;

create function private.wa_gateway_state_set(p_state text, p_error text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_state not in ('desconhecido', 'conectado', 'desconectado', 'aguardando_leitura', 'erro') then
    raise exception 'Estado inválido.' using errcode = '22023';
  end if;
  update public.wa_gateway_settings
     set connection_state = p_state, last_check_at = now(), last_error = left(p_error, 300),
         connected_at = case when p_state = 'conectado' and connection_state <> 'conectado' then now()
                             when p_state = 'conectado' then connected_at else null end,
         -- o WhatsApp saiu da conexão (ex.: aparelho desconectou): a trava desliga sozinha
         enabled = case when p_state = 'desconectado' then false else enabled end,
         updated_at = now()
   where id;
end;
$$;
revoke all on function private.wa_gateway_state_set(text, text) from public, anon, authenticated;
grant execute on function private.wa_gateway_state_set(text, text) to service_role;

create function public.wa_gateway_save(p_base_url text, p_instance text, p_api_key text default null, p_accept_risk boolean default false)
returns void language sql set search_path = '' as $$ select private.wa_gateway_save_impl(p_base_url, p_instance, p_api_key, p_accept_risk) $$;
create function public.wa_gateway_set_enabled(p_enabled boolean)
returns void language sql set search_path = '' as $$ select private.wa_gateway_set_enabled_impl(p_enabled) $$;
create function public.wa_gateway_config_get()
returns jsonb language sql stable set search_path = '' as $$ select private.wa_gateway_config_get() $$;
create function public.wa_gateway_state_set(p_state text, p_error text default null)
returns void language sql set search_path = '' as $$ select private.wa_gateway_state_set(p_state, p_error) $$;
revoke all on function public.wa_gateway_save(text, text, text, boolean) from public, anon;
revoke all on function public.wa_gateway_set_enabled(boolean) from public, anon;
revoke all on function public.wa_gateway_config_get() from public, anon, authenticated;
revoke all on function public.wa_gateway_state_set(text, text) from public, anon, authenticated;
grant execute on function public.wa_gateway_save(text, text, text, boolean) to authenticated;
grant execute on function public.wa_gateway_set_enabled(boolean) to authenticated;
grant execute on function public.wa_gateway_config_get() to service_role;
grant execute on function public.wa_gateway_state_set(text, text) to service_role;
