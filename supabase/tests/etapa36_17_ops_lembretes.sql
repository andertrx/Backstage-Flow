-- Teste da Central 36.17 (lembrete de tarefa vencida, 8h/12h/17h, e aparelhos para notificação).
-- Roda numa transação desfeita (termina com "R: N verificações OK", que desfaz tudo).
do $$
declare
  v_admin uuid; v_visu uuid; v_sector uuid; t_late uuid; t_done uuid; t_future uuid; t_other uuid;
  v_res jsonb; v_sub uuid; v_ok integer := 0;
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_p256 text := 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4';
begin
  select id into v_admin from public.profiles where role = 'admin' and active order by created_at limit 1;
  select id into v_visu from public.profiles where role = 'visualizador' and active order by created_at limit 1;
  select id into v_sector from public.ops_sectors where status = 'ativo' order by position limit 1;

  -- Horários (Brasília = UTC-3): antes das 8h não tem; 8h, 12h e 17h
  if private.ops_due_slot('2026-10-26 10:59:00+00') is not null or private.ops_due_slot('2026-10-26 11:00:00+00') <> 8
     or private.ops_due_slot('2026-10-26 14:59:00+00') <> 8 or private.ops_due_slot('2026-10-26 15:00:00+00') <> 12
     or private.ops_due_slot('2026-10-26 20:00:00+00') <> 17 or private.ops_due_slot('2026-10-27 02:30:00+00') <> 17 then
    raise exception 'horários 8h, 12h e 17h de Brasília';
  end if;
  v_ok := v_ok + 1;

  -- Tarefas: vencida e aberta (admin responsável), concluída, futura, e uma em que o admin é só adicional
  insert into public.ops_tasks (title, sector_id, due_date) values ('Teste vencida', v_sector, v_today - 1) returning id into t_late;
  insert into public.ops_tasks (title, sector_id, due_date, status_id) values ('Teste concluída', v_sector, v_today - 2, 'finalizado') returning id into t_done;
  insert into public.ops_tasks (title, sector_id, due_date) values ('Teste futura', v_sector, v_today + 3) returning id into t_future;
  insert into public.ops_tasks (title, sector_id, due_date) values ('Teste de outro', v_sector, v_today) returning id into t_other;
  insert into public.ops_task_people (task_id, user_id, role) values
    (t_late, v_admin, 'principal'), (t_done, v_admin, 'principal'), (t_future, v_admin, 'principal'),
    (t_other, v_visu, 'principal'), (t_other, v_admin, 'adicional');
  v_res := private.ops_due_tasks_for(v_admin);
  -- (o banco real pode ter outras tarefas vencidas do admin: confere só as de teste)
  if not v_res @> jsonb_build_array(jsonb_build_object('id', t_late, 'days_late', 1))
     or v_res @> jsonb_build_array(jsonb_build_object('id', t_done)) or v_res @> jsonb_build_array(jsonb_build_object('id', t_future))
     or v_res @> jsonb_build_array(jsonb_build_object('id', t_other)) then
    raise exception 'só a vencida e aberta em que é o responsável: %', v_res;
  end if;
  if not private.ops_due_tasks_for(v_visu) @> jsonb_build_array(jsonb_build_object('id', t_other)) then raise exception 'vence hoje também conta (para o responsável)'; end if;
  v_ok := v_ok + 1;

  -- Tela do admin: recebe as tarefas; marcar "Vi" fora do horário é recusado
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  v_res := public.ops_due_reminder();
  if jsonb_array_length(v_res -> 'tasks') < 1 or (v_res ->> 'slot') is distinct from (private.ops_due_slot())::text then
    raise exception 'lembrete da tela: %', v_res;
  end if;
  begin
    perform public.ops_due_reminder_seen(v_today - 1, 8::smallint);
    raise exception 'dia ou horário errado deveria ser recusado';
  exception when invalid_parameter_value then null;
  end;
  if private.ops_due_slot() is not null then
    perform public.ops_due_reminder_seen(v_today, private.ops_due_slot());
    if not (public.ops_due_reminder() ->> 'seen')::boolean then raise exception 'depois do Vi, o horário fica visto'; end if;
  end if;
  v_ok := v_ok + 1;

  -- Aparelho: inválido recusado; válido salvo; a tela não lê o endereço/chaves; ninguém vê o aparelho dos outros
  begin
    perform public.ops_push_subscribe('http://inseguro', v_p256, 'BTBZMqHH6r4Tts7J_aSIgg', 'Chrome');
    raise exception 'endereço sem https deveria ser recusado';
  exception when invalid_parameter_value then null;
  end;
  v_sub := public.ops_push_subscribe('https://fcm.googleapis.com/fcm/send/teste-3617', v_p256, 'BTBZMqHH6r4Tts7J_aSIgg', 'Chrome no Windows');
  if (select count(*) from public.ops_push_subscriptions where id = v_sub) <> 1 then raise exception 'aparelho salvo'; end if;
  begin
    perform endpoint from public.ops_push_subscriptions;
    raise exception 'a tela não lê o endereço do aparelho';
  exception when insufficient_privilege then null;
  end;
  perform set_config('request.jwt.claims', json_build_object('sub', v_visu, 'role', 'authenticated')::text, true);
  if exists (select 1 from public.ops_push_subscriptions where id = v_sub) then raise exception 'outro usuário não vê o aparelho'; end if;
  v_ok := v_ok + 1;

  -- Servidor: alvos (só no horário e se não viu), resultado do envio, chaves
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'postgres', true);
  v_res := private.ops_push_targets();
  if private.ops_due_slot() is null and jsonb_array_length(v_res) <> 0 then raise exception 'fora do horário não envia'; end if;
  perform private.ops_push_mark(v_sub, false, true, 'Navegador cancelou (410)');
  if (select disabled_at from public.ops_push_subscriptions where id = v_sub) is null then raise exception 'navegador cancelado: aparelho desligado (não apagado)'; end if;
  if exists (select 1 from vault.secrets where name = 'vapid_private_jwk') then
    if private.ops_push_keys_set(repeat('A', 87), '{}') then raise exception 'chaves não são trocadas depois de criadas'; end if;
  else
    if not private.ops_push_keys_set(repeat('A', 87), '{"kty":"EC"}') or private.ops_push_keys_set(repeat('B', 87), '{}') then
      raise exception 'chaves criadas uma vez só';
    end if;
  end if;
  v_ok := v_ok + 1;

  raise exception 'R: % verificações OK', v_ok;
end $$;
