-- Teste da Etapa 40 (servidor MCP): registro das chamadas, saúde, sigilo e isolamento das consultas que o MCP usa.
-- Roda numa transação desfeita (termina com "R: N verificações OK", que desfaz tudo).
do $$
declare
  v_admin uuid; v_visu uuid; v_res jsonb; v_ok integer := 0; v_n integer;
begin
  select id into v_admin from public.profiles where role = 'admin' and active order by created_at limit 1;
  select id into v_visu from public.profiles where role = 'visualizador' and active order by created_at limit 1;

  -- Gravação: só o servidor (chave de serviço); a tela não grava nem chama a função de gravar
  perform public.mcp_log_call(v_admin, 'backstage_status', true, null, 120, null);
  perform public.mcp_log_call(v_visu, 'backstage_get_metrics', false, 'TOO_MANY_REQUESTS', 3, null);
  perform public.mcp_log_call(gen_random_uuid(), 'backstage_list_clients', false, 'UNAUTHENTICATED', 1, null);
  if (select user_id from public.mcp_call_log where tool = 'backstage_list_clients' order by id desc limit 1) is not null then
    raise exception 'pessoa que não existe não fica registrada';
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_visu, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  begin
    perform public.mcp_log_call(v_visu, 'x', true, null, 1, null);
    raise exception 'a tela não pode gravar no registro';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.mcp_call_log (user_id, tool, ok) values (v_visu, 'x', true);
    raise exception 'a tela não pode inserir direto';
  exception when insufficient_privilege then null;
  end;
  v_ok := v_ok + 1;

  -- Saúde: a pessoa vê só as próprias chamadas; o admin vê todas, com o nome nos erros
  v_res := public.mcp_health(24);
  if v_res ->> 'escopo' <> 'só as suas chamadas' or (select count(*) from public.mcp_call_log where user_id <> v_visu) > 0 then
    raise exception 'visualizador vê só as próprias chamadas: %', v_res;
  end if;
  if (v_res ->> 'limite_atingido')::int < 1 or (v_res -> 'ultimos_erros' -> 0 ->> 'pessoa') is not null then
    raise exception 'saúde do visualizador (sem nomes): %', v_res;
  end if;
  begin
    perform public.mcp_health(0);
    raise exception 'período inválido deveria ser recusado';
  exception when invalid_parameter_value then null;
  end;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  v_res := public.mcp_health(24);
  if v_res ->> 'escopo' <> 'todas as pessoas' or (v_res ->> 'chamadas')::int < 3 then raise exception 'admin vê todas: %', v_res; end if;
  v_ok := v_ok + 1;

  -- Sem login: nada
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'anon', true);
  begin
    perform public.mcp_health(24);
    raise exception 'sem login não vê a saúde';
  exception when insufficient_privilege then null;
  end;
  perform set_config('role', 'postgres', true);
  v_ok := v_ok + 1;

  -- Isolamento das consultas que o MCP usa: visualizador sem clientes liberados não vê clientes, campanhas nem números
  if exists (select 1 from public.user_client_access where user_id = v_visu) then
    raise notice 'visualizador tem clientes liberados: isolamento conferido só pela contagem';
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_visu, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  select count(*) into v_n from public.clients where id not in (select client_id from public.user_client_access where user_id = v_visu);
  if v_n <> 0 then raise exception 'visualizador vê cliente não liberado (%)', v_n; end if;
  select count(*) into v_n from public.campaigns where client_id not in (select client_id from public.user_client_access where user_id = v_visu);
  if v_n <> 0 then raise exception 'visualizador vê campanha de cliente não liberado'; end if;
  select count(*) into v_n from public.dashboard_summary(current_date - 30, current_date, null, null, null, null, null) where spend_micros > 0;
  if not exists (select 1 from public.user_client_access where user_id = v_visu) and v_n <> 0 then raise exception 'visualizador sem clientes vê números'; end if;
  perform set_config('role', 'postgres', true);
  v_ok := v_ok + 1;

  -- Limpeza de 180 dias: tira só o antigo
  insert into public.mcp_call_log (created_at, user_id, tool, ok) values (now() - interval '181 days', v_admin, 'antigo', true), (now() - interval '179 days', v_admin, 'recente', true);
  v_n := private.mcp_log_purge();
  if exists (select 1 from public.mcp_call_log where tool = 'antigo') or not exists (select 1 from public.mcp_call_log where tool = 'recente') then
    raise exception 'limpeza de 180 dias';
  end if;
  if not exists (select 1 from cron.job where jobname = 'mcp-log-purge') then raise exception 'agendamento da limpeza'; end if;
  v_ok := v_ok + 1;

  raise exception 'R: % verificações OK', v_ok;
end $$;
