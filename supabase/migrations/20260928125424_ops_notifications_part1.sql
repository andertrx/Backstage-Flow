-- =============================================================================
-- Etapa 36.6 (parte 1): notificações da Central (sino). Nada externo (e-mail,
-- WhatsApp): só dentro do CRM. Sem duplicar: uma chave única por evento e
-- pessoa. Quem fez a ação não é avisado. Cada pessoa pode desligar tipos.
-- Remoção: supabase/rollback/remover_central_operacoes.sql
-- =============================================================================

create table public.ops_notifications (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  kind        text not null check (kind in ('tarefa.atribuida', 'tarefa.mencao', 'tarefa.comentario', 'tarefa.concluida', 'tarefa.prazo',
                                            'tarefa.atrasada', 'reuniao.convite', 'reuniao.hoje', 'reuniao.item', 'cliente.am', 'lead.responsavel')),
  title       text not null check (char_length(title) <= 300),
  body        text check (char_length(body) <= 500),
  link        text check (link ~ '^/operacoes/'),
  actor_id    uuid references auth.users (id) on delete set null,
  task_id     uuid references public.ops_tasks (id) on delete cascade,
  meeting_id  uuid references public.ops_meetings (id) on delete cascade,
  dedupe_key  text not null,
  created_at  timestamptz not null default now(),
  read_at     timestamptz,
  unique (user_id, dedupe_key)
);
comment on table public.ops_notifications is 'Etapa 36: notificações internas da Central (sino). Uma por evento e pessoa; lidas continuam guardadas.';
create index ops_notifications_user_idx on public.ops_notifications (user_id, created_at desc);
create index ops_notifications_unread_idx on public.ops_notifications (user_id) where read_at is null;
create index ops_notifications_actor_idx on public.ops_notifications (actor_id);
create index ops_notifications_task_idx on public.ops_notifications (task_id);
create index ops_notifications_meeting_idx on public.ops_notifications (meeting_id);

create table public.ops_notification_prefs (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  muted       text[] not null default '{}',   -- tipos que a pessoa desligou
  updated_at  timestamptz not null default now()
);
comment on table public.ops_notification_prefs is 'Etapa 36: preferências de notificação (tipos desligados) de cada pessoa.';

alter table public.ops_notifications enable row level security;
alter table public.ops_notification_prefs enable row level security;
revoke all on public.ops_notifications, public.ops_notification_prefs from anon, authenticated;
grant select on public.ops_notifications, public.ops_notification_prefs to authenticated;
create policy "Cada pessoa vê as próprias notificações" on public.ops_notifications for select to authenticated
  using (user_id = (select auth.uid()));
create policy "Cada pessoa vê as próprias preferências" on public.ops_notification_prefs for select to authenticated
  using (user_id = (select auth.uid()));

-- Permissão da Central de OUTRA pessoa (para não avisar quem não pode ver).
create function private.ops_user_can(p_user uuid, p_permission text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p where p.id = p_user and p.active and p.role = 'admin')
      or exists (select 1 from public.ops_members m join public.profiles p on p.id = m.user_id
                  where m.user_id = p_user and m.active and p.active and p.role <> 'cliente'
                    and exists (select 1 from public.ops_member_permissions a where a.user_id = m.user_id and a.permission = 'ops.access')
                    and exists (select 1 from public.ops_member_permissions x where x.user_id = m.user_id and x.permission = p_permission))
$$;
revoke all on function private.ops_user_can(uuid, text) from public, anon, authenticated;

-- Cria a notificação (se a pessoa pode receber, não foi quem fez e não desligou o tipo).
create function private.ops_notify(p_user uuid, p_kind text, p_title text, p_body text, p_link text, p_dedupe text,
                                   p_task uuid default null, p_meeting uuid default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_user is null or p_user = (select auth.uid()) or not private.ops_member_ok(p_user) then return; end if;
  if exists (select 1 from public.ops_notification_prefs where user_id = p_user and p_kind = any (muted)) then return; end if;
  insert into public.ops_notifications (user_id, kind, title, body, link, actor_id, task_id, meeting_id, dedupe_key)
  values (p_user, p_kind, left(p_title, 300), left(p_body, 500), p_link, (select auth.uid()), p_task, p_meeting, p_dedupe)
  on conflict (user_id, dedupe_key) do nothing;
end;
$$;
revoke all on function private.ops_notify(uuid, text, text, text, text, text, uuid, uuid) from public, anon, authenticated;

create function private.ops_person_name(p_user uuid)
returns text language sql stable security definer set search_path = '' as $$
  select coalesce((select full_name from public.profiles where id = p_user), 'Alguém')
$$;
revoke all on function private.ops_person_name(uuid) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Gatilhos: eventos que avisam alguém
-- -----------------------------------------------------------------------------
create function private.ops_notify_task_people_tg()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  t record;
begin
  select * into t from public.ops_tasks where id = new.task_id;
  if t.archived_at is not null then return null; end if;
  perform private.ops_notify(new.user_id, 'tarefa.atribuida',
    'Você entrou na tarefa #' || t.number || ': ' || t.title,
    case new.role when 'principal' then 'Como responsável principal' when 'adicional' then 'Como responsável adicional'
                  when 'aprovador' then 'Como aprovador' else 'Como observador' end
      || case when t.due_date is not null then ' · prazo ' || to_char(t.due_date, 'DD/MM/YYYY') else '' end,
    '/operacoes/tarefas?tarefa=' || t.id, 'atribuida:' || t.id || ':' || new.user_id, t.id, null);
  return null;
end;
$$;
create trigger ops_task_people_notify after insert on public.ops_task_people for each row execute function private.ops_notify_task_people_tg();

create function private.ops_notify_mention_tg()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  c record;
  t record;
begin
  select * into c from public.ops_comments where id = new.comment_id;
  select * into t from public.ops_tasks where id = c.task_id;
  perform private.ops_notify(new.user_id, 'tarefa.mencao',
    private.ops_person_name(c.author_id) || ' mencionou você na tarefa #' || t.number, left(c.body, 200),
    '/operacoes/tarefas?tarefa=' || t.id, 'mencao:' || c.id, t.id, null);
  return null;
end;
$$;
create trigger ops_mentions_notify after insert on public.ops_mentions for each row execute function private.ops_notify_mention_tg();

-- Comentário: avisa as pessoas da tarefa e quem criou (menos o autor e quem já foi mencionado).
-- Roda no fim da transação, quando as menções já estão gravadas.
create function private.ops_notify_comment_tg()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  t record;
  v_user uuid;
begin
  if new.removed_at is not null then return null; end if;
  select * into t from public.ops_tasks where id = new.task_id;
  for v_user in
    select u from (select p.user_id as u from public.ops_task_people p where p.task_id = t.id union select t.created_by) x
     where u is not null and u <> new.author_id
       and not exists (select 1 from public.ops_mentions m where m.comment_id = new.id and m.user_id = x.u)
  loop
    perform private.ops_notify(v_user, 'tarefa.comentario',
      private.ops_person_name(new.author_id) || ' comentou na tarefa #' || t.number || ': ' || t.title, left(new.body, 200),
      '/operacoes/tarefas?tarefa=' || t.id, 'comentario:' || new.id, t.id, null);
  end loop;
  return null;
end;
$$;
create constraint trigger ops_comments_notify after insert on public.ops_comments deferrable initially deferred
  for each row execute function private.ops_notify_comment_tg();

-- Tarefa concluída: avisa quem criou.
create function private.ops_notify_task_done_tg()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.completed_at is null and new.completed_at is not null then
    perform private.ops_notify(new.created_by, 'tarefa.concluida', 'Tarefa #' || new.number || ' concluída: ' || new.title,
      'Concluída por ' || private.ops_person_name((select auth.uid())), '/operacoes/tarefas?tarefa=' || new.id,
      'concluida:' || new.id || ':' || extract(epoch from new.completed_at)::bigint, new.id, null);
  end if;
  return null;
end;
$$;
create trigger ops_tasks_notify_done after update of completed_at on public.ops_tasks for each row execute function private.ops_notify_task_done_tg();

create function private.ops_notify_meeting_people_tg()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  m record;
begin
  select * into m from public.ops_meetings where id = new.meeting_id;
  if m.status <> 'agendada' then return null; end if;
  perform private.ops_notify(new.user_id, 'reuniao.convite', 'Você foi chamado para a reunião #' || m.number || ': ' || m.title,
    to_char(m.starts_at at time zone 'America/Sao_Paulo', 'DD/MM/YYYY "às" HH24:MI') || ' (horário de Brasília)',
    '/operacoes/reunioes?reuniao=' || m.id, 'reuniao:' || m.id, null, m.id);
  return null;
end;
$$;
create trigger ops_meeting_people_notify after insert on public.ops_meeting_people for each row execute function private.ops_notify_meeting_people_tg();

create function private.ops_notify_meeting_item_tg()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  m record;
begin
  if new.owner_id is null then return null; end if;
  select * into m from public.ops_meetings where id = new.meeting_id;
  perform private.ops_notify(new.owner_id, 'reuniao.item',
    case new.kind when 'pendencia' then 'Pendência' when 'bloqueio' then 'Bloqueio' when 'decisao' then 'Decisão' else 'Objetivo' end
      || ' para você na reunião #' || m.number || ': ' || m.title,
    left(new.body, 200) || case when new.due_date is not null then ' · prazo ' || to_char(new.due_date, 'DD/MM/YYYY') else '' end,
    '/operacoes/reunioes?reuniao=' || m.id, 'item:' || new.id, null, m.id);
  return null;
end;
$$;
create trigger ops_meeting_items_notify after insert on public.ops_meeting_items for each row execute function private.ops_notify_meeting_item_tg();

create function private.ops_notify_am_tg()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.am_user_id is not null and (tg_op = 'INSERT' or new.am_user_id is distinct from old.am_user_id) then
    perform private.ops_notify(new.am_user_id, 'cliente.am',
      'Você é o Account Manager de ' || (select name from public.clients where id = new.client_id),
      'Acompanhe o cliente na Central de Operações.', '/operacoes/clientes?cliente=' || new.client_id,
      'am:' || new.client_id || ':' || new.am_user_id || ':' || new.version, null, null);
  end if;
  return null;
end;
$$;
create trigger ops_client_ops_notify after insert or update of am_user_id on public.ops_client_ops for each row execute function private.ops_notify_am_tg();

-- Lead: só avisa quem tem "Comercial" (os dados do lead são do Comercial).
create function private.ops_notify_lead_tg()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.owner_id is not null and (tg_op = 'INSERT' or new.owner_id is distinct from old.owner_id)
     and private.ops_user_can(new.owner_id, 'ops.commercial') then
    perform private.ops_notify(new.owner_id, 'lead.responsavel', 'O lead #' || new.number || ' ' || new.company_name || ' ficou com você',
      case when new.next_action is not null then 'Próxima ação: ' || new.next_action else 'Sem próxima ação definida.' end,
      '/operacoes/comercial?lead=' || new.id, 'lead:' || new.id || ':' || new.owner_id || ':' || new.version, null, null);
  end if;
  return null;
end;
$$;
create trigger ops_leads_notify after insert or update of owner_id on public.ops_leads for each row execute function private.ops_notify_lead_tg();

-- -----------------------------------------------------------------------------
-- Avisos do dia (pg_cron, 8h de Brasília): prazo amanhã, atrasadas, reunião hoje.
-- Sem duplicar: prazo/atraso uma vez por data de prazo; reunião uma vez por reunião.
-- -----------------------------------------------------------------------------
create function private.ops_notify_daily()
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_before bigint := (select count(*) from public.ops_notifications);
  r record;
begin
  for r in
    select t.id, t.number, t.title, t.due_date, p.user_id
      from public.ops_tasks t
      join public.ops_statuses s on s.id = t.status_id
      join public.ops_task_people p on p.task_id = t.id and p.role in ('principal', 'adicional')
     where t.archived_at is null and s.category not in ('concluido', 'cancelado')
       and t.due_date is not null and t.due_date <= v_today + 1
  loop
    if r.due_date = v_today + 1 then
      perform private.ops_notify(r.user_id, 'tarefa.prazo', 'Prazo amanhã: tarefa #' || r.number, r.title,
        '/operacoes/tarefas?tarefa=' || r.id, 'prazo:' || r.id || ':' || r.due_date, r.id, null);
    elsif r.due_date < v_today then
      perform private.ops_notify(r.user_id, 'tarefa.atrasada', 'Tarefa #' || r.number || ' atrasada desde ' || to_char(r.due_date, 'DD/MM/YYYY'),
        r.title, '/operacoes/tarefas?tarefa=' || r.id, 'atrasada:' || r.id || ':' || r.due_date, r.id, null);
    end if;
  end loop;
  for r in
    select m.id, m.number, m.title, m.starts_at, u.user_id
      from public.ops_meetings m
      cross join lateral (select p.user_id from public.ops_meeting_people p where p.meeting_id = m.id
                          union select m.organizer_id) u
     where m.status = 'agendada' and (m.starts_at at time zone 'America/Sao_Paulo')::date = v_today and u.user_id is not null
  loop
    perform private.ops_notify(r.user_id, 'reuniao.hoje',
      'Reunião hoje às ' || to_char(r.starts_at at time zone 'America/Sao_Paulo', 'HH24:MI') || ': ' || r.title,
      'Reunião #' || r.number || ' (horário de Brasília)', '/operacoes/reunioes?reuniao=' || r.id, 'hoje:' || r.id, null, r.id);
  end loop;
  return (select count(*) from public.ops_notifications) - v_before;
end;
$$;
revoke all on function private.ops_notify_daily() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Sino: listar, contar não lidas, marcar como lida, preferências
-- -----------------------------------------------------------------------------
create function private.ops_notifications_list_impl(p_unread boolean, p_kind text, p_limit integer)
returns jsonb language sql stable security definer set search_path = '' as $$
  select case when not private.ops_can('ops.access') then null else jsonb_build_object(
    'items', (select coalesce(jsonb_agg(jsonb_build_object('id', n.id, 'kind', n.kind, 'title', n.title, 'body', n.body, 'link', n.link,
                'actor', pa.full_name, 'created_at', n.created_at, 'read_at', n.read_at) order by n.created_at desc, n.id desc), '[]')
                from (select * from public.ops_notifications x
                       where x.user_id = (select auth.uid()) and (not coalesce(p_unread, false) or x.read_at is null)
                         and (nullif(p_kind, '') is null or x.kind = p_kind)
                       order by x.created_at desc, x.id desc limit least(greatest(coalesce(p_limit, 30), 1), 200)) n
                left join public.profiles pa on pa.id = n.actor_id),
    'unread', (select count(*) from public.ops_notifications where user_id = (select auth.uid()) and read_at is null)) end
$$;
revoke all on function private.ops_notifications_list_impl(boolean, text, integer) from public, anon;
grant execute on function private.ops_notifications_list_impl(boolean, text, integer) to authenticated;
create function public.ops_notifications_list(p_unread boolean default false, p_kind text default null, p_limit integer default 30)
returns jsonb language sql stable set search_path = '' as $$ select private.ops_notifications_list_impl(p_unread, p_kind, p_limit) $$;
revoke all on function public.ops_notifications_list(boolean, text, integer) from public, anon;
grant execute on function public.ops_notifications_list(boolean, text, integer) to authenticated;

create function private.ops_notifications_unread_impl()
returns integer language sql stable security definer set search_path = '' as $$
  select case when not private.ops_can('ops.access') then 0
              else (select count(*)::integer from public.ops_notifications where user_id = (select auth.uid()) and read_at is null) end
$$;
revoke all on function private.ops_notifications_unread_impl() from public, anon;
grant execute on function private.ops_notifications_unread_impl() to authenticated;
create function public.ops_notifications_unread()
returns integer language sql stable set search_path = '' as $$ select private.ops_notifications_unread_impl() $$;
revoke all on function public.ops_notifications_unread() from public, anon;
grant execute on function public.ops_notifications_unread() to authenticated;

-- p_ids vazio/nulo = todas.
create function private.ops_notifications_read_impl(p_ids bigint[])
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_n integer;
begin
  perform private.ops_need('ops.access');
  update public.ops_notifications set read_at = now()
   where user_id = (select auth.uid()) and read_at is null and (p_ids is null or cardinality(p_ids) = 0 or id = any (p_ids));
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
revoke all on function private.ops_notifications_read_impl(bigint[]) from public, anon;
grant execute on function private.ops_notifications_read_impl(bigint[]) to authenticated;
create function public.ops_notifications_read(p_ids bigint[] default null)
returns integer language sql set search_path = '' as $$ select private.ops_notifications_read_impl(p_ids) $$;
revoke all on function public.ops_notifications_read(bigint[]) from public, anon;
grant execute on function public.ops_notifications_read(bigint[]) to authenticated;

create function private.ops_notification_prefs_save_impl(p_muted text[])
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_kinds text[] := array['tarefa.atribuida', 'tarefa.mencao', 'tarefa.comentario', 'tarefa.concluida', 'tarefa.prazo', 'tarefa.atrasada',
                          'reuniao.convite', 'reuniao.hoje', 'reuniao.item', 'cliente.am', 'lead.responsavel'];
begin
  perform private.ops_need('ops.access');
  if exists (select 1 from unnest(coalesce(p_muted, '{}')) k where k <> all (v_kinds)) then
    raise exception 'Tipo de notificação desconhecido.' using errcode = '22023';
  end if;
  insert into public.ops_notification_prefs (user_id, muted, updated_at)
  values ((select auth.uid()), array(select distinct k from unnest(coalesce(p_muted, '{}')) k order by 1), now())
  on conflict (user_id) do update set muted = excluded.muted, updated_at = now();
end;
$$;
revoke all on function private.ops_notification_prefs_save_impl(text[]) from public, anon;
grant execute on function private.ops_notification_prefs_save_impl(text[]) to authenticated;
create function public.ops_notification_prefs_save(p_muted text[])
returns void language sql set search_path = '' as $$ select private.ops_notification_prefs_save_impl(p_muted) $$;
revoke all on function public.ops_notification_prefs_save(text[]) from public, anon;
grant execute on function public.ops_notification_prefs_save(text[]) to authenticated;
