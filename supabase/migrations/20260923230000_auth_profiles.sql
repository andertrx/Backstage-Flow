-- =============================================================================
-- ETAPA 1 — Usuários, papéis e auditoria
--
-- Cria:
--   * schema  private            → funções e configurações que o site não enxerga
--   * tipo    public.user_role   → os 5 papéis do sistema
--   * tabela  public.profiles    → perfil de cada usuário (1 linha por login)
--   * tabela  public.audit_logs  → quem fez o quê (gestão de usuários, etc.)
--   * tabela  private.app_settings → configurações internas (ex.: e-mail do 1º admin)
--   * gatilho que cria o perfil automaticamente quando um login é criado
--   * regras RLS: cada usuário lê só o próprio perfil; admin lê todos
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Schema privado (não é exposto pela API do Supabase)
-- -----------------------------------------------------------------------------
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

create table private.app_settings (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now()
);
revoke all on private.app_settings from public, anon, authenticated;
grant all on private.app_settings to service_role;

-- -----------------------------------------------------------------------------
-- Papéis
-- -----------------------------------------------------------------------------
create type public.user_role as enum ('admin', 'gestor', 'operador', 'visualizador', 'cliente');

-- -----------------------------------------------------------------------------
-- Perfis
-- -----------------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null,
  full_name   text not null default '' check (char_length(full_name) <= 120),
  role        public.user_role not null default 'visualizador',
  -- Usuário novo nasce INATIVO: só ganha acesso quando um admin ativa.
  active      boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid references auth.users (id) on delete set null
);

comment on table public.profiles is 'Perfil de cada usuário: nome, papel e se está ativo. Nunca apagar: desativar.';
comment on column public.profiles.active is 'Usuários inativos não enxergam nenhum dado (verificado pelo RLS).';

create index profiles_role_idx on public.profiles (role) where active;

-- updated_at automático
create function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function private.touch_updated_at();

-- -----------------------------------------------------------------------------
-- Auditoria
-- -----------------------------------------------------------------------------
create table public.audit_logs (
  id          bigint generated always as identity primary key,
  actor_id    uuid references auth.users (id) on delete set null,
  action      text not null,
  target_type text not null,
  target_id   text,
  details     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

comment on table public.audit_logs is 'Registro permanente de ações administrativas. Gravado apenas pelo servidor.';

create index audit_logs_created_at_idx on public.audit_logs (created_at desc);
create index audit_logs_target_idx on public.audit_logs (target_type, target_id);

-- -----------------------------------------------------------------------------
-- Funções auxiliares das regras de segurança
--   security definer: rodam com permissão do dono para ler profiles sem cair
--   em recursão de RLS. search_path vazio evita sequestro de nomes.
-- -----------------------------------------------------------------------------
create function private.current_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = ''
as $$
  select p.role
  from public.profiles p
  where p.id = (select auth.uid()) and p.active
$$;

create function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(private.current_user_role() = 'admin', false)
$$;

revoke all on function private.current_user_role() from public, anon;
revoke all on function private.is_admin() from public, anon;
grant execute on function private.current_user_role() to authenticated, service_role;
grant execute on function private.is_admin() to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Criação automática do perfil quando um login é criado
--   * Perfil nasce inativo como "visualizador".
--   * Exceção única: o PRIMEIRO administrador. Se o e-mail for igual ao
--     configurado em private.app_settings('bootstrap_admin_email') e ainda não
--     existir nenhum admin, ele nasce admin e ativo.
-- -----------------------------------------------------------------------------
create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  bootstrap_email text;
  is_bootstrap    boolean;
begin
  select s.value into bootstrap_email
  from private.app_settings s
  where s.key = 'bootstrap_admin_email';

  is_bootstrap := bootstrap_email is not null
    and lower(new.email) = lower(bootstrap_email)
    and not exists (select 1 from public.profiles p where p.role = 'admin');

  insert into public.profiles (id, email, full_name, role, active)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    case when is_bootstrap then 'admin'::public.user_role else 'visualizador'::public.user_role end,
    is_bootstrap
  );

  if is_bootstrap then
    insert into public.audit_logs (actor_id, action, target_type, target_id, details)
    values (new.id, 'user.bootstrap_admin', 'user', new.id::text, jsonb_build_object('email', new.email));
  end if;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- Mantém o e-mail do perfil igual ao do login
create function private.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles set email = coalesce(new.email, '') where id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row
  when (old.email is distinct from new.email)
  execute function private.handle_user_email_change();

-- -----------------------------------------------------------------------------
-- Permissões de tabela (o que cada tipo de conexão PODE tentar fazer)
-- -----------------------------------------------------------------------------
revoke all on public.profiles from anon, authenticated;
revoke all on public.audit_logs from anon, authenticated;

grant select on public.profiles to authenticated;
-- O próprio usuário só pode alterar o NOME. Papel e "ativo" só pelo servidor.
grant update (full_name) on public.profiles to authenticated;
grant select on public.audit_logs to authenticated;

-- -----------------------------------------------------------------------------
-- RLS: regras linha a linha
-- -----------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.audit_logs enable row level security;

create policy "Usuário lê o próprio perfil; admin lê todos"
  on public.profiles for select
  to authenticated
  using (id = (select auth.uid()) or (select private.is_admin()));

create policy "Usuário ativo altera o próprio nome"
  on public.profiles for update
  to authenticated
  using (id = (select auth.uid()) and active)
  with check (id = (select auth.uid()) and active);

create policy "Somente admin lê a auditoria"
  on public.audit_logs for select
  to authenticated
  using ((select private.is_admin()));
