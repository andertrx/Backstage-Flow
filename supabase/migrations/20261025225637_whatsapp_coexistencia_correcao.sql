-- Correção da T4.2 (achada pelo teste do banco): sem usuário logado, o papel vem vazio e a conferência
-- "só administrador" deixava passar. Agora papel vazio = recusado.

create or replace function private.wa_app_settings_get_impl()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s public.wa_app_settings;
begin
  if coalesce((select private.current_user_role())::text, '') <> 'admin' then
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

create or replace function private.wa_app_settings_save_impl(p_app_id text, p_config_id text, p_app_secret text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.wa_app_settings;
begin
  if coalesce((select private.current_user_role())::text, '') <> 'admin' then
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
