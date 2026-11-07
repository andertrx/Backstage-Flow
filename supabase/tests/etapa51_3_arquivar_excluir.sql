-- Teste da Etapa 51.3 — Arquivar e excluir cartões (tarefas e leads). Transação desfeita: termina com "R: N verificações OK".
do $$
declare
  v_admin uuid; v_p uuid; v_sector uuid; v_t_meu uuid; v_t_outro uuid; v_t_rep uuid; v_l_meu uuid; v_l_outro uuid; v_l_conv uuid;
  v_ok int := 0; v_j jsonb; v_cli uuid; v_stage text;
begin
  select id into v_admin from public.profiles where role = 'admin' and active order by created_at limit 1;
  select p.id into v_p from public.profiles p
   where p.active and p.role not in ('admin', 'cliente')
     and exists (select 1 from public.ops_member_permissions x where x.user_id = p.id and x.permission = 'ops.access')
   order by p.created_at limit 1;
  if v_p is null then raise exception 'teste precisa de uma pessoa da Central que não seja admin'; end if;
  -- a pessoa do teste fica sem "Arquivar tarefas" e com o Comercial (dentro da transação)
  update public.ops_member_permissions set permission = 'ops.tasks.assign' where user_id = v_p and permission = 'ops.tasks.archive';
  insert into public.ops_member_permissions (user_id, permission) values (v_p, 'ops.commercial') on conflict do nothing;
  select id into v_sector from public.ops_sectors where status = 'ativo' order by position limit 1;
  select id into v_stage from public.ops_lead_stages where active and category = 'aberto' order by position limit 1;
  select id into v_cli from public.clients where status <> 'encerrado' order by created_at limit 1;

  insert into public.ops_tasks (title, sector_id, created_by, visibility) values ('51.3 minha', v_sector, v_p, 'equipe') returning id into v_t_meu;
  insert into public.ops_tasks (title, sector_id, created_by, visibility) values ('51.3 de outro', v_sector, v_admin, 'equipe') returning id into v_t_outro;
  insert into public.ops_tasks (title, sector_id, created_by, visibility) values ('51.3 repassada', v_sector, v_admin, 'equipe') returning id into v_t_rep;
  insert into public.ops_task_people (task_id, user_id, role) values (v_t_rep, v_p, 'principal');
  insert into public.ops_leads (company_name, stage_id, created_by) values ('Lead 51.3 meu', v_stage, v_p) returning id into v_l_meu;
  insert into public.ops_leads (company_name, stage_id, created_by, owner_id) values ('Lead 51.3 outro', v_stage, v_admin, null) returning id into v_l_outro;
  insert into public.ops_leads (company_name, stage_id, created_by, client_id, converted_at) values ('Lead 51.3 convertido', v_stage, v_p, v_cli, now()) returning id into v_l_conv;

  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_p, 'role', 'authenticated')::text, true);

  -- 1) arquivar: a própria e a repassada sim; a de outro (sem estar com a pessoa) não
  perform public.ops_task_archive(v_t_meu, true);
  perform public.ops_task_archive(v_t_rep, true);
  begin perform public.ops_task_archive(v_t_outro, true); raise exception 'arquivou tarefa de outro';
  exception when sqlstate '42501' then null; end;
  v_ok := v_ok + 1;

  -- 2) excluir: a própria sim; a repassada não (só arquivar)
  begin perform public.ops_task_delete(v_t_rep); raise exception 'excluiu tarefa repassada';
  exception when sqlstate '42501' then null; end;
  perform public.ops_task_delete(v_t_meu);
  v_ok := v_ok + 1;

  -- 3) tarefa excluída some: não abre, não aparece na lista de arquivadas; está nos excluídos
  if public.ops_task_get(v_t_meu) is not null then raise exception 'tarefa excluída ainda abre'; end if;
  if exists (select 1 from jsonb_array_elements(public.ops_task_list('{"archived":true}'::jsonb)) e where e ->> 'id' = v_t_meu::text) then
    raise exception 'tarefa excluída na lista de arquivadas';
  end if;
  v_j := public.ops_archive_list('tarefas', 'excluidos');
  if not exists (select 1 from jsonb_array_elements(v_j) e where e ->> 'id' = v_t_meu::text and (e ->> 'can_restore')::boolean = false) then
    raise exception 'excluída não está nos excluídos (ou não admin pode restaurar): %', v_j;
  end if;
  v_j := public.ops_archive_list('tarefas', 'arquivados');
  if not exists (select 1 from jsonb_array_elements(v_j) e where e ->> 'id' = v_t_rep::text and (e ->> 'can_unarchive')::boolean and not (e ->> 'can_delete')::boolean) then
    raise exception 'repassada arquivada com permissões erradas: %', v_j;
  end if;
  v_ok := v_ok + 1;

  -- 4) ficha da tarefa traz as permissões novas
  perform public.ops_task_archive(v_t_rep, false);
  v_j := public.ops_task_get(v_t_rep);
  if (v_j -> 'can' ->> 'archive')::boolean is not true or (v_j -> 'can' ->> 'delete')::boolean is not false then
    raise exception 'permissões da ficha erradas: %', v_j -> 'can';
  end if;
  v_ok := v_ok + 1;

  -- 5) restaurar: só admin; volta arquivada
  begin perform public.ops_task_restore(v_t_meu); raise exception 'não admin restaurou';
  exception when sqlstate '42501' then null; end;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  perform public.ops_task_restore(v_t_meu);
  perform set_config('role', 'postgres', true);
  if (select deleted_at is null and archived_at is not null from public.ops_tasks where id = v_t_meu) is not true then raise exception 'restaurar não voltou arquivada'; end if;
  if not exists (select 1 from public.ops_activity where task_id = v_t_meu and action = 'tarefa.excluida')
     or not exists (select 1 from public.ops_activity where task_id = v_t_meu and action = 'tarefa.restaurada') then
    raise exception 'excluir/restaurar sem histórico';
  end if;
  v_ok := v_ok + 1;

  -- 6) leads: arquivar só o próprio/responsável; excluir só o próprio; convertido não pode ser excluído
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_p, 'role', 'authenticated')::text, true);
  begin perform public.ops_lead_archive(v_l_outro, true); raise exception 'arquivou lead de outro';
  exception when sqlstate '42501' then null; end;
  begin perform public.ops_lead_delete(v_l_conv); raise exception 'excluiu lead convertido';
  exception when sqlstate '22023' then null; end;
  perform public.ops_lead_archive(v_l_meu, true);
  perform public.ops_lead_delete(v_l_meu);
  if public.ops_lead_get(v_l_meu) is not null then raise exception 'lead excluído ainda abre'; end if;
  if exists (select 1 from jsonb_array_elements(public.ops_lead_board('{"archived":true}'::jsonb) -> 'leads') e where e ->> 'id' = v_l_meu::text) then
    raise exception 'lead excluído no filtro Arquivados';
  end if;
  if not exists (select 1 from jsonb_array_elements(public.ops_archive_list('leads', 'excluidos')) e where e ->> 'id' = v_l_meu::text) then
    raise exception 'lead excluído fora da lista de excluídos';
  end if;
  v_ok := v_ok + 1;

  -- 7) o responsável (dono) de um lead de outra pessoa pode arquivar, mas não excluir
  perform set_config('role', 'postgres', true);
  update public.ops_leads set owner_id = v_p where id = v_l_outro;
  perform set_config('role', 'authenticated', true);
  perform public.ops_lead_archive(v_l_outro, true);
  begin perform public.ops_lead_delete(v_l_outro); raise exception 'responsável excluiu lead de outro';
  exception when sqlstate '42501' then null; end;
  v_j := public.ops_lead_get(v_l_outro);
  if (v_j -> 'can' ->> 'archive')::boolean is not true or (v_j -> 'can' ->> 'delete')::boolean is not false then
    raise exception 'permissões do lead erradas: %', v_j -> 'can';
  end if;
  v_ok := v_ok + 1;

  -- 8) admin restaura o lead (volta arquivado) e vê a lista de excluídos de todos
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  perform public.ops_lead_restore(v_l_meu);
  if public.ops_lead_get(v_l_meu) is null then raise exception 'lead restaurado não abre'; end if;
  v_ok := v_ok + 1;

  raise exception 'R: % verificações OK', v_ok;
end;
$$;
