-- Teste da T5.21 — só envio automático + aprovação fora do prazo. Transação desfeita: termina com "R: N verificações OK".
-- Monta dois envios para HOJE (um automático, um comum) e recua o horário para o passado. Rode entre 6h e 23h20 de Brasília.
do $$
declare
  v_seq bigint; v_seq_called boolean;
  v_admin uuid; v_sem uuid; v_c1 uuid; v_c2 uuid; e1 uuid; e2 uuid; v_ok int := 0; v_n int; v_r jsonb; v_p jsonb;
  v_dow int := extract(dow from now() at time zone 'America/Sao_Paulo')::int;
  v_min int := extract(hour from now() at time zone 'America/Sao_Paulo')::int * 60 + extract(minute from now() at time zone 'America/Sao_Paulo')::int;
  v_hor text := to_char((now() at time zone 'America/Sao_Paulo') + interval '25 minutes', 'HH24:MI');
  mk jsonb;
begin
  select last_value, is_called into v_seq, v_seq_called from public.ops_envios_codigo_seq;
  if not (v_min between 360 and 1400) then raise exception 'Rode este teste entre 6h e 23h20 de Brasília.'; end if;
  select id into v_admin from public.profiles where role = 'admin' and active order by created_at limit 1;
  select p.id into v_sem from public.profiles p where p.active and p.role not in ('admin', 'cliente')
     and not exists (select 1 from public.ops_member_permissions x where x.user_id = p.id and x.permission = 'ops.envios') limit 1;
  select id into v_c1 from public.clients where excluded_at is null and private.client_is_active(id) order by name limit 1;
  select id into v_c2 from public.clients c where c.excluded_at is null and private.client_is_active(c.id) and c.id <> v_c1
     and not exists (select 1 from public.wa_grupos g where g.cliente_id = c.id and g.desvinculado_em is null) order by c.name limit 1;
  if v_c2 is null then raise exception 'Preciso de um cliente ativo sem grupo ligado para este teste.'; end if;
  update public.wa_gateway_settings set enabled = true, connection_state = 'conectado' where id;
  -- isola o teste de envios reais em andamento (tudo é desfeito no fim): sem mensagem recente (ritmo de 45 s) e sem fila de outros envios
  update public.wa_disparos set atualizado_em = now() - interval '10 minutes', enviado_em = case when enviado_em is not null then now() - interval '10 minutes' end where status in ('enviando', 'enviado');
  update public.wa_disparos set status = 'falhou' where status = 'pendente';
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  perform set_config('request.headers', '{}', true);
  mk := jsonb_build_array(jsonb_build_object('cliente_id', v_c1, 'nome_grupo', 'G1'), jsonb_build_object('cliente_id', v_c2, 'nome_grupo', 'G2'));
  e1 := public.ops_envio_save(null, null, jsonb_build_object('nome', 'Auto teste', 'mensagem', 'Oi', 'dia_semana', v_dow, 'horario', v_hor, 'clientes', mk));
  e2 := public.ops_envio_save(null, null, jsonb_build_object('nome', 'Comum teste', 'mensagem', 'Oi', 'dia_semana', v_dow, 'horario', v_hor, 'clientes', mk));
  perform public.wa_grupo_vincular(v_c1, '120363000000000091@g.us', 'Grupo 1');
  perform public.wa_envio_set_automatico(e1, true);
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);

  -- 1) antes do horário, dentro da janela: aguardando aprovação (automático e comum)
  if private.envio_situacao(e1) ->> 'situacao_hoje' <> 'aguardando_aprovacao' then raise exception 'automático antes do horário: %', private.envio_situacao(e1); end if;
  v_ok := v_ok + 1;

  -- 2) o horário passa sem aprovação: o automático continua aprovável (aprovacao_tardia); o comum fecha como antes
  update public.ops_envios set horario = (now() at time zone 'America/Sao_Paulo' - interval '10 minutes')::time where id in (e1, e2);
  v_r := private.envio_situacao(e1);
  if v_r ->> 'situacao_hoje' <> 'nao_aprovado_a_tempo' or not (v_r ->> 'aprovacao_tardia')::boolean then raise exception 'automático depois do horário: %', v_r; end if;
  v_r := private.envio_situacao(e2);
  if v_r ->> 'situacao_hoje' <> 'nao_aprovado_a_tempo' or (v_r ->> 'aprovacao_tardia')::boolean then raise exception 'comum depois do horário: %', v_r; end if;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  v_r := public.ops_envio_pendentes();
  if not exists (select 1 from jsonb_array_elements(v_r) x where x ->> 'id' = e1::text) then raise exception 'o automático atrasado não está no pop-up: %', v_r; end if;
  if exists (select 1 from jsonb_array_elements(v_r) x where x ->> 'id' = e2::text) then raise exception 'o comum atrasado apareceu no pop-up'; end if;
  v_ok := v_ok + 1;

  -- 3) permissões e regra antiga: sem permissão não decide; o comum depois do horário continua recusando
  perform set_config('request.jwt.claims', json_build_object('sub', v_sem, 'role', 'authenticated')::text, true);
  begin perform public.ops_envio_decidir(e1, 1, true); raise exception 'sem permissão aprovou';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  begin perform public.ops_envio_decidir(e2, 1, true); raise exception 'o comum foi aprovado depois do horário';
  exception when sqlstate '22023' then null; end;
  v_ok := v_ok + 1;

  -- 4) aprovando o automático fora do prazo: vale, e já entra na fila (cliente com grupo pendente; sem grupo, pulado uma vez)
  v_r := public.ops_envio_decidir(e1, 1, true);
  if v_r ->> 'situacao_hoje' <> 'aprovado' then raise exception 'aprovação tardia não valeu: %', v_r; end if;
  select count(*) into v_n from public.wa_disparos where envio_id = e1 and cliente_id = v_c1 and status = 'pendente' and origem = 'automatico';
  if v_n <> 1 then raise exception 'cliente com grupo não entrou na fila (%)', v_n; end if;
  select count(*) into v_n from public.wa_disparos where envio_id = e1 and cliente_id = v_c2 and status = 'pulado' and detalhe like 'Cliente sem grupo%';
  if v_n <> 1 then raise exception 'cliente sem grupo não foi pulado uma vez (%)', v_n; end if;
  if not exists (select 1 from public.audit_logs where action = 'ops.envio.approve' and target_id = e1::text and (details ->> 'fora_do_prazo')::boolean) then raise exception 'auditoria não marcou fora do prazo'; end if;
  v_ok := v_ok + 1;

  -- 5) rodar de novo não duplica nada
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
  perform private.wa_envios_enfileirar();
  select count(*) into v_n from public.wa_disparos where envio_id = e1;
  if v_n <> 2 then raise exception 'duplicou (%)', v_n; end if;
  v_ok := v_ok + 1;

  -- 6) ligou o grupo do cliente que tinha sido pulado: ele entra na fila (e o "pulado" antigo não se repete)
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  perform public.wa_grupo_vincular(v_c2, '120363000000000092@g.us', 'Grupo 2');
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
  perform private.wa_envios_enfileirar();
  perform private.wa_envios_enfileirar();
  select count(*) into v_n from public.wa_disparos where envio_id = e1 and cliente_id = v_c2 and status = 'pendente';
  if v_n <> 1 then raise exception 'cliente que ganhou grupo não entrou na fila (%)', v_n; end if;
  select count(*) into v_n from public.wa_disparos where envio_id = e1 and cliente_id = v_c2 and status = 'pulado';
  if v_n <> 1 then raise exception 'o pulado antigo sumiu ou duplicou (%)', v_n; end if;
  v_ok := v_ok + 1;

  -- 7) o servidor pega o próximo, só uma vez, com o texto do envio
  v_p := private.wa_disparo_proximo();
  if v_p is null or v_p ->> 'mensagem' <> 'Oi' then raise exception 'próximo errado: %', v_p; end if;
  if private.wa_disparo_proximo() is not null then raise exception 'entregou duas vezes'; end if;
  v_ok := v_ok + 1;

  -- 8) a janela de 3 horas conta da aprovação: aprovação de 4 h atrás (horário 5 h atrás) = passou do prazo, nada sai
  update public.ops_envio_aprovacoes set decidido_em = now() - interval '4 hours' where envio_id = e1;
  update public.ops_envios set horario = (now() at time zone 'America/Sao_Paulo' - interval '5 hours')::time where id = e1;
  update public.wa_disparos set status = 'pendente', atualizado_em = now() - interval '2 minutes' where envio_id = e1 and status in ('pendente', 'enviando');
  if private.wa_disparo_proximo() is not null then raise exception 'enviou fora da janela'; end if;
  select count(*) into v_n from public.wa_disparos where envio_id = e1 and status = 'pulado' and detalhe like 'Passou do prazo%';
  if v_n <> 2 then raise exception 'esperava 2 fechados por prazo (%)', v_n; end if;
  v_ok := v_ok + 1;

  -- 9) o envio manual saiu do banco
  if to_regprocedure('public.wa_envio_enviar_agora(uuid,uuid[],boolean)') is not null or to_regprocedure('private.wa_envio_enviar_agora_impl(uuid,uuid[],boolean)') is not null then
    raise exception 'a função do envio manual ainda existe';
  end if;
  v_ok := v_ok + 1;

  perform setval('public.ops_envios_codigo_seq', v_seq, v_seq_called);
  raise exception 'R: % verificações OK (desfeito)', v_ok;
end $$;
