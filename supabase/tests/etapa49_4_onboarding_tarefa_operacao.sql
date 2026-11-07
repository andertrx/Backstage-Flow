-- Teste da Etapa 49.4 — Agendado → Realizado exige reunião Realizada + ao menos 1 tarefa para o time de operação
-- (setor diferente de Comercial, não cancelada, não arquivada; finalizada conta). Transação desfeita: termina com "R: N verificações OK".
do $$
declare
  v_admin uuid; v_am uuid; v_cli uuid; v_cli2 uuid; v_m uuid; v_m2 uuid; v_cat text; v_ver int; v_ok int := 0; v_b jsonb; v_t uuid;
  s_com uuid; s_trafego uuid; s_design uuid; s_am uuid; v_err text;
begin
  select id into v_admin from public.profiles where role = 'admin' and active order by created_at limit 1;
  select id into v_am from public.profiles where active and role not in ('admin', 'cliente') order by created_at limit 1;
  select id into v_cat from public.ops_meeting_categories where active order by position limit 1;
  select id into s_com from public.ops_sectors where lower(btrim(name)) = 'comercial';
  select id into s_trafego from public.ops_sectors where name = 'Gestão de Tráfego';
  select id into s_design from public.ops_sectors where name = 'Design';
  select id into s_am from public.ops_sectors where name = 'Account Manager';
  insert into public.clients (name, status) values ('Cliente teste 49.4', 'ativo') returning id into v_cli;
  insert into public.clients (name, status) values ('Cliente teste 49.4 b', 'ativo') returning id into v_cli2;
  insert into public.ops_client_ops (client_id, stage_id, am_user_id) values (v_cli, 'onboarding_pendente', v_am);
  insert into public.ops_client_ops (client_id, stage_id, am_user_id) values (v_cli2, 'onboarding_pendente', v_am);

  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

  -- 1) reunião realizada e nenhuma tarefa: vai para Agendado, mas não para Realizado (mensagem fala da tarefa)
  v_m := public.ops_meeting_save(null, null, jsonb_build_object('title', 'Onboarding 49.4', 'category_id', v_cat,
           'starts_at', (now() + interval '1 day')::text, 'duration_min', 30, 'client_id', v_cli));
  perform public.ops_client_meeting_link(v_cli, v_m);
  select version into v_ver from public.ops_client_ops where client_id = v_cli;
  perform public.ops_client_stage_move(v_cli, v_ver, 'coleta_acessos');
  perform public.ops_meeting_record(v_m, (select version from public.ops_meetings where id = v_m), 'Ata', '{}');
  select version into v_ver from public.ops_client_ops where client_id = v_cli;
  begin perform public.ops_client_stage_move(v_cli, v_ver, 'briefing'); raise exception 'foi para Realizado sem tarefa';
  exception when sqlstate '22023' then get stacked diagnostics v_err = message_text; end;
  if v_err not like '%tarefa para o time de operação%' then raise exception 'mensagem errada: %', v_err; end if;
  v_ok := v_ok + 1;

  -- 2) o quadro mostra que falta a tarefa
  v_b := public.ops_client_board('{}'::jsonb);
  if not exists (select 1 from jsonb_array_elements(v_b -> 'clients') c where c ->> 'client_id' = v_cli::text
                  and (c ->> 'meeting_ok') = 'true' and (c ->> 'ops_task_ok') = 'false') then raise exception 'quadro sem ops_task_ok=false'; end if;
  v_ok := v_ok + 1;

  -- 3) aviso da reunião realizada pede a tarefa (não diz "pode ir")
  perform set_config('role', 'postgres', true); perform set_config('request.jwt.claims', '', true);
  if not exists (select 1 from public.ops_notifications where dedupe_key like 'onb-realizada:' || v_cli || ':%' and title like 'Reunião realizada: crie a tarefa da operação%') then
    raise exception 'aviso de realizada não pede a tarefa';
  end if;
  v_ok := v_ok + 1;

  -- 4) lembrete diário também pede a tarefa
  perform private.ops_onboarding_reuniao_lembrar();
  if not exists (select 1 from public.ops_notifications where dedupe_key like 'onb-lembrete:' || v_cli || ':%' and title like 'Reunião realizada: crie a tarefa da operação%') then
    raise exception 'lembrete não pede a tarefa';
  end if;
  v_ok := v_ok + 1;

  -- 5) tarefas que NÃO contam: do Comercial, cancelada, arquivada
  insert into public.ops_tasks (title, client_id, sector_id, created_by) values ('Do comercial', v_cli, s_com, v_admin);
  insert into public.ops_tasks (title, client_id, sector_id, status_id, created_by) values ('Cancelada', v_cli, s_trafego, 'cancelado', v_admin);
  insert into public.ops_tasks (title, client_id, sector_id, created_by, archived_at) values ('Arquivada', v_cli, s_design, v_admin, now());
  if private.ops_onboarding_tem_tarefa_operacao(v_cli) then raise exception 'contou tarefa que não vale'; end if;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  select version into v_ver from public.ops_client_ops where client_id = v_cli;
  begin perform public.ops_client_stage_move(v_cli, v_ver, 'briefing'); raise exception 'foi para Realizado com tarefa que não vale';
  exception when sqlstate '22023' then null; end;
  v_ok := v_ok + 1;

  -- 6) avanço automático respeita a mesma regra (função interna: conferida como sistema)
  perform set_config('role', 'postgres', true);
  if private.ops_onboarding_gate_msg(v_cli, (select position from public.ops_client_stages where id = 'coleta_acessos'),
                                     (select position from public.ops_client_stages where id = 'briefing'), 'briefing') is null then
    raise exception 'avanço automático passaria sem tarefa';
  end if;
  v_ok := v_ok + 1;

  -- 7) tarefa FINALIZADA de outro setor conta: vai para Realizado, e o quadro mostra ops_task_ok=true
  perform set_config('role', 'postgres', true);
  insert into public.ops_tasks (title, client_id, sector_id, status_id, created_by, completed_at)
    values ('Próximos passos', v_cli, s_am, 'finalizado', v_admin, now()) returning id into v_t;
  perform set_config('role', 'authenticated', true);
  v_b := public.ops_client_board('{}'::jsonb);
  if not exists (select 1 from jsonb_array_elements(v_b -> 'clients') c where c ->> 'client_id' = v_cli::text and (c ->> 'ops_task_ok') = 'true') then
    raise exception 'quadro sem ops_task_ok=true';
  end if;
  select version into v_ver from public.ops_client_ops where client_id = v_cli;
  perform public.ops_client_stage_move(v_cli, v_ver, 'briefing');
  if (select stage_id from public.ops_client_ops where client_id = v_cli) <> 'briefing' then raise exception 'não foi para Realizado com tarefa'; end if;
  v_ok := v_ok + 1;

  -- 8) com tarefa já criada, o aviso de realizada diz "pode ir"
  v_m2 := public.ops_meeting_save(null, null, jsonb_build_object('title', 'Onboarding 49.4 b', 'category_id', v_cat,
            'starts_at', (now() + interval '1 day')::text, 'duration_min', 30, 'client_id', v_cli2));
  perform public.ops_client_meeting_link(v_cli2, v_m2);
  perform set_config('role', 'postgres', true);
  insert into public.ops_tasks (title, client_id, sector_id, created_by) values ('Configurar campanhas', v_cli2, s_trafego, v_admin);
  perform set_config('role', 'authenticated', true);
  perform public.ops_meeting_record(v_m2, (select version from public.ops_meetings where id = v_m2), 'Ata', '{}');
  perform set_config('role', 'postgres', true); perform set_config('request.jwt.claims', '', true);
  if not exists (select 1 from public.ops_notifications where dedupe_key like 'onb-realizada:' || v_cli2 || ':%' and title like '%pode ir para Onboarding Realizado') then
    raise exception 'aviso com tarefa não diz pode ir';
  end if;
  v_ok := v_ok + 1;

  -- 9) Pendente → Agendado continua sem exigir tarefa; Cancelado continua livre
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  select version into v_ver from public.ops_client_ops where client_id = v_cli2;
  perform public.ops_client_stage_move(v_cli2, v_ver, 'coleta_acessos');
  select version into v_ver from public.ops_client_ops where client_id = v_cli2;
  perform public.ops_client_stage_move(v_cli2, v_ver, 'configuracao_inicial');
  if (select stage_id from public.ops_client_ops where client_id = v_cli2) <> 'configuracao_inicial' then raise exception 'Cancelado deixou de ser livre'; end if;
  v_ok := v_ok + 1;

  raise exception 'R: % verificações OK', v_ok;
end;
$$;
