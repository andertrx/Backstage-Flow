-- Teste da Etapa 50.1 — tarefas padrão do onboarding. Transação desfeita: termina com "R: N verificações OK".
do $$
declare
  v_admin uuid; v_sem uuid; v_sec uuid; v_com uuid; v_id uuid; v_ok int := 0; v_n int;
begin
  select id into v_admin from public.profiles where role = 'admin' and active order by created_at limit 1;
  select id into v_sem from public.profiles where active and role not in ('admin', 'cliente') order by created_at limit 1;
  select id into v_sec from public.ops_sectors where name = 'Design' and status = 'ativo';
  select id into v_com from public.ops_sectors where name = 'Comercial';
  select count(*) into v_n from public.ops_onboarding_task_templates where active;
  if v_n < 4 then raise exception 'faltam as 4 tarefas padrão (%)', v_n; end if;
  v_ok := v_ok + 1;

  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_sem, 'role', 'authenticated')::text, true);
  begin perform public.ops_onboarding_template_save(null, jsonb_build_object('title', 'Teste 50.1', 'sector_id', v_sec)); raise exception 'não-admin cadastrou';
  exception when insufficient_privilege then null; end;
  begin perform public.ops_onboarding_template_set_active((select id from public.ops_onboarding_task_templates limit 1), false); raise exception 'não-admin desativou';
  exception when insufficient_privilege then null; end;
  v_ok := v_ok + 1;

  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  begin perform public.ops_onboarding_template_save(null, jsonb_build_object('title', 'ab', 'sector_id', v_sec)); raise exception 'título curto aceito';
  exception when sqlstate '22023' then null; end;
  begin perform public.ops_onboarding_template_save(null, jsonb_build_object('title', 'Teste 50.1', 'sector_id', gen_random_uuid())); raise exception 'setor inexistente aceito';
  exception when sqlstate '22023' then null; end;
  begin perform public.ops_onboarding_template_save(null, jsonb_build_object('title', 'Teste 50.1', 'sector_id', v_sec, 'due_days', 200)); raise exception 'prazo absurdo aceito';
  exception when sqlstate '22023' or sqlstate '22003' or sqlstate '23514' then null; end;
  v_id := public.ops_onboarding_template_save(null, jsonb_build_object('title', 'Teste 50.1', 'sector_id', v_sec, 'priority', 'alta', 'due_days', 3));
  begin perform public.ops_onboarding_template_save(null, jsonb_build_object('title', 'teste 50.1', 'sector_id', v_sec)); raise exception 'duplicada aceita';
  exception when sqlstate '22023' then null; end;
  perform public.ops_onboarding_template_save(v_id, jsonb_build_object('title', 'Teste 50.1 b', 'sector_id', v_sec, 'priority', 'baixa'));
  if (select title from public.ops_onboarding_task_templates where id = v_id) <> 'Teste 50.1 b' then raise exception 'não editou'; end if;
  v_ok := v_ok + 1;

  perform public.ops_onboarding_template_set_active(v_id, false);
  if (select active from public.ops_onboarding_task_templates where id = v_id) then raise exception 'não desativou'; end if;
  perform public.ops_onboarding_template_reorder(array(select id from public.ops_onboarding_task_templates order by position desc));
  if not exists (select 1 from public.audit_logs where action like 'ops.onboarding_template.%' and target_id = v_id::text) then raise exception 'sem auditoria'; end if;
  v_ok := v_ok + 1;

  raise exception 'R: % verificações OK', v_ok;
end;
$$;
