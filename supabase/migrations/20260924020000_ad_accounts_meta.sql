-- =============================================================================
-- ETAPA 3 — Conexões com plataformas e contas de anúncio (começando pelo Meta)
--
-- Cria:
--   * tabela public.platform_connections → cada "conexão" (ex.: usuário do sistema do BM)
--       O TOKEN NÃO FICA NESTA TABELA: fica criptografado no Supabase Vault;
--       aqui guardamos só o id do segredo, invisível para o site.
--   * tabela public.ad_accounts          → contas de anúncio vinculadas a clientes
--   * tabela public.ad_account_assets    → páginas e perfis do Instagram de cada conta
--   * tabela public.sync_state           → estado de sincronização de cada conta
--   * funções de cofre (somente servidor) para gravar/ler/apagar o token
--   * auditoria com autor informado pelo servidor (coluna updated_by)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Tipos
-- -----------------------------------------------------------------------------
create type public.connection_status as enum ('ativa', 'erro', 'revogada');

-- Status NORMALIZADO da conta (igual para todas as plataformas).
create type public.ad_account_status as enum (
  'ativa',
  'atencao',
  'restrita',
  'desativada',
  'pagamento_pendente',
  'encerrada',
  'desconhecida'
);

create type public.ad_account_asset_type as enum ('page', 'instagram');

-- -----------------------------------------------------------------------------
-- Auditoria: autor pode vir do login (site) ou da coluna updated_by (servidor)
-- -----------------------------------------------------------------------------
create or replace function private.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_type text := tg_argv[0];
  key_column  text := coalesce(tg_argv[1], case tg_argv[0] when 'client' then 'id' else 'client_id' end);
  before_row  jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  after_row   jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  changed     jsonb;
  actor       uuid;
begin
  if tg_op = 'UPDATE' then
    select jsonb_object_agg(key, jsonb_build_object('before', before_row -> key, 'after', value))
      into changed
    from jsonb_each(after_row)
    where key not in ('updated_at', 'updated_by') and value is distinct from before_row -> key;
    if changed is null then return new; end if;
  else
    changed := coalesce(after_row, before_row);
  end if;

  actor := coalesce((select auth.uid()), nullif(coalesce(after_row, before_row) ->> 'updated_by', '')::uuid);

  insert into public.audit_logs (actor_id, action, target_type, target_id, details)
  values (actor, target_type || '.' || lower(tg_op), target_type,
          coalesce(after_row, before_row) ->> key_column, changed);

  return coalesce(new, old);
end;
$$;

-- -----------------------------------------------------------------------------
-- Conexões
-- -----------------------------------------------------------------------------
create table public.platform_connections (
  id                 uuid primary key default gen_random_uuid(),
  platform_id        text not null references public.platforms (id),
  label              text not null check (char_length(btrim(label)) between 2 and 80),
  status             public.connection_status not null default 'ativa',
  external_user_id   text,
  external_user_name text,
  vault_secret_id    uuid,
  token_expires_at   timestamptz,
  last_checked_at    timestamptz,
  last_error         text check (last_error is null or char_length(last_error) <= 500),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  created_by         uuid references auth.users (id) on delete set null,
  updated_by         uuid references auth.users (id) on delete set null
);

comment on table public.platform_connections is 'Conexões com as plataformas. O token fica no Vault; vault_secret_id nunca é exposto ao site.';

create index platform_connections_platform_idx on public.platform_connections (platform_id, status);
create index platform_connections_created_by_idx on public.platform_connections (created_by);
create index platform_connections_updated_by_idx on public.platform_connections (updated_by);

create trigger platform_connections_touch_updated_at
  before update on public.platform_connections
  for each row execute function private.touch_updated_at();

create trigger platform_connections_audit
  after insert or update on public.platform_connections
  for each row execute function private.audit_row_change('connection', 'id');

-- -----------------------------------------------------------------------------
-- Contas de anúncio
-- -----------------------------------------------------------------------------
create table public.ad_accounts (
  id               uuid primary key default gen_random_uuid(),
  platform_id      text not null references public.platforms (id),
  external_id      text not null check (external_id ~ '^[0-9A-Za-z_-]{1,64}$'),
  client_id        uuid not null references public.clients (id),
  connection_id    uuid references public.platform_connections (id) on delete set null,
  name             text not null,
  currency         text check (currency is null or currency ~ '^[A-Z]{3}$'),
  timezone         text,
  status           public.ad_account_status not null default 'desconhecida',
  raw_status       text,
  status_reason    text,
  business_id      text,
  business_name    text,
  is_prepay        boolean,
  is_demo          boolean not null default false,
  linked_at        timestamptz not null default now(),
  unlinked_at      timestamptz,
  details_updated_at timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  updated_by       uuid references auth.users (id) on delete set null
);

comment on table public.ad_accounts is 'Contas de anúncio vinculadas a clientes. Desvincular = preencher unlinked_at (histórico preservado).';
comment on column public.ad_accounts.external_id is 'Id na plataforma (Meta: só os números, sem "act_"; Google: Customer ID sem traços).';
comment on column public.ad_accounts.raw_status is 'Status exatamente como a plataforma informou (ex.: account_status=3).';

-- Uma conta só pode estar vinculada (ativa) a um cliente por vez.
create unique index ad_accounts_active_external_key
  on public.ad_accounts (platform_id, external_id) where unlinked_at is null;
create index ad_accounts_client_idx on public.ad_accounts (client_id, platform_id) where unlinked_at is null;
create index ad_accounts_connection_idx on public.ad_accounts (connection_id);
create index ad_accounts_updated_by_idx on public.ad_accounts (updated_by);

create trigger ad_accounts_touch_updated_at
  before update on public.ad_accounts
  for each row execute function private.touch_updated_at();

create trigger ad_accounts_audit
  after insert or update on public.ad_accounts
  for each row execute function private.audit_row_change('ad_account', 'id');

-- -----------------------------------------------------------------------------
-- Páginas / Instagram de cada conta
-- -----------------------------------------------------------------------------
create table public.ad_account_assets (
  id            uuid primary key default gen_random_uuid(),
  ad_account_id uuid not null references public.ad_accounts (id) on delete cascade,
  asset_type    public.ad_account_asset_type not null,
  external_id   text not null,
  name          text,
  parent_external_id text,
  updated_at    timestamptz not null default now(),
  unique (ad_account_id, asset_type, external_id)
);

comment on table public.ad_account_assets is 'Páginas do Facebook e perfis do Instagram disponíveis para a conta (fotografia da última atualização).';

-- -----------------------------------------------------------------------------
-- Estado de sincronização (a sincronização em si chega na Etapa 16)
-- -----------------------------------------------------------------------------
create table public.sync_state (
  ad_account_id      uuid primary key references public.ad_accounts (id) on delete cascade,
  status             text not null default 'pendente'
                     check (status in ('pendente', 'executando', 'sucesso', 'erro')),
  last_attempt_at    timestamptz,
  last_success_at    timestamptz,
  next_run_at        timestamptz,
  last_error_code    text,
  last_error_message text,
  locked_until       timestamptz,
  updated_at         timestamptz not null default now()
);

comment on table public.sync_state is 'Uma linha por conta: última/próxima sincronização, trava e último erro.';

create trigger sync_state_touch_updated_at
  before update on public.sync_state
  for each row execute function private.touch_updated_at();

-- -----------------------------------------------------------------------------
-- Cofre de tokens (Supabase Vault) — SOMENTE o servidor (service_role) executa
-- -----------------------------------------------------------------------------
create function public.connection_secret_set(p_connection_id uuid, p_secret text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing uuid;
  created  uuid;
begin
  select vault_secret_id into existing from public.platform_connections where id = p_connection_id;
  if not found then raise exception 'conexão não encontrada'; end if;

  if existing is not null then
    perform vault.update_secret(existing, p_secret);
  else
    created := vault.create_secret(p_secret, 'connection:' || p_connection_id::text, 'Token de conexão com plataforma de anúncios');
    update public.platform_connections set vault_secret_id = created where id = p_connection_id;
  end if;
end;
$$;

create function public.connection_secret_get(p_connection_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select s.decrypted_secret
  from public.platform_connections c
  join vault.decrypted_secrets s on s.id = c.vault_secret_id
  where c.id = p_connection_id and c.status <> 'revogada'
$$;

create function public.connection_secret_delete(p_connection_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing uuid;
begin
  select vault_secret_id into existing from public.platform_connections where id = p_connection_id;
  if existing is not null then
    delete from vault.secrets where id = existing;
    update public.platform_connections set vault_secret_id = null where id = p_connection_id;
  end if;
end;
$$;

revoke all on function public.connection_secret_set(uuid, text) from public, anon, authenticated;
revoke all on function public.connection_secret_get(uuid) from public, anon, authenticated;
revoke all on function public.connection_secret_delete(uuid) from public, anon, authenticated;
grant execute on function public.connection_secret_set(uuid, text) to service_role;
grant execute on function public.connection_secret_get(uuid) to service_role;
grant execute on function public.connection_secret_delete(uuid) to service_role;

-- -----------------------------------------------------------------------------
-- Permissões de tabela: o site só LÊ. Toda escrita passa pelas Edge Functions.
-- -----------------------------------------------------------------------------
revoke all on public.platform_connections from anon, authenticated;
revoke all on public.ad_accounts from anon, authenticated;
revoke all on public.ad_account_assets from anon, authenticated;
revoke all on public.sync_state from anon, authenticated;

-- vault_secret_id fica de fora: o site nem sabe onde o token está guardado.
grant select (id, platform_id, label, status, external_user_id, external_user_name, token_expires_at,
              last_checked_at, last_error, created_at, updated_at, created_by)
  on public.platform_connections to authenticated;
grant select on public.ad_accounts to authenticated;
grant select on public.ad_account_assets to authenticated;
grant select on public.sync_state to authenticated;

alter table public.platform_connections enable row level security;
alter table public.ad_accounts enable row level security;
alter table public.ad_account_assets enable row level security;
alter table public.sync_state enable row level security;

create policy "Admin e gestor veem as conexões (sem o token)"
  on public.platform_connections for select to authenticated
  using ((select private.current_user_role()) in ('admin', 'gestor'));

create policy "Vê contas dos clientes liberados"
  on public.ad_accounts for select to authenticated
  using ((select private.can_view_client(client_id)));

create policy "Vê páginas/Instagram das contas visíveis"
  on public.ad_account_assets for select to authenticated
  using (exists (
    select 1 from public.ad_accounts a
    where a.id = ad_account_id and (select private.can_view_client(a.client_id))
  ));

create policy "Vê o estado de sincronização das contas visíveis"
  on public.sync_state for select to authenticated
  using (exists (
    select 1 from public.ad_accounts a
    where a.id = ad_account_id and (select private.can_view_client(a.client_id))
  ));
