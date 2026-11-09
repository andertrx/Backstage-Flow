-- T5.22 Fase 2: "Quem recebe hoje". Transação desfeita; esperado: erro "T5.22-F2: 7 verificações OK (desfeito)".
do $$
declare
  v_admin uuid; v_nonadmin uuid; v_c1 uuid; v_c2 uuid; e1 uuid; v_ok int := 0; v_s jsonb; v_n int; v_sem date := (private.envio_hoje() ->> 'semana')::date;
  v_dow int := extract(dow from now() at time zone 'America/Sao_Paulo')::int;
  v_hor text := to_char((now() at time zone 'America/Sao_Paulo') - interval '10 minutes', 'HH24:MI');
  mk jsonb; v_seq bigint; v_called boolean;
begin
  select last_value, is_called into v_seq, v_called from public.ops_envios_codigo_seq;
  select id into v_admin from public.profiles where role = 'admin' and active order by created_at limit 1;
  select id into v_nonadmin from public.profiles where role <> 'admin' and active limit 1;
  select c.id into v_c1 from public.clients c where c.excluded_at is null and private.client_is_active(c.id) order by name limit 1;
  select c.id into v_c2 from public.clients c where c.excluded_at is null and private.client_is_active(c.id) and c.id <> v_c1 order by name limit 1;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  perform set_config('request.headers', '{}', true);
  mk := jsonb_build_array(jsonb_build_object('cliente_id', v_c1, 'nome_grupo', 'G1'), jsonb_build_object('cliente_id', v_c2, 'nome_grupo', 'G2'));
  e1 := public.ops_envio_save(null, null, jsonb_build_object('nome', 'Quem recebe', 'mensagem', 'Oi', 'dia_semana', v_dow, 'horario', v_hor, 'clientes', mk));
  -- 1) padrão: todos recebem
  v_s := public.ops_envio_get(e1);
  if exists (select 1 from jsonb_array_elements(v_s -> 'clientes') c where not (c ->> 'recebe_hoje')::boolean) then raise exception 'padrão: todos recebem: %', v_s; end if;
  v_ok := v_ok + 1;
  -- 2) desmarcar o cliente 2 (admin)
  v_s := public.ops_envio_semana_set(e1, jsonb_build_array(jsonb_build_object('cliente_id', v_c2, 'receber', false)));
  if (select count(*) from jsonb_array_elements(v_s -> 'clientes') c where not (c ->> 'recebe_hoje')::boolean and c ->> 'cliente_id' = v_c2::text) <> 1 then raise exception 'cliente 2 deveria estar desmarcado: %', v_s; end if;
  v_ok := v_ok + 1;
  -- 3) cliente de fora do envio é recusado
  begin perform public.ops_envio_semana_set(e1, jsonb_build_array(jsonb_build_object('cliente_id', gen_random_uuid(), 'receber', false))); raise exception 'aceitou cliente de fora';
  exception when sqlstate '22023' then null; end;
  v_ok := v_ok + 1;
  -- 4) quem não tem a permissão de Envios não grava
  for v_nonadmin in select id from public.profiles where role <> 'admin' and active loop
    perform set_config('request.jwt.claims', json_build_object('sub', v_nonadmin, 'role', 'authenticated')::text, true);
    if not private.ops_can('ops.envios') then
      begin perform public.ops_envio_semana_set(e1, '[]'::jsonb); raise exception 'sem permissão gravou';
      exception when sqlstate '42501' then null; end;
      exit;
    end if;
  end loop;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  v_ok := v_ok + 1;
  -- 5) a fila pula o desmarcado e leva só o cliente 1
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
  update public.wa_gateway_settings set enabled = true where id;
  insert into public.wa_envio_config (envio_id, automatico) values (e1, true) on conflict (envio_id) do update set automatico = true;
  insert into public.ops_envio_aprovacoes (envio_id, semana, decisao, versao_envio, origem) values (e1, v_sem, 'aprovado', (select versao from public.ops_envios where id = e1), 'sistema')
  on conflict (envio_id, semana) do update set decisao = 'aprovado', versao_envio = excluded.versao_envio;
  insert into public.wa_grupos (cliente_id, grupo_id, grupo_nome) select v_c1, '120363000000000071@g.us', 'T1'
   where not exists (select 1 from public.wa_grupos g where g.cliente_id = v_c1 and g.desvinculado_em is null);
  insert into public.wa_grupos (cliente_id, grupo_id, grupo_nome) select v_c2, '120363000000000072@g.us', 'T2'
   where not exists (select 1 from public.wa_grupos g where g.cliente_id = v_c2 and g.desvinculado_em is null);
  perform private.wa_envios_enfileirar();
  select count(*) into v_n from public.wa_disparos where envio_id = e1 and status = 'pendente';
  if v_n <> 1 or exists (select 1 from public.wa_disparos where envio_id = e1 and cliente_id = v_c2 and status = 'pendente') then raise exception 'fila deveria ter só o cliente 1 (tem %)', v_n; end if;
  v_ok := v_ok + 1;
  -- 6) marcar de novo coloca na fila; desmarcar tira o pendente da fila (pulado)
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  perform public.ops_envio_semana_set(e1, jsonb_build_array(jsonb_build_object('cliente_id', v_c2, 'receber', true)));
  perform set_config('role', 'postgres', true);
  perform private.wa_envios_enfileirar();
  if not exists (select 1 from public.wa_disparos where envio_id = e1 and cliente_id = v_c2 and status = 'pendente') then raise exception 'marcar de novo deveria enfileirar'; end if;
  perform set_config('role', 'authenticated', true);
  perform public.ops_envio_semana_set(e1, jsonb_build_array(jsonb_build_object('cliente_id', v_c1, 'receber', false)));
  if not exists (select 1 from public.wa_disparos where envio_id = e1 and cliente_id = v_c1 and status = 'pulado' and detalhe like 'Desmarcado%') then raise exception 'desmarcar deveria pular o pendente'; end if;
  v_ok := v_ok + 1;
  -- 7) a escolha é só da semana: com outra semana volta ao padrão
  perform set_config('role', 'postgres', true);
  update public.ops_envio_semana_clientes set semana = v_sem - 7 where envio_id = e1;
  perform set_config('role', 'authenticated', true);
  if exists (select 1 from jsonb_array_elements(public.ops_envio_get(e1) -> 'clientes') c where not (c ->> 'recebe_hoje')::boolean) then raise exception 'semana nova deveria voltar ao padrão'; end if;
  v_ok := v_ok + 1;
  perform set_config('role', 'postgres', true);
  perform setval('public.ops_envios_codigo_seq', v_seq, v_called);
  raise exception 'T5.22-F2: % verificações OK (desfeito)', v_ok;
end $$;
