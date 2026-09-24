-- =============================================================================
-- ETAPA 2 — Clientes
--
-- Cria:
--   * tabela public.platforms          → plataformas suportadas (meta, google; futuras)
--   * tipo   public.client_status      → ativo / pausado / encerrado
--   * tabela public.clients            → cadastro de clientes da agência
--   * tabela public.user_client_access → quais clientes cada usuário pode ver
--   * validação de CNPJ (numérico e alfanumérico — regra da Receita a partir de 07/2026)
--   * auditoria automática de clientes e acessos
--   * regras RLS: cada usuário só enxerga os clientes liberados para ele
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Plataformas (tabela de referência; nova plataforma = nova linha)
-- -----------------------------------------------------------------------------
create table public.platforms (
  id         text primary key check (id ~ '^[a-z][a-z0-9_]{1,30}$'),
  name       text not null,
  enabled    boolean not null default true,
  sort_order smallint not null default 0
);

comment on table public.platforms is 'Plataformas de anúncio suportadas. Adicionar TikTok/LinkedIn no futuro = inserir linha.';

insert into public.platforms (id, name, enabled, sort_order) values
  ('meta', 'Meta Ads', true, 1),
  ('google', 'Google Ads', true, 2);

revoke all on public.platforms from anon, authenticated;
grant select on public.platforms to authenticated;
alter table public.platforms enable row level security;
create policy "Usuários logados leem as plataformas"
  on public.platforms for select to authenticated using (true);

-- -----------------------------------------------------------------------------
-- Validação de CNPJ
--   Aceita o formato numérico e o novo alfanumérico (letras nas 12 primeiras
--   posições). Cálculo oficial: valor de cada caractere = código ASCII - 48,
--   pesos 5..2,9..2 e 6..2,9..2, módulo 11.
--   Recebe o CNPJ já normalizado (sem pontuação, maiúsculo).
-- -----------------------------------------------------------------------------
create function private.is_valid_cnpj(cnpj text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  w1 int[] := array[5,4,3,2,9,8,7,6,5,4,3,2];
  w2 int[] := array[6,5,4,3,2,9,8,7,6,5,4,3,2];
  s int;
  r int;
  d1 int;
  d2 int;
  i int;
begin
  if cnpj is null or cnpj !~ '^[0-9A-Z]{12}[0-9]{2}$' then return false; end if;
  if cnpj ~ '^(.)\1{13}$' then return false; end if; -- 00000000000000, 11111111111111...

  s := 0;
  for i in 1..12 loop s := s + (ascii(substr(cnpj, i, 1)) - 48) * w1[i]; end loop;
  r := s % 11;
  d1 := case when r < 2 then 0 else 11 - r end;

  s := 0;
  for i in 1..13 loop s := s + (ascii(substr(cnpj, i, 1)) - 48) * w2[i]; end loop;
  r := s % 11;
  d2 := case when r < 2 then 0 else 11 - r end;

  return substr(cnpj, 13, 1)::int = d1 and substr(cnpj, 14, 1)::int = d2;
end;
$$;

grant execute on function private.is_valid_cnpj(text) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Clientes
-- -----------------------------------------------------------------------------
create type public.client_status as enum ('ativo', 'pausado', 'encerrado');

create table public.clients (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(btrim(name)) between 2 and 120),
  company     text check (company is null or char_length(company) <= 160),
  cnpj        text check (cnpj is null or private.is_valid_cnpj(cnpj)),
  owner_name  text check (owner_name is null or char_length(owner_name) <= 120),
  phone       text check (phone is null or phone ~ '^\+?[0-9]{10,15}$'),
  email       text check (email is null or (char_length(email) <= 254 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  notes       text check (notes is null or char_length(notes) <= 5000),
  status      public.client_status not null default 'ativo',
  timezone    text not null default 'America/Sao_Paulo' check (timezone ~ '^[A-Za-z_]+(/[A-Za-z0-9_+-]+)+$'),
  is_demo     boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid references auth.users (id) on delete set null
);

comment on table public.clients is 'Clientes da agência. Nunca apagar: usar status = encerrado.';
comment on column public.clients.cnpj is 'Somente letras/números, maiúsculo (aceita o CNPJ alfanumérico).';
comment on column public.clients.phone is 'Somente dígitos, com DDI/DDD (ex.: 5545999998888).';
comment on column public.clients.timezone is 'Fuso do cliente; usado para "hoje/ontem" e fechamento diário.';
comment on column public.clients.is_demo is 'Dado fictício de demonstração (Etapa 27). Nunca confundir com real.';

create unique index clients_cnpj_key on public.clients (cnpj) where cnpj is not null;
create index clients_status_name_idx on public.clients (status, name);
create index clients_created_by_idx on public.clients (created_by);

create trigger clients_touch_updated_at
  before update on public.clients
  for each row execute function private.touch_updated_at();

-- Quem criou é sempre o usuário logado; data de criação não pode ser alterada.
create function private.clients_set_audit_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce((select auth.uid()), new.created_by);
    new.created_at := now();
  else
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;
  return new;
end;
$$;

create trigger clients_set_audit_columns
  before insert or update on public.clients
  for each row execute function private.clients_set_audit_columns();

-- -----------------------------------------------------------------------------
-- Acesso de usuários a clientes
-- -----------------------------------------------------------------------------
create table public.user_client_access (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  client_id  uuid not null references public.clients (id) on delete cascade,
  granted_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (user_id, client_id)
);

comment on table public.user_client_access is 'Clientes liberados para cada usuário não-admin (gestor, operador, visualizador, cliente).';

create index user_client_access_client_idx on public.user_client_access (client_id);
create index user_client_access_granted_by_idx on public.user_client_access (granted_by);

create function private.user_client_access_set_granted_by()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.granted_by := coalesce((select auth.uid()), new.granted_by);
  new.created_at := now();
  return new;
end;
$$;

create trigger user_client_access_set_granted_by
  before insert on public.user_client_access
  for each row execute function private.user_client_access_set_granted_by();

-- Gestor que cadastra um cliente ganha acesso a ele automaticamente.
create function private.grant_creator_access()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.current_user_role() = 'gestor' then
    insert into public.user_client_access (user_id, client_id, granted_by)
    values ((select auth.uid()), new.id, (select auth.uid()))
    on conflict do nothing;
  end if;
  return new;
end;
$$;

create trigger clients_grant_creator_access
  after insert on public.clients
  for each row execute function private.grant_creator_access();

-- -----------------------------------------------------------------------------
-- Funções de permissão por cliente
-- -----------------------------------------------------------------------------
create function private.can_view_client(target uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  -- Usuário inativo/sem perfil tem papel NULL → não vê nada.
  select case
    when private.current_user_role() is null then false
    when private.current_user_role() = 'admin' then true
    else exists (
      select 1 from public.user_client_access a
      where a.user_id = (select auth.uid()) and a.client_id = target
    )
  end
$$;

create function private.can_edit_client(target uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case private.current_user_role()
    when 'admin' then true
    when 'gestor' then exists (
      select 1 from public.user_client_access a
      where a.user_id = (select auth.uid()) and a.client_id = target
    )
    else false
  end
$$;

revoke all on function private.can_view_client(uuid) from public, anon;
revoke all on function private.can_edit_client(uuid) from public, anon;
grant execute on function private.can_view_client(uuid) to authenticated, service_role;
grant execute on function private.can_edit_client(uuid) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Auditoria automática (grava em public.audit_logs)
-- -----------------------------------------------------------------------------
create function private.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_type text := tg_argv[0];
  before_row  jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  after_row   jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  changed     jsonb;
  target      text;
begin
  target := coalesce(after_row, before_row) ->> case target_type when 'client' then 'id' else 'client_id' end;

  if tg_op = 'UPDATE' then
    -- Guarda só os campos que mudaram (antes → depois).
    select jsonb_object_agg(key, jsonb_build_object('before', before_row -> key, 'after', value))
      into changed
    from jsonb_each(after_row)
    where key not in ('updated_at') and value is distinct from before_row -> key;
    if changed is null then return new; end if;
  else
    changed := coalesce(after_row, before_row);
  end if;

  insert into public.audit_logs (actor_id, action, target_type, target_id, details)
  values ((select auth.uid()), target_type || '.' || lower(tg_op), target_type, target, changed);

  return coalesce(new, old);
end;
$$;

create trigger clients_audit
  after insert or update on public.clients
  for each row execute function private.audit_row_change('client');

create trigger user_client_access_audit
  after insert or delete on public.user_client_access
  for each row execute function private.audit_row_change('client_access');

-- -----------------------------------------------------------------------------
-- Permissões de tabela
-- -----------------------------------------------------------------------------
revoke all on public.clients from anon, authenticated;
revoke all on public.user_client_access from anon, authenticated;

-- Colunas que o site pode escrever. id/created_*/is_demo ficam protegidas.
grant select on public.clients to authenticated;
grant insert (id, name, company, cnpj, owner_name, phone, email, notes, status, timezone) on public.clients to authenticated;
grant update (name, company, cnpj, owner_name, phone, email, notes, status, timezone) on public.clients to authenticated;

grant select, insert, delete on public.user_client_access to authenticated;

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.clients enable row level security;
alter table public.user_client_access enable row level security;

create policy "Vê clientes liberados (admin vê todos)"
  on public.clients for select to authenticated
  using ((select private.can_view_client(id)));

create policy "Admin e gestor cadastram clientes"
  on public.clients for insert to authenticated
  with check ((select private.current_user_role()) in ('admin', 'gestor') and not is_demo);

create policy "Admin e gestor responsável editam o cliente"
  on public.clients for update to authenticated
  using ((select private.can_edit_client(id)))
  with check ((select private.can_edit_client(id)));

create policy "Usuário vê os próprios acessos; admin vê todos"
  on public.user_client_access for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_admin()));

create policy "Somente admin libera acesso"
  on public.user_client_access for insert to authenticated
  with check ((select private.is_admin()));

create policy "Somente admin remove acesso"
  on public.user_client_access for delete to authenticated
  using ((select private.is_admin()));
