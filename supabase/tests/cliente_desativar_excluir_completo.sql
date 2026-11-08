-- Teste (transação desfeita; termina em "R: N verificações OK"): desativar esconde a Central/Tracking, reativar traz de volta,
-- só admin/gestor/Account Manager podem, excluir abandona tudo. Usa o primeiro cliente DESATIVADO que tenha cartão na Central.
do $$
declare v_admin uuid; v_visu uuid; v_c uuid; v_name text; v_t uuid; v_ok int := 0; v_n int;
begin
  select id into v_admin from public.profiles where role='admin' and active order by created_at limit 1;
  select id into v_visu from public.profiles where role='visualizador' and active order by created_at limit 1;
  select c.id, c.name into v_c, v_name from public.clients c where c.status='encerrado' and c.excluded_at is null
     and exists (select 1 from public.ops_client_ops o where o.client_id = c.id) and exists (select 1 from public.ops_tasks t where t.client_id = c.id) limit 1;
  select id into v_t from public.ops_tasks where client_id = v_c and archived_at is null limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role','authenticated')::text, true);
  perform set_config('role','authenticated',true);
  if private.ops_task_visible(v_t) then raise exception 'tarefa de cliente desativado some da Central'; end if;
  select count(*) into v_n from public.ops_client_ops where client_id = v_c;
  if v_n <> 0 then raise exception 'cartão do cliente desativado some: %', v_n; end if;
  select count(*) into v_n from public.tracking_containers where client_id = v_c;
  if v_n <> 0 then raise exception 'site some do Tracking'; end if;
  v_ok := v_ok + 1;
  perform public.client_set_active(v_c, true);
  if not private.ops_task_visible(v_t) then raise exception 'reativado: a tarefa volta'; end if;
  perform public.client_set_active(v_c, false);
  v_ok := v_ok + 1;
  perform set_config('request.jwt.claims', json_build_object('sub', v_visu, 'role','authenticated')::text, true);
  begin perform public.client_set_active(v_c, true); raise exception 'visualizador não reativa'; exception when insufficient_privilege then null; end;
  begin perform public.client_exclude(v_c, v_name); raise exception 'visualizador não exclui'; exception when insufficient_privilege then null; end;
  v_ok := v_ok + 1;
  perform set_config('request.jwt.claims', '', true); perform set_config('role','postgres',true);
  update public.ops_client_ops set am_user_id = v_visu where client_id = v_c;
  perform set_config('request.jwt.claims', json_build_object('sub', v_visu, 'role','authenticated')::text, true);
  perform set_config('role','authenticated',true);
  perform public.client_set_active(v_c, true);
  perform public.client_set_active(v_c, false);
  v_ok := v_ok + 1;
  perform public.client_exclude(v_c, v_name);
  perform set_config('request.jwt.claims', '', true); perform set_config('role','postgres',true);
  if (select excluded_at from public.clients where id = v_c) is null then raise exception 'excluído'; end if;
  if exists (select 1 from public.ad_accounts where client_id = v_c and unlinked_at is null) then raise exception 'contas desvinculadas'; end if;
  if exists (select 1 from public.ops_tasks where client_id = v_c and archived_at is null) then raise exception 'tarefas arquivadas'; end if;
  if exists (select 1 from public.tracking_containers where client_id = v_c and status <> 'pausado') then raise exception 'site pausado'; end if;
  if not exists (select 1 from public.audit_logs where action = 'client.exclude' and target_id = v_c::text and (details->>'contas_desvinculadas')::int >= 1) then raise exception 'histórico da exclusão'; end if;
  v_ok := v_ok + 1;
  raise exception 'R: % verificações OK', v_ok;
end $$;
