-- T5.32 (Etapa 1) — Subtarefas. Roda numa transação desfeita no final (raise exception).
do $$
declare
  adm uuid; nadm uuid; sec uuid; cli uuid;
  pai uuid; s1 uuid; s2 uuid; outro uuid; vv integer; msg text; n int := 0; j jsonb; k int;
begin
  select id into adm from public.profiles where role = 'admin' and active limit 1;
  select id into nadm from public.profiles where role = 'equipe' and active limit 1;
  select id into sec from public.ops_sectors where status = 'ativo' limit 1;
  select id into cli from public.clients limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  set local role authenticated;

  pai := public.ops_task_save(null, null, jsonb_build_object('title', 'Lançamento T532', 'sector_id', sec, 'client_id', cli, 'people', '{}'::jsonb));
  s1 := public.ops_task_save(null, null, jsonb_build_object('title', 'Subtarefa 1', 'sector_id', sec, 'parent_id', pai, 'people', '{}'::jsonb));
  s2 := public.ops_task_save(null, null, jsonb_build_object('title', 'Subtarefa 2', 'sector_id', sec, 'parent_id', pai, 'client_id', null, 'people', '{}'::jsonb));
  -- 1) subtarefa criada e herda o cliente da principal
  if (select parent_id from public.ops_tasks where id = s1) = pai and (select client_id from public.ops_tasks where id = s2) = cli then n := n + 1; end if;
  -- 2) só um nível
  begin perform public.ops_task_save(null, null, jsonb_build_object('title', 'Neta', 'sector_id', sec, 'parent_id', s1, 'people', '{}'::jsonb)); exception when others then msg := sqlerrm; end;
  if msg like '%só um nível%' then n := n + 1; end if; msg := null;
  -- 3) tarefa com subtarefas não vira subtarefa
  outro := public.ops_task_save(null, null, jsonb_build_object('title', 'Outra principal', 'sector_id', sec, 'people', '{}'::jsonb));
  select version into vv from public.ops_tasks where id = pai;
  begin perform public.ops_task_save(pai, vv, jsonb_build_object('title', 'Lançamento T532', 'sector_id', sec, 'client_id', cli, 'parent_id', outro, 'people', '{}'::jsonb)); exception when others then msg := sqlerrm; end;
  if msg like '%já tem subtarefas%' then n := n + 1; end if; msg := null;
  -- 4) não finaliza a principal com subtarefas abertas
  select version into vv from public.ops_tasks where id = pai;
  begin perform public.ops_task_set_status(pai, vv, 'finalizado'); exception when others then msg := sqlerrm; end;
  if msg like '%2 subtarefa(s) em aberto%' then n := n + 1; end if; msg := null;
  -- 5) leitura: subtarefa mostra a principal; principal mostra subtarefas e progresso
  j := public.ops_task_get(s1);
  if (j -> 'parent' ->> 'title') = 'Lançamento T532' then n := n + 1; end if;
  j := public.ops_task_get(pai);
  if jsonb_array_length(j -> 'subtasks') = 2 and (j -> 'subtask_progress' ->> 'total')::int = 2 and (j -> 'subtask_progress' ->> 'done')::int = 0 then n := n + 1; end if;
  -- 6) lista: "só principais" esconde subtarefas; contadores corretos
  j := public.ops_task_list(jsonb_build_object('top_only', true, 'q', 'T532'), 50, 0);
  if jsonb_array_length(j) = 1 and (j -> 0 ->> 'subtasks_total')::int = 2 then n := n + 1; end if;
  j := public.ops_task_list(jsonb_build_object('parent_id', pai), 50, 0);
  if jsonb_array_length(j) = 2 and (j -> 0 ->> 'parent_title') = 'Lançamento T532' then n := n + 1; end if;
  -- 7) concluir uma, cancelar outra: aí a principal finaliza
  select version into vv from public.ops_tasks where id = s1; perform public.ops_task_set_status(s1, vv, 'finalizado');
  select version into vv from public.ops_tasks where id = s2; perform public.ops_task_set_status(s2, vv, 'cancelado');
  select version into vv from public.ops_tasks where id = pai; perform public.ops_task_set_status(pai, vv, 'finalizado');
  if (select status_id from public.ops_tasks where id = pai) = 'finalizado' then n := n + 1; end if;
  -- 8) ordem das subtarefas
  perform public.ops_subtask_reorder(pai, array[s2, s1]);
  if (select sub_position from public.ops_tasks where id = s2) < (select sub_position from public.ops_tasks where id = s1) then n := n + 1; end if;
  -- 9) arquivar a principal leva as subtarefas; desarquivar traz de volta
  perform public.ops_task_archive(pai, true);
  if (select count(*) from public.ops_tasks where parent_id = pai and archived_at is not null) = 2 then n := n + 1; end if;
  perform public.ops_task_archive(pai, false);
  if (select count(*) from public.ops_tasks where parent_id = pai and archived_at is null) = 2 then n := n + 1; end if;
  -- 10) subtarefa não desarquiva sozinha com a principal arquivada
  perform public.ops_task_archive(pai, true);
  begin perform public.ops_task_archive(s1, false); exception when others then msg := sqlerrm; end;
  if msg like '%Desarquive primeiro%' then n := n + 1; end if; msg := null;
  perform public.ops_task_archive(pai, false);
  -- 11) excluir leva as subtarefas; restaurar traz de volta
  perform public.ops_task_delete(pai);
  reset role;
  if (select count(*) from public.ops_tasks where parent_id = pai and deleted_at is not null) = 2 then n := n + 1; end if;
  set local role authenticated;
  perform public.ops_task_restore(pai);
  if (select count(*) from public.ops_tasks where parent_id = pai and deleted_at is null) = 2 then n := n + 1; end if;
  perform public.ops_task_archive(pai, false);
  -- 12) promover subtarefa a tarefa (tira da principal) e transformar tarefa em subtarefa
  select version into vv from public.ops_tasks where id = s1;
  perform public.ops_task_save(s1, vv, jsonb_build_object('title', 'Subtarefa 1', 'sector_id', sec, 'parent_id', null, 'people', '{}'::jsonb));
  if (select parent_id from public.ops_tasks where id = s1) is null then n := n + 1; end if;
  select version into vv from public.ops_tasks where id = outro;
  perform public.ops_task_save(outro, vv, jsonb_build_object('title', 'Outra principal', 'sector_id', sec, 'parent_id', pai, 'people', '{}'::jsonb));
  if (select parent_id from public.ops_tasks where id = outro) = pai then n := n + 1; end if;
  -- 13) histórico da principal registra a criação das subtarefas
  select count(*) into k from public.ops_activity where task_id = pai and action = 'tarefa.subtarefa_criada';
  if k = 2 then n := n + 1; end if;
  -- 14) quem não pode editar não cria subtarefa
  if nadm is not null then
    perform set_config('request.jwt.claims', json_build_object('sub', nadm, 'role', 'authenticated')::text, true);
    begin perform public.ops_task_save(null, null, jsonb_build_object('title', 'Intrusa', 'sector_id', sec, 'parent_id', pai, 'people', '{}'::jsonb)); exception when others then msg := sqlerrm; end;
    if msg is not null then n := n + 1; end if;
  else n := n + 1; end if;
  raise exception 'T5.32: % verificações OK de 19 (desfeito)', n;
end $$;
