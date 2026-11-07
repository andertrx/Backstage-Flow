-- Teste da Etapa 47.2 — Onboarding por etapas ligadas à reunião. Transação desfeita: termina com "R: N verificações OK".
do $$
declare
  v_admin uuid; v_am uuid; v_cli uuid; v_cli2 uuid; v_cli3 uuid; v_m1 uuid; v_m2 uuid; v_m3 uuid; v_ok int := 0; v_ver int; v_cat text; v_b jsonb;
begin
  select id into v_admin from public.profiles where role = 'admin' and active order by created_at limit 1;
  select id into v_am from public.profiles where active and role not in ('admin', 'cliente') order by created_at limit 1;
  select id into v_cli from public.clients where status <> 'encerrado' order by created_at limit 1;
  select id into v_cli2 from public.clients where status <> 'encerrado' and id <> v_cli order by created_at limit 1;
  select id into v_cli3 from public.clients where status <> 'encerrado' and id not in (v_cli, v_cli2) order by created_at limit 1;
  select id into v_cat from public.ops_meeting_categories where active order by position limit 1;
  if v_cli3 is null then
    insert into public.clients (name, status) values ('Cliente teste 47.2', 'ativo') returning id into v_cli3;
  end if;
  insert into public.ops_client_ops (client_id, stage_id, am_user_id) values (v_cli, 'onboarding_pendente', v_am)
    on conflict (client_id) do update set stage_id = 'onboarding_pendente', onboarding_meeting_id = null, am_user_id = v_am;
  insert into public.ops_client_ops (client_id, stage_id) values (v_cli2, 'onboarding_pendente')
    on conflict (client_id) do update set stage_id = 'onboarding_pendente', onboarding_meeting_id = null;
  insert into public.ops_client_ops (client_id, stage_id) values (v_cli3, 'onboarding_pendente')
    on conflict (client_id) do update set stage_id = 'onboarding_pendente', onboarding_meeting_id = null;

  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

  -- 1) Pendente sem reunião: não vai para Agendado nem Realizado
  select version into v_ver from public.ops_client_ops where client_id = v_cli;
  begin perform public.ops_client_stage_move(v_cli, v_ver, 'coleta_acessos'); raise exception 'foi para Agendado sem reunião';
  exception when sqlstate '22023' then null; end;
  begin perform public.ops_client_stage_move(v_cli, v_ver, 'briefing'); raise exception 'foi para Realizado sem reunião';
  exception when sqlstate '22023' then null; end;
  v_ok := v_ok + 1;

  -- 1b) 49.3: Cancelado é livre (sem reunião): vai direto e volta
  perform public.ops_client_stage_move(v_cli, v_ver, 'configuracao_inicial');
  if (select stage_id from public.ops_client_ops where client_id = v_cli) <> 'configuracao_inicial' then raise exception 'Cancelado não é livre'; end if;
  select version into v_ver from public.ops_client_ops where client_id = v_cli;
  perform public.ops_client_stage_move(v_cli, v_ver, 'onboarding_pendente');
  select version into v_ver from public.ops_client_ops where client_id = v_cli;
  v_ok := v_ok + 1;

  -- 2) reunião agendada vinculada: vai para Agendado, mas não para Realizado
  v_m1 := public.ops_meeting_save(null, null, jsonb_build_object('title', 'Onboarding teste', 'category_id', v_cat,
            'starts_at', (now() + interval '2 days')::text, 'duration_min', 30, 'client_id', v_cli));
  perform public.ops_client_meeting_link(v_cli, v_m1);
  begin perform public.ops_client_stage_move(v_cli, v_ver, 'briefing'); raise exception 'pulou para Realizado só com agendada';
  exception when sqlstate '22023' then null; end;
  perform public.ops_client_stage_move(v_cli, v_ver, 'coleta_acessos');
  if (select stage_id from public.ops_client_ops where client_id = v_cli) <> 'coleta_acessos' then raise exception 'não foi para Agendado'; end if;
  v_b := public.ops_client_board('{}'::jsonb);
  if not exists (select 1 from jsonb_array_elements(v_b -> 'clients') c where c ->> 'client_id' = v_cli::text and (c ->> 'meeting_scheduled') = 'true' and (c ->> 'meeting_ok') = 'false') then
    raise exception 'quadro sem meeting_scheduled';
  end if;
  select version into v_ver from public.ops_client_ops where client_id = v_cli;
  begin perform public.ops_client_stage_move(v_cli, v_ver, 'briefing'); raise exception 'foi para Realizado com reunião só agendada';
  exception when sqlstate '22023' then null; end;
  v_ok := v_ok + 1;

  -- 3) reunião realizada (+ 49.4: 1 tarefa para o time de operação): vai para Realizado; voltar é livre
  perform public.ops_meeting_record(v_m1, (select version from public.ops_meetings where id = v_m1), 'Ata', '{}');
  perform set_config('role', 'postgres', true);
  insert into public.ops_tasks (title, client_id, sector_id, created_by)
    values ('Próximos passos (teste 47.2)', v_cli, (select id from public.ops_sectors where lower(name) <> 'comercial' order by position limit 1), v_admin);
  perform set_config('role', 'authenticated', true);
  select version into v_ver from public.ops_client_ops where client_id = v_cli;
  perform public.ops_client_stage_move(v_cli, v_ver, 'briefing');
  if (select stage_id from public.ops_client_ops where client_id = v_cli) <> 'briefing' then raise exception 'não foi para Realizado'; end if;
  begin perform public.ops_client_meeting_unlink(v_cli); raise exception 'desvinculou em Realizado';
  exception when sqlstate '22023' then null; end;
  select version into v_ver from public.ops_client_ops where client_id = v_cli;
  perform public.ops_client_stage_move(v_cli, v_ver, 'onboarding_pendente');
  v_ok := v_ok + 1;

  -- 4) cancelar com "cliente não fará mais onboarding": vai sozinho para Cancelado (a partir de Pendente com reunião agendada)
  v_m2 := public.ops_meeting_save(null, null, jsonb_build_object('title', 'Onboarding 2', 'category_id', v_cat,
            'starts_at', (now() + interval '3 days')::text, 'duration_min', 30, 'client_id', v_cli2));
  perform public.ops_client_meeting_link(v_cli2, v_m2);
  begin perform public.ops_meeting_cancel_kind(v_m2, (select version from public.ops_meetings where id = v_m2), 'x', 'invalido'); raise exception 'tipo inválido aceito';
  exception when sqlstate '22023' then null; end;
  perform public.ops_meeting_cancel_kind(v_m2, (select version from public.ops_meetings where id = v_m2), '', 'cliente_desistiu');
  if (select stage_id from public.ops_client_ops where client_id = v_cli2) <> 'configuracao_inicial' then raise exception 'não foi para Cancelado'; end if;
  if (select cancel_reason from public.ops_meetings where id = v_m2) is null then raise exception 'sem motivo padrão'; end if;
  if not exists (select 1 from public.ops_activity where client_id = v_cli2 and action = 'cliente.etapa' and origin = 'sistema' and after ->> 'etapa' = 'configuracao_inicial') then
    raise exception 'sem histórico do cancelamento';
  end if;
  perform set_config('role', 'postgres', true); perform set_config('request.jwt.claims', '', true);
  if not exists (select 1 from public.ops_notifications where kind = 'cliente.reuniao' and dedupe_key like 'onb-desistiu:' || v_cli2 || ':%') then raise exception 'sem aviso de cancelamento do onboarding'; end if;
  perform set_config('role', 'authenticated', true); perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  v_ok := v_ok + 1;

  -- 5) cancelar por outro motivo estando em Agendado: volta para Pendente (não vai para Cancelado)
  v_m3 := public.ops_meeting_save(null, null, jsonb_build_object('title', 'Onboarding 3', 'category_id', v_cat,
            'starts_at', (now() + interval '4 days')::text, 'duration_min', 30, 'client_id', v_cli3));
  perform public.ops_client_meeting_link(v_cli3, v_m3);
  select version into v_ver from public.ops_client_ops where client_id = v_cli3;
  perform public.ops_client_stage_move(v_cli3, v_ver, 'coleta_acessos');
  perform public.ops_meeting_cancel_kind(v_m3, (select version from public.ops_meetings where id = v_m3), 'Cliente remarcou', 'outro');
  if (select stage_id from public.ops_client_ops where client_id = v_cli3) <> 'onboarding_pendente' then raise exception 'não voltou para Pendente'; end if;
  v_ok := v_ok + 1;

  -- 6) desvincular em Agendado volta para Pendente; cancelado não pode ser vinculado
  begin perform public.ops_client_meeting_link(v_cli3, v_m3); raise exception 'vinculou cancelada';
  exception when sqlstate '22023' then null; end;
  perform public.ops_client_meeting_unlink(v_cli3);
  v_ok := v_ok + 1;

  -- 7) lembrete diário: um por cliente por dia
  perform set_config('role', 'postgres', true); perform set_config('request.jwt.claims', '', true);
  perform private.ops_onboarding_reuniao_lembrar();
  perform private.ops_onboarding_reuniao_lembrar();
  if (select count(*) from (select dedupe_key, user_id from public.ops_notifications where dedupe_key like 'onb-lembrete:%'
        group by 1, 2 having count(*) > 1) d) > 0 then raise exception 'lembrete duplicou'; end if;
  if not exists (select 1 from public.ops_notifications where dedupe_key like 'onb-lembrete:' || v_cli3 || ':%') then raise exception 'sem lembrete'; end if;
  v_ok := v_ok + 1;

  raise exception 'R: % verificações OK', v_ok;
end;
$$;
