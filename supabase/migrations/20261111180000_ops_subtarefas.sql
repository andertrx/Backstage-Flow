-- (Aplicada em 3 partes no Supabase: ops_subtarefas_a_estrutura_e_salvar, _b_arquivar_e_ordem, _c_leitura_e_lista. Este arquivo é o espelho completo.)
-- T5.32 (Etapa 1) — Subtarefas na Central de Operações.
-- Subtarefa É uma tarefa de verdade (número, status, setor, pessoas, prazo, comentários, histórico), ligada a uma tarefa principal.
-- Um nível só: a principal não pode ser subtarefa e a subtarefa não tem subtarefas.
-- A subtarefa herda cliente e etapa do onboarding da principal; setor, pessoas e prazo são dela.
-- Finalizar a principal exige subtarefas concluídas ou canceladas. Arquivar/excluir a principal leva as subtarefas juntas.
-- Tarefa única continua sendo o normal: nada muda para quem não usa subtarefas.

alter table public.ops_tasks
  add column parent_id uuid references public.ops_tasks (id),
  add column sub_position integer not null default 0,
  add constraint ops_tasks_parent_not_self check (parent_id is null or parent_id <> id);
create index ops_tasks_parent_idx on public.ops_tasks (parent_id, sub_position) where parent_id is not null;
comment on column public.ops_tasks.parent_id is 'T5.32: tarefa principal desta subtarefa (um nível só).';
comment on column public.ops_tasks.sub_position is 'T5.32: ordem da subtarefa dentro da principal.';

-- Foto da tarefa (histórico de edições) passa a incluir a tarefa principal.
create or replace function private.ops_task_snapshot(p_task uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'titulo', t.title, 'descricao', t.description, 'cliente', t.client_id, 'setor', t.sector_id, 'status', t.status_id,
    'prioridade', t.priority, 'inicio', t.start_date, 'prazo', t.due_date, 'esforco', t.effort_hours, 'visibilidade', t.visibility,
    'etapa', t.client_stage_id, 'obrigatoria', t.mandatory, 'principal', t.parent_id,
    'etiquetas', (select coalesce(jsonb_agg(g.name order by g.name), '[]') from public.ops_task_tags tt join public.ops_tags g on g.id = tt.tag_id where tt.task_id = t.id))
  from public.ops_tasks t where t.id = p_task
$$;

-- Confere a tarefa principal escolhida (visível, ativa, de primeiro nível, diferente da própria tarefa).
create function private.ops_subtask_parent(p_parent uuid, p_self uuid)
returns public.ops_tasks language plpgsql stable security definer set search_path = '' as $$
declare v public.ops_tasks;
begin
  select * into v from public.ops_tasks where id = p_parent;
  if v.id is null or v.deleted_at is not null or not private.ops_task_visible(p_parent) then
    raise exception 'Tarefa principal não encontrada.' using errcode = '22023';
  end if;
  if p_self is not null and v.id = p_self then raise exception 'Uma tarefa não pode ser subtarefa dela mesma.' using errcode = '22023'; end if;
  if v.archived_at is not null then raise exception 'A tarefa principal está arquivada: desarquive para incluir subtarefas.' using errcode = '22023'; end if;
  if v.parent_id is not null then raise exception 'Subtarefa não pode ter subtarefas (só um nível).' using errcode = '22023'; end if;
  return v;
end;
$$;
revoke all on function private.ops_subtask_parent(uuid, uuid) from public, anon, authenticated;

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
  v_par public.ops_tasks;
  v_set_parent boolean := false;
  v_new_parent uuid;
  v_client uuid := nullif(p ->> 'client_id', '')::uuid;
  v_stage text := nullif(p ->> 'client_stage_id', '');
  v_mand boolean := coalesce((p ->> 'mandatory')::boolean, false);
  v_vis text := nullif(p ->> 'visibility', '');
  v_pos integer;
  v_num integer;
begin
  if p_id is null then
    perform private.ops_need('ops.tasks.create');
    if nullif(p ->> 'parent_id', '') is not null then
      perform private.ops_need('ops.tasks.edit');
      v_par := private.ops_subtask_parent((p ->> 'parent_id')::uuid, null);
      v_new_parent := v_par.id;
      v_set_parent := true;
    end if;
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
    v_new_parent := v_old.parent_id;
    if p ? 'parent_id' and nullif(p ->> 'parent_id', '')::uuid is distinct from v_old.parent_id then
      v_new_parent := nullif(p ->> 'parent_id', '')::uuid;
      v_set_parent := true;
      if v_new_parent is not null then
        if exists (select 1 from public.ops_tasks where parent_id = p_id and deleted_at is null) then
          raise exception 'Esta tarefa já tem subtarefas: não pode virar subtarefa de outra (só um nível).' using errcode = '22023';
        end if;
        v_par := private.ops_subtask_parent(v_new_parent, p_id);
      end if;
    elsif v_old.parent_id is not null then
      select * into v_par from public.ops_tasks where id = v_old.parent_id;
    end if;
  end if;
  -- subtarefa herda cliente e etapa do onboarding da principal; nunca é "obrigatória" por si
  if v_par.id is not null then
    v_client := v_par.client_id;
    v_stage := v_par.client_stage_id;
    v_mand := false;
    if p_id is null and v_vis is null then v_vis := v_par.visibility; end if;
  end if;
  if v_stage is not null then
    if v_client is null then raise exception 'Etapa do onboarding só vale para tarefa de cliente.' using errcode = '22023'; end if;
    if not exists (select 1 from public.ops_client_stages where id = v_stage
                   and (active or (p_id is not null and id = v_old_stage) or v_par.id is not null)) then
      raise exception 'Escolha uma etapa ativa do onboarding.' using errcode = '22023';
    end if;
  end if;
  if not exists (select 1 from public.ops_sectors where id = (p ->> 'sector_id')::uuid and (status = 'ativo' or id = v_old_sector)) then
    raise exception 'Escolha um setor ativo.' using errcode = '22023';
  end if;
  if v_client is not null and not exists (select 1 from public.clients where id = v_client) then
    raise exception 'Cliente não encontrado.' using errcode = '22023';
  end if;
  if v_set_parent and v_new_parent is not null then
    select coalesce(max(sub_position), 0) + 1 into v_pos from public.ops_tasks where parent_id = v_new_parent;
  end if;

  if p_id is null then
    v_others := exists (select 1 from (
                          select v_people ->> 'principal' as u
                          union all select jsonb_array_elements_text(coalesce(v_people -> 'adicionais', '[]'))
                          union all select jsonb_array_elements_text(coalesce(v_people -> 'aprovadores', '[]'))
                          union all select jsonb_array_elements_text(coalesce(v_people -> 'observadores', '[]'))) x
                        where nullif(x.u, '') is not null and x.u::uuid <> v_me);
    if v_others then perform private.ops_need('ops.tasks.assign'); end if;
    insert into public.ops_tasks (title, description, client_id, sector_id, status_id, priority, start_date, due_date, effort_hours,
                                  visibility, created_by, updated_by, client_stage_id, mandatory, parent_id, sub_position)
    values (btrim(p ->> 'title'), nullif(btrim(p ->> 'description'), ''), v_client, (p ->> 'sector_id')::uuid,
            coalesce(nullif(p ->> 'status_id', ''), 'nao_iniciado'), coalesce(nullif(p ->> 'priority', ''), 'media'),
            nullif(p ->> 'start_date', '')::date, nullif(p ->> 'due_date', '')::date, nullif(p ->> 'effort_hours', '')::numeric,
            coalesce(v_vis, 'setor'), v_me, v_me,
            v_stage, v_mand and v_stage is not null, v_new_parent, coalesce(v_pos, 0))
    returning id into v_id;
    if not exists (select 1 from public.ops_statuses s join public.ops_tasks t on t.status_id = s.id where t.id = v_id and s.active) then
      raise exception 'Escolha um status ativo.' using errcode = '22023';
    end if;
    perform private.ops_write_people(v_id, coalesce(v_people, '{}'));
    perform private.ops_write_tags(v_id, p -> 'tags');
    update public.ops_tasks set completed_at = case when (select category from public.ops_statuses where id = status_id) = 'concluido' then now() end
     where id = v_id;
    perform private.ops_log(v_id, v_client, 'tarefa.criada', null,
                            private.ops_task_snapshot(v_id) || jsonb_build_object('pessoas', private.ops_task_people_json(v_id)));
    if v_new_parent is not null then
      select number into v_num from public.ops_tasks where id = v_id;
      perform private.ops_log(v_new_parent, v_client, 'tarefa.subtarefa_criada', null, jsonb_build_object('numero', v_num, 'titulo', btrim(p ->> 'title')));
    end if;
  else
    v_before := private.ops_task_snapshot(p_id);
    update public.ops_tasks
       set title = btrim(p ->> 'title'), description = nullif(btrim(p ->> 'description'), ''), client_id = v_client,
           sector_id = (p ->> 'sector_id')::uuid, priority = coalesce(nullif(p ->> 'priority', ''), priority),
           start_date = nullif(p ->> 'start_date', '')::date, due_date = nullif(p ->> 'due_date', '')::date,
           effort_hours = nullif(p ->> 'effort_hours', '')::numeric, visibility = coalesce(nullif(p ->> 'visibility', ''), visibility),
           client_stage_id = case when v_par.id is not null then v_stage when p ? 'client_stage_id' then v_stage else client_stage_id end,
           mandatory = case when v_par.id is not null then false when p ? 'mandatory' then v_mand else mandatory end,
           parent_id = case when v_set_parent then v_new_parent else parent_id end,
           sub_position = case when v_set_parent then coalesce(v_pos, 0) else sub_position end,
           updated_by = v_me, version = version + 1
     where id = p_id;
    update public.ops_tasks set mandatory = false where id = p_id and mandatory and (client_stage_id is null or client_id is null);
    update public.ops_tasks set client_stage_id = null where id = p_id and client_id is null and client_stage_id is not null;
    if p ? 'tags' then perform private.ops_write_tags(p_id, p -> 'tags'); end if;
    -- principal mudou de cliente/etapa: as subtarefas acompanham
    update public.ops_tasks c set client_id = t.client_id, client_stage_id = t.client_stage_id, version = c.version + 1, updated_by = v_me
      from public.ops_tasks t
     where t.id = p_id and c.parent_id = p_id and (c.client_id is distinct from t.client_id or c.client_stage_id is distinct from t.client_stage_id);
    if v_set_parent then
      select number into v_num from public.ops_tasks where id = p_id;
      if v_new_parent is not null then
        perform private.ops_log(v_new_parent, v_client, 'tarefa.subtarefa_incluida', null, jsonb_build_object('numero', v_num, 'titulo', btrim(p ->> 'title')));
      end if;
      if v_old.parent_id is not null then
        perform private.ops_log(v_old.parent_id, v_old.client_id, 'tarefa.subtarefa_removida', null, jsonb_build_object('numero', v_num, 'titulo', btrim(p ->> 'title')));
      end if;
    end if;
    v_after := private.ops_task_snapshot(p_id);
    if v_after is distinct from v_before then
      perform private.ops_log(p_id, coalesce(v_client, v_old.client_id), 'tarefa.editada',
        (select jsonb_object_agg(k, v_before -> k) from jsonb_object_keys(v_before) k where v_before -> k is distinct from v_after -> k),
        (select jsonb_object_agg(k, v_after -> k) from jsonb_object_keys(v_after) k where v_before -> k is distinct from v_after -> k));
    end if;
  end if;
  return v_id;
end;
$$;

-- Finalizar a principal exige subtarefas concluídas ou canceladas.
create or replace function private.ops_task_set_status_impl(p_id uuid, p_version integer, p_status text)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_old record;
  v_cat text;
  v_blockers integer;
  v_abertas integer;
begin
  select * into v_old from public.ops_tasks where id = p_id;
  if v_old.id is null or not private.ops_task_visible(p_id) then raise exception 'Tarefa não encontrada.' using errcode = '22023'; end if;
  if not (private.ops_can('ops.cards.move') or private.ops_can('ops.tasks.edit')) then
    raise exception 'Você não tem permissão para mudar o status desta tarefa.' using errcode = '42501';
  end if;
  if v_old.archived_at is not null then raise exception 'Tarefa arquivada: desarquive para mudar o status.' using errcode = '22023'; end if;
  if v_old.version <> coalesce(p_version, -1) then
    raise exception 'Alguém alterou esta tarefa antes de você. Recarregue para ver a versão atual.' using errcode = '40001';
  end if;
  select category into v_cat from public.ops_statuses where id = p_status and active;
  if v_cat is null then raise exception 'Status inválido ou desativado.' using errcode = '22023'; end if;
  if p_status = v_old.status_id then return v_old.version; end if;
  v_blockers := private.ops_task_blockers(p_id);
  if v_cat = 'concluido' and v_blockers > 0 then
    raise exception 'Esta tarefa depende de % tarefa(s) ainda aberta(s). Conclua ou retire a dependência antes de finalizar.', v_blockers using errcode = '22023';
  end if;
  if v_cat = 'concluido' then
    select count(*) into v_abertas from public.ops_tasks c join public.ops_statuses cs on cs.id = c.status_id
     where c.parent_id = p_id and c.archived_at is null and c.deleted_at is null and cs.category not in ('concluido', 'cancelado');
    if v_abertas > 0 then
      raise exception 'Esta tarefa tem % subtarefa(s) em aberto. Conclua ou cancele as subtarefas antes de finalizar.', v_abertas using errcode = '22023';
    end if;
  end if;
  update public.ops_tasks
     set status_id = p_status, version = version + 1, updated_by = (select auth.uid()),
         completed_at = case when v_cat = 'concluido' then coalesce(completed_at, now()) else null end
   where id = p_id;
  perform private.ops_log(p_id, v_old.client_id, 'tarefa.status', jsonb_build_object('status', v_old.status_id), jsonb_build_object('status', p_status));
  return v_old.version + 1;
end;
$$;

-- Arquivar / excluir a principal leva as subtarefas juntas; desarquivar / restaurar traz de volta só as que foram junto.
create or replace function private.ops_task_archive_impl(p_id uuid, p_archived boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_old record;
  r record;
begin
  select * into v_old from public.ops_tasks where id = p_id;
  if v_old.id is null or not private.ops_task_visible(p_id) then raise exception 'Tarefa não encontrada.' using errcode = '22023'; end if;
  if not private.ops_can_archive_task(p_id) then
    raise exception 'Você só pode arquivar tarefas que criou ou que estão com você.' using errcode = '42501';
  end if;
  if (v_old.archived_at is not null) = p_archived then return; end if;
  if not p_archived and v_old.parent_id is not null and exists (select 1 from public.ops_tasks where id = v_old.parent_id and archived_at is not null) then
    raise exception 'Desarquive primeiro a tarefa principal.' using errcode = '22023';
  end if;
  update public.ops_tasks
     set archived_at = case when p_archived then now() end, archived_by = case when p_archived then (select auth.uid()) end,
         version = version + 1, updated_by = (select auth.uid())
   where id = p_id;
  perform private.ops_log(p_id, v_old.client_id, case when p_archived then 'tarefa.arquivada' else 'tarefa.desarquivada' end, null, null);
  if p_archived then
    for r in select id, client_id from public.ops_tasks where parent_id = p_id and archived_at is null and deleted_at is null loop
      update public.ops_tasks set archived_at = (select archived_at from public.ops_tasks where id = p_id), archived_by = (select auth.uid()),
             version = version + 1, updated_by = (select auth.uid()) where id = r.id;
      perform private.ops_log(r.id, r.client_id, 'tarefa.arquivada', null, jsonb_build_object('motivo', 'com a tarefa principal'));
    end loop;
  else
    for r in select id, client_id from public.ops_tasks where parent_id = p_id and archived_at = v_old.archived_at and deleted_at is null loop
      update public.ops_tasks set archived_at = null, archived_by = null, version = version + 1, updated_by = (select auth.uid()) where id = r.id;
      perform private.ops_log(r.id, r.client_id, 'tarefa.desarquivada', null, jsonb_build_object('motivo', 'com a tarefa principal'));
    end loop;
  end if;
end;
$$;

create or replace function private.ops_task_delete_impl(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_t record; r record; v_at timestamptz;
begin
  select * into v_t from public.ops_tasks where id = p_id;
  if v_t.id is null or not private.ops_task_visible(p_id) then raise exception 'Tarefa não encontrada.' using errcode = '22023'; end if;
  if not private.ops_can_delete_task(p_id) then
    raise exception 'Só quem criou a tarefa (ou um administrador) pode excluí-la. Você pode arquivar.' using errcode = '42501';
  end if;
  v_at := now();
  update public.ops_tasks set deleted_at = v_at, deleted_by = (select auth.uid()),
         archived_at = coalesce(archived_at, v_at), archived_by = coalesce(archived_by, (select auth.uid())),
         version = version + 1, updated_by = (select auth.uid())
   where id = p_id;
  perform private.ops_log(p_id, v_t.client_id, 'tarefa.excluida', null, null);
  for r in select id, client_id from public.ops_tasks where parent_id = p_id and deleted_at is null loop
    update public.ops_tasks set deleted_at = v_at, deleted_by = (select auth.uid()),
           archived_at = coalesce(archived_at, v_at), archived_by = coalesce(archived_by, (select auth.uid())),
           version = version + 1, updated_by = (select auth.uid())
     where id = r.id;
    perform private.ops_log(r.id, r.client_id, 'tarefa.excluida', null, jsonb_build_object('motivo', 'com a tarefa principal'));
  end loop;
end;
$$;

create or replace function private.ops_task_restore_impl(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_t record; r record;
begin
  if not private.is_admin() then raise exception 'Só o administrador restaura tarefas excluídas.' using errcode = '42501'; end if;
  select * into v_t from public.ops_tasks where id = p_id and deleted_at is not null;
  if v_t.id is null then raise exception 'Tarefa excluída não encontrada.' using errcode = '22023'; end if;
  -- volta como arquivada (desarquivar é um passo à parte)
  update public.ops_tasks set deleted_at = null, deleted_by = null, version = version + 1, updated_by = (select auth.uid()) where id = p_id;
  perform private.ops_log(p_id, v_t.client_id, 'tarefa.restaurada', null, null);
  for r in select id, client_id from public.ops_tasks where parent_id = p_id and deleted_at = v_t.deleted_at loop
    update public.ops_tasks set deleted_at = null, deleted_by = null, version = version + 1, updated_by = (select auth.uid()) where id = r.id;
    perform private.ops_log(r.id, r.client_id, 'tarefa.restaurada', null, jsonb_build_object('motivo', 'com a tarefa principal'));
  end loop;
end;
$$;

-- Ordem das subtarefas (arrastar).
create function private.ops_subtask_reorder_impl(p_parent uuid, p_ids uuid[])
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.ops_tasks where id = p_parent and parent_id is null) or not private.ops_task_visible(p_parent) then
    raise exception 'Tarefa não encontrada.' using errcode = '22023';
  end if;
  perform private.ops_need('ops.tasks.edit');
  update public.ops_tasks c set sub_position = o.ord
    from unnest(p_ids) with ordinality as o(id, ord)
   where c.id = o.id and c.parent_id = p_parent;
end;
$$;
revoke all on function private.ops_subtask_reorder_impl(uuid, uuid[]) from public, anon;
grant execute on function private.ops_subtask_reorder_impl(uuid, uuid[]) to authenticated;
create function public.ops_subtask_reorder(p_parent uuid, p_ids uuid[])
returns void language sql set search_path = '' as $$ select private.ops_subtask_reorder_impl(p_parent, p_ids) $$;
revoke all on function public.ops_subtask_reorder(uuid, uuid[]) from public, anon;
grant execute on function public.ops_subtask_reorder(uuid, uuid[]) to authenticated;

-- Leitura da tarefa: principal (só título, mesmo sem poder ver a principal) e subtarefas com progresso.
create or replace function private.ops_task_get_v2_impl(p_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select case when j is null then null
              else jsonb_set(jsonb_set(j, '{can,archive}', to_jsonb(private.ops_can_archive_task(p_id))),
                             '{can,delete}', to_jsonb(private.ops_can_delete_task(p_id)))
                   || jsonb_build_object(
                     'parent', (select jsonb_build_object('id', pt.id, 'number', pt.number, 'title', pt.title, 'visible', private.ops_task_visible(pt.id),
                                                          'status_name', ps.name, 'status_color', ps.color)
                                  from public.ops_tasks t join public.ops_tasks pt on pt.id = t.parent_id join public.ops_statuses ps on ps.id = pt.status_id
                                 where t.id = p_id),
                     'subtasks', (select coalesce(jsonb_agg(jsonb_build_object(
                                    'id', c.id, 'number', c.number, 'title', case when private.ops_task_visible(c.id) then c.title end,
                                    'visible', private.ops_task_visible(c.id), 'status_id', c.status_id, 'status_name', cs.name, 'status_color', cs.color,
                                    'done', cs.category in ('concluido', 'cancelado'), 'sector_id', c.sector_id, 'due_date', c.due_date, 'priority', c.priority,
                                    'version', c.version, 'people', private.ops_task_people_json(c.id)) order by c.sub_position, c.number), '[]')
                                  from public.ops_tasks c join public.ops_statuses cs on cs.id = c.status_id
                                 where c.parent_id = p_id and c.archived_at is null and c.deleted_at is null),
                     'subtask_progress', (select jsonb_build_object('total', count(*), 'done', count(*) filter (where cs.category in ('concluido', 'cancelado')))
                                            from public.ops_tasks c join public.ops_statuses cs on cs.id = c.status_id
                                           where c.parent_id = p_id and c.archived_at is null and c.deleted_at is null))
         end
    from (select private.ops_task_get_impl(p_id) as j) x
$$;

-- Lista: principal (só título), progresso e filtro "só principais".
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
       and (not coalesce((f ->> 'top_only')::boolean, false) or t.parent_id is null)
       and (nullif(f ->> 'parent_id', '') is null or t.parent_id = (f ->> 'parent_id')::uuid)
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
           b.demand_id, b.client_stage_id, b.mandatory, b.queue_column_id, b.parent_id, b.sub_position,
           (select pt.number from public.ops_tasks pt where pt.id = b.parent_id) as parent_number,
           (select pt.title from public.ops_tasks pt where pt.id = b.parent_id) as parent_title,
           (select count(*) from public.ops_tasks sc where sc.parent_id = b.id and sc.archived_at is null and sc.deleted_at is null) as subtasks_total,
           (select count(*) from public.ops_tasks sc join public.ops_statuses ss on ss.id = sc.status_id
             where sc.parent_id = b.id and sc.archived_at is null and sc.deleted_at is null and ss.category in ('concluido', 'cancelado')) as subtasks_done,
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
