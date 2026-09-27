-- =============================================================================
-- Etapa 36.1 — Central de Operações: setores, equipe e permissões
--
--   ops_sectors             → setores (Comercial, Design...), configuráveis
--   ops_members             → quem trabalha na Central: cargo, ativo, reuniões
--   ops_member_sectors      → setor principal e secundários de cada pessoa
--   ops_member_permissions  → o que cada pessoa pode fazer na Central
--
-- Reaproveita login e usuários atuais (profiles). O papel "equipe" enxerga só
-- a Central: as regras de clientes dos módulos de anúncios passam a negar
-- esse papel (visible_client_ids / can_view_client).
-- Nada é apagado: setor sai de uso por "inativo" ou "arquivado".
-- Remoção: supabase/rollback/remover_central_operacoes.sql
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Papel "equipe" não vê clientes pelos módulos de anúncios
-- -----------------------------------------------------------------------------
create or replace function private.visible_client_ids()
returns setof uuid language sql stable security definer set search_path = '' as $$
  select c.id from public.clients c where private.current_user_role() = 'admin'
  union
  select a.client_id from public.user_client_access a
  where a.user_id = (select auth.uid()) and private.current_user_role() is not null
    and private.current_user_role() <> 'equipe'
    and (private.current_user_role() <> 'cliente'
         or exists (select 1 from public.client_portal p where p.client_id = a.client_id and p.login_enabled))
$$;

create or replace function private.can_view_client(target uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select case
    when private.current_user_role() is null then false
    when private.current_user_role() = 'admin' then true
    when private.current_user_role() = 'equipe' then false
    else exists (
      select 1 from public.user_client_access a
      where a.user_id = (select auth.uid()) and a.client_id = target
        and (private.current_user_role() <> 'cliente'
             or exists (select 1 from public.client_portal p where p.client_id = target and p.login_enabled))
    )
  end
$$;

-- -----------------------------------------------------------------------------
-- Tabelas
-- -----------------------------------------------------------------------------
create table public.ops_sectors (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(btrim(name)) between 2 and 60),
  color       text not null default '#7C3AED' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  position    integer not null default 0,
  status      text not null default 'ativo' check (status in ('ativo', 'inativo', 'arquivado')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users (id) on delete set null
);
comment on table public.ops_sectors is 'Etapa 36: setores da Central de Operações (configuráveis). Nunca apagar: inativo/arquivado.';
create unique index ops_sectors_name_uq on public.ops_sectors (lower(btrim(name))) where status <> 'arquivado';
create index ops_sectors_updated_by_idx on public.ops_sectors (updated_by);
create trigger ops_sectors_touch before update on public.ops_sectors for each row execute function private.touch_updated_at();

create table public.ops_members (
  user_id         uuid primary key references public.profiles (id) on delete cascade,
  job_title       text check (char_length(job_title) <= 80),
  active          boolean not null default true,
  joins_meetings  boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  updated_by      uuid references auth.users (id) on delete set null
);
comment on table public.ops_members is 'Etapa 36: pessoas da Central de Operações (cargo, ativo, participa de reuniões). Login e dados pessoais ficam em profiles.';
create index ops_members_updated_by_idx on public.ops_members (updated_by);
create trigger ops_members_touch before update on public.ops_members for each row execute function private.touch_updated_at();

create table public.ops_member_sectors (
  user_id     uuid not null references public.ops_members (user_id) on delete cascade,
  sector_id   uuid not null references public.ops_sectors (id),
  is_primary  boolean not null default false,
  primary key (user_id, sector_id)
);
comment on table public.ops_member_sectors is 'Etapa 36: setor principal (1 por pessoa) e secundários.';
create unique index ops_member_sectors_one_primary on public.ops_member_sectors (user_id) where is_primary;
create index ops_member_sectors_sector_idx on public.ops_member_sectors (sector_id);

create table public.ops_member_permissions (
  user_id     uuid not null references public.ops_members (user_id) on delete cascade,
  permission  text not null check (permission in (
    'ops.access', 'ops.kanban.view', 'ops.tasks.create', 'ops.tasks.edit', 'ops.tasks.archive', 'ops.tasks.assign',
    'ops.tasks.sector', 'ops.cards.move', 'ops.clients.view', 'ops.history.edit', 'ops.meetings.manage',
    'ops.dashboard.view', 'ops.commercial')),
  primary key (user_id, permission)
);
comment on table public.ops_member_permissions is 'Etapa 36: permissões da Central por pessoa. Gerenciar setores, equipe e configurações é só do admin.';

-- -----------------------------------------------------------------------------
-- Permissão: admin pode tudo; os demais, o que foi marcado (com a pessoa ativa)
-- -----------------------------------------------------------------------------
create function private.ops_can(p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when private.current_user_role() is null or private.current_user_role() = 'cliente' then false
    when private.current_user_role() = 'admin' then true
    else exists (
      select 1 from public.ops_members m
       where m.user_id = (select auth.uid()) and m.active
         and exists (select 1 from public.ops_member_permissions a where a.user_id = m.user_id and a.permission = 'ops.access')
         and exists (select 1 from public.ops_member_permissions x where x.user_id = m.user_id and x.permission = p_permission))
  end
$$;
revoke all on function private.ops_can(text) from public, anon;
grant execute on function private.ops_can(text) to authenticated;

-- Leitura: quem acessa a Central vê setores e quem está em qual setor.
-- Escrita: só pelas funções abaixo (admin).
alter table public.ops_sectors enable row level security;
alter table public.ops_members enable row level security;
alter table public.ops_member_sectors enable row level security;
alter table public.ops_member_permissions enable row level security;
revoke all on public.ops_sectors, public.ops_members, public.ops_member_sectors, public.ops_member_permissions from anon, authenticated;
grant select on public.ops_sectors, public.ops_members, public.ops_member_sectors to authenticated;
grant select on public.ops_member_permissions to authenticated;
create policy "Central vê os setores" on public.ops_sectors for select to authenticated using ((select private.ops_can('ops.access')));
create policy "Central vê a equipe" on public.ops_members for select to authenticated using ((select private.ops_can('ops.access')));
create policy "Central vê os setores da equipe" on public.ops_member_sectors for select to authenticated using ((select private.ops_can('ops.access')));
create policy "Admin vê as permissões; cada um vê as suas" on public.ops_member_permissions for select to authenticated
  using ((select private.is_admin()) or user_id = (select auth.uid()));

-- -----------------------------------------------------------------------------
-- Setores iniciais
-- -----------------------------------------------------------------------------
insert into public.ops_sectors (name, color, position) values
  ('Comercial', '#7C3AED', 1), ('Atendimento', '#06B6D4', 2), ('Account Manager', '#A855F7', 3),
  ('Operacional', '#10B981', 4), ('Design', '#F59E0B', 5), ('Copy', '#22D3EE', 6),
  ('Gestão de Tráfego', '#EF4444', 7), ('Social Media', '#EC4899', 8), ('Desenvolvimento (Dev)', '#3B82F6', 9),
  ('Áudio e Vídeo', '#64748B', 10);

-- -----------------------------------------------------------------------------
-- Funções (admin). Padrão do projeto: pública repassa, a privada confere.
-- -----------------------------------------------------------------------------
create function private.ops_require_admin()
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_admin() then
    raise exception 'Só o administrador pode mudar a configuração da Central de Operações.' using errcode = '42501';
  end if;
end;
$$;
revoke all on function private.ops_require_admin() from public, anon;
grant execute on function private.ops_require_admin() to authenticated;

-- Criar (p_id nulo) ou editar nome/cor.
create function private.ops_sector_save_impl(p_id uuid, p_name text, p_color text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_before jsonb;
begin
  perform private.ops_require_admin();
  if exists (select 1 from public.ops_sectors s where lower(btrim(s.name)) = lower(btrim(p_name)) and s.status <> 'arquivado'
               and s.id is distinct from p_id) then
    raise exception 'Já existe um setor com esse nome.' using errcode = '22023';
  end if;
  if p_id is null then
    insert into public.ops_sectors (name, color, position, updated_by)
    values (btrim(p_name), p_color, coalesce((select max(position) from public.ops_sectors), 0) + 1, (select auth.uid()))
    returning id into v_id;
    insert into public.audit_logs (actor_id, action, target_type, target_id, details)
    values ((select auth.uid()), 'ops.sector.create', 'ops_sector', v_id::text, jsonb_build_object('nome', btrim(p_name), 'cor', p_color));
  else
    select to_jsonb(s) into v_before from public.ops_sectors s where s.id = p_id;
    if v_before is null then raise exception 'Setor não encontrado.' using errcode = '22023'; end if;
    update public.ops_sectors set name = btrim(p_name), color = p_color, updated_by = (select auth.uid()) where id = p_id;
    v_id := p_id;
    insert into public.audit_logs (actor_id, action, target_type, target_id, details)
    values ((select auth.uid()), 'ops.sector.update', 'ops_sector', v_id::text,
            jsonb_build_object('antes', jsonb_build_object('nome', v_before ->> 'name', 'cor', v_before ->> 'color'),
                               'depois', jsonb_build_object('nome', btrim(p_name), 'cor', p_color)));
  end if;
  return v_id;
end;
$$;
revoke all on function private.ops_sector_save_impl(uuid, text, text) from public, anon;
grant execute on function private.ops_sector_save_impl(uuid, text, text) to authenticated;
create function public.ops_sector_save(p_id uuid, p_name text, p_color text)
returns uuid language sql set search_path = '' as $$ select private.ops_sector_save_impl(p_id, p_name, p_color) $$;
revoke all on function public.ops_sector_save(uuid, text, text) from public, anon;
grant execute on function public.ops_sector_save(uuid, text, text) to authenticated;

-- Nova ordem (lista completa ou parcial de ids, na ordem desejada).
create function private.ops_sector_reorder_impl(p_ids uuid[])
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.ops_require_admin();
  update public.ops_sectors s set position = o.ord, updated_by = (select auth.uid())
    from unnest(p_ids) with ordinality as o(id, ord) where s.id = o.id;
  insert into public.audit_logs (actor_id, action, target_type, target_id, details)
  values ((select auth.uid()), 'ops.sector.reorder', 'ops_sector', null, jsonb_build_object('ordem', to_jsonb(p_ids)));
end;
$$;
revoke all on function private.ops_sector_reorder_impl(uuid[]) from public, anon;
grant execute on function private.ops_sector_reorder_impl(uuid[]) to authenticated;
create function public.ops_sector_reorder(p_ids uuid[])
returns void language sql set search_path = '' as $$ select private.ops_sector_reorder_impl(p_ids) $$;
revoke all on function public.ops_sector_reorder(uuid[]) from public, anon;
grant execute on function public.ops_sector_reorder(uuid[]) to authenticated;

-- Ativar, desativar ou arquivar. Com pessoas no setor, é preciso dizer para
-- qual setor elas vão (p_move_to); nada fica "órfão".
create function private.ops_sector_set_status_impl(p_id uuid, p_status text, p_move_to uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_before text;
  v_people integer;
begin
  perform private.ops_require_admin();
  select status into v_before from public.ops_sectors where id = p_id;
  if v_before is null then raise exception 'Setor não encontrado.' using errcode = '22023'; end if;
  if p_status not in ('ativo', 'inativo', 'arquivado') then raise exception 'Situação inválida.' using errcode = '22023'; end if;
  select count(*) into v_people from public.ops_member_sectors where sector_id = p_id;
  if p_status <> 'ativo' and v_people > 0 then
    if p_move_to is null then
      raise exception 'Este setor tem % pessoa(s). Escolha para qual setor elas vão antes de desativar.', v_people using errcode = '22023';
    end if;
    if p_move_to = p_id or not exists (select 1 from public.ops_sectors where id = p_move_to and status = 'ativo') then
      raise exception 'Escolha um setor de destino ativo e diferente deste.' using errcode = '22023';
    end if;
    -- Quem tinha o destino como secundário: vira principal se o setor saindo era o principal.
    update public.ops_member_sectors d set is_primary = d.is_primary or o.is_primary
      from public.ops_member_sectors o
     where o.sector_id = p_id and d.sector_id = p_move_to and d.user_id = o.user_id;
    insert into public.ops_member_sectors (user_id, sector_id, is_primary)
    select o.user_id, p_move_to, o.is_primary from public.ops_member_sectors o
     where o.sector_id = p_id
       and not exists (select 1 from public.ops_member_sectors d where d.user_id = o.user_id and d.sector_id = p_move_to);
    delete from public.ops_member_sectors where sector_id = p_id;
  end if;
  update public.ops_sectors set status = p_status, updated_by = (select auth.uid()) where id = p_id;
  insert into public.audit_logs (actor_id, action, target_type, target_id, details)
  values ((select auth.uid()), 'ops.sector.status', 'ops_sector', p_id::text,
          jsonb_build_object('antes', v_before, 'depois', p_status, 'pessoas_movidas', case when p_status <> 'ativo' then v_people else 0 end,
                             'destino', p_move_to));
end;
$$;
revoke all on function private.ops_sector_set_status_impl(uuid, text, uuid) from public, anon;
grant execute on function private.ops_sector_set_status_impl(uuid, text, uuid) to authenticated;
create function public.ops_sector_set_status(p_id uuid, p_status text, p_move_to uuid default null)
returns void language sql set search_path = '' as $$ select private.ops_sector_set_status_impl(p_id, p_status, p_move_to) $$;
revoke all on function public.ops_sector_set_status(uuid, text, uuid) from public, anon;
grant execute on function public.ops_sector_set_status(uuid, text, uuid) to authenticated;

-- Colocar/atualizar uma pessoa na Central: setor principal, secundários, cargo, permissões.
create function private.ops_member_save_impl(p_user_id uuid, p_primary_sector uuid, p_secondary uuid[], p_job_title text,
                                             p_active boolean, p_joins_meetings boolean, p_permissions text[])
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_role public.user_role;
  v_before jsonb;
  v_secondary uuid[] := array(select distinct s from unnest(coalesce(p_secondary, '{}')) s where s is distinct from p_primary_sector);
  v_perms text[] := array(select distinct p from unnest(coalesce(p_permissions, '{}')) p);
begin
  perform private.ops_require_admin();
  select role into v_role from public.profiles where id = p_user_id;
  if v_role is null then raise exception 'Usuário não encontrado.' using errcode = '22023'; end if;
  if v_role = 'cliente' then raise exception 'Usuários com papel Cliente não entram na Central de Operações.' using errcode = '22023'; end if;
  if p_primary_sector is null then raise exception 'Escolha o setor principal.' using errcode = '22023'; end if;
  if exists (select 1 from unnest(array_append(v_secondary, p_primary_sector)) s
              where not exists (select 1 from public.ops_sectors x where x.id = s and x.status = 'ativo')) then
    raise exception 'Escolha só setores ativos.' using errcode = '22023';
  end if;
  if char_length(coalesce(p_job_title, '')) > 80 then raise exception 'Cargo muito longo (até 80 letras).' using errcode = '22023'; end if;

  select jsonb_build_object(
           'cargo', m.job_title, 'ativo', m.active, 'reunioes', m.joins_meetings,
           'setores', (select jsonb_agg(jsonb_build_object('setor', s.sector_id, 'principal', s.is_primary) order by s.is_primary desc, s.sector_id)
                         from public.ops_member_sectors s where s.user_id = m.user_id),
           'permissoes', (select jsonb_agg(p.permission order by p.permission) from public.ops_member_permissions p where p.user_id = m.user_id))
    into v_before from public.ops_members m where m.user_id = p_user_id;

  insert into public.ops_members (user_id, job_title, active, joins_meetings, updated_by)
  values (p_user_id, nullif(btrim(p_job_title), ''), coalesce(p_active, true), coalesce(p_joins_meetings, true), (select auth.uid()))
  on conflict (user_id) do update set job_title = excluded.job_title, active = excluded.active,
                                      joins_meetings = excluded.joins_meetings, updated_by = excluded.updated_by;
  delete from public.ops_member_sectors where user_id = p_user_id;
  insert into public.ops_member_sectors (user_id, sector_id, is_primary) values (p_user_id, p_primary_sector, true);
  insert into public.ops_member_sectors (user_id, sector_id, is_primary) select p_user_id, s, false from unnest(v_secondary) s;
  delete from public.ops_member_permissions where user_id = p_user_id;
  insert into public.ops_member_permissions (user_id, permission) select p_user_id, p from unnest(v_perms) p;

  insert into public.audit_logs (actor_id, action, target_type, target_id, details)
  values ((select auth.uid()), 'ops.member.update', 'user', p_user_id::text,
          jsonb_build_object('antes', v_before,
                             'depois', jsonb_build_object('cargo', nullif(btrim(p_job_title), ''), 'ativo', coalesce(p_active, true),
                                                          'reunioes', coalesce(p_joins_meetings, true), 'setor_principal', p_primary_sector,
                                                          'setores_secundarios', to_jsonb(v_secondary), 'permissoes', to_jsonb(v_perms))));
end;
$$;
revoke all on function private.ops_member_save_impl(uuid, uuid, uuid[], text, boolean, boolean, text[]) from public, anon;
grant execute on function private.ops_member_save_impl(uuid, uuid, uuid[], text, boolean, boolean, text[]) to authenticated;
create function public.ops_member_save(p_user_id uuid, p_primary_sector uuid, p_secondary uuid[], p_job_title text,
                                       p_active boolean, p_joins_meetings boolean, p_permissions text[])
returns void language sql set search_path = '' as $$
  select private.ops_member_save_impl(p_user_id, p_primary_sector, p_secondary, p_job_title, p_active, p_joins_meetings, p_permissions)
$$;
revoke all on function public.ops_member_save(uuid, uuid, uuid[], text, boolean, boolean, text[]) from public, anon;
grant execute on function public.ops_member_save(uuid, uuid, uuid[], text, boolean, boolean, text[]) to authenticated;

-- Minhas permissões na Central (para a tela; o banco confere de novo em cada ação).
create function private.ops_my_permissions_impl()
returns text[] language sql stable security definer set search_path = '' as $$
  select case
    when private.is_admin() then array['ops.access', 'ops.kanban.view', 'ops.tasks.create', 'ops.tasks.edit', 'ops.tasks.archive',
      'ops.tasks.assign', 'ops.tasks.sector', 'ops.cards.move', 'ops.clients.view', 'ops.history.edit', 'ops.meetings.manage',
      'ops.dashboard.view', 'ops.commercial', 'ops.admin']
    when private.ops_can('ops.access') then
      array(select p.permission from public.ops_member_permissions p where p.user_id = (select auth.uid()) order by p.permission)
    else '{}'::text[]
  end
$$;
revoke all on function private.ops_my_permissions_impl() from public, anon;
grant execute on function private.ops_my_permissions_impl() to authenticated;
create function public.ops_my_permissions()
returns text[] language sql stable set search_path = '' as $$ select private.ops_my_permissions_impl() $$;
revoke all on function public.ops_my_permissions() from public, anon;
grant execute on function public.ops_my_permissions() to authenticated;

-- Equipe: quem está na Central (nome e e-mail vêm do cadastro atual).
-- O admin vê também quem ainda não está na Central e as permissões.
create function private.ops_team_impl()
returns table (user_id uuid, full_name text, email text, role public.user_role, profile_active boolean,
               in_ops boolean, job_title text, member_active boolean, joins_meetings boolean,
               primary_sector_id uuid, secondary_sector_ids uuid[], permissions text[])
language sql stable security definer set search_path = '' as $$
  select p.id, p.full_name, p.email, p.role, p.active,
         m.user_id is not null, m.job_title, coalesce(m.active, false), coalesce(m.joins_meetings, false),
         (select s.sector_id from public.ops_member_sectors s where s.user_id = p.id and s.is_primary),
         array(select s.sector_id from public.ops_member_sectors s where s.user_id = p.id and not s.is_primary order by s.sector_id),
         case when private.is_admin() then array(select x.permission from public.ops_member_permissions x where x.user_id = p.id order by x.permission) end
    from public.profiles p
    left join public.ops_members m on m.user_id = p.id
   where private.ops_can('ops.access')
     and p.role <> 'cliente'
     and (m.user_id is not null or private.is_admin())
   order by p.full_name
$$;
revoke all on function private.ops_team_impl() from public, anon;
grant execute on function private.ops_team_impl() to authenticated;
create function public.ops_team()
returns table (user_id uuid, full_name text, email text, role public.user_role, profile_active boolean,
               in_ops boolean, job_title text, member_active boolean, joins_meetings boolean,
               primary_sector_id uuid, secondary_sector_ids uuid[], permissions text[])
language sql stable set search_path = '' as $$ select * from private.ops_team_impl() $$;
revoke all on function public.ops_team() from public, anon;
grant execute on function public.ops_team() to authenticated;
