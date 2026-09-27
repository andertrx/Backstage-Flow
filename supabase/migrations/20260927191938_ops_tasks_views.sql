-- Etapa 36.2 (parte 3): lista, detalhe, listas para escolher, contagens e status configuráveis.
-- -----------------------------------------------------------------------------
-- Lista (filtros) e detalhe
-- f: {q, client_id, sector_id, status_ids[], priorities[], person_id, mine, due ('atrasadas'|'hoje'|'semana'|'sem_prazo'),
--     archived (false), categories[]}
-- -----------------------------------------------------------------------------
create function private.ops_task_list_impl(f jsonb, p_limit integer, p_offset integer)
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
revoke all on function private.ops_task_list_impl(jsonb, integer, integer) from public, anon;
grant execute on function private.ops_task_list_impl(jsonb, integer, integer) to authenticated;
create function public.ops_task_list(f jsonb default '{}', p_limit integer default 200, p_offset integer default 0)
returns jsonb language sql stable set search_path = '' as $$ select private.ops_task_list_impl(f, p_limit, p_offset) $$;
revoke all on function public.ops_task_list(jsonb, integer, integer) from public, anon;
grant execute on function public.ops_task_list(jsonb, integer, integer) to authenticated;

create function private.ops_task_get_impl(p_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select case when not private.ops_task_visible(p_id) then null else (
    select jsonb_build_object(
      'task', to_jsonb(t) || jsonb_build_object('client_name', c.name, 'category', s.category, 'status_name', s.name, 'status_color', s.color,
                                                'created_by_name', cb.full_name, 'blockers', private.ops_task_blockers(t.id)),
      'people', private.ops_task_people_json(t.id),
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
revoke all on function private.ops_task_get_impl(uuid) from public, anon;
grant execute on function private.ops_task_get_impl(uuid) to authenticated;
create function public.ops_task_get(p_id uuid)
returns jsonb language sql stable set search_path = '' as $$ select private.ops_task_get_impl(p_id) $$;
revoke all on function public.ops_task_get(uuid) from public, anon;
grant execute on function public.ops_task_get(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Listas para escolher: pessoas (ativas na Central) e clientes.
-- Clientes: quem cria tarefas vê os nomes dos clientes ativos/pausados; os
-- demais só os clientes das tarefas que enxergam. Só nome e situação: nada de
-- anúncios.
-- -----------------------------------------------------------------------------
create function private.ops_directory_impl()
returns jsonb language sql stable security definer set search_path = '' as $$
  select case when not private.ops_can('ops.access') then null else jsonb_build_object(
    'people', (select coalesce(jsonb_agg(jsonb_build_object('user_id', p.id, 'name', p.full_name,
                                                             'sector_id', (select s.sector_id from public.ops_member_sectors s where s.user_id = p.id and s.is_primary),
                                                             'sectors', (select coalesce(jsonb_agg(s.sector_id), '[]') from public.ops_member_sectors s where s.user_id = p.id))
                                          order by p.full_name), '[]')
                 from public.profiles p where private.ops_member_ok(p.id)),
    'clients', (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'status', c.status) order by c.name), '[]')
                  from public.clients c
                 where (private.ops_can('ops.tasks.create') and c.status <> 'encerrado')
                    or exists (select 1 from public.ops_tasks t where t.client_id = c.id and private.ops_task_visible(t.id)))) end
$$;
revoke all on function private.ops_directory_impl() from public, anon;
grant execute on function private.ops_directory_impl() to authenticated;
create function public.ops_directory()
returns jsonb language sql stable set search_path = '' as $$ select private.ops_directory_impl() $$;
revoke all on function public.ops_directory() from public, anon;
grant execute on function public.ops_directory() to authenticated;

-- Contagens por pessoa (aba Equipe). Só tarefas não arquivadas.
create function private.ops_team_counts_impl()
returns table (user_id uuid, abertas bigint, em_andamento bigint, atrasadas bigint, concluidas_30d bigint, proxima_entrega date)
language sql stable security definer set search_path = '' as $$
  with today as (select (now() at time zone 'America/Sao_Paulo')::date as d)
  select p.user_id,
         count(distinct t.id) filter (where s.category not in ('concluido', 'cancelado')),
         count(distinct t.id) filter (where s.category = 'andamento'),
         count(distinct t.id) filter (where s.category not in ('concluido', 'cancelado') and t.due_date < (select d from today)),
         count(distinct t.id) filter (where s.category = 'concluido' and t.completed_at > now() - interval '30 days'),
         min(t.due_date) filter (where s.category not in ('concluido', 'cancelado') and t.due_date >= (select d from today))
    from public.ops_task_people p
    join public.ops_tasks t on t.id = p.task_id and t.archived_at is null
    join public.ops_statuses s on s.id = t.status_id
   where private.ops_can('ops.access') and p.role in ('principal', 'adicional')
   group by p.user_id
$$;
revoke all on function private.ops_team_counts_impl() from public, anon;
grant execute on function private.ops_team_counts_impl() to authenticated;
create function public.ops_team_counts()
returns table (user_id uuid, abertas bigint, em_andamento bigint, atrasadas bigint, concluidas_30d bigint, proxima_entrega date)
language sql stable set search_path = '' as $$ select * from private.ops_team_counts_impl() $$;
revoke all on function public.ops_team_counts() from public, anon;
grant execute on function public.ops_team_counts() to authenticated;

-- -----------------------------------------------------------------------------
-- Status configuráveis (admin). Desativar status em uso pede o destino.
-- -----------------------------------------------------------------------------
create function private.ops_status_save_impl(p_id text, p_name text, p_color text, p_category text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_id text := p_id;
  v_before jsonb;
begin
  perform private.ops_require_admin();
  if exists (select 1 from public.ops_statuses where lower(btrim(name)) = lower(btrim(p_name)) and id is distinct from p_id) then
    raise exception 'Já existe um status com esse nome.' using errcode = '22023';
  end if;
  if p_id is null then
    insert into public.ops_statuses (name, color, category, position, updated_by)
    values (btrim(p_name), p_color, p_category, coalesce((select max(position) from public.ops_statuses), 0) + 1, (select auth.uid()))
    returning id into v_id;
  else
    select to_jsonb(s) into v_before from public.ops_statuses s where id = p_id;
    if v_before is null then raise exception 'Status não encontrado.' using errcode = '22023'; end if;
    -- O grupo de um status em uso não muda (os números antigos continuariam certos).
    if p_category is distinct from v_before ->> 'category' and exists (select 1 from public.ops_tasks where status_id = p_id) then
      raise exception 'Este status já está em uso: o grupo não pode mudar. Crie um status novo.' using errcode = '22023';
    end if;
    update public.ops_statuses set name = btrim(p_name), color = p_color, category = p_category, updated_by = (select auth.uid()), updated_at = now()
     where id = p_id;
  end if;
  insert into public.audit_logs (actor_id, action, target_type, target_id, details)
  values ((select auth.uid()), case when p_id is null then 'ops.status.create' else 'ops.status.update' end, 'ops_status', v_id,
          jsonb_build_object('antes', v_before, 'depois', jsonb_build_object('nome', btrim(p_name), 'cor', p_color, 'grupo', p_category)));
  return v_id;
end;
$$;
revoke all on function private.ops_status_save_impl(text, text, text, text) from public, anon;
grant execute on function private.ops_status_save_impl(text, text, text, text) to authenticated;
create function public.ops_status_save(p_id text, p_name text, p_color text, p_category text)
returns text language sql set search_path = '' as $$ select private.ops_status_save_impl(p_id, p_name, p_color, p_category) $$;
revoke all on function public.ops_status_save(text, text, text, text) from public, anon;
grant execute on function public.ops_status_save(text, text, text, text) to authenticated;

create function private.ops_status_reorder_impl(p_ids text[])
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.ops_require_admin();
  update public.ops_statuses s set position = o.ord, updated_at = now(), updated_by = (select auth.uid())
    from unnest(p_ids) with ordinality as o(id, ord) where s.id = o.id;
  insert into public.audit_logs (actor_id, action, target_type, target_id, details)
  values ((select auth.uid()), 'ops.status.reorder', 'ops_status', null, jsonb_build_object('ordem', to_jsonb(p_ids)));
end;
$$;
revoke all on function private.ops_status_reorder_impl(text[]) from public, anon;
grant execute on function private.ops_status_reorder_impl(text[]) to authenticated;
create function public.ops_status_reorder(p_ids text[])
returns void language sql set search_path = '' as $$ select private.ops_status_reorder_impl(p_ids) $$;
revoke all on function public.ops_status_reorder(text[]) from public, anon;
grant execute on function public.ops_status_reorder(text[]) to authenticated;

create function private.ops_status_set_active_impl(p_id text, p_active boolean, p_move_to text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_count integer;
  v_task record;
begin
  perform private.ops_require_admin();
  if not exists (select 1 from public.ops_statuses where id = p_id) then raise exception 'Status não encontrado.' using errcode = '22023'; end if;
  if not p_active then
    if (select count(*) from public.ops_statuses where active and id <> p_id) = 0 then
      raise exception 'Precisa haver pelo menos um status ativo.' using errcode = '22023';
    end if;
    select count(*) into v_count from public.ops_tasks where status_id = p_id and archived_at is null;
    if v_count > 0 then
      if p_move_to is null then
        raise exception 'Há % tarefa(s) neste status. Escolha para qual status elas vão antes de desativar.', v_count using errcode = '22023';
      end if;
      if p_move_to = p_id or not exists (select 1 from public.ops_statuses where id = p_move_to and active) then
        raise exception 'Escolha um status de destino ativo e diferente deste.' using errcode = '22023';
      end if;
      for v_task in select id, client_id from public.ops_tasks where status_id = p_id and archived_at is null loop
        update public.ops_tasks set status_id = p_move_to, version = version + 1, updated_by = (select auth.uid()) where id = v_task.id;
        perform private.ops_log(v_task.id, v_task.client_id, 'tarefa.status', jsonb_build_object('status', p_id),
                                jsonb_build_object('status', p_move_to, 'motivo', 'status desativado pelo admin'), 'sistema');
      end loop;
    end if;
  end if;
  update public.ops_statuses set active = p_active, updated_at = now(), updated_by = (select auth.uid()) where id = p_id;
  insert into public.audit_logs (actor_id, action, target_type, target_id, details)
  values ((select auth.uid()), 'ops.status.active', 'ops_status', p_id,
          jsonb_build_object('ativo', p_active, 'tarefas_movidas', coalesce(v_count, 0), 'destino', p_move_to));
end;
$$;
revoke all on function private.ops_status_set_active_impl(text, boolean, text) from public, anon;
grant execute on function private.ops_status_set_active_impl(text, boolean, text) to authenticated;
create function public.ops_status_set_active(p_id text, p_active boolean, p_move_to text default null)
returns void language sql set search_path = '' as $$ select private.ops_status_set_active_impl(p_id, p_active, p_move_to) $$;
revoke all on function public.ops_status_set_active(text, boolean, text) from public, anon;
grant execute on function public.ops_status_set_active(text, boolean, text) to authenticated;
