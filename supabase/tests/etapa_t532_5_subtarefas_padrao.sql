-- T5.32 etapa 5 — subtarefas padrão no modelo do onboarding e resumo do cliente. Transação desfeita no final.
do $$
declare adm uuid; sec uuid; tpl uuid; cli uuid; t1 uuid; s1 uuid; msg text; n int := 0; subs text[]; summ jsonb; vv int;
begin
  select id into adm from public.profiles where role = 'admin' and active limit 1;
  select id into sec from public.ops_sectors where status = 'ativo' limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  tpl := public.ops_onboarding_template_save(null, jsonb_build_object('title', 'Modelo teste T5325', 'sector_id', sec, 'subtasks', jsonb_build_array('Pedir logo', '  ', 'Pedir cores')));
  select subtasks into subs from public.ops_onboarding_task_templates where id = tpl;
  if subs = array['Pedir logo', 'Pedir cores'] then n := n + 1; end if;
  begin perform public.ops_onboarding_template_save(tpl, jsonb_build_object('title', 'Modelo teste T5325', 'sector_id', sec, 'subtasks', jsonb_build_array('ab'))); exception when others then msg := sqlerrm; end;
  if msg like '%3 a 200 letras%' then n := n + 1; end if; msg := null;
  perform public.ops_onboarding_template_save(tpl, jsonb_build_object('title', 'Modelo teste T5325', 'sector_id', sec));
  select subtasks into subs from public.ops_onboarding_task_templates where id = tpl;
  if cardinality(subs) = 0 then n := n + 1; end if;
  reset role;
  select id into cli from public.clients limit 1;
  set local role authenticated;
  t1 := public.ops_task_save(null, null, jsonb_build_object('title', 'Principal T5325', 'sector_id', sec, 'client_id', cli, 'people', jsonb_build_object('principal', adm)));
  s1 := public.ops_task_save(null, null, jsonb_build_object('title', 'Sub T5325', 'sector_id', sec, 'parent_id', t1, 'people', jsonb_build_object('principal', adm)));
  reset role; summ := private.ops_client_summary(cli); set local role authenticated;
  if (summ ->> 'subtarefas')::int >= 1 and (summ ->> 'subtarefas_concluidas')::int = 0 then n := n + 1; end if;
  select version into vv from public.ops_tasks where id = s1;
  perform public.ops_task_set_status(s1, vv, 'finalizado');
  reset role; summ := private.ops_client_summary(cli);
  if (summ ->> 'subtarefas_concluidas')::int >= 1 then n := n + 1; end if;
  raise exception 'T5.32-5: % verificações OK de 5 (desfeito)', n;
end $$;
