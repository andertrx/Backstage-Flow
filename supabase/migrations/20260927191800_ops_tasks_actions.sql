-- Etapa 36.2 (parte 2): criar/editar, status, pessoas, arquivar, dependências, comentários e anexos.
-- -----------------------------------------------------------------------------
-- Criar / editar
-- p: {title, description, client_id, sector_id, priority, start_date, due_date, effort_hours,
--     visibility, tags[], status_id (só ao criar), people {principal, adicionais[], aprovadores[], observadores[]} (só ao criar)}
-- -----------------------------------------------------------------------------
create function private.ops_task_save_impl(p_id uuid, p_version integer, p jsonb)
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
    if (p ->> 'sector_id')::uuid is distinct from v_old_sector then perform private.ops_need('ops.tasks.sector'); end if;
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
                                  visibility, created_by, updated_by)
    values (btrim(p ->> 'title'), nullif(btrim(p ->> 'description'), ''), nullif(p ->> 'client_id', '')::uuid, (p ->> 'sector_id')::uuid,
            coalesce(nullif(p ->> 'status_id', ''), 'nao_iniciado'), coalesce(nullif(p ->> 'priority', ''), 'media'),
            nullif(p ->> 'start_date', '')::date, nullif(p ->> 'due_date', '')::date, nullif(p ->> 'effort_hours', '')::numeric,
            coalesce(nullif(p ->> 'visibility', ''), 'setor'), v_me, v_me)
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
           updated_by = v_me, version = version + 1
     where id = p_id;
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
revoke all on function private.ops_task_save_impl(uuid, integer, jsonb) from public, anon;
grant execute on function private.ops_task_save_impl(uuid, integer, jsonb) to authenticated;
create function public.ops_task_save(p_id uuid, p_version integer, p jsonb)
returns uuid language sql set search_path = '' as $$ select private.ops_task_save_impl(p_id, p_version, p) $$;
revoke all on function public.ops_task_save(uuid, integer, jsonb) from public, anon;
grant execute on function public.ops_task_save(uuid, integer, jsonb) to authenticated;

-- -----------------------------------------------------------------------------
-- Mudar status (mover o cartão). Não conclui com dependência aberta.
-- -----------------------------------------------------------------------------
create function private.ops_task_set_status_impl(p_id uuid, p_version integer, p_status text)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_old record;
  v_cat text;
  v_blockers integer;
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
  update public.ops_tasks
     set status_id = p_status, version = version + 1, updated_by = (select auth.uid()),
         completed_at = case when v_cat = 'concluido' then coalesce(completed_at, now()) else null end
   where id = p_id;
  perform private.ops_log(p_id, v_old.client_id, 'tarefa.status', jsonb_build_object('status', v_old.status_id), jsonb_build_object('status', p_status));
  return v_old.version + 1;
end;
$$;
revoke all on function private.ops_task_set_status_impl(uuid, integer, text) from public, anon;
grant execute on function private.ops_task_set_status_impl(uuid, integer, text) to authenticated;
create function public.ops_task_set_status(p_id uuid, p_version integer, p_status text)
returns integer language sql set search_path = '' as $$ select private.ops_task_set_status_impl(p_id, p_version, p_status) $$;
revoke all on function public.ops_task_set_status(uuid, integer, text) from public, anon;
grant execute on function public.ops_task_set_status(uuid, integer, text) to authenticated;

-- -----------------------------------------------------------------------------
-- Pessoas da tarefa
-- -----------------------------------------------------------------------------
create function private.ops_task_set_people_impl(p_id uuid, p_version integer, p_people jsonb)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_old record;
  v_before jsonb;
begin
  select * into v_old from public.ops_tasks where id = p_id;
  if v_old.id is null or not private.ops_task_visible(p_id) then raise exception 'Tarefa não encontrada.' using errcode = '22023'; end if;
  perform private.ops_need('ops.tasks.assign');
  if v_old.archived_at is not null then raise exception 'Tarefa arquivada: desarquive para mudar as pessoas.' using errcode = '22023'; end if;
  if v_old.version <> coalesce(p_version, -1) then
    raise exception 'Alguém alterou esta tarefa antes de você. Recarregue para ver a versão atual.' using errcode = '40001';
  end if;
  v_before := private.ops_task_people_json(p_id);
  perform private.ops_write_people(p_id, p_people);
  update public.ops_tasks set version = version + 1, updated_by = (select auth.uid()) where id = p_id;
  if private.ops_task_people_json(p_id) is distinct from v_before then
    perform private.ops_log(p_id, v_old.client_id, 'tarefa.pessoas', jsonb_build_object('pessoas', v_before),
                            jsonb_build_object('pessoas', private.ops_task_people_json(p_id)));
  end if;
  return v_old.version + 1;
end;
$$;
revoke all on function private.ops_task_set_people_impl(uuid, integer, jsonb) from public, anon;
grant execute on function private.ops_task_set_people_impl(uuid, integer, jsonb) to authenticated;
create function public.ops_task_set_people(p_id uuid, p_version integer, p_people jsonb)
returns integer language sql set search_path = '' as $$ select private.ops_task_set_people_impl(p_id, p_version, p_people) $$;
revoke all on function public.ops_task_set_people(uuid, integer, jsonb) from public, anon;
grant execute on function public.ops_task_set_people(uuid, integer, jsonb) to authenticated;

-- -----------------------------------------------------------------------------
-- Arquivar / desarquivar
-- -----------------------------------------------------------------------------
create function private.ops_task_archive_impl(p_id uuid, p_archived boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_old record;
begin
  select * into v_old from public.ops_tasks where id = p_id;
  if v_old.id is null or not private.ops_task_visible(p_id) then raise exception 'Tarefa não encontrada.' using errcode = '22023'; end if;
  perform private.ops_need('ops.tasks.archive');
  if (v_old.archived_at is not null) = p_archived then return; end if;
  update public.ops_tasks
     set archived_at = case when p_archived then now() end, archived_by = case when p_archived then (select auth.uid()) end,
         version = version + 1, updated_by = (select auth.uid())
   where id = p_id;
  perform private.ops_log(p_id, v_old.client_id, case when p_archived then 'tarefa.arquivada' else 'tarefa.desarquivada' end, null, null);
end;
$$;
revoke all on function private.ops_task_archive_impl(uuid, boolean) from public, anon;
grant execute on function private.ops_task_archive_impl(uuid, boolean) to authenticated;
create function public.ops_task_archive(p_id uuid, p_archived boolean)
returns void language sql set search_path = '' as $$ select private.ops_task_archive_impl(p_id, p_archived) $$;
revoke all on function public.ops_task_archive(uuid, boolean) from public, anon;
grant execute on function public.ops_task_archive(uuid, boolean) to authenticated;

-- -----------------------------------------------------------------------------
-- Dependências (sem ciclo: A depende de B que depende de A)
-- -----------------------------------------------------------------------------
create function private.ops_task_dependency_impl(p_id uuid, p_depends_on uuid, p_add boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_client uuid;
  v_num bigint;
begin
  if not private.ops_task_visible(p_id) or not private.ops_task_visible(p_depends_on) then
    raise exception 'Tarefa não encontrada.' using errcode = '22023';
  end if;
  perform private.ops_need('ops.tasks.edit');
  select client_id into v_client from public.ops_tasks where id = p_id;
  select number into v_num from public.ops_tasks where id = p_depends_on;
  if p_add then
    if p_id = p_depends_on then raise exception 'A tarefa não pode depender dela mesma.' using errcode = '22023'; end if;
    if exists (with recursive chain(id) as (
                 select depends_on_id from public.ops_task_deps where task_id = p_depends_on
                 union select d.depends_on_id from public.ops_task_deps d join chain c on d.task_id = c.id)
               select 1 from chain where id = p_id) then
      raise exception 'Isso criaria um ciclo (uma tarefa esperando a outra para sempre).' using errcode = '22023';
    end if;
    insert into public.ops_task_deps (task_id, depends_on_id, created_by) values (p_id, p_depends_on, (select auth.uid()))
    on conflict do nothing;
    perform private.ops_log(p_id, v_client, 'tarefa.dependencia_incluida', null, jsonb_build_object('depende_de', v_num));
  else
    delete from public.ops_task_deps where task_id = p_id and depends_on_id = p_depends_on;
    perform private.ops_log(p_id, v_client, 'tarefa.dependencia_retirada', jsonb_build_object('depende_de', v_num), null);
  end if;
end;
$$;
revoke all on function private.ops_task_dependency_impl(uuid, uuid, boolean) from public, anon;
grant execute on function private.ops_task_dependency_impl(uuid, uuid, boolean) to authenticated;
create function public.ops_task_dependency(p_id uuid, p_depends_on uuid, p_add boolean)
returns void language sql set search_path = '' as $$ select private.ops_task_dependency_impl(p_id, p_depends_on, p_add) $$;
revoke all on function public.ops_task_dependency(uuid, uuid, boolean) from public, anon;
grant execute on function public.ops_task_dependency(uuid, uuid, boolean) to authenticated;

-- -----------------------------------------------------------------------------
-- Comentários e @menções (só quem enxerga a tarefa pode ser mencionado)
-- -----------------------------------------------------------------------------
create function private.ops_comment_add_impl(p_task uuid, p_body text, p_mentions uuid[])
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  v_id bigint;
  v_client uuid;
  v_user uuid;
  v_names text[] := '{}';
begin
  if not private.ops_task_visible(p_task) then raise exception 'Tarefa não encontrada.' using errcode = '22023'; end if;
  perform private.ops_need('ops.access');
  if char_length(btrim(coalesce(p_body, ''))) = 0 then raise exception 'Escreva o comentário.' using errcode = '22023'; end if;
  if char_length(p_body) > 5000 then raise exception 'Comentário muito longo (até 5.000 letras).' using errcode = '22023'; end if;
  insert into public.ops_comments (task_id, author_id, body) values (p_task, (select auth.uid()), btrim(p_body)) returning id into v_id;
  foreach v_user in array coalesce(array(select distinct x from unnest(p_mentions) x), '{}') loop
    if not private.ops_member_ok(v_user) or not exists (
         select 1 from public.ops_tasks t where t.id = p_task and (
           exists (select 1 from public.profiles pr where pr.id = v_user and pr.role = 'admin')
           or t.created_by = v_user or t.visibility = 'equipe'
           or exists (select 1 from public.ops_task_people p where p.task_id = t.id and p.user_id = v_user)
           or (t.visibility = 'setor' and exists (select 1 from public.ops_member_sectors s where s.user_id = v_user and s.sector_id = t.sector_id)))) then
      raise exception 'Uma das pessoas mencionadas não enxerga esta tarefa. Inclua a pessoa na tarefa antes de mencionar.' using errcode = '22023';
    end if;
    insert into public.ops_mentions (comment_id, user_id) values (v_id, v_user);
    v_names := v_names || (select full_name from public.profiles where id = v_user);
  end loop;
  select client_id into v_client from public.ops_tasks where id = p_task;
  perform private.ops_log(p_task, v_client, 'tarefa.comentario', null,
                          jsonb_build_object('comentario', left(btrim(p_body), 300), 'mencoes', to_jsonb(v_names)));
  return v_id;
end;
$$;
revoke all on function private.ops_comment_add_impl(uuid, text, uuid[]) from public, anon;
grant execute on function private.ops_comment_add_impl(uuid, text, uuid[]) to authenticated;
create function public.ops_comment_add(p_task uuid, p_body text, p_mentions uuid[] default '{}')
returns bigint language sql set search_path = '' as $$ select private.ops_comment_add_impl(p_task, p_body, p_mentions) $$;
revoke all on function public.ops_comment_add(uuid, text, uuid[]) from public, anon;
grant execute on function public.ops_comment_add(uuid, text, uuid[]) to authenticated;

create function private.ops_comment_remove_impl(p_id bigint)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_c record;
begin
  select c.*, t.client_id into v_c from public.ops_comments c join public.ops_tasks t on t.id = c.task_id where c.id = p_id;
  if v_c.id is null or not private.ops_task_visible(v_c.task_id) then raise exception 'Comentário não encontrado.' using errcode = '22023'; end if;
  if v_c.author_id is distinct from (select auth.uid()) and not private.is_admin() then
    raise exception 'Só quem escreveu (ou o admin) pode retirar o comentário.' using errcode = '42501';
  end if;
  if v_c.removed_at is not null then return; end if;
  update public.ops_comments set removed_at = now(), removed_by = (select auth.uid()) where id = p_id;
  perform private.ops_log(v_c.task_id, v_c.client_id, 'tarefa.comentario_retirado', jsonb_build_object('comentario', left(v_c.body, 300)), null);
end;
$$;
revoke all on function private.ops_comment_remove_impl(bigint) from public, anon;
grant execute on function private.ops_comment_remove_impl(bigint) to authenticated;
create function public.ops_comment_remove(p_id bigint)
returns void language sql set search_path = '' as $$ select private.ops_comment_remove_impl(p_id) $$;
revoke all on function public.ops_comment_remove(bigint) from public, anon;
grant execute on function public.ops_comment_remove(bigint) to authenticated;

-- -----------------------------------------------------------------------------
-- Anexos: o navegador envia o arquivo para ops-files/<tarefa>/…; aqui registra.
-- -----------------------------------------------------------------------------
create function private.ops_attachment_add_impl(p_task uuid, p_path text, p_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_obj record;
  v_id uuid;
  v_client uuid;
begin
  if not private.ops_task_visible(p_task) then raise exception 'Tarefa não encontrada.' using errcode = '22023'; end if;
  perform private.ops_need('ops.access');
  if split_part(coalesce(p_path, ''), '/', 1) <> p_task::text then raise exception 'Arquivo fora da pasta da tarefa.' using errcode = '22023'; end if;
  select o.metadata into v_obj from storage.objects o where o.bucket_id = 'ops-files' and o.name = p_path;
  if v_obj.metadata is null then raise exception 'O arquivo não chegou ao armazenamento. Envie de novo.' using errcode = '22023'; end if;
  insert into public.ops_attachments (task_id, path, name, mime, size_bytes, uploaded_by)
  values (p_task, p_path, left(btrim(p_name), 200), coalesce(v_obj.metadata ->> 'mimetype', 'application/octet-stream'),
          coalesce((v_obj.metadata ->> 'size')::bigint, 1), (select auth.uid()))
  returning id into v_id;
  select client_id into v_client from public.ops_tasks where id = p_task;
  perform private.ops_log(p_task, v_client, 'tarefa.anexo_incluido', null,
                          jsonb_build_object('arquivo', left(btrim(p_name), 200), 'tamanho', (v_obj.metadata ->> 'size')::bigint));
  return v_id;
end;
$$;
revoke all on function private.ops_attachment_add_impl(uuid, text, text) from public, anon;
grant execute on function private.ops_attachment_add_impl(uuid, text, text) to authenticated;
create function public.ops_attachment_add(p_task uuid, p_path text, p_name text)
returns uuid language sql set search_path = '' as $$ select private.ops_attachment_add_impl(p_task, p_path, p_name) $$;
revoke all on function public.ops_attachment_add(uuid, text, text) from public, anon;
grant execute on function public.ops_attachment_add(uuid, text, text) to authenticated;

create function private.ops_attachment_remove_impl(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_a record;
begin
  select a.*, t.client_id into v_a from public.ops_attachments a join public.ops_tasks t on t.id = a.task_id where a.id = p_id;
  if v_a.id is null or not private.ops_task_visible(v_a.task_id) then raise exception 'Anexo não encontrado.' using errcode = '22023'; end if;
  if v_a.uploaded_by is distinct from (select auth.uid()) and not private.ops_can('ops.tasks.edit') then
    raise exception 'Só quem enviou ou quem edita tarefas pode retirar o anexo.' using errcode = '42501';
  end if;
  if v_a.removed_at is not null then return; end if;
  update public.ops_attachments set removed_at = now(), removed_by = (select auth.uid()) where id = p_id;
  perform private.ops_log(v_a.task_id, v_a.client_id, 'tarefa.anexo_retirado', jsonb_build_object('arquivo', v_a.name), null);
end;
$$;
revoke all on function private.ops_attachment_remove_impl(uuid) from public, anon;
grant execute on function private.ops_attachment_remove_impl(uuid) to authenticated;
create function public.ops_attachment_remove(p_id uuid)
returns void language sql set search_path = '' as $$ select private.ops_attachment_remove_impl(p_id) $$;
revoke all on function public.ops_attachment_remove(uuid) from public, anon;
grant execute on function public.ops_attachment_remove(uuid) to authenticated;

