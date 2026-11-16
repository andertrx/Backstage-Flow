-- Fase 35.2 (passo 1) — Campaign Builder: permissões por pessoa e rascunhos de campanha.
-- NADA é publicado no Meta aqui. Só guarda quem pode fazer o quê e os rascunhos (campanha → conjuntos → anúncios, em JSON).
-- Ver o módulo: administrador, gestor e operador (mesma regra do Criador de Anúncios). Criar, editar e publicar: por pessoa; administrador tem tudo.
-- Rascunho nunca é apagado: é arquivado.

-- -----------------------------------------------------------------------------
-- Permissões por pessoa
-- -----------------------------------------------------------------------------
create table public.builder_permissions (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  can_create  boolean not null default false,
  can_edit    boolean not null default false,
  can_publish boolean not null default false,
  updated_by  uuid references auth.users (id) on delete set null,
  updated_at  timestamptz not null default now()
);
comment on table public.builder_permissions is 'Fase 35.2: o que cada pessoa pode fazer no Campaign Builder (criar, editar, publicar). Administrador tem tudo sem precisar de linha. Guardada enquanto o usuário existir.';

-- -----------------------------------------------------------------------------
-- Rascunhos
-- -----------------------------------------------------------------------------
create table public.builder_drafts (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references public.clients (id),
  ad_account_id uuid references public.ad_accounts (id),
  name          text not null check (char_length(btrim(name)) between 2 and 120),
  data          jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object' and pg_column_size(data) <= 200000),
  version       integer not null default 1,
  archived_at   timestamptz,
  created_by    uuid references auth.users (id) on delete set null,
  updated_by    uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
comment on table public.builder_drafts is 'Fase 35.2: rascunho de campanha do Campaign Builder (data = campanha, conjuntos e anúncios em JSON). Permanente: arquivado_em, nunca apagado. version evita que duas pessoas sobrescrevam uma à outra.';
create index builder_drafts_client_idx on public.builder_drafts (client_id, updated_at desc) where archived_at is null;
create index builder_drafts_account_idx on public.builder_drafts (ad_account_id) where ad_account_id is not null;
create index builder_permissions_updated_by_idx on public.builder_permissions (updated_by);
create index builder_drafts_created_by_idx on public.builder_drafts (created_by);
create index builder_drafts_updated_by_idx on public.builder_drafts (updated_by);

alter table public.builder_permissions enable row level security;
alter table public.builder_drafts enable row level security;
revoke all on table public.builder_permissions, public.builder_drafts from anon, authenticated;
grant select on table public.builder_drafts to authenticated;

-- Quem vê o módulo
create function private.builder_pode_ver()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(private.current_user_role()::text in ('admin', 'gestor', 'operador'), false)
$$;
revoke all on function private.builder_pode_ver() from public, anon;
grant execute on function private.builder_pode_ver() to authenticated;

-- Uma permissão da pessoa logada: 'create' | 'edit' | 'publish'
create function private.builder_can(p_what text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare r public.builder_permissions;
begin
  if not private.builder_pode_ver() then return false; end if;
  if private.is_admin() then return true; end if;
  select * into r from public.builder_permissions where user_id = (select auth.uid());
  if r.user_id is null then return false; end if;
  return case p_what when 'create' then r.can_create when 'edit' then r.can_edit when 'publish' then r.can_publish else false end;
end;
$$;
revoke all on function private.builder_can(text) from public, anon;
grant execute on function private.builder_can(text) to authenticated;

create policy "Campaign Builder: vê os rascunhos dos clientes que enxerga" on public.builder_drafts for select to authenticated
  using ((select private.builder_pode_ver()) and (select private.can_view_client(client_id)));

-- Sem senha, token ou cartão no rascunho (mesma regra do Criador de Anúncios)
-- (private.ads_builder_sem_segredo já existe)

-- -----------------------------------------------------------------------------
-- Minhas permissões
-- -----------------------------------------------------------------------------
create function private.builder_my_permissions_impl()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  return jsonb_build_object(
    'ver', private.builder_pode_ver(),
    'criar', private.builder_can('create'),
    'editar', private.builder_can('edit'),
    'publicar', private.builder_can('publish'));
end;
$$;

-- Lista de pessoas e permissões (só administrador)
create function private.builder_permissions_list_impl()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'Só o administrador vê quem pode o quê.' using errcode = '42501'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('user_id', p.id, 'nome', p.full_name, 'papel', p.role,
            'criar', coalesce(b.can_create, false), 'editar', coalesce(b.can_edit, false), 'publicar', coalesce(b.can_publish, false))
            order by lower(p.full_name)), '[]')
            from public.profiles p left join public.builder_permissions b on b.user_id = p.id
           where p.active and p.role::text in ('gestor', 'operador'));
end;
$$;

create function private.builder_permission_save_impl(p_user uuid, p_create boolean, p_edit boolean, p_publish boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v_role text;
begin
  if not private.is_admin() then raise exception 'Só o administrador muda quem pode o quê.' using errcode = '42501'; end if;
  select role::text into v_role from public.profiles where id = p_user and active;
  if v_role is null then raise exception 'Pessoa não encontrada.' using errcode = '22023'; end if;
  if v_role not in ('gestor', 'operador') then raise exception 'Só gestor e operador recebem permissões do Campaign Builder.' using errcode = '22023'; end if;
  -- Quem cria ou publica precisa poder editar o que criou.
  if (coalesce(p_publish, false) or coalesce(p_create, false)) and not coalesce(p_edit, false) then
    raise exception 'Para criar ou publicar, a pessoa também precisa poder editar.' using errcode = '22023';
  end if;
  insert into public.builder_permissions (user_id, can_create, can_edit, can_publish, updated_by, updated_at)
  values (p_user, coalesce(p_create, false), coalesce(p_edit, false), coalesce(p_publish, false), (select auth.uid()), now())
  on conflict (user_id) do update set can_create = excluded.can_create, can_edit = excluded.can_edit,
    can_publish = excluded.can_publish, updated_by = excluded.updated_by, updated_at = now();
  insert into public.audit_logs (actor_id, action, target_type, target_id, details)
  values ((select auth.uid()), 'builder.permissao', 'user', p_user::text,
          jsonb_build_object('criar', coalesce(p_create, false), 'editar', coalesce(p_edit, false), 'publicar', coalesce(p_publish, false)));
end;
$$;

-- -----------------------------------------------------------------------------
-- Rascunhos: listar, salvar, arquivar
-- -----------------------------------------------------------------------------
create function private.builder_draft_list_impl(p_client uuid default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.builder_pode_ver() then raise exception 'Sem permissão para o Campaign Builder.' using errcode = '42501'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'client_id', d.client_id, 'client_name', c.name,
            'ad_account_id', d.ad_account_id, 'ad_account_name', a.name, 'name', d.name, 'version', d.version,
            'updated_at', d.updated_at, 'updated_by_name', u.full_name) order by d.updated_at desc), '[]')
            from public.builder_drafts d
            join public.clients c on c.id = d.client_id
            left join public.ad_accounts a on a.id = d.ad_account_id
            left join public.profiles u on u.id = d.updated_by
           where d.archived_at is null
             and (p_client is null or d.client_id = p_client)
             and private.can_view_client(d.client_id));
end;
$$;

-- Um rascunho inteiro (com os dados)
create function private.builder_draft_get_impl(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare d public.builder_drafts;
begin
  if not private.builder_pode_ver() then raise exception 'Sem permissão para o Campaign Builder.' using errcode = '42501'; end if;
  select * into d from public.builder_drafts where id = p_id and archived_at is null;
  if d.id is null or not private.can_view_client(d.client_id) then raise exception 'Rascunho não encontrado.' using errcode = '22023'; end if;
  return jsonb_build_object('id', d.id, 'client_id', d.client_id, 'ad_account_id', d.ad_account_id, 'name', d.name,
    'data', d.data, 'version', d.version, 'updated_at', d.updated_at);
end;
$$;

-- Salvar: sem p_id cria (precisa "criar"); com p_id edita (precisa "editar") e confere a versão.
create function private.builder_draft_save_impl(p_id uuid, p_version integer, p_client uuid, p_account uuid, p_name text, p_data jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_data jsonb := coalesce(p_data, '{}'::jsonb);
  d public.builder_drafts;
begin
  if not private.builder_pode_ver() then raise exception 'Sem permissão para o Campaign Builder.' using errcode = '42501'; end if;
  if char_length(v_name) < 2 or char_length(v_name) > 120 then raise exception 'Dê um nome ao rascunho (2 a 120 letras).' using errcode = '22023'; end if;
  if jsonb_typeof(v_data) <> 'object' then raise exception 'Dados do rascunho inválidos.' using errcode = '22023'; end if;
  if pg_column_size(v_data) > 200000 then raise exception 'Rascunho grande demais.' using errcode = '22023'; end if;
  perform private.ads_builder_sem_segredo(v_data::text || ' ' || v_name);

  if p_id is null then
    if not private.builder_can('create') then raise exception 'Você não tem permissão para criar rascunhos.' using errcode = '42501'; end if;
    if p_client is null or not private.can_edit_client(p_client) then
      raise exception 'Você não tem acesso a este cliente.' using errcode = '42501';
    end if;
    if p_account is not null and not exists (
      select 1 from public.ad_accounts a where a.id = p_account and a.client_id = p_client and a.platform_id = 'meta' and a.unlinked_at is null) then
      raise exception 'Esta conta de anúncio não é do Meta ou não pertence ao cliente.' using errcode = '22023';
    end if;
    insert into public.builder_drafts (client_id, ad_account_id, name, data, created_by, updated_by)
    values (p_client, p_account, v_name, v_data, (select auth.uid()), (select auth.uid()))
    returning * into d;
    insert into public.audit_logs (actor_id, action, target_type, target_id, details)
    values ((select auth.uid()), 'builder.rascunho.criar', 'builder_draft', d.id::text, jsonb_build_object('name', v_name, 'client_id', p_client));
  else
    if not private.builder_can('edit') then raise exception 'Você não tem permissão para editar rascunhos.' using errcode = '42501'; end if;
    select * into d from public.builder_drafts where id = p_id and archived_at is null for update;
    if d.id is null then raise exception 'Rascunho não encontrado.' using errcode = '22023'; end if;
    if not private.can_edit_client(d.client_id) then raise exception 'Você não tem acesso a este cliente.' using errcode = '42501'; end if;
    if p_version is distinct from d.version then
      raise exception 'Outra pessoa alterou este rascunho. Recarregue antes de salvar.' using errcode = '40001';
    end if;
    update public.builder_drafts set name = v_name, data = v_data, version = version + 1, updated_by = (select auth.uid()), updated_at = now()
     where id = d.id returning * into d;
  end if;
  return jsonb_build_object('id', d.id, 'version', d.version, 'updated_at', d.updated_at);
end;
$$;

create function private.builder_draft_archive_impl(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare d public.builder_drafts;
begin
  if not private.builder_can('edit') then raise exception 'Você não tem permissão para arquivar rascunhos.' using errcode = '42501'; end if;
  select * into d from public.builder_drafts where id = p_id and archived_at is null for update;
  if d.id is null then raise exception 'Rascunho não encontrado.' using errcode = '22023'; end if;
  if not private.can_edit_client(d.client_id) then raise exception 'Você não tem acesso a este cliente.' using errcode = '42501'; end if;
  update public.builder_drafts set archived_at = now(), updated_by = (select auth.uid()), updated_at = now() where id = d.id;
  insert into public.audit_logs (actor_id, action, target_type, target_id, details)
  values ((select auth.uid()), 'builder.rascunho.arquivar', 'builder_draft', d.id::text, jsonb_build_object('name', d.name));
end;
$$;

-- -----------------------------------------------------------------------------
-- Funções públicas finas + permissões de execução
-- -----------------------------------------------------------------------------
revoke all on function
  private.builder_my_permissions_impl(), private.builder_permissions_list_impl(),
  private.builder_permission_save_impl(uuid, boolean, boolean, boolean),
  private.builder_draft_list_impl(uuid), private.builder_draft_get_impl(uuid),
  private.builder_draft_save_impl(uuid, integer, uuid, uuid, text, jsonb), private.builder_draft_archive_impl(uuid)
  from public, anon, authenticated;
grant execute on function
  private.builder_my_permissions_impl(), private.builder_permissions_list_impl(),
  private.builder_permission_save_impl(uuid, boolean, boolean, boolean),
  private.builder_draft_list_impl(uuid), private.builder_draft_get_impl(uuid),
  private.builder_draft_save_impl(uuid, integer, uuid, uuid, text, jsonb), private.builder_draft_archive_impl(uuid)
  to authenticated;

create function public.builder_my_permissions() returns jsonb language sql stable set search_path = '' as $$ select private.builder_my_permissions_impl() $$;
create function public.builder_permissions_list() returns jsonb language sql stable set search_path = '' as $$ select private.builder_permissions_list_impl() $$;
create function public.builder_permission_save(p_user uuid, p_create boolean, p_edit boolean, p_publish boolean)
returns void language sql set search_path = '' as $$ select private.builder_permission_save_impl(p_user, p_create, p_edit, p_publish) $$;
create function public.builder_draft_list(p_client uuid default null) returns jsonb language sql stable set search_path = '' as $$ select private.builder_draft_list_impl(p_client) $$;
create function public.builder_draft_get(p_id uuid) returns jsonb language sql stable set search_path = '' as $$ select private.builder_draft_get_impl(p_id) $$;
create function public.builder_draft_save(p_id uuid, p_version integer, p_client uuid, p_account uuid, p_name text, p_data jsonb)
returns jsonb language sql set search_path = '' as $$ select private.builder_draft_save_impl(p_id, p_version, p_client, p_account, p_name, p_data) $$;
create function public.builder_draft_archive(p_id uuid) returns void language sql set search_path = '' as $$ select private.builder_draft_archive_impl(p_id) $$;

revoke all on function
  public.builder_my_permissions(), public.builder_permissions_list(), public.builder_permission_save(uuid, boolean, boolean, boolean),
  public.builder_draft_list(uuid), public.builder_draft_get(uuid), public.builder_draft_save(uuid, integer, uuid, uuid, text, jsonb),
  public.builder_draft_archive(uuid)
  from public, anon;
grant execute on function
  public.builder_my_permissions(), public.builder_permissions_list(), public.builder_permission_save(uuid, boolean, boolean, boolean),
  public.builder_draft_list(uuid), public.builder_draft_get(uuid), public.builder_draft_save(uuid, integer, uuid, uuid, text, jsonb),
  public.builder_draft_archive(uuid)
  to authenticated;
