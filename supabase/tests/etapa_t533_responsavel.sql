-- T5.33 — Responsável obrigatório (todas as tarefas). Transação desfeita no final.
do $$
declare adm uuid; sec uuid; t1 uuid; leg uuid; sub uuid; vv int; msg text; n int := 0;
begin
  select id into adm from public.profiles where role = 'admin' and active limit 1;
  select id into sec from public.ops_sectors where status = 'ativo' limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin perform public.ops_task_save(null, null, jsonb_build_object('title', 'Sem dono', 'sector_id', sec, 'people', '{}'::jsonb)); exception when others then msg := sqlerrm; end;
  if msg like '%precisa de um responsável%' then n := n + 1; end if; msg := null;
  begin perform public.ops_task_save(null, null, jsonb_build_object('title', 'Sem dono', 'sector_id', sec)); exception when others then msg := sqlerrm; end;
  if msg like '%precisa de um responsável%' then n := n + 1; end if; msg := null;
  begin perform public.ops_task_save(null, null, jsonb_build_object('title', 'Só adicional', 'sector_id', sec, 'people', jsonb_build_object('adicionais', jsonb_build_array(adm)))); exception when others then msg := sqlerrm; end;
  if msg like '%precisa de um responsável%' then n := n + 1; end if; msg := null;
  t1 := public.ops_task_save(null, null, jsonb_build_object('title', 'Com dono', 'sector_id', sec, 'people', jsonb_build_object('principal', adm)));
  if exists (select 1 from public.ops_task_people where task_id = t1 and role = 'principal' and user_id = adm) then n := n + 1; end if;
  begin perform public.ops_task_save(null, null, jsonb_build_object('title', 'Sub sem dono', 'sector_id', sec, 'parent_id', t1, 'people', '{}'::jsonb)); exception when others then msg := sqlerrm; end;
  if msg like '%precisa de um responsável%' then n := n + 1; end if; msg := null;
  sub := public.ops_task_save(null, null, jsonb_build_object('title', 'Sub com dono', 'sector_id', sec, 'parent_id', t1, 'people', jsonb_build_object('principal', adm)));
  if sub is not null then n := n + 1; end if;
  select version into vv from public.ops_tasks where id = t1;
  begin perform public.ops_task_set_people(t1, vv, jsonb_build_object('adicionais', jsonb_build_array(adm))); exception when others then msg := sqlerrm; end;
  if msg like '%precisa de um responsável%' then n := n + 1; end if; msg := null;
  perform public.ops_task_set_people(t1, vv, jsonb_build_object('principal', adm, 'adicionais', '[]'::jsonb));
  n := n + 1;
  reset role;
  insert into public.ops_tasks (title, sector_id, status_id, created_by, updated_by) values ('Tarefa antiga', sec, 'nao_iniciado', adm, adm) returning id into leg;
  set local role authenticated;
  select version into vv from public.ops_tasks where id = leg;
  begin perform public.ops_task_set_status(leg, vv, 'em_andamento'); exception when others then msg := sqlerrm; end;
  if msg like '%sem responsável%' then n := n + 1; end if; msg := null;
  begin perform public.ops_task_save(leg, vv, jsonb_build_object('title', 'Tarefa antiga 2', 'sector_id', sec)); exception when others then msg := sqlerrm; end;
  if msg like '%sem responsável%' then n := n + 1; end if; msg := null;
  perform public.ops_task_set_people(leg, vv, jsonb_build_object('principal', adm));
  select version into vv from public.ops_tasks where id = leg;
  perform public.ops_task_set_status(leg, vv, 'em_andamento');
  if (select status_id from public.ops_tasks where id = leg) = 'em_andamento' then n := n + 1; end if;
  raise exception 'T5.33: % verificações OK de 11 (desfeito)', n;
end $$;
