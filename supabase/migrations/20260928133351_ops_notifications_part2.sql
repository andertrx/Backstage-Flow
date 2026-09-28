-- =============================================================================
-- Etapa 36.6 (parte 2): repetição de tarefas e reuniões + avisos diários.
-- Cada ocorrência vira uma tarefa/reunião própria (com histórico próprio),
-- criada pelo pg_cron. Sem duplicar: uma ocorrência por repetição e data.
-- Tarefas nascem no dia; reuniões aparecem na agenda com 7 dias de antecedência.
-- =============================================================================

create table public.ops_recurrences (
  id           uuid primary key default gen_random_uuid(),
  kind         text not null check (kind in ('tarefa', 'reuniao')),
  task_id      uuid references public.ops_tasks (id),       -- tarefa modelo
  meeting_id   uuid references public.ops_meetings (id),    -- reunião modelo
  frequency    text not null check (frequency in ('diaria', 'dias_uteis', 'semanal', 'mensal')),
  weekdays     smallint[] check (weekdays is null or weekdays <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[]),  -- 0 = domingo
  month_day    smallint check (month_day between 1 and 31),
  start_date   date not null,
  end_date     date check (end_date is null or end_date >= start_date),
  active       boolean not null default true,
  stop_reason  text check (char_length(stop_reason) <= 300),
  last_date    date,                                        -- última data já gerada
  created_by   uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  stopped_by   uuid references auth.users (id) on delete set null,
  stopped_at   timestamptz,
  check ((kind = 'tarefa' and task_id is not null and meeting_id is null) or (kind = 'reuniao' and meeting_id is not null and task_id is null)),
  check (frequency <> 'semanal' or cardinality(weekdays) > 0),
  check (frequency <> 'mensal' or month_day is not null)
);
comment on table public.ops_recurrences is 'Etapa 36: repetição de tarefas e reuniões (diária, dias úteis, semanal, mensal). Parar não apaga nada.';
create unique index ops_recurrences_task_active_idx on public.ops_recurrences (task_id) where active and task_id is not null;
create unique index ops_recurrences_meeting_active_idx on public.ops_recurrences (meeting_id) where active and meeting_id is not null;
create index ops_recurrences_task_idx on public.ops_recurrences (task_id);
create index ops_recurrences_meeting_idx on public.ops_recurrences (meeting_id);
create index ops_recurrences_created_by_idx on public.ops_recurrences (created_by);
create index ops_recurrences_stopped_by_idx on public.ops_recurrences (stopped_by);

alter table public.ops_tasks add column recurrence_id uuid references public.ops_recurrences (id), add column occurrence_date date;
alter table public.ops_tasks add constraint ops_tasks_occurrence_unique unique (recurrence_id, occurrence_date);
alter table public.ops_meetings add column recurrence_id uuid references public.ops_recurrences (id), add column occurrence_date date;
alter table public.ops_meetings add constraint ops_meetings_occurrence_unique unique (recurrence_id, occurrence_date);

alter table public.ops_recurrences enable row level security;
revoke all on public.ops_recurrences from anon, authenticated;
grant select on public.ops_recurrences to authenticated;
create policy "Vê repetições de tarefas e reuniões visíveis" on public.ops_recurrences for select to authenticated
  using ((task_id is not null and private.ops_task_visible(task_id)) or (meeting_id is not null and private.ops_meeting_visible(meeting_id)));

-- A data entra na regra?
create function private.ops_recurrence_matches(p_frequency text, p_weekdays smallint[], p_month_day smallint, p_day date)
returns boolean language sql immutable set search_path = '' as $$
  select case p_frequency
    when 'diaria' then true
    when 'dias_uteis' then extract(isodow from p_day) <= 5
    when 'semanal' then extract(dow from p_day)::smallint = any (p_weekdays)
    when 'mensal' then extract(day from p_day) = least(p_month_day,
                         extract(day from (date_trunc('month', p_day) + interval '1 month - 1 day'))::smallint)
    else false end
$$;
revoke all on function private.ops_recurrence_matches(text, smallint[], smallint, date) from public, anon;
grant execute on function private.ops_recurrence_matches(text, smallint[], smallint, date) to authenticated;

-- Gera as ocorrências que faltam (uma repetição ou todas). Roda como sistema.
create function private.ops_recurrence_generate(p_rec uuid default null)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_count integer := 0;
  r record;
  t record;
  m record;
  d date;
  v_to date;
  v_new uuid;
  v_offset integer;
begin
  for r in select * from public.ops_recurrences where active and (p_rec is null or id = p_rec) for update skip locked loop
    -- Quem criou a repetição ainda pode criar isso?
    if not private.ops_user_can(r.created_by, case r.kind when 'tarefa' then 'ops.tasks.create' else 'ops.meetings.manage' end) then
      update public.ops_recurrences set active = false, stopped_at = now(),
             stop_reason = 'Parada automaticamente: quem criou a repetição não tem mais permissão na Central.' where id = r.id;
      continue;
    end if;
    if r.kind = 'tarefa' then
      select * into t from public.ops_tasks where id = r.task_id;
      if t.archived_at is not null then
        update public.ops_recurrences set active = false, stopped_at = now(),
               stop_reason = 'Parada automaticamente: a tarefa modelo foi arquivada.' where id = r.id;
        continue;
      end if;
      v_to := least(v_today, coalesce(r.end_date, v_today));
      v_offset := case when t.due_date is not null then t.due_date - coalesce(t.start_date, t.due_date) else 0 end;
    else
      select * into m from public.ops_meetings where id = r.meeting_id;
      v_to := least(v_today + 6, coalesce(r.end_date, v_today + 6));
    end if;
    for d in select g::date from generate_series(greatest(r.start_date, coalesce(r.last_date + 1, r.start_date), v_today), v_to, interval '1 day') g loop
      continue when not private.ops_recurrence_matches(r.frequency, r.weekdays, r.month_day, d);
      v_new := null;
      if r.kind = 'tarefa' then
        insert into public.ops_tasks (title, description, client_id, sector_id, status_id, priority, start_date, due_date, effort_hours,
                                      visibility, created_by, updated_by, recurrence_id, occurrence_date)
        values (t.title, t.description, t.client_id, t.sector_id, 'nao_iniciado', t.priority, d, d + v_offset, t.effort_hours,
                t.visibility, r.created_by, r.created_by, r.id, d)
        on conflict (recurrence_id, occurrence_date) do nothing
        returning id into v_new;
        if v_new is not null then
          insert into public.ops_task_tags (task_id, tag_id) select v_new, tag_id from public.ops_task_tags where task_id = t.id;
          insert into public.ops_task_people (task_id, user_id, role)
            select v_new, p.user_id, p.role from public.ops_task_people p where p.task_id = t.id and private.ops_member_ok(p.user_id);
          perform private.ops_log(v_new, t.client_id, 'tarefa.criada', null,
            private.ops_task_snapshot(v_new) || jsonb_build_object('repeticao', t.number), 'sistema');
          v_count := v_count + 1;
        end if;
      else
        insert into public.ops_meetings (title, category_id, starts_at, duration_min, sector_id, client_id, location, agenda,
                                         organizer_id, created_by, updated_by, recurrence_id, occurrence_date)
        values (m.title, m.category_id, (d + (m.starts_at at time zone 'America/Sao_Paulo')::time) at time zone 'America/Sao_Paulo',
                m.duration_min, m.sector_id, m.client_id, m.location, m.agenda, m.organizer_id, r.created_by, r.created_by, r.id, d)
        on conflict (recurrence_id, occurrence_date) do nothing
        returning id into v_new;
        if v_new is not null then
          insert into public.ops_meeting_people (meeting_id, user_id)
            select v_new, p.user_id from public.ops_meeting_people p where p.meeting_id = m.id and private.ops_member_ok(p.user_id);
          insert into public.ops_activity (meeting_id, client_id, action, actor_id, origin, after)
          values (v_new, m.client_id, 'reuniao.criada', null, 'sistema',
                  private.ops_meeting_snapshot(v_new) || jsonb_build_object('repeticao', m.number, 'reuniao',
                    (select number from public.ops_meetings where id = v_new), 'titulo_reuniao', m.title));
          v_count := v_count + 1;
        end if;
      end if;
    end loop;
    update public.ops_recurrences set last_date = greatest(coalesce(last_date, v_to), v_to) where id = r.id and v_to >= r.start_date;
    if r.end_date is not null and r.end_date <= v_to then
      update public.ops_recurrences set active = false, stopped_at = now(), stop_reason = 'Terminou na data final.' where id = r.id;
    end if;
  end loop;
  return v_count;
end;
$$;
revoke all on function private.ops_recurrence_generate(uuid) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Criar / parar repetição. p: {kind, source_id, frequency, weekdays, month_day, start_date, end_date}
-- -----------------------------------------------------------------------------
create function private.ops_recurrence_save_impl(p jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_kind text := p ->> 'kind';
  v_source uuid := nullif(p ->> 'source_id', '')::uuid;
  v_freq text := p ->> 'frequency';
  v_start date := nullif(p ->> 'start_date', '')::date;
  v_end date := nullif(p ->> 'end_date', '')::date;
  v_days smallint[] := array(select distinct x::smallint from jsonb_array_elements_text(coalesce(p -> 'weekdays', '[]')) x order by 1);
  v_mday smallint := nullif(p ->> 'month_day', '')::smallint;
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_id uuid;
  t record;
  m record;
begin
  if v_kind = 'tarefa' then
    select * into t from public.ops_tasks where id = v_source;
    if t.id is null or not private.ops_task_visible(v_source) then raise exception 'Tarefa não encontrada.' using errcode = '22023'; end if;
    perform private.ops_need('ops.tasks.create');
    if exists (select 1 from public.ops_task_people x where x.task_id = t.id and x.user_id <> (select auth.uid())) then
      perform private.ops_need('ops.tasks.assign');
    end if;
    if t.archived_at is not null then raise exception 'Tarefa arquivada não pode ser repetida.' using errcode = '22023'; end if;
    if t.recurrence_id is not null then raise exception 'Esta tarefa já é uma repetição. Altere a repetição pela tarefa original.' using errcode = '22023'; end if;
    if exists (select 1 from public.ops_recurrences where task_id = t.id and active) then
      raise exception 'Esta tarefa já se repete. Pare a repetição atual antes de criar outra.' using errcode = '22023';
    end if;
  elsif v_kind = 'reuniao' then
    select * into m from public.ops_meetings where id = v_source;
    if m.id is null or not private.ops_meeting_visible(v_source) then raise exception 'Reunião não encontrada.' using errcode = '22023'; end if;
    perform private.ops_need('ops.meetings.manage');
    if m.status = 'cancelada' then raise exception 'Reunião cancelada não pode ser repetida.' using errcode = '22023'; end if;
    if m.recurrence_id is not null then raise exception 'Esta reunião já é uma repetição. Altere a repetição pela reunião original.' using errcode = '22023'; end if;
    if exists (select 1 from public.ops_recurrences where meeting_id = m.id and active) then
      raise exception 'Esta reunião já se repete. Pare a repetição atual antes de criar outra.' using errcode = '22023';
    end if;
  else
    raise exception 'Tipo de repetição inválido.' using errcode = '22023';
  end if;
  if v_freq is null or v_freq not in ('diaria', 'dias_uteis', 'semanal', 'mensal') then raise exception 'Escolha a frequência.' using errcode = '22023'; end if;
  if v_freq = 'semanal' and cardinality(v_days) = 0 then raise exception 'Escolha os dias da semana.' using errcode = '22023'; end if;
  if v_freq = 'semanal' and exists (select 1 from unnest(v_days) x where x not between 0 and 6) then raise exception 'Dia da semana inválido.' using errcode = '22023'; end if;
  if v_freq = 'mensal' and (v_mday is null or v_mday not between 1 and 31) then raise exception 'Escolha o dia do mês (1 a 31).' using errcode = '22023'; end if;
  if v_start is null or v_start <= v_today then raise exception 'A repetição começa a partir de amanhã.' using errcode = '22023'; end if;
  if v_end is not null and v_end < v_start then raise exception 'A data final vem depois do início.' using errcode = '22023'; end if;
  insert into public.ops_recurrences (kind, task_id, meeting_id, frequency, weekdays, month_day, start_date, end_date, created_by)
  values (v_kind, case when v_kind = 'tarefa' then v_source end, case when v_kind = 'reuniao' then v_source end, v_freq,
          case when v_freq = 'semanal' then v_days end, case when v_freq = 'mensal' then v_mday end, v_start, v_end, (select auth.uid()))
  returning id into v_id;
  if v_kind = 'tarefa' then
    perform private.ops_log(t.id, t.client_id, 'tarefa.repeticao', null,
      jsonb_build_object('frequencia', v_freq, 'dias', to_jsonb(v_days), 'dia_mes', v_mday, 'inicio', v_start, 'fim', v_end));
  else
    perform private.ops_meeting_log(m.id, 'reuniao.repeticao', null,
      jsonb_build_object('frequencia', v_freq, 'dias', to_jsonb(v_days), 'dia_mes', v_mday, 'inicio', v_start, 'fim', v_end));
  end if;
  perform private.ops_recurrence_generate(v_id);
  return v_id;
end;
$$;
revoke all on function private.ops_recurrence_save_impl(jsonb) from public, anon;
grant execute on function private.ops_recurrence_save_impl(jsonb) to authenticated;
create function public.ops_recurrence_save(p jsonb)
returns uuid language sql set search_path = '' as $$ select private.ops_recurrence_save_impl(p) $$;
revoke all on function public.ops_recurrence_save(jsonb) from public, anon;
grant execute on function public.ops_recurrence_save(jsonb) to authenticated;

create function private.ops_recurrence_can_stop(p_rec uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.ops_recurrences r where r.id = p_rec and r.active and (
    r.created_by = (select auth.uid()) or private.is_admin()
    or (r.kind = 'tarefa' and private.ops_task_visible(r.task_id) and private.ops_can('ops.tasks.edit'))
    or (r.kind = 'reuniao' and private.ops_meeting_can_edit(r.meeting_id))))
$$;
revoke all on function private.ops_recurrence_can_stop(uuid) from public, anon;
grant execute on function private.ops_recurrence_can_stop(uuid) to authenticated;

create function private.ops_recurrence_stop_impl(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  r record;
begin
  select * into r from public.ops_recurrences where id = p_id for update;
  if r.id is null or not ((r.task_id is not null and private.ops_task_visible(r.task_id)) or (r.meeting_id is not null and private.ops_meeting_visible(r.meeting_id))) then
    raise exception 'Repetição não encontrada.' using errcode = '22023';
  end if;
  if not r.active then return; end if;
  if not private.ops_recurrence_can_stop(p_id) then raise exception 'Você não pode parar esta repetição.' using errcode = '42501'; end if;
  update public.ops_recurrences set active = false, stopped_by = (select auth.uid()), stopped_at = now(),
         stop_reason = 'Parada por ' || private.ops_person_name((select auth.uid())) || '.' where id = p_id;
  if r.kind = 'tarefa' then
    perform private.ops_log(r.task_id, (select client_id from public.ops_tasks where id = r.task_id), 'tarefa.repeticao_parada', null, null);
  else
    perform private.ops_meeting_log(r.meeting_id, 'reuniao.repeticao_parada', null, null);
  end if;
end;
$$;
revoke all on function private.ops_recurrence_stop_impl(uuid) from public, anon;
grant execute on function private.ops_recurrence_stop_impl(uuid) to authenticated;
create function public.ops_recurrence_stop(p_id uuid)
returns void language sql set search_path = '' as $$ select private.ops_recurrence_stop_impl(p_id) $$;
revoke all on function public.ops_recurrence_stop(uuid) from public, anon;
grant execute on function public.ops_recurrence_stop(uuid) to authenticated;

-- Repetição de uma tarefa/reunião (modelo ou ocorrência). p_kind: tarefa | reuniao
create function private.ops_recurrence_for_impl(p_kind text, p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_rec uuid;
  v_is_source boolean := false;
  r record;
begin
  if p_kind = 'tarefa' then
    if not private.ops_task_visible(p_id) then return null; end if;
    select id into v_rec from public.ops_recurrences where task_id = p_id order by active desc, created_at desc limit 1;
    v_is_source := v_rec is not null;
    if v_rec is null then select recurrence_id into v_rec from public.ops_tasks where id = p_id; end if;
  elsif p_kind = 'reuniao' then
    if not private.ops_meeting_visible(p_id) then return null; end if;
    select id into v_rec from public.ops_recurrences where meeting_id = p_id order by active desc, created_at desc limit 1;
    v_is_source := v_rec is not null;
    if v_rec is null then select recurrence_id into v_rec from public.ops_meetings where id = p_id; end if;
  else
    return null;
  end if;
  if v_rec is null then return null; end if;
  select * into r from public.ops_recurrences where id = v_rec;
  return jsonb_build_object('id', r.id, 'kind', r.kind, 'frequency', r.frequency, 'weekdays', to_jsonb(r.weekdays), 'month_day', r.month_day,
    'start_date', r.start_date, 'end_date', r.end_date, 'active', r.active, 'stop_reason', r.stop_reason, 'last_date', r.last_date,
    'is_source', v_is_source, 'source_id', coalesce(r.task_id, r.meeting_id),
    'source_number', case when r.kind = 'tarefa' then (select number from public.ops_tasks where id = r.task_id)
                          else (select number from public.ops_meetings where id = r.meeting_id) end,
    'occurrences', case when r.kind = 'tarefa' then (select count(*) from public.ops_tasks where recurrence_id = r.id)
                        else (select count(*) from public.ops_meetings where recurrence_id = r.id) end,
    'created_by_name', private.ops_person_name(r.created_by), 'can_stop', private.ops_recurrence_can_stop(r.id));
end;
$$;
revoke all on function private.ops_recurrence_for_impl(text, uuid) from public, anon;
grant execute on function private.ops_recurrence_for_impl(text, uuid) to authenticated;
create function public.ops_recurrence_for(p_kind text, p_id uuid)
returns jsonb language sql stable set search_path = '' as $$ select private.ops_recurrence_for_impl(p_kind, p_id) $$;
revoke all on function public.ops_recurrence_for(text, uuid) from public, anon;
grant execute on function public.ops_recurrence_for(text, uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- pg_cron: repetições às 00:03 e avisos às 07:52 (horário de Brasília = UTC−3)
-- -----------------------------------------------------------------------------
select cron.schedule('ops-recurrences', '3 3 * * *', 'select private.ops_recurrence_generate()');
select cron.schedule('ops-notify-daily', '52 10 * * *', 'select private.ops_notify_daily()');
