-- Teste da Etapa 47.1 — Onboarding Pendente exige reunião realizada. Transação desfeita: termina com "R: N verificações OK".
do $$
declare
  v_admin uuid; v_am uuid; v_out uuid; v_cli uuid; v_cli2 uuid; v_m1 uuid; v_m2 uuid; v_ok int := 0; v_ver int; v_next text; v_b jsonb; v_cat text;
begin
  select id into v_admin from public.profiles where role = 'admin' and active order by created_at limit 1;
  select id into v_am from public.profiles where active and role not in ('admin', 'cliente') order by created_at limit 1;
  select id into v_out from public.profiles where active and role = 'cliente' order by created_at limit 1;
  select id into v_cli from public.clients where status <> 'encerrado' order by created_at limit 1;
  select id into v_cli2 from public.clients where status <> 'encerrado' and id <> v_cli order by created_at limit 1;
  select id into v_cat from public.ops_meeting_categories where active order by position limit 1;
  select id into v_next from public.ops_client_stages
   where active and position > (select position from public.ops_client_stages where id = 'onboarding_pendente') order by position limit 1;

  -- cenário: dois clientes em "Onboarding Pendente", sem reunião (como os que já estavam)
  insert into public.ops_client_ops (client_id, stage_id, am_user_id) values (v_cli, 'onboarding_pendente', v_am)
    on conflict (client_id) do update set stage_id = 'onboarding_pendente', onboarding_meeting_id = null, am_user_id = v_am;
  insert into public.ops_client_ops (client_id, stage_id) values (v_cli2, 'onboarding_pendente')
    on conflict (client_id) do update set stage_id = 'onboarding_pendente', onboarding_meeting_id = null;

  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

  -- 1) sem reunião: não avança (nem o admin)
  select version into v_ver from public.ops_client_ops where client_id = v_cli;
  begin perform public.ops_client_stage_move(v_cli, v_ver, v_next); raise exception 'avançou sem reunião';
  exception when sqlstate '22023' then null; end;
  v_ok := v_ok + 1;

  -- 2) reunião só agendada e vinculada: ainda não avança
  v_m1 := public.ops_meeting_save(null, null, jsonb_build_object('title', 'Onboarding teste', 'category_id', v_cat,
            'starts_at', (now() + interval '2 days')::text, 'duration_min', 30, 'client_id', v_cli));
  perform public.ops_client_meeting_link(v_cli, v_m1);
  if (select onboarding_meeting_id from public.ops_client_ops where client_id = v_cli) <> v_m1 then raise exception 'não vinculou'; end if;
  if not exists (select 1 from public.ops_activity where client_id = v_cli and action = 'cliente.reuniao_vinculada') then raise exception 'sem histórico do vínculo'; end if;
  select version into v_ver from public.ops_client_ops where client_id = v_cli;
  begin perform public.ops_client_stage_move(v_cli, v_ver, v_next); raise exception 'avançou com reunião só agendada';
  exception when sqlstate '22023' then null; end;
  v_ok := v_ok + 1;

  -- 3) validações do vínculo
  begin perform public.ops_client_meeting_link(v_cli2, v_m1); raise exception 'vinculou reunião de outro cliente';
  exception when sqlstate '22023' then null; end;
  v_m2 := public.ops_meeting_save(null, null, jsonb_build_object('title', 'Reunião sem cliente', 'category_id', v_cat,
            'starts_at', (now() + interval '3 days')::text, 'duration_min', 30));
  perform public.ops_client_meeting_link(v_cli2, v_m2);
  if (select client_id from public.ops_meetings where id = v_m2) is distinct from v_cli2 then raise exception 'não ligou a reunião ao cliente'; end if;
  begin perform public.ops_client_meeting_link(v_cli, v_m2); raise exception 'vinculou reunião já usada por outro cliente';
  exception when sqlstate '22023' then null; end;
  begin perform public.ops_client_meeting_link(v_cli, gen_random_uuid()); raise exception 'vinculou reunião inexistente';
  exception when sqlstate '22023' then null; end;
  if v_out is not null then
    perform set_config('request.jwt.claims', json_build_object('sub', v_out, 'role', 'authenticated')::text, true);
    begin perform public.ops_client_meeting_link(v_cli, v_m1); raise exception 'sem permissão vinculou';
    exception when sqlstate '22023' or sqlstate '42501' then null; end;
    perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  end if;
  v_ok := v_ok + 1;

  -- 4) quadro mostra a reunião e meeting_ok=false
  v_b := public.ops_client_board('{}'::jsonb);
  if not exists (select 1 from jsonb_array_elements(v_b -> 'clients') c
                  where c ->> 'client_id' = v_cli::text and (c -> 'onboarding_meeting' ->> 'id') = v_m1::text and (c ->> 'meeting_ok') = 'false') then
    raise exception 'quadro sem a reunião vinculada';
  end if;
  v_ok := v_ok + 1;

  -- 5) reunião realizada: libera, avisa e o cliente avança
  perform public.ops_meeting_record(v_m1, (select version from public.ops_meetings where id = v_m1), 'Ata de teste', '{}');
  v_b := public.ops_client_board('{}'::jsonb);
  if not exists (select 1 from jsonb_array_elements(v_b -> 'clients') c where c ->> 'client_id' = v_cli::text and (c ->> 'meeting_ok') = 'true') then
    raise exception 'quadro não liberou após realizada';
  end if;
  perform set_config('role', 'postgres', true); perform set_config('request.jwt.claims', '', true);
  if not exists (select 1 from public.ops_notifications where kind = 'cliente.reuniao' and dedupe_key like 'onb-realizada:' || v_cli || ':%') then
    raise exception 'sem aviso de reunião realizada';
  end if;
  perform set_config('role', 'authenticated', true); perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  select version into v_ver from public.ops_client_ops where client_id = v_cli;
  perform public.ops_client_stage_move(v_cli, v_ver, v_next);
  if (select stage_id from public.ops_client_ops where client_id = v_cli) <> v_next then raise exception 'não avançou com reunião realizada'; end if;
  -- voltar continua livre
  select version into v_ver from public.ops_client_ops where client_id = v_cli;
  perform public.ops_client_stage_move(v_cli, v_ver, 'onboarding_pendente');
  v_ok := v_ok + 1;

  -- 6) desvincular e histórico
  perform public.ops_client_meeting_unlink(v_cli2);
  if (select onboarding_meeting_id from public.ops_client_ops where client_id = v_cli2) is not null then raise exception 'não desvinculou'; end if;
  if not exists (select 1 from public.ops_activity where client_id = v_cli2 and action = 'cliente.reuniao_desvinculada') then raise exception 'sem histórico do desvínculo'; end if;
  v_ok := v_ok + 1;

  -- 7) cancelar a reunião vinculada avisa e o cliente volta a precisar de reunião
  perform public.ops_client_meeting_link(v_cli2, v_m2);
  perform public.ops_meeting_cancel(v_m2, (select version from public.ops_meetings where id = v_m2), 'teste');
  perform set_config('role', 'postgres', true); perform set_config('request.jwt.claims', '', true);
  if not exists (select 1 from public.ops_notifications where kind = 'cliente.reuniao' and dedupe_key like 'onb-cancelada:' || v_cli2 || ':%') then
    raise exception 'sem aviso de reunião cancelada';
  end if;
  perform set_config('role', 'authenticated', true); perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  if private.ops_onboarding_reuniao_ok(v_cli2) then raise exception 'cancelada não pode liberar'; end if;
  v_ok := v_ok + 1;

  -- 8) lembrete: um por cliente por dia (rodar duas vezes não duplica)
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
  perform private.ops_onboarding_reuniao_lembrar();
  perform private.ops_onboarding_reuniao_lembrar();
  if (select count(*) from (select dedupe_key, user_id from public.ops_notifications where dedupe_key like 'onb-lembrete:' || v_cli2 || ':%'
        group by 1, 2 having count(*) > 1) d) > 0 then raise exception 'lembrete duplicou';
  end if;
  if not exists (select 1 from public.ops_notifications where dedupe_key like 'onb-lembrete:' || v_cli2 || ':%') then raise exception 'sem lembrete'; end if;
  v_ok := v_ok + 1;

  raise exception 'R: % verificações OK', v_ok;
end;
$$;
