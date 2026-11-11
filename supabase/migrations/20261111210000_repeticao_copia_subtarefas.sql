-- T5.32 etapa 6 — A repetição de tarefa também copia as subtarefas (abertas, não arquivadas) da tarefa modelo.
-- As subtarefas nascem no status inicial, com os mesmos setor/prioridade/responsáveis e o prazo na mesma distância da data de início.
create or replace function private.ops_recurrence_generate(p_rec uuid default null)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_count integer := 0;
  r record;
  t record;
  m record;
  c record;
  d date;
  v_to date;
  v_new uuid;
  v_child uuid;
  v_offset integer;
begin
  for r in select * from public.ops_recurrences where active and (p_rec is null or id = p_rec) for update skip locked loop
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
          if not exists (select 1 from public.ops_task_people where task_id = v_new and role = 'principal') then
            update public.ops_task_people set role = 'principal' where task_id = v_new and user_id = r.created_by;
            insert into public.ops_task_people (task_id, user_id, role) select v_new, r.created_by, 'principal'
             where not exists (select 1 from public.ops_task_people where task_id = v_new and role = 'principal') on conflict do nothing;
          end if;
          perform private.ops_log(v_new, t.client_id, 'tarefa.criada', null,
            private.ops_task_snapshot(v_new) || jsonb_build_object('repeticao', t.number), 'sistema');
          v_count := v_count + 1;
          -- T5.32: copia as subtarefas abertas da tarefa modelo (só se o modelo é uma tarefa principal)
          if t.parent_id is null then
            for c in select * from public.ops_tasks
                      where parent_id = t.id and archived_at is null and deleted_at is null
                      order by sub_position, number loop
              insert into public.ops_tasks (title, description, client_id, sector_id, status_id, priority, due_date, effort_hours,
                                            visibility, created_by, updated_by, parent_id, sub_position)
              values (c.title, c.description, t.client_id, c.sector_id, 'nao_iniciado', c.priority,
                      case when c.due_date is not null then d + (c.due_date - coalesce(t.start_date, t.due_date, c.due_date)) end,
                      c.effort_hours, c.visibility, r.created_by, r.created_by, v_new, c.sub_position)
              returning id into v_child;
              insert into public.ops_task_people (task_id, user_id, role)
                select v_child, p.user_id, p.role from public.ops_task_people p where p.task_id = c.id and private.ops_member_ok(p.user_id);
              if not exists (select 1 from public.ops_task_people where task_id = v_child and role = 'principal') then
                update public.ops_task_people set role = 'principal' where task_id = v_child and user_id = r.created_by;
                insert into public.ops_task_people (task_id, user_id, role) select v_child, r.created_by, 'principal'
                 where not exists (select 1 from public.ops_task_people where task_id = v_child and role = 'principal') on conflict do nothing;
              end if;
              perform private.ops_log(v_child, t.client_id, 'tarefa.criada', null,
                private.ops_task_snapshot(v_child) || jsonb_build_object('repeticao', t.number), 'sistema');
            end loop;
          end if;
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
