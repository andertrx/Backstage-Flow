-- T5.22 Fase 3: reenviar. Transação desfeita; esperado erro "T5.22-F3: 6 verificações OK (desfeito)".
do $$
declare
  v_admin uuid; v_c1 uuid; v_c2 uuid; e1 uuid; v_ok int := 0; v_n int; v_r jsonb; v_sem date := (private.envio_hoje() ->> 'semana')::date;
  v_dow int := extract(dow from now() at time zone 'America/Sao_Paulo')::int;
  v_hor text := to_char((now() at time zone 'America/Sao_Paulo') - interval '10 minutes', 'HH24:MI');
  mk jsonb; v_seq bigint; v_called boolean;
begin
  select last_value, is_called into v_seq, v_called from public.ops_envios_codigo_seq;
  select id into v_admin from public.profiles where role = 'admin' and active order by created_at limit 1;
  select c.id into v_c1 from public.clients c where c.excluded_at is null and private.client_is_active(c.id) order by name limit 1;
  select c.id into v_c2 from public.clients c where c.excluded_at is null and private.client_is_active(c.id) and c.id <> v_c1 order by name limit 1;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  perform set_config('request.headers', '{}', true);
  mk := jsonb_build_array(jsonb_build_object('cliente_id', v_c1, 'nome_grupo', 'G1'), jsonb_build_object('cliente_id', v_c2, 'nome_grupo', 'G2'));
  e1 := public.ops_envio_save(null, null, jsonb_build_object('nome', 'Reenvio', 'mensagem', 'Oi', 'dia_semana', v_dow, 'horario', v_hor, 'clientes', mk));
  -- 1) sem ser automático e sem aprovação: recusa
  begin perform public.wa_envio_reenviar(e1, 'faltantes'); raise exception 'aceitou sem ser automático'; exception when sqlstate '22023' then null; end;
  v_ok := v_ok + 1;
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
  update public.wa_gateway_settings set enabled = true, connection_state = 'conectado' where id;
  insert into public.wa_envio_config (envio_id, automatico) values (e1, true) on conflict (envio_id) do update set automatico = true;
  insert into public.wa_grupos (cliente_id, grupo_id, grupo_nome) select v_c1, '120363000000000081@g.us', 'T1' where not exists (select 1 from public.wa_grupos g where g.cliente_id = v_c1 and g.desvinculado_em is null);
  insert into public.wa_grupos (cliente_id, grupo_id, grupo_nome) select v_c2, '120363000000000082@g.us', 'T2' where not exists (select 1 from public.wa_grupos g where g.cliente_id = v_c2 and g.desvinculado_em is null);
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  -- 2) automático mas sem aprovação da semana: recusa
  begin perform public.wa_envio_reenviar(e1, 'faltantes'); raise exception 'aceitou sem aprovação'; exception when sqlstate '22023' then null; end;
  v_ok := v_ok + 1;
  perform set_config('role', 'postgres', true);
  insert into public.ops_envio_aprovacoes (envio_id, semana, decisao, versao_envio, origem) values (e1, v_sem, 'aprovado', (select versao from public.ops_envios where id = e1), 'sistema');
  -- cliente 1 já recebeu; cliente 2 falhou
  insert into public.ops_envio_execucoes (envio_id, cliente_id, status, detalhe, origem) values (e1, v_c1, 'enviado', 'ok', 'whatsapp'), (e1, v_c2, 'falhou', 'erro', 'whatsapp');
  perform set_config('role', 'authenticated', true);
  -- 3) só quem não recebeu: entra o cliente 2, não o 1
  v_r := public.wa_envio_reenviar(e1, 'faltantes');
  if (v_r ->> 'na_fila')::int <> 1 or not exists (select 1 from public.wa_disparos where envio_id = e1 and cliente_id = v_c2 and status = 'pendente' and origem = 'manual')
     or exists (select 1 from public.wa_disparos where envio_id = e1 and cliente_id = v_c1) then raise exception 'faltantes errado: %', v_r; end if;
  v_ok := v_ok + 1;
  -- 4) repetir não duplica (já está na fila)
  v_r := public.wa_envio_reenviar(e1, 'faltantes');
  if (v_r ->> 'na_fila')::int <> 0 then raise exception 'duplicou na fila: %', v_r; end if;
  v_ok := v_ok + 1;
  -- 5) todos: o cliente 1 entra de novo, o 2 continua só uma vez
  v_r := public.wa_envio_reenviar(e1, 'todos');
  select count(*) into v_n from public.wa_disparos where envio_id = e1 and status = 'pendente';
  if (v_r ->> 'na_fila')::int <> 1 or v_n <> 2 then raise exception 'todos errado: % / %', v_r, v_n; end if;
  v_ok := v_ok + 1;
  -- 6) desmarcado na semana não recebe nem no reenvio
  perform public.ops_envio_semana_set(e1, jsonb_build_array(jsonb_build_object('cliente_id', v_c1, 'receber', false)));
  perform set_config('role', 'postgres', true);
  update public.wa_disparos set status = 'enviado' where envio_id = e1;
  perform set_config('role', 'authenticated', true);
  v_r := public.wa_envio_reenviar(e1, 'todos');
  if exists (select 1 from public.wa_disparos where envio_id = e1 and cliente_id = v_c1 and status = 'pendente') then raise exception 'desmarcado entrou: %', v_r; end if;
  v_ok := v_ok + 1;
  perform set_config('role', 'postgres', true);
  perform setval('public.ops_envios_codigo_seq', v_seq, v_called);
  raise exception 'T5.22-F3: % verificações OK (desfeito)', v_ok;
end $$;
