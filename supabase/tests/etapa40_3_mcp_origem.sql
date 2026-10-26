-- Teste da Etapa 40.3 (parte B): o que é feito pelo MCP fica marcado "mcp" no histórico; o resto continua "manual".
-- Roda numa transação desfeita (termina com "R: N verificações OK").
do $$
declare
  v_admin uuid; v_sector uuid; t1 uuid; t2 uuid; t3 uuid; v_ok integer := 0;
begin
  select id into v_admin from public.profiles where role = 'admin' and active order by created_at limit 1;
  select id into v_sector from public.ops_sectors where status = 'ativo' order by position limit 1;
  perform set_config('role', 'authenticated', true);

  -- Pelo site (login normal, sem client_id): continua "manual"
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  perform set_config('request.headers', '{}', true);
  t1 := public.ops_task_save(null, null, jsonb_build_object('title', 'Teste origem site', 'sector_id', v_sector));
  if (select origin from public.ops_activity where task_id = t1 order by id limit 1) <> 'manual' then raise exception 'pelo site continua manual'; end if;
  v_ok := v_ok + 1;

  -- Pelo MCP com login OAuth (token com client_id): "mcp"
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated', 'client_id', gen_random_uuid())::text, true);
  t2 := public.ops_task_save(null, null, jsonb_build_object('title', 'Teste origem oauth', 'sector_id', v_sector));
  if (select origin from public.ops_activity where task_id = t2 order by id limit 1) <> 'mcp' then raise exception 'OAuth vira mcp'; end if;
  perform public.ops_comment_add(t2, 'comentário pelo MCP', '{}');
  if exists (select 1 from public.ops_activity where task_id = t2 and origin <> 'mcp') then raise exception 'todas as ações pelo MCP ficam mcp'; end if;
  v_ok := v_ok + 1;

  -- Pelo MCP com o sinal do servidor (cabeçalho): "mcp"; auditoria ganha "origem"
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  perform set_config('request.headers', '{"x-backstage-origin": "mcp"}', true);
  t3 := public.ops_task_save(null, null, jsonb_build_object('title', 'Teste origem cabecalho', 'sector_id', v_sector));
  if (select origin from public.ops_activity where task_id = t3 order by id limit 1) <> 'mcp' then raise exception 'cabeçalho vira mcp'; end if;
  perform public.ops_activity_type_save(null, 'Tipo teste origem MCP', true);
  if (select details ->> 'origem' from public.audit_logs where action = 'ops.activity_type.create' order by id desc limit 1) is distinct from 'mcp' then
    raise exception 'auditoria marcada mcp';
  end if;
  v_ok := v_ok + 1;

  -- Sistema continua sistema; valor inventado continua proibido
  perform set_config('role', 'postgres', true);
  insert into public.ops_activity (task_id, action, actor_id, origin) values (t1, 'teste', null, 'sistema');
  if (select origin from public.ops_activity where task_id = t1 and action = 'teste') <> 'sistema' then raise exception 'sistema fica sistema'; end if;
  begin
    insert into public.ops_activity (task_id, action, actor_id, origin) values (t1, 'teste2', null, 'outro');
    raise exception 'origem inventada deveria ser recusada';
  exception when check_violation then null;
  end;
  v_ok := v_ok + 1;

  raise exception 'R: % verificações OK', v_ok;
end $$;
