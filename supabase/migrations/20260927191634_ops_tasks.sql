-- =============================================================================
-- Etapa 36.2 — Central de Operações: tarefas
--
--   ops_statuses       → status das tarefas (8 iniciais, configuráveis)
--   ops_tasks          → a tarefa (UMA só, usada em todas as telas)
--   ops_task_people    → principal, adicionais, aprovadores e observadores
--   ops_task_deps      → "esta tarefa depende daquela"
--   ops_tags / ops_task_tags
--   ops_comments / ops_mentions
--   ops_attachments    → anexos no bucket PRIVADO ops-files
--   ops_activity       → histórico permanente (antes/depois, quem, quando)
--
-- Escrita só por funções (conferem permissão, versão e gravam o histórico).
-- Nada é apagado: tarefa é arquivada; comentário e anexo são "retirados".
-- Remoção: supabase/rollback/remover_central_operacoes.sql
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Status
-- -----------------------------------------------------------------------------
create table public.ops_statuses (
  id         text primary key default gen_random_uuid()::text,
  name       text not null check (char_length(btrim(name)) between 2 and 40),
  color      text not null check (color ~ '^#[0-9A-Fa-f]{6}$'),
  -- Grupo fixo (é ele que os painéis usam); o nome e a cor são livres.
  category   text not null check (category in ('aberto', 'andamento', 'aguardando_cliente', 'aguardando_interno',
                                               'bloqueado', 'revisao', 'concluido', 'cancelado')),
  position   integer not null default 0,
  active     boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);
comment on table public.ops_statuses is 'Etapa 36: status das tarefas (nome/cor/ordem configuráveis; o grupo define como conta nos painéis).';
create index ops_statuses_updated_by_idx on public.ops_statuses (updated_by);
insert into public.ops_statuses (id, name, color, category, position) values
  ('nao_iniciado', 'Não Iniciado', '#06B6D4', 'aberto', 1),
  ('em_andamento', 'Em Andamento', '#F59E0B', 'andamento', 2),
  ('aguardando_cliente', 'Aguardando Cliente', '#EAB308', 'aguardando_cliente', 3),
  ('aguardando_interno', 'Aguardando Interno', '#64748B', 'aguardando_interno', 4),
  ('bloqueado', 'Bloqueado', '#EF4444', 'bloqueado', 5),
  ('em_revisao', 'Em Revisão', '#3B82F6', 'revisao', 6),
  ('finalizado', 'Finalizado', '#10B981', 'concluido', 7),
  ('cancelado', 'Cancelado', '#94A3B8', 'cancelado', 8);

-- -----------------------------------------------------------------------------
-- Tarefas e o que pertence a elas
-- -----------------------------------------------------------------------------
create table public.ops_tasks (
  id            uuid primary key default gen_random_uuid(),
  number        bigint generated always as identity unique,
  title         text not null check (char_length(btrim(title)) between 3 and 200),
  description   text check (char_length(description) <= 10000),
  client_id     uuid references public.clients (id),
  sector_id     uuid not null references public.ops_sectors (id),
  status_id     text not null default 'nao_iniciado' references public.ops_statuses (id),
  priority      text not null default 'media' check (priority in ('baixa', 'media', 'alta', 'urgente')),
  start_date    date,
  due_date      date,
  effort_hours  numeric(7, 2) check (effort_hours is null or effort_hours between 0 and 10000),
  -- setor: quem é do setor + pessoas da tarefa; participantes: só as pessoas; equipe: toda a Central
  visibility    text not null default 'setor' check (visibility in ('setor', 'participantes', 'equipe')),
  created_by    uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  updated_by    uuid references auth.users (id) on delete set null,
  completed_at  timestamptz,
  archived_at   timestamptz,
  archived_by   uuid references auth.users (id) on delete set null,
  -- Controle de alteração simultânea: só grava se a versão bater.
  version       integer not null default 1,
  check (due_date is null or start_date is null or due_date >= start_date)
);
comment on table public.ops_tasks is 'Etapa 36: tarefa da Central de Operações (registro único em todas as telas). Nunca apagar: arquivar.';
create index ops_tasks_client_idx on public.ops_tasks (client_id);
create index ops_tasks_sector_idx on public.ops_tasks (sector_id, status_id);
create index ops_tasks_status_idx on public.ops_tasks (status_id);
create index ops_tasks_due_idx on public.ops_tasks (due_date) where archived_at is null;
create index ops_tasks_created_by_idx on public.ops_tasks (created_by);
create index ops_tasks_updated_by_idx on public.ops_tasks (updated_by);
create index ops_tasks_archived_by_idx on public.ops_tasks (archived_by);

create table public.ops_task_people (
  task_id  uuid not null references public.ops_tasks (id) on delete cascade,
  user_id  uuid not null references public.profiles (id),
  role     text not null check (role in ('principal', 'adicional', 'aprovador', 'observador')),
  added_at timestamptz not null default now(),
  primary key (task_id, user_id, role)
);
comment on table public.ops_task_people is 'Etapa 36: pessoas da tarefa (um principal; vários adicionais, aprovadores e observadores).';
create unique index ops_task_people_one_principal on public.ops_task_people (task_id) where role = 'principal';
create index ops_task_people_user_idx on public.ops_task_people (user_id, task_id);

create table public.ops_task_deps (
  task_id        uuid not null references public.ops_tasks (id) on delete cascade,
  depends_on_id  uuid not null references public.ops_tasks (id) on delete cascade,
  created_by     uuid references auth.users (id) on delete set null,
  created_at     timestamptz not null default now(),
  primary key (task_id, depends_on_id),
  check (task_id <> depends_on_id)
);
comment on table public.ops_task_deps is 'Etapa 36: dependências explícitas (a tarefa fica bloqueada enquanto a outra não termina).';
create index ops_task_deps_on_idx on public.ops_task_deps (depends_on_id);
create index ops_task_deps_created_by_idx on public.ops_task_deps (created_by);

create table public.ops_tags (
  id    uuid primary key default gen_random_uuid(),
  name  text not null check (char_length(btrim(name)) between 1 and 40),
  color text not null default '#06B6D4' check (color ~ '^#[0-9A-Fa-f]{6}$')
);
create unique index ops_tags_name_uq on public.ops_tags (lower(btrim(name)));
comment on table public.ops_tags is 'Etapa 36: etiquetas das tarefas.';
create table public.ops_task_tags (
  task_id uuid not null references public.ops_tasks (id) on delete cascade,
  tag_id  uuid not null references public.ops_tags (id),
  primary key (task_id, tag_id)
);
create index ops_task_tags_tag_idx on public.ops_task_tags (tag_id);

create table public.ops_comments (
  id          bigint generated always as identity primary key,
  task_id     uuid not null references public.ops_tasks (id) on delete cascade,
  author_id   uuid references auth.users (id) on delete set null,
  body        text not null check (char_length(btrim(body)) between 1 and 5000),
  created_at  timestamptz not null default now(),
  removed_at  timestamptz,
  removed_by  uuid references auth.users (id) on delete set null
);
comment on table public.ops_comments is 'Etapa 36: comentários das tarefas. Retirar não apaga (fica no histórico).';
create index ops_comments_task_idx on public.ops_comments (task_id, created_at);
create index ops_comments_author_idx on public.ops_comments (author_id);
create index ops_comments_removed_by_idx on public.ops_comments (removed_by);

create table public.ops_mentions (
  comment_id bigint not null references public.ops_comments (id) on delete cascade,
  user_id    uuid not null references public.profiles (id),
  primary key (comment_id, user_id)
);
comment on table public.ops_mentions is 'Etapa 36: @menções dos comentários (base das notificações da 36.6).';
create index ops_mentions_user_idx on public.ops_mentions (user_id);

create table public.ops_attachments (
  id           uuid primary key default gen_random_uuid(),
  task_id      uuid not null references public.ops_tasks (id) on delete cascade,
  path         text not null unique,
  name         text not null check (char_length(name) between 1 and 200),
  mime         text not null,
  size_bytes   bigint not null check (size_bytes between 1 and 26214400),
  uploaded_by  uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  removed_at   timestamptz,
  removed_by   uuid references auth.users (id) on delete set null
);
comment on table public.ops_attachments is 'Etapa 36: anexos (arquivo no bucket privado ops-files; abre só por link temporário). Retirar não apaga.';
create index ops_attachments_task_idx on public.ops_attachments (task_id, created_at);
create index ops_attachments_uploaded_by_idx on public.ops_attachments (uploaded_by);
create index ops_attachments_removed_by_idx on public.ops_attachments (removed_by);

create table public.ops_activity (
  id          bigint generated always as identity primary key,
  task_id     uuid references public.ops_tasks (id) on delete cascade,
  client_id   uuid references public.clients (id),
  action      text not null,
  actor_id    uuid references auth.users (id) on delete set null,
  origin      text not null default 'manual' check (origin in ('manual', 'sistema')),
  before      jsonb,
  after       jsonb,
  created_at  timestamptz not null default now()
);
comment on table public.ops_activity is 'Etapa 36: histórico permanente da Central (quem fez o quê, antes e depois). Nunca apagado por edição.';
create index ops_activity_task_idx on public.ops_activity (task_id, created_at desc);
create index ops_activity_client_idx on public.ops_activity (client_id, created_at desc);
create index ops_activity_actor_idx on public.ops_activity (actor_id);

create trigger ops_tasks_touch before update on public.ops_tasks for each row execute function private.touch_updated_at();

-- -----------------------------------------------------------------------------
-- Quem vê a tarefa
-- -----------------------------------------------------------------------------
create function private.ops_task_visible(p_task uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select case
    when private.is_admin() then exists (select 1 from public.ops_tasks where id = p_task)
    when not private.ops_can('ops.access') then false
    else exists (
      select 1 from public.ops_tasks t
       where t.id = p_task
         and (t.created_by = (select auth.uid())
              or t.visibility = 'equipe'
              or exists (select 1 from public.ops_task_people p where p.task_id = t.id and p.user_id = (select auth.uid()))
              or (t.visibility = 'setor' and exists (select 1 from public.ops_member_sectors s
                                                     where s.user_id = (select auth.uid()) and s.sector_id = t.sector_id))))
  end
$$;
revoke all on function private.ops_task_visible(uuid) from public, anon;
grant execute on function private.ops_task_visible(uuid) to authenticated;

-- Leitura direta (as telas usam as funções abaixo; isto garante que nada vaze).
alter table public.ops_statuses enable row level security;
alter table public.ops_tasks enable row level security;
alter table public.ops_task_people enable row level security;
alter table public.ops_task_deps enable row level security;
alter table public.ops_tags enable row level security;
alter table public.ops_task_tags enable row level security;
alter table public.ops_comments enable row level security;
alter table public.ops_mentions enable row level security;
alter table public.ops_attachments enable row level security;
alter table public.ops_activity enable row level security;
revoke all on public.ops_statuses, public.ops_tasks, public.ops_task_people, public.ops_task_deps, public.ops_tags, public.ops_task_tags,
  public.ops_comments, public.ops_mentions, public.ops_attachments, public.ops_activity from anon, authenticated;
grant select on public.ops_statuses, public.ops_tasks, public.ops_task_people, public.ops_task_deps, public.ops_tags, public.ops_task_tags,
  public.ops_comments, public.ops_mentions, public.ops_attachments, public.ops_activity to authenticated;
create policy "Central vê os status" on public.ops_statuses for select to authenticated using ((select private.ops_can('ops.access')));
create policy "Central vê as etiquetas" on public.ops_tags for select to authenticated using ((select private.ops_can('ops.access')));
create policy "Vê as tarefas que pode ver" on public.ops_tasks for select to authenticated using ((select private.ops_task_visible(id)));
create policy "Vê pessoas das tarefas visíveis" on public.ops_task_people for select to authenticated using ((select private.ops_task_visible(task_id)));
create policy "Vê dependências das tarefas visíveis" on public.ops_task_deps for select to authenticated using ((select private.ops_task_visible(task_id)));
create policy "Vê etiquetas das tarefas visíveis" on public.ops_task_tags for select to authenticated using ((select private.ops_task_visible(task_id)));
create policy "Vê comentários das tarefas visíveis" on public.ops_comments for select to authenticated using ((select private.ops_task_visible(task_id)));
create policy "Vê menções dos comentários visíveis" on public.ops_mentions for select to authenticated
  using (exists (select 1 from public.ops_comments c where c.id = comment_id and (select private.ops_task_visible(c.task_id))));
create policy "Vê anexos das tarefas visíveis" on public.ops_attachments for select to authenticated using ((select private.ops_task_visible(task_id)));
create policy "Vê histórico das tarefas visíveis" on public.ops_activity for select to authenticated
  using (task_id is not null and (select private.ops_task_visible(task_id)));

-- -----------------------------------------------------------------------------
-- Anexos: bucket privado. Pasta = id da tarefa. Link temporário para abrir.
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ops-files', 'ops-files', false, 26214400, array[
  'image/png', 'image/jpeg', 'image/webp', 'image/gif', 'application/pdf', 'text/plain', 'text/csv',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/zip', 'video/mp4', 'video/quicktime', 'audio/mpeg'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create function private.ops_task_folder_visible(p_name text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  v_folder text := split_part(coalesce(p_name, ''), '/', 1);
begin
  if v_folder !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return false; end if;
  return private.ops_task_visible(v_folder::uuid);
end;
$$;
revoke all on function private.ops_task_folder_visible(text) from public, anon;
grant execute on function private.ops_task_folder_visible(text) to authenticated;
create policy "Central envia anexos das tarefas visíveis" on storage.objects for insert to authenticated
  with check (bucket_id = 'ops-files' and (select private.ops_task_folder_visible(name)));
create policy "Central abre anexos das tarefas visíveis" on storage.objects for select to authenticated
  using (bucket_id = 'ops-files' and (select private.ops_task_folder_visible(name)));

-- -----------------------------------------------------------------------------
-- Apoio
-- -----------------------------------------------------------------------------
create function private.ops_need(p_permission text)
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.ops_can(p_permission) then
    raise exception 'Você não tem permissão para esta ação na Central de Operações.' using errcode = '42501';
  end if;
end;
$$;
revoke all on function private.ops_need(text) from public, anon;
grant execute on function private.ops_need(text) to authenticated;

create function private.ops_log(p_task uuid, p_client uuid, p_action text, p_before jsonb, p_after jsonb, p_origin text default 'manual')
returns void language sql security definer set search_path = '' as $$
  insert into public.ops_activity (task_id, client_id, action, actor_id, origin, before, after)
  values (p_task, p_client, p_action, (select auth.uid()), p_origin, p_before, p_after)
$$;
revoke all on function private.ops_log(uuid, uuid, text, jsonb, jsonb, text) from public, anon, authenticated;

-- Tarefa com as dependências ainda abertas = bloqueada.
create function private.ops_task_blockers(p_task uuid)
returns integer language sql stable security definer set search_path = '' as $$
  select count(*)::integer from public.ops_task_deps d
    join public.ops_tasks o on o.id = d.depends_on_id
    join public.ops_statuses s on s.id = o.status_id
   where d.task_id = p_task and s.category not in ('concluido', 'cancelado') and o.archived_at is null
$$;
revoke all on function private.ops_task_blockers(uuid) from public, anon;
grant execute on function private.ops_task_blockers(uuid) to authenticated;

-- A pessoa pode receber tarefa? (ativa na Central, com acesso)
create function private.ops_member_ok(p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p where p.id = p_user and p.active and p.role = 'admin')
      or exists (select 1 from public.ops_members m join public.profiles p on p.id = m.user_id
                  where m.user_id = p_user and m.active and p.active and p.role <> 'cliente'
                    and exists (select 1 from public.ops_member_permissions x where x.user_id = m.user_id and x.permission = 'ops.access'))
$$;
revoke all on function private.ops_member_ok(uuid) from public, anon;
grant execute on function private.ops_member_ok(uuid) to authenticated;

create function private.ops_task_snapshot(p_task uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'titulo', t.title, 'descricao', t.description, 'cliente', t.client_id, 'setor', t.sector_id, 'status', t.status_id,
    'prioridade', t.priority, 'inicio', t.start_date, 'prazo', t.due_date, 'esforco', t.effort_hours, 'visibilidade', t.visibility,
    'etiquetas', (select coalesce(jsonb_agg(g.name order by g.name), '[]') from public.ops_task_tags tt join public.ops_tags g on g.id = tt.tag_id where tt.task_id = t.id))
  from public.ops_tasks t where t.id = p_task
$$;
revoke all on function private.ops_task_snapshot(uuid) from public, anon, authenticated;

create function private.ops_task_people_json(p_task uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('user_id', p.user_id, 'role', p.role, 'name', pr.full_name)
                            order by case p.role when 'principal' then 1 when 'adicional' then 2 when 'aprovador' then 3 else 4 end, pr.full_name), '[]')
    from public.ops_task_people p join public.profiles pr on pr.id = p.user_id where p.task_id = p_task
$$;
revoke all on function private.ops_task_people_json(uuid) from public, anon, authenticated;

-- Grava as pessoas (sem conferir permissão: quem chama confere).
create function private.ops_write_people(p_task uuid, p_people jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid;
  v_role text;
begin
  if jsonb_typeof(coalesce(p_people, '{}'::jsonb)) <> 'object' then raise exception 'Pessoas inválidas.' using errcode = '22023'; end if;
  delete from public.ops_task_people where task_id = p_task;
  if nullif(p_people ->> 'principal', '') is not null then
    v_user := (p_people ->> 'principal')::uuid;
    if not private.ops_member_ok(v_user) then raise exception 'O responsável principal precisa estar ativo na Central.' using errcode = '22023'; end if;
    insert into public.ops_task_people (task_id, user_id, role) values (p_task, v_user, 'principal');
  end if;
  foreach v_role in array array['adicional', 'aprovador', 'observador'] loop
    for v_user in select distinct (x)::uuid from jsonb_array_elements_text(coalesce(p_people -> (case v_role when 'adicional' then 'adicionais'
                                                                                                  when 'aprovador' then 'aprovadores'
                                                                                                  else 'observadores' end), '[]')) x loop
      if not private.ops_member_ok(v_user) then raise exception 'Todas as pessoas da tarefa precisam estar ativas na Central.' using errcode = '22023'; end if;
      insert into public.ops_task_people (task_id, user_id, role) values (p_task, v_user, v_role) on conflict do nothing;
    end loop;
  end loop;
end;
$$;
revoke all on function private.ops_write_people(uuid, jsonb) from public, anon, authenticated;

create function private.ops_write_tags(p_task uuid, p_tags jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_name text;
  v_tag uuid;
begin
  delete from public.ops_task_tags where task_id = p_task;
  for v_name in select distinct btrim(x) from jsonb_array_elements_text(coalesce(p_tags, '[]')) x where btrim(x) <> '' loop
    if char_length(v_name) > 40 then raise exception 'Etiqueta muito longa (até 40 letras).' using errcode = '22023'; end if;
    select id into v_tag from public.ops_tags where lower(btrim(name)) = lower(v_name);
    if v_tag is null then insert into public.ops_tags (name) values (v_name) returning id into v_tag; end if;
    insert into public.ops_task_tags (task_id, tag_id) values (p_task, v_tag) on conflict do nothing;
  end loop;
end;
$$;
revoke all on function private.ops_write_tags(uuid, jsonb) from public, anon, authenticated;

