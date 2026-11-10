-- T5.24: fila mais segura. Transação desfeita; esperado: erro "T5.24: 4 verificações OK (desfeito)".
do $$
declare
  v_admin uuid; v_c1 uuid; e1 uuid; v_ok int := 0; v_json jsonb; v_id bigint; v_sem date := (private.envio_hoje() ->> 'semana')::date;
  v_dow int := extract(dow from now() at time zone 'America/Sao_Paulo')::int;
  v_hor text := to_char((now() at time zone 'America/Sao_Paulo') - interval '10 minutes', 'HH24:MI');
  v_seq bigint; v_called boolean; mk jsonb;
begin
  select last_value, is_called into v_seq, v_called from public.ops_envios_codigo_seq;
  select id into v_admin from public.profiles where role = 'admin' and active order by created_at limit 1;
  select c.id into v_c1 from public.clients c where c.excluded_at is null and private.client_is_active(c.id) order by name limit 1;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  perform set_config('request.headers', '{}', true);
  mk := jsonb_build_array(jsonb_build_object('cliente_id', v_c1, 'nome_grupo', 'G1'));
  e1 := public.ops_envio_save(null, null, jsonb_build_object('nome', 'Fila segura', 'mensagem', 'Oi', 'dia_semana', v_dow, 'horario', v_hor, 'clientes', mk));
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
  update public.wa_gateway_settings set enabled = true, connection_state = 'conectado' where id;
  insert into public.wa_envio_config (envio_id, automatico) values (e1, true);
  insert into public.wa_grupos (cliente_id, grupo_id, grupo_nome) select v_c1, '120363000000000091@g.us', 'T1'
   where not exists (select 1 from public.wa_grupos g where g.cliente_id = v_c1 and g.desvinculado_em is null);
  -- limpa a fila para o teste enxergar só o que ele cria
  update public.wa_disparos set status = 'pulado' where status = 'pendente';
  update public.wa_disparos set enviado_em = now() - interval '1 day', atualizado_em = now() - interval '1 day' where status in ('enviando', 'enviado');

  -- 1) reenvio (origem manual) SEM aprovação da semana: não sai, é pulado
  insert into public.wa_disparos (envio_id, cliente_id, grupo_id, semana, origem, versao_envio)
  values (e1, v_c1, (select grupo_id from public.wa_grupos where cliente_id = v_c1 and desvinculado_em is null limit 1), v_sem, 'manual', 1);
  if private.wa_disparo_proximo() is not null then raise exception 'reenvio saiu sem aprovação'; end if;
  if not exists (select 1 from public.wa_disparos where envio_id = e1 and status = 'pulado' and detalhe like 'A aprovação da semana não vale mais%') then raise exception 'deveria ter pulado por aprovação'; end if;
  v_ok := v_ok + 1;

  -- 2) aprovado depois: o pulado por aprovação volta à fila no automático
  insert into public.ops_envio_aprovacoes (envio_id, semana, decisao, versao_envio, origem)
  values (e1, v_sem, 'aprovado', (select versao from public.ops_envios where id = e1), 'sistema');
  insert into public.wa_disparos (envio_id, cliente_id, grupo_id, semana, origem, status, versao_envio, detalhe)
  select e1, v_c1, grupo_id, v_sem, 'automatico', 'pulado', 1, 'A aprovação da semana não vale mais (envio editado ou recusado).'
    from public.wa_grupos where cliente_id = v_c1 and desvinculado_em is null limit 1;
  perform private.wa_envios_enfileirar();
  if not exists (select 1 from public.wa_disparos where envio_id = e1 and origem = 'automatico' and status = 'pendente') then raise exception 'pulado por aprovação não voltou à fila'; end if;
  v_ok := v_ok + 1;

  -- 3) com aprovação, o reenvio manual sai
  update public.wa_disparos set status = 'pulado' where envio_id = e1 and status = 'pendente';
  insert into public.wa_disparos (envio_id, cliente_id, grupo_id, semana, origem, versao_envio)
  select e1, v_c1, grupo_id, v_sem, 'manual', (select versao from public.ops_envios where id = e1) from public.wa_grupos where cliente_id = v_c1 and desvinculado_em is null limit 1;
  v_json := private.wa_disparo_proximo();
  if v_json is null then raise exception 'reenvio aprovado deveria sair'; end if;
  v_id := (v_json ->> 'id')::bigint;
  v_ok := v_ok + 1;

  -- 4) presa em "enviando" por mais de 5 minutos: NÃO volta à fila (evita envio em dobro): vira "falhou"
  update public.wa_disparos set atualizado_em = now() - interval '10 minutes' where id = v_id;
  perform private.wa_disparo_proximo();
  if (select status from public.wa_disparos where id = v_id) <> 'falhou' or not exists (select 1 from public.wa_disparos where id = v_id and detalhe like 'Resultado não confirmado%') then raise exception 'presa deveria virar falhou'; end if;
  v_ok := v_ok + 1;

  perform setval('public.ops_envios_codigo_seq', v_seq, v_called);
  raise exception 'T5.24: % verificações OK (desfeito)', v_ok;
end $$;
