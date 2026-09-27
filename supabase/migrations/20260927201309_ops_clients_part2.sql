-- Etapa 36.3 (parte 2): tarefas guardam demanda, etapa do onboarding, obrigatória e coluna da fila.
-- Mesmas funções da 36.2, só com os campos novos.

create or replace function private.ops_task_snapshot(p_task uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'titulo', t.title, 'descricao', t.description, 'cliente', t.client_id, 'setor', t.sector_id, 'status', t.status_id,
    'prioridade', t.priority, 'inicio', t.start_date, 'prazo', t.due_date, 'esforco', t.effort_hours, 'visibilidade', t.visibility,
    'etapa', t.client_stage_id, 'obrigatoria', t.mandatory,
    'etiquetas', (select coalesce(jsonb_agg(g.name order by g.name), '[]') from public.ops_task_tags tt join public.ops_tags g on g.id = tt.tag_id where tt.task_id = t.id))
  from public.ops_tasks t where t.id = p_task
$$;

create or replace function private.ops_task_save_impl(p_id uuid, p_version integer, p jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := (select auth.uid());
  v_id uuid := p_id;
  v_before jsonb;
  v_after jsonb;
  v_old record;
  v_people jsonb := p -> 'people';
  v_others boolean;
  v_old_sector uuid;
  v_old_stage text;
begin
  if p_id is null then
    perform private.ops_need('ops.tasks.create');
  else
    select * into v_old from public.ops_tasks where id = p_id;
    if v_old.id is null or not private.ops_task_visible(p_id) then raise exception 'Tarefa não encontrada.' using errcode = '22023'; end if;
    perform private.ops_need('ops.tasks.edit');
    if v_old.archived_at is not null then raise exception 'Tarefa arquivada: desarquive para editar.' using errcode = '22023'; end if;
    if v_old.version <> coalesce(p_version, -1) then
      raise exception 'Alguém alterou esta tarefa antes de você. Recarregue para ver a versão atual.' using errcode = '40001';
    end if;
    v_old_sector := v_old.sector_id;
    v_old_stage := v_old.client_stage_id;
    if (p ->> 'sector_id')::uuid is distinct from v_old_sector then perform private.ops_need('ops.tasks.sector'); end if;
  end if;
  -- 36.3: etapa do onboarding (exige cliente) e "obrigatória para avançar".
  if nullif(p ->> 'client_stage_id', '') is not null then
    if nullif(p ->> 'client_id', '') is null then raise exception 'Etapa do onboarding só vale para tarefa de cliente.' using errcode = '22023'; end if;
    if not exists (select 1 from public.ops_client_stages where id = p ->> 'client_stage_id'
                   and (active or (p_id is not null and id = v_old_stage))) then
      raise exception 'Escolha uma etapa ativa do onboarding.' using errcode = '22023';
    end if;
  end if;
  if not exists (select 1 from public.ops_sectors where id = (p ->> 'sector_id')::uuid and (status = 'ativo' or id = v_old_sector)) then
    raise exception 'Escolha um setor ativo.' using errcode = '22023';
  end if;
  if nullif(p ->> 'client_id', '') is not null
     and not exists (select 1 from public.clients where id = (p ->> 'client_id')::uuid) then
    raise exception 'Cliente não encontrado.' using errcode = '22023';
  end if;

  if p_id is null then
    -- Colocar outras pessoas na tarefa exige "atribuir responsáveis".
    v_others := exists (select 1 from (
                          select v_people ->> 'principal' as u
                          union all select jsonb_array_elements_text(coalesce(v_people -> 'adicionais', '[]'))
                          union all select jsonb_array_elements_text(coalesce(v_people -> 'aprovadores', '[]'))
                          union all select jsonb_array_elements_text(coalesce(v_people -> 'observadores', '[]'))) x
                        where nullif(x.u, '') is not null and x.u::uuid <> v_me);
    if v_others then perform private.ops_need('ops.tasks.assign'); end if;
    insert into public.ops_tasks (title, description, client_id, sector_id, status_id, priority, start_date, due_date, effort_hours,
                                  visibility, created_by, updated_by, client_stage_id, mandatory)
    values (btrim(p ->> 'title'), nullif(btrim(p ->> 'description'), ''), nullif(p ->> 'client_id', '')::uuid, (p ->> 'sector_id')::uuid,
            coalesce(nullif(p ->> 'status_id', ''), 'nao_iniciado'), coalesce(nullif(p ->> 'priority', ''), 'media'),
            nullif(p ->> 'start_date', '')::date, nullif(p ->> 'due_date', '')::date, nullif(p ->> 'effort_hours', '')::numeric,
            coalesce(nullif(p ->> 'visibility', ''), 'setor'), v_me, v_me,
            nullif(p ->> 'client_stage_id', ''), coalesce((p ->> 'mandatory')::boolean, false) and nullif(p ->> 'client_stage_id', '') is not null)
    returning id into v_id;
    if not exists (select 1 from public.ops_statuses s join public.ops_tasks t on t.status_id = s.id where t.id = v_id and s.active) then
      raise exception 'Escolha um status ativo.' using errcode = '22023';
    end if;
    perform private.ops_write_people(v_id, coalesce(v_people, '{}'));
    perform private.ops_write_tags(v_id, p -> 'tags');
    update public.ops_tasks set completed_at = case when (select category from public.ops_statuses where id = status_id) = 'concluido' then now() end
     where id = v_id;
    perform private.ops_log(v_id, nullif(p ->> 'client_id', '')::uuid, 'tarefa.criada', null,
                            private.ops_task_snapshot(v_id) || jsonb_build_object('pessoas', private.ops_task_people_json(v_id)));
  else
    v_before := private.ops_task_snapshot(p_id);
    update public.ops_tasks
       set title = btrim(p ->> 'title'), description = nullif(btrim(p ->> 'description'), ''), client_id = nullif(p ->> 'client_id', '')::uuid,
           sector_id = (p ->> 'sector_id')::uuid, priority = coalesce(nullif(p ->> 'priority', ''), priority),
           start_date = nullif(p ->> 'start_date', '')::date, due_date = nullif(p ->> 'due_date', '')::date,
           effort_hours = nullif(p ->> 'effort_hours', '')::numeric, visibility = coalesce(nullif(p ->> 'visibility', ''), visibility),
           client_stage_id = case when p ? 'client_stage_id' then nullif(p ->> 'client_stage_id', '') else client_stage_id end,
           mandatory = case when p ? 'mandatory' then coalesce((p ->> 'mandatory')::boolean, false) else mandatory end,
           updated_by = v_me, version = version + 1
     where id = p_id;
    update public.ops_tasks set mandatory = false where id = p_id and mandatory and (client_stage_id is null or client_id is null);
    update public.ops_tasks set client_stage_id = null where id = p_id and client_id is null and client_stage_id is not null;
    if p ? 'tags' then perform private.ops_write_tags(p_id, p -> 'tags'); end if;
    v_after := private.ops_task_snapshot(p_id);
    if v_after is distinct from v_before then
      perform private.ops_log(p_id, coalesce(nullif(p ->> 'client_id', '')::uuid, v_old.client_id), 'tarefa.editada',
        (select jsonb_object_agg(k, v_before -> k) from jsonb_object_keys(v_before) k where v_before -> k is distinct from v_after -> k),
        (select jsonb_object_agg(k, v_after -> k) from jsonb_object_keys(v_after) k where v_before -> k is distinct from v_after -> k));
    end if;
  end if;
  return v_id;
end;
$$;

create or replace function private.ops_task_list_impl(f jsonb, p_limit integer, p_offset integer)
returns jsonb language sql stable security definer set search_path = '' as $$
  with me as (select (select auth.uid()) as id, (now() at time zone 'America/Sao_Paulo')::date as today),
  base as (
    select t.*, s.category, s.name as status_name, s.color as status_color, c.name as client_name
      from public.ops_tasks t
      join public.ops_statuses s on s.id = t.status_id
      left join public.clients c on c.id = t.client_id, me
     where private.ops_task_visible(t.id)
       and (case when coalesce((f ->> 'archived')::boolean, false) then t.archived_at is not null else t.archived_at is null end)
       and (nullif(f ->> 'q', '') is null or t.title ilike '%' || (f ->> 'q') || '%' or t.description ilike '%' || (f ->> 'q') || '%'
            or t.number::text = ltrim(f ->> 'q', '#') or c.name ilike '%' || (f ->> 'q') || '%')
       and (nullif(f ->> 'client_id', '') is null or t.client_id = (f ->> 'client_id')::uuid)
       and (nullif(f ->> 'sector_id', '') is null or t.sector_id = (f ->> 'sector_id')::uuid)
       and (nullif(f ->> 'demand_id', '') is null or t.demand_id = (f ->> 'demand_id')::uuid)
       and (jsonb_array_length(coalesce(f -> 'status_ids', '[]')) = 0 or t.status_id in (select jsonb_array_elements_text(f -> 'status_ids')))
       and (jsonb_array_length(coalesce(f -> 'categories', '[]')) = 0 or s.category in (select jsonb_array_elements_text(f -> 'categories')))
       and (jsonb_array_length(coalesce(f -> 'priorities', '[]')) = 0 or t.priority in (select jsonb_array_elements_text(f -> 'priorities')))
       and (nullif(f ->> 'person_id', '') is null
            or (f ->> 'person_id') = 'nenhum' and not exists (select 1 from public.ops_task_people p where p.task_id = t.id and p.role = 'principal')
            or exists (select 1 from public.ops_task_people p where p.task_id = t.id and p.user_id::text = f ->> 'person_id'))
       and (not coalesce((f ->> 'mine')::boolean, false) or exists (select 1 from public.ops_task_people p where p.task_id = t.id and p.user_id = me.id))
       and (case f ->> 'due'
              when 'atrasadas' then t.due_date < me.today and s.category not in ('concluido', 'cancelado')
              when 'hoje' then t.due_date = me.today
              when 'semana' then t.due_date between me.today and me.today + 7
              when 'sem_prazo' then t.due_date is null
              else true end)
  )
  select coalesce(jsonb_agg(row_to_json(r)::jsonb order by r.ord1, r.ord2, r.number desc), '[]') from (
    select b.id, b.number, b.title, b.client_id, b.client_name, b.sector_id, b.status_id, b.status_name, b.status_color, b.category,
           b.priority, b.start_date, b.due_date, b.visibility, b.version, b.created_at, b.updated_at, b.completed_at, b.archived_at,
           b.demand_id, b.client_stage_id, b.mandatory, b.queue_column_id,
           private.ops_task_people_json(b.id) as people,
           (select coalesce(jsonb_agg(g.name order by g.name), '[]') from public.ops_task_tags tt join public.ops_tags g on g.id = tt.tag_id where tt.task_id = b.id) as tags,
           private.ops_task_blockers(b.id) as blockers,
           (select count(*) from public.ops_comments cm where cm.task_id = b.id and cm.removed_at is null) as comments,
           (select count(*) from public.ops_attachments a where a.task_id = b.id and a.removed_at is null) as attachments,
           (b.due_date < (select today from me) and b.category not in ('concluido', 'cancelado')) as overdue,
           coalesce(b.due_date, 'infinity'::date) as ord1,
           case b.priority when 'urgente' then 1 when 'alta' then 2 when 'media' then 3 else 4 end as ord2
      from base b
     order by coalesce(b.due_date, 'infinity'::date), case b.priority when 'urgente' then 1 when 'alta' then 2 when 'media' then 3 else 4 end, b.number desc
     limit least(greatest(coalesce(p_limit, 200), 1), 500) offset greatest(coalesce(p_offset, 0), 0)
  ) r
$$;

create or replace function private.ops_task_get_impl(p_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select case when not private.ops_task_visible(p_id) then null else (
    select jsonb_build_object(
      'task', to_jsonb(t) || jsonb_build_object('client_name', c.name, 'category', s.category, 'status_name', s.name, 'status_color', s.color,
                                                'created_by_name', cb.full_name, 'blockers', private.ops_task_blockers(t.id)),
      'people', private.ops_task_people_json(t.id),
      'demand', (select jsonb_build_object('id', dm.id, 'number', dm.number, 'title', dm.title,
                   'tasks', (select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'number', o.number, 'sector_id', o.sector_id,
                                     'title', case when private.ops_task_visible(o.id) then o.title end, 'status_name', os.name, 'status_color', os.color,
                                     'done', os.category in ('concluido', 'cancelado'), 'visible', private.ops_task_visible(o.id)) order by o.number), '[]')
                               from public.ops_tasks o join public.ops_statuses os on os.id = o.status_id where o.demand_id = dm.id))
                 from public.ops_demands dm where dm.id = t.demand_id),
      'stage_name', (select st.name from public.ops_client_stages st where st.id = t.client_stage_id),
      'tags', (select coalesce(jsonb_agg(g.name order by g.name), '[]') from public.ops_task_tags tt join public.ops_tags g on g.id = tt.tag_id where tt.task_id = t.id),
      'depends_on', (select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'number', o.number, 'title', o.title, 'status_name', os.name,
                                                                  'status_color', os.color, 'done', os.category in ('concluido', 'cancelado'),
                                                                  'visible', private.ops_task_visible(o.id)) order by o.number), '[]')
                       from public.ops_task_deps d join public.ops_tasks o on o.id = d.depends_on_id join public.ops_statuses os on os.id = o.status_id
                      where d.task_id = t.id),
      'dependents', (select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'number', o.number, 'title', o.title) order by o.number), '[]')
                       from public.ops_task_deps d join public.ops_tasks o on o.id = d.task_id
                      where d.depends_on_id = t.id and private.ops_task_visible(o.id)),
      'comments', (select coalesce(jsonb_agg(jsonb_build_object('id', cm.id, 'author_id', cm.author_id, 'author', pa.full_name, 'body', cm.body,
                                                                'created_at', cm.created_at,
                                                                'mentions', (select coalesce(jsonb_agg(pm.full_name order by pm.full_name), '[]')
                                                                               from public.ops_mentions m join public.profiles pm on pm.id = m.user_id
                                                                              where m.comment_id = cm.id)) order by cm.created_at), '[]')
                     from public.ops_comments cm left join public.profiles pa on pa.id = cm.author_id
                    where cm.task_id = t.id and cm.removed_at is null),
      'attachments', (select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'name', a.name, 'mime', a.mime, 'size_bytes', a.size_bytes, 'path', a.path,
                                                                   'uploaded_by', a.uploaded_by, 'uploader', pu.full_name, 'created_at', a.created_at)
                                                order by a.created_at), '[]')
                        from public.ops_attachments a left join public.profiles pu on pu.id = a.uploaded_by
                       where a.task_id = t.id and a.removed_at is null),
      'activity', (select coalesce(jsonb_agg(y.x order by y.created_at desc), '[]') from (
                     select jsonb_build_object('id', h.id, 'action', h.action, 'actor', ph.full_name, 'origin', h.origin, 'before', h.before,
                                               'after', h.after, 'created_at', h.created_at) as x, h.created_at
                       from public.ops_activity h left join public.profiles ph on ph.id = h.actor_id
                      where h.task_id = t.id order by h.created_at desc limit 200) y),
      'can', jsonb_build_object('edit', private.ops_can('ops.tasks.edit'), 'move', private.ops_can('ops.cards.move') or private.ops_can('ops.tasks.edit'),
                                'assign', private.ops_can('ops.tasks.assign'), 'archive', private.ops_can('ops.tasks.archive'),
                                'sector', private.ops_can('ops.tasks.sector'), 'admin', private.is_admin()))
      from public.ops_tasks t
      join public.ops_statuses s on s.id = t.status_id
      left join public.clients c on c.id = t.client_id
      left join public.profiles cb on cb.id = t.created_by
     where t.id = p_id) end
$$;
