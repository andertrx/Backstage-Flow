-- T5.32 etapa 6 — a repetição copia as subtarefas abertas. Transação desfeita no final.
do $$
declare adm uuid; sec uuid; t1 uuid; s1 uuid; s2 uuid; s3 uuid; rec uuid; novo uuid; n int := 0; today date := (now() at time zone 'America/Sao_Paulo')::date; vv int; cnt int;
begin
  select id into adm from public.profiles where role = 'admin' and active limit 1;
  select id into sec from public.ops_sectors where status = 'ativo' limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  t1 := public.ops_task_save(null, null, jsonb_build_object('title', 'Modelo repete T5326', 'sector_id', sec, 'start_date', today, 'due_date', today + 2, 'people', jsonb_build_object('principal', adm)));
  s1 := public.ops_task_save(null, null, jsonb_build_object('title', 'Passo 1 T5326', 'sector_id', sec, 'parent_id', t1, 'due_date', today + 1, 'people', jsonb_build_object('principal', adm)));
  s2 := public.ops_task_save(null, null, jsonb_build_object('title', 'Passo 2 T5326', 'sector_id', sec, 'parent_id', t1, 'people', jsonb_build_object('principal', adm)));
  s3 := public.ops_task_save(null, null, jsonb_build_object('title', 'Passo velho T5326', 'sector_id', sec, 'parent_id', t1, 'people', jsonb_build_object('principal', adm)));
  select version into vv from public.ops_tasks where id = s3;
  perform public.ops_task_archive(s3, true);
  reset role;
  insert into public.ops_recurrences (kind, task_id, frequency, start_date, created_by) values ('tarefa', t1, 'diaria', today, adm) returning id into rec;
  perform private.ops_recurrence_generate(rec);
  select id into novo from public.ops_tasks where recurrence_id = rec and occurrence_date = today;
  if novo is not null then n := n + 1; end if;
  select count(*) into cnt from public.ops_tasks where parent_id = novo;
  if cnt = 2 then n := n + 1; end if;
  if exists (select 1 from public.ops_tasks where parent_id = novo and title = 'Passo 1 T5326' and due_date = today + 1 and sub_position = (select sub_position from public.ops_tasks where id = s1) and status_id = 'nao_iniciado') then n := n + 1; end if;
  if not exists (select 1 from public.ops_tasks where parent_id = novo and title = 'Passo velho T5326') then n := n + 1; end if;
  if not exists (select 1 from public.ops_tasks c where c.parent_id = novo and not exists (select 1 from public.ops_task_people p where p.task_id = c.id and p.role = 'principal')) then n := n + 1; end if;
  perform private.ops_recurrence_generate(rec);
  select count(*) into cnt from public.ops_tasks where parent_id = novo;
  if cnt = 2 then n := n + 1; end if;
  raise exception 'T5.32-6: % verificações OK de 6 (desfeito)', n;
end $$;
