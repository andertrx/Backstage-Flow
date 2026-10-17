-- =============================================================================
-- Etapa 39.1 — Inteligência de Resultados: conexão com o Google Sheets.
--
-- A planilha de cada cliente é a fonte dos dados (perfil comercial e origem de
-- cada contato). Nesta fase: a chave da conta de serviço do Google (no cofre) e
-- o cadastro da planilha por cliente (aba, cabeçalho, mapeamento das colunas e
-- regras dos perfis). Nenhum contato é guardado aqui.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Conta de serviço do Google (uma para o CRM todo; a chave fica no cofre)
-- -----------------------------------------------------------------------------
create table public.sheets_settings (
  id                    boolean primary key default true check (id),
  service_account_email text check (service_account_email is null or service_account_email ~ '^[^@\s]+@[^@\s]+\.iam\.gserviceaccount\.com$'),
  has_key               boolean not null default false,
  key_updated_at        timestamptz,
  last_test_at          timestamptz,
  last_test_ok          boolean,
  last_test_error       text check (char_length(last_test_error) <= 500),
  updated_at            timestamptz not null default now(),
  updated_by            uuid references auth.users (id) on delete set null
);
comment on table public.sheets_settings is
  'Etapa 39.1: conta de serviço do Google usada para ler as planilhas (a chave fica no Vault, nunca aqui).';
insert into public.sheets_settings (id) values (true);
create index sheets_settings_updated_by_idx on public.sheets_settings (updated_by);
alter table public.sheets_settings enable row level security;
revoke all on public.sheets_settings from anon, authenticated;
grant select on public.sheets_settings to authenticated;
create policy "Equipe vê a configuração do Google Sheets" on public.sheets_settings for select to authenticated
  using ((select private.current_user_role()) in ('admin', 'gestor', 'operador', 'visualizador'));

-- Salvar a chave (JSON da conta de serviço). Só o administrador.
create function private.sheets_settings_save_impl(p_key text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_json jsonb;
  v_email text;
  v_secret uuid;
begin
  if private.current_user_role() is distinct from 'admin' then
    raise exception 'Só o administrador configura o Google Sheets.' using errcode = '42501';
  end if;
  if p_key is null or char_length(p_key) > 10000 then
    raise exception 'Cole o conteúdo do arquivo JSON da chave.' using errcode = '22023';
  end if;
  begin
    v_json := p_key::jsonb;
  exception when others then
    raise exception 'O texto colado não é o arquivo JSON da chave. Abra o arquivo baixado do Google e copie tudo.' using errcode = '22023';
  end;
  v_email := lower(v_json ->> 'client_email');
  if v_json ->> 'type' is distinct from 'service_account'
     or v_email is null or v_email !~ '^[^@\s]+@[^@\s]+\.iam\.gserviceaccount\.com$'
     or coalesce(v_json ->> 'private_key', '') !~ 'BEGIN PRIVATE KEY' then
    raise exception 'Esta não é uma chave de conta de serviço do Google (faltam "type", "client_email" ou "private_key").' using errcode = '22023';
  end if;
  select id into v_secret from vault.secrets where name = 'google_sheets_key';
  if v_secret is null then
    perform vault.create_secret(p_key, 'google_sheets_key', 'Chave da conta de serviço do Google (leitura das planilhas)');
  else
    perform vault.update_secret(v_secret, p_key);
  end if;
  update public.sheets_settings
     set service_account_email = v_email, has_key = true, key_updated_at = now(),
         last_test_at = null, last_test_ok = null, last_test_error = null,
         updated_at = now(), updated_by = (select auth.uid())
   where id;
  insert into public.audit_logs (actor_id, action, target_type, target_id, details)
  values ((select auth.uid()), 'sheets_settings.update', 'sheets_settings', 'google', jsonb_build_object('conta', v_email));
  return v_email;
end;
$$;
revoke all on function private.sheets_settings_save_impl(text) from public, anon;
grant execute on function private.sheets_settings_save_impl(text) to authenticated;
create function public.sheets_settings_save(p_key text)
returns text language sql set search_path = ''
as $$ select private.sheets_settings_save_impl(p_key) $$;
revoke all on function public.sheets_settings_save(text) from public, anon;
grant execute on function public.sheets_settings_save(text) to authenticated;

create function private.sheets_settings_remove_key_impl()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.current_user_role() is distinct from 'admin' then
    raise exception 'Só o administrador configura o Google Sheets.' using errcode = '42501';
  end if;
  -- Esvazia a chave no cofre (o servidor trata chave vazia como "sem chave").
  perform vault.update_secret(s.id, '') from vault.secrets s where s.name = 'google_sheets_key';
  update public.sheets_settings
     set has_key = false, key_updated_at = now(), last_test_at = null, last_test_ok = null, last_test_error = null,
         updated_at = now(), updated_by = (select auth.uid())
   where id;
  insert into public.audit_logs (actor_id, action, target_type, target_id, details)
  values ((select auth.uid()), 'sheets_settings.remove_key', 'sheets_settings', 'google', '{}'::jsonb);
end;
$$;
revoke all on function private.sheets_settings_remove_key_impl() from public, anon;
grant execute on function private.sheets_settings_remove_key_impl() to authenticated;
create function public.sheets_settings_remove_key()
returns void language sql set search_path = ''
as $$ select private.sheets_settings_remove_key_impl() $$;
revoke all on function public.sheets_settings_remove_key() from public, anon;
grant execute on function public.sheets_settings_remove_key() to authenticated;

-- Só o servidor lê a chave.
create function public.sheets_key_get()
returns text
language sql
stable
security definer
set search_path = ''
as $$ select decrypted_secret from vault.decrypted_secrets where name = 'google_sheets_key' $$;
revoke all on function public.sheets_key_get() from public, anon, authenticated;
grant execute on function public.sheets_key_get() to service_role;

-- -----------------------------------------------------------------------------
-- Planilha conectada a um cliente (o modelo aceita mais de uma por cliente)
-- -----------------------------------------------------------------------------
-- Campos internos que podem ser ligados a colunas da planilha.
create function private.ri_mapping_fields()
returns text[]
language sql
immutable
set search_path = ''
as $$ select array['record_id', 'contact_date', 'contact_key', 'profile', 'account_id', 'campaign_id', 'campaign_name',
                   'adset_id', 'adset_name', 'ad_id', 'ad_name', 'status', 'sale_date', 'sale_value'] $$;

create table public.ri_sources (
  id                uuid primary key default gen_random_uuid(),
  client_id         uuid not null references public.clients (id) on delete cascade,
  spreadsheet_id    text not null check (spreadsheet_id ~ '^[A-Za-z0-9_-]{20,100}$'),
  spreadsheet_title text check (char_length(spreadsheet_title) <= 300),
  sheet_name        text not null check (char_length(sheet_name) between 1 and 100),
  header_row        integer not null default 1 check (header_row between 1 and 50),
  -- campo interno → nome da coluna (cabeçalho) na planilha
  mapping           jsonb not null default '{}'::jsonb check (jsonb_typeof(mapping) = 'object'),
  -- valor da planilha (normalizado: minúsculas, sem acento) → perfil
  profile_rules     jsonb not null default '{}'::jsonb check (jsonb_typeof(profile_rules) = 'object'),
  enabled           boolean not null default true,
  created_at        timestamptz not null default now(),
  created_by        uuid references auth.users (id) on delete set null,
  updated_at        timestamptz not null default now(),
  updated_by        uuid references auth.users (id) on delete set null,
  unique (client_id, spreadsheet_id, sheet_name)
);
comment on table public.ri_sources is
  'Etapa 39.1: planilha do Google Sheets de cada cliente (aba, cabeçalho, mapeamento das colunas e regras dos perfis comerciais).';
create index ri_sources_client_idx on public.ri_sources (client_id);
create index ri_sources_created_by_idx on public.ri_sources (created_by);
create index ri_sources_updated_by_idx on public.ri_sources (updated_by);
create trigger ri_sources_touch_updated_at before update on public.ri_sources
  for each row execute function private.touch_updated_at();
alter table public.ri_sources enable row level security;
revoke all on public.ri_sources from anon, authenticated;
grant select on public.ri_sources to authenticated;
create policy "Equipe vê as planilhas dos clientes liberados" on public.ri_sources for select to authenticated
  using ((select private.current_user_role()) <> 'cliente' and (select private.can_view_client(client_id)));

-- Criar ou alterar a planilha de um cliente (admin e gestor do cliente).
create function private.ri_source_save_impl(
  p_id uuid, p_client_id uuid, p_spreadsheet_id text, p_spreadsheet_title text, p_sheet_name text,
  p_header_row integer, p_mapping jsonb, p_profile_rules jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_client uuid;
  v_key text;
  v_val jsonb;
begin
  v_client := coalesce((select client_id from public.ri_sources where id = p_id), p_client_id);
  if p_id is not null and not exists (select 1 from public.ri_sources where id = p_id) then
    raise exception 'Planilha não encontrada.' using errcode = '22023';
  end if;
  if v_client is null or not private.can_edit_client(v_client) then
    raise exception 'Sem permissão para configurar a planilha deste cliente.' using errcode = '42501';
  end if;
  if p_spreadsheet_id is null or p_spreadsheet_id !~ '^[A-Za-z0-9_-]{20,100}$' then
    raise exception 'Link ou ID da planilha inválido.' using errcode = '22023';
  end if;
  if coalesce(btrim(p_sheet_name), '') = '' or char_length(p_sheet_name) > 100 then
    raise exception 'Escolha a aba da planilha.' using errcode = '22023';
  end if;
  if p_header_row is null or p_header_row not between 1 and 50 then
    raise exception 'A linha do cabeçalho deve ficar entre 1 e 50.' using errcode = '22023';
  end if;
  if p_mapping is null or jsonb_typeof(p_mapping) <> 'object' then
    raise exception 'Mapeamento inválido.' using errcode = '22023';
  end if;
  for v_key, v_val in select * from jsonb_each(p_mapping) loop
    if not v_key = any (private.ri_mapping_fields()) or jsonb_typeof(v_val) <> 'string'
       or char_length(v_val #>> '{}') not between 1 and 200 then
      raise exception 'Mapeamento inválido (campo %).', v_key using errcode = '22023';
    end if;
  end loop;
  if coalesce(p_mapping ->> 'profile', '') = '' then
    raise exception 'Escolha a coluna do perfil comercial.' using errcode = '22023';
  end if;
  if p_profile_rules is null or jsonb_typeof(p_profile_rules) <> 'object' then
    raise exception 'Regras dos perfis inválidas.' using errcode = '22023';
  end if;
  if (select count(*) from jsonb_object_keys(p_profile_rules)) > 500 then
    raise exception 'Regras demais (máximo 500 valores).' using errcode = '22023';
  end if;
  for v_key, v_val in select * from jsonb_each(p_profile_rules) loop
    if char_length(v_key) not between 1 and 200
       or jsonb_typeof(v_val) <> 'string'
       or (v_val #>> '{}') not in ('lojista', 'sacoleiro', 'consumidor_final', 'nao_identificado') then
      raise exception 'Regra de perfil inválida (%).', left(v_key, 50) using errcode = '22023';
    end if;
  end loop;

  if p_id is null then
    if exists (select 1 from public.ri_sources where client_id = v_client and spreadsheet_id = p_spreadsheet_id and sheet_name = btrim(p_sheet_name)) then
      raise exception 'Esta aba desta planilha já está conectada a este cliente.' using errcode = '23505';
    end if;
    insert into public.ri_sources (client_id, spreadsheet_id, spreadsheet_title, sheet_name, header_row, mapping, profile_rules, created_by, updated_by)
    values (v_client, p_spreadsheet_id, left(p_spreadsheet_title, 300), btrim(p_sheet_name), p_header_row, p_mapping, p_profile_rules,
            (select auth.uid()), (select auth.uid()))
    returning id into v_id;
  else
    update public.ri_sources
       set spreadsheet_id = p_spreadsheet_id, spreadsheet_title = left(p_spreadsheet_title, 300), sheet_name = btrim(p_sheet_name),
           header_row = p_header_row, mapping = p_mapping, profile_rules = p_profile_rules, updated_by = (select auth.uid())
     where id = p_id;
    v_id := p_id;
  end if;
  insert into public.audit_logs (actor_id, action, target_type, target_id, details)
  values ((select auth.uid()), case when p_id is null then 'ri_source.create' else 'ri_source.update' end, 'ri_source', v_id::text,
          jsonb_build_object('cliente', v_client, 'planilha', p_spreadsheet_id, 'aba', btrim(p_sheet_name),
                             'colunas', (select count(*) from jsonb_object_keys(p_mapping)),
                             'regras', (select count(*) from jsonb_object_keys(p_profile_rules))));
  return v_id;
end;
$$;
revoke all on function private.ri_source_save_impl(uuid, uuid, text, text, text, integer, jsonb, jsonb) from public, anon;
grant execute on function private.ri_source_save_impl(uuid, uuid, text, text, text, integer, jsonb, jsonb) to authenticated;
create function public.ri_source_save(
  p_id uuid, p_client_id uuid, p_spreadsheet_id text, p_spreadsheet_title text, p_sheet_name text,
  p_header_row integer, p_mapping jsonb, p_profile_rules jsonb)
returns uuid language sql set search_path = ''
as $$ select private.ri_source_save_impl(p_id, p_client_id, p_spreadsheet_id, p_spreadsheet_title, p_sheet_name, p_header_row, p_mapping, p_profile_rules) $$;
revoke all on function public.ri_source_save(uuid, uuid, text, text, text, integer, jsonb, jsonb) from public, anon;
grant execute on function public.ri_source_save(uuid, uuid, text, text, text, integer, jsonb, jsonb) to authenticated;
