-- Teste da Etapa 44.3 — disparos pelo WhatsApp conectado. Transação desfeita: termina com "R: N verificações OK".
-- Monta um envio para HOJE com horário daqui a 25 minutos, aprovado e depois recuado para 10 minutos atrás. Rode entre 0h20 e 5h30 ou entre 7h e 23h20 de Brasília.
do $$
declare
  v_seq bigint; v_seq_called boolean;
  v_admin uuid; v_sem uuid; v_c1 uuid; v_c2 uuid; e1 uuid; v_ok int := 0; v_n int; v_r jsonb; v_p jsonb; v_id bigint;
  v_dow int := extract(dow from now() at time zone 'America/Sao_Paulo')::int;
  v_min int := extract(hour from now() at time zone 'America/Sao_Paulo')::int * 60 + extract(minute from now() at time zone 'America/Sao_Paulo')::int;
  v_hor text := to_char((now() at time zone 'America/Sao_Paulo') + interval '25 minutes', 'HH24:MI');
  mk jsonb;
begin
  select last_value, is_called into v_seq, v_seq_called from public.ops_envios_codigo_seq;
  if not (v_min between 20 and 330 or v_min between 420 and 1400) then raise exception 'Rode este teste entre 0h20 e 5h30 ou entre 7h e 23h20 de Brasília.'; end if;
  select id into v_admin from public.profiles where role = 'admin' and active order by created_at limit 1;
  select p.id into v_sem from public.profiles p where p.active and p.role not in ('admin', 'cliente') and not exists (select 1 from public.ops_member_permissions x where x.user_id = p.id and x.permission = 'ops.envios') order by p.created_at limit 1;
  select id into v_c1 from public.clients where excluded_at is null order by name limit 1;
  select id into v_c2 from public.clients where excluded_at is null order by name offset 1 limit 1;
  update public.wa_gateway_settings set enabled = true, connection_state = 'conectado' where id;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  perform set_config('request.headers', '{}', true);
  mk := jsonb_build_array(jsonb_build_object('cliente_id', v_c1, 'nome_grupo', 'G1'), jsonb_build_object('cliente_id', v_c2, 'nome_grupo', 'G2'));
  e1 := public.ops_envio_save(null, null, jsonb_build_object('nome', 'Disparo teste', 'mensagem', 'Oi', 'dia_semana', v_dow, 'horario', v_hor, 'clientes', mk));
  perform public.ops_envio_decidir(e1, 1, true);
  perform public.wa_grupo_vincular(v_c1, '120363000000000091@g.us', 'Grupo 1');
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
  update public.ops_envios set horario = (now() at time zone 'America/Sao_Paulo' - interval '10 minutes')::time where id = e1;

  -- 1) permissões: só o administrador liga o automático; quem não tem permissão não enfileira
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_sem, 'role', 'authenticated')::text, true);
  begin perform public.wa_envio_set_automatico(e1, true); raise exception 'sem permissão ligou';
  exception when insufficient_privilege then null; end;
  begin perform public.wa_envio_enviar_agora(e1, array[v_c1]); raise exception 'sem permissão enfileirou';
  exception when insufficient_privilege then null; end;
  v_ok := v_ok + 1;

  -- 2) "enviar agora": cliente com grupo entra; sem grupo fica de fora com motivo; segundo pedido: já está na fila
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  v_r := public.wa_envio_enviar_agora(e1, array[v_c1, v_c2]);
  if (v_r ->> 'enfileirados')::int <> 1 or jsonb_array_length(v_r -> 'pulados') <> 1 then raise exception 'enviar agora errado: %', v_r; end if;
  v_r := public.wa_envio_enviar_agora(e1, array[v_c1]);
  if (v_r ->> 'enfileirados')::int <> 0 or v_r -> 'pulados' -> 0 ->> 'motivo' <> 'Já está na fila.' then raise exception 'duplicou na fila: %', v_r; end if;
  begin perform public.wa_envio_enviar_agora(e1, '{}'); raise exception 'aceitou lista vazia';
  exception when sqlstate '22023' then null; end;
  v_ok := v_ok + 1;

  -- 3) servidor: pega o próximo, só uma vez; falha temporária volta para a fila; segunda falha fecha como falhou
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
  v_p := private.wa_disparo_proximo();
  if v_p is null or v_p ->> 'grupo_id' <> '120363000000000091@g.us' or v_p ->> 'mensagem' <> 'Oi' then raise exception 'próximo errado: %', v_p; end if;
  v_id := (v_p ->> 'id')::bigint;
  if private.wa_disparo_proximo() is not null then raise exception 'entregou duas vezes'; end if;
  perform private.wa_disparo_resultado(v_id, false, 'sem resposta', true);
  if (select status from public.wa_disparos where id = v_id) <> 'pendente' then raise exception 'não voltou para a fila'; end if;
  update public.wa_disparos set atualizado_em = now() - interval '2 minutes' where id = v_id;
  if private.wa_disparo_proximo() is null then raise exception 'não pegou de novo'; end if;
  perform private.wa_disparo_resultado(v_id, false, 'sem resposta', true);
  if (select status from public.wa_disparos where id = v_id) <> 'falhou' then raise exception 'não fechou como falhou'; end if;
  v_ok := v_ok + 1;

  -- 4) sucesso grava a execução com origem whatsapp; depois "já recebeu" (e reenviar permite)
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  perform public.wa_envio_enviar_agora(e1, array[v_c1]);
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
  update public.wa_disparos set atualizado_em = now() - interval '2 minutes' where status = 'pendente';
  v_p := private.wa_disparo_proximo();
  v_id := (v_p ->> 'id')::bigint;
  perform private.wa_disparo_resultado(v_id, true, null, false);
  if (select status from public.wa_disparos where id = v_id) <> 'enviado' then raise exception 'não marcou enviado'; end if;
  if not exists (select 1 from public.ops_envio_execucoes where envio_id = e1 and cliente_id = v_c1 and status = 'enviado' and origem = 'whatsapp') then raise exception 'execução não registrada'; end if;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  v_r := public.wa_envio_enviar_agora(e1, array[v_c1]);
  if v_r -> 'pulados' -> 0 ->> 'motivo' <> 'Já recebeu nesta semana.' then raise exception 'reenviou sem querer: %', v_r; end if;
  if (public.wa_envio_enviar_agora(e1, array[v_c1], true) ->> 'enfileirados')::int <> 1 then raise exception 'reenviar não funcionou'; end if;
  v_ok := v_ok + 1;

  -- 5) ritmo: logo depois de um envio, o servidor espera
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
  if private.wa_disparo_proximo() is not null then raise exception 'ignorou o ritmo de 45 s'; end if;
  v_ok := v_ok + 1;

  -- 6) trava geral desligada: nada sai e "enviar agora" é recusado
  update public.wa_gateway_settings set enabled = false where id;
  if private.wa_disparo_proximo() is not null then raise exception 'enviou com a trava desligada'; end if;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  begin perform public.wa_envio_enviar_agora(e1, array[v_c1], true); raise exception 'enfileirou com a trava desligada';
  exception when sqlstate '22023' then null; end;
  v_ok := v_ok + 1;

  perform set_config('role', 'postgres', true);
  perform setval('public.ops_envios_codigo_seq', v_seq, v_seq_called);
  raise exception 'R: % verificações OK', v_ok;
end $$;
