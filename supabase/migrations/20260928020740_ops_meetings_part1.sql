-- =============================================================================
-- Etapa 36.5 (parte 1): Dailies e reuniões — categorias, reuniões, participantes
-- e itens (objetivos, pendências, decisões, bloqueios). Pendência e bloqueio
-- viram tarefa com um clique (parte 2). Nada é apagado: item retirado só some
-- da tela, reunião cancelada continua no histórico.
-- Remoção: supabase/rollback/remover_central_operacoes.sql
-- =============================================================================

create table public.ops_meeting_categories (
  id        text primary key default gen_random_uuid()::text,
  name      text not null check (char_length(btrim(name)) between 2 and 60),
  color     text not null check (color ~ '^#[0-9A-Fa-f]{6}$'),
  position  integer not null default 0,
  active    boolean not null default true
);
comment on table public.ops_meeting_categories is 'Etapa 36: tipos de reunião (configuráveis pelo admin).';
insert into public.ops_meeting_categories (id, name, color, position) values
  ('daily', 'Daily', '#2563EB', 1), ('setor', 'Reunião de setor', '#7C3AED', 2), ('cliente', 'Reunião com cliente', '#10B981', 3),
  ('planejamento', 'Planejamento', '#F59E0B', 4), ('alinhamento', 'Alinhamento interno', '#06B6D4', 5), ('outra', 'Outra', '#64748B', 6);

create table public.ops_meetings (
  id            uuid primary key default gen_random_uuid(),
  number        bigint generated always as identity unique,
  title         text not null check (char_length(btrim(title)) between 3 and 160),
  category_id   text not null references public.ops_meeting_categories (id),
  -- agendada → realizada (com ata e presença) ou cancelada (com motivo).
  status        text not null default 'agendada' check (status in ('agendada', 'realizada', 'cancelada')),
  starts_at     timestamptz not null,
  duration_min  integer not null default 30 check (duration_min between 5 and 600),
  sector_id     uuid references public.ops_sectors (id),
  client_id     uuid references public.clients (id),
  location      text check (char_length(location) <= 300),   -- sala ou link da chamada
  agenda        text check (char_length(agenda) <= 5000),     -- pauta
  notes         text check (char_length(notes) <= 20000),     -- ata / resumo
  cancel_reason text check (char_length(cancel_reason) <= 500),
  held_at       timestamptz,
  organizer_id  uuid references auth.users (id) on delete set null,
  created_by    uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_by    uuid references auth.users (id) on delete set null,
  updated_at    timestamptz not null default now(),
  version       integer not null default 1
);
comment on table public.ops_meetings is 'Etapa 36: Dailies e reuniões da Central (agenda, pauta, ata e presença). Nunca apagadas.';
create index ops_meetings_starts_idx on public.ops_meetings (starts_at desc);
create index ops_meetings_category_idx on public.ops_meetings (category_id);
create index ops_meetings_sector_idx on public.ops_meetings (sector_id, starts_at desc);
create index ops_meetings_client_idx on public.ops_meetings (client_id, starts_at desc);
create index ops_meetings_organizer_idx on public.ops_meetings (organizer_id);
create index ops_meetings_created_by_idx on public.ops_meetings (created_by);
create index ops_meetings_updated_by_idx on public.ops_meetings (updated_by);
create trigger ops_meetings_touch before update on public.ops_meetings for each row execute function private.touch_updated_at();

create table public.ops_meeting_people (
  meeting_id  uuid not null references public.ops_meetings (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  attended    boolean,   -- presença marcada ao registrar a reunião (vazio = ainda não registrada)
  primary key (meeting_id, user_id)
);
comment on table public.ops_meeting_people is 'Etapa 36: participantes de cada reunião e presença.';
create index ops_meeting_people_user_idx on public.ops_meeting_people (user_id);

create table public.ops_meeting_items (
  id          uuid primary key default gen_random_uuid(),
  meeting_id  uuid not null references public.ops_meetings (id) on delete cascade,
  kind        text not null check (kind in ('objetivo', 'pendencia', 'decisao', 'bloqueio')),
  body        text not null check (char_length(btrim(body)) between 2 and 2000),
  owner_id    uuid references auth.users (id) on delete set null,
  sector_id   uuid references public.ops_sectors (id),
  due_date    date,
  task_id     uuid unique references public.ops_tasks (id),   -- tarefa gerada (uma só por item)
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  removed_at  timestamptz,
  removed_by  uuid references auth.users (id) on delete set null
);
comment on table public.ops_meeting_items is 'Etapa 36: objetivos, pendências, decisões e bloqueios da reunião; pendência/bloqueio vira tarefa com um clique.';
create index ops_meeting_items_meeting_idx on public.ops_meeting_items (meeting_id, created_at);
create index ops_meeting_items_owner_idx on public.ops_meeting_items (owner_id);
create index ops_meeting_items_sector_idx on public.ops_meeting_items (sector_id);
create index ops_meeting_items_created_by_idx on public.ops_meeting_items (created_by);
create index ops_meeting_items_removed_by_idx on public.ops_meeting_items (removed_by);

-- O histórico da reunião usa a tabela de histórico da Central (com o cliente, se houver).
alter table public.ops_activity add column meeting_id uuid references public.ops_meetings (id);
create index ops_activity_meeting_idx on public.ops_activity (meeting_id, created_at desc);

-- -----------------------------------------------------------------------------
-- Quem vê a reunião: admin e "Criar reuniões e Dailies"; quem organiza ou participa;
-- quem é do setor da reunião; quem acompanha o cliente da reunião na Central.
-- -----------------------------------------------------------------------------
create function private.ops_meeting_visible(p_meeting uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.ops_can('ops.access') and exists (
    select 1 from public.ops_meetings m
     where m.id = p_meeting
       and (private.ops_can('ops.meetings.manage')
            or m.organizer_id = (select auth.uid())
            or exists (select 1 from public.ops_meeting_people p where p.meeting_id = m.id and p.user_id = (select auth.uid()))
            or (m.sector_id is not null and exists (select 1 from public.ops_member_sectors s
                                                     where s.user_id = (select auth.uid()) and s.sector_id = m.sector_id))
            or (m.client_id is not null and private.ops_client_visible(m.client_id))))
$$;
revoke all on function private.ops_meeting_visible(uuid) from public, anon;
grant execute on function private.ops_meeting_visible(uuid) to authenticated;

-- Quem altera a reunião (dados, participantes, ata, cancelar): "Criar reuniões e Dailies" ou quem organiza.
create function private.ops_meeting_can_edit(p_meeting uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.ops_can('ops.access') and (private.ops_can('ops.meetings.manage')
      or exists (select 1 from public.ops_meetings m where m.id = p_meeting and m.organizer_id = (select auth.uid())))
$$;
revoke all on function private.ops_meeting_can_edit(uuid) from public, anon;
grant execute on function private.ops_meeting_can_edit(uuid) to authenticated;

-- Quem registra itens (pendências, decisões…): quem altera e quem participa.
create function private.ops_meeting_can_add(p_meeting uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.ops_meeting_can_edit(p_meeting)
      or (private.ops_can('ops.access')
          and exists (select 1 from public.ops_meeting_people p where p.meeting_id = p_meeting and p.user_id = (select auth.uid())))
$$;
revoke all on function private.ops_meeting_can_add(uuid) from public, anon;
grant execute on function private.ops_meeting_can_add(uuid) to authenticated;

create function private.ops_meeting_log(p_meeting uuid, p_action text, p_before jsonb, p_after jsonb, p_origin text default 'manual')
returns void language sql security definer set search_path = '' as $$
  insert into public.ops_activity (meeting_id, client_id, action, actor_id, origin, before, after)
  select m.id, m.client_id, p_action, (select auth.uid()), p_origin, p_before,
         coalesce(p_after, '{}') || jsonb_build_object('reuniao', m.number, 'titulo_reuniao', m.title)
    from public.ops_meetings m where m.id = p_meeting
$$;
revoke all on function private.ops_meeting_log(uuid, text, jsonb, jsonb, text) from public, anon, authenticated;

create function private.ops_meeting_snapshot(p_meeting uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('titulo', m.title, 'tipo', c.name, 'inicio', m.starts_at, 'duracao', m.duration_min, 'setor', s.name,
                            'cliente', cl.name, 'local', m.location, 'pauta', m.agenda, 'organizador', po.full_name,
                            'participantes', (select coalesce(jsonb_agg(pp.full_name order by pp.full_name), '[]')
                                                from public.ops_meeting_people p join public.profiles pp on pp.id = p.user_id
                                               where p.meeting_id = m.id))
    from public.ops_meetings m join public.ops_meeting_categories c on c.id = m.category_id
    left join public.ops_sectors s on s.id = m.sector_id left join public.clients cl on cl.id = m.client_id
    left join public.profiles po on po.id = m.organizer_id
   where m.id = p_meeting
$$;
revoke all on function private.ops_meeting_snapshot(uuid) from public, anon, authenticated;

alter table public.ops_meeting_categories enable row level security;
alter table public.ops_meetings enable row level security;
alter table public.ops_meeting_people enable row level security;
alter table public.ops_meeting_items enable row level security;
revoke all on public.ops_meeting_categories, public.ops_meetings, public.ops_meeting_people, public.ops_meeting_items from anon, authenticated;
grant select on public.ops_meeting_categories, public.ops_meetings, public.ops_meeting_people, public.ops_meeting_items to authenticated;
create policy "Central vê os tipos de reunião" on public.ops_meeting_categories for select to authenticated using ((select private.ops_can('ops.access')));
create policy "Vê as reuniões que pode acompanhar" on public.ops_meetings for select to authenticated using (private.ops_meeting_visible(id));
create policy "Vê participantes das reuniões visíveis" on public.ops_meeting_people for select to authenticated using (private.ops_meeting_visible(meeting_id));
create policy "Vê itens das reuniões visíveis" on public.ops_meeting_items for select to authenticated using (private.ops_meeting_visible(meeting_id));
