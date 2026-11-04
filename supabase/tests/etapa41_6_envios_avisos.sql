-- Teste do aviso para aprovar o envio semanal (04/11/2026). Transação desfeita: termina com "R: N verificações OK".
-- Monta envios para HOJE com horário daqui a 25 minutos (Brasília). Rode entre 0h e 5h30 ou entre 7h e 23h30 de Brasília.
do $$
declare
  v_seq bigint; v_seq_called boolean;
  v_admin uuid; v_c1 uuid; e1 uuid; e2 uuid; v_ok integer := 0; v_n integer; v_row record;
  v_dow int := extract(dow from now() at time zone 'America/Sao_Paulo')::int;
  v_min int := extract(hour from now() at time zone 'America/Sao_Paulo')::int * 60 + extract(minute from now() at time zone 'America/Sao_Paulo')::int;
  v_hor text := to_char((now() at time zone 'America/Sao_Paulo') + interval '25 minutes', 'HH24:MI');
  mk jsonb;
begin
  select last_value, is_called into v_seq, v_seq_called from public.ops_envios_codigo_seq;
  if not (v_min <= 330 or (v_min between 420 and 1410)) then raise exception 'Rode este teste entre 0h e 5h30 ou entre 7h e 23h30 de Brasília.'; end if;
  select id into v_admin from public.profiles where role = 'admin' and active order by created_at limit 1;
  select id into v_c1 from public.clients where excluded_at is null order by name limit 1;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  perform set_config('request.headers', '{}', true);
  mk := jsonb_build_array(jsonb_build_object('cliente_id', v_c1, 'nome_grupo', 'Grupo teste'));
  e1 := public.ops_envio_save(null, null, jsonb_build_object('nome', 'Aviso teste', 'mensagem', 'Oi', 'dia_semana', v_dow, 'horario', v_hor, 'clientes', mk));
  if public.ops_envio_get(e1) ->> 'situacao_hoje' <> 'aguardando_aprovacao' then raise exception 'envio de teste deveria esperar aprovação'; end if;

  -- 1) o agendador gera o aviso (momento mais recente vencido: 25 min antes = "meio") para o administrador
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
  v_n := private.envio_avisar();
  if v_n < 1 then raise exception 'nenhum aviso gerado'; end if;
  select * into v_row from public.ops_envio_avisos where envio_id = e1 and user_id = v_admin;
  if v_row.momento <> 'meio' or v_row.push_status <> 'pendente' or v_row.email_status <> 'pendente' then raise exception 'aviso: %', v_row; end if;
  v_ok := v_ok + 1;

  -- 2) aparece no sino, com o link da tela de envios
  if not exists (select 1 from public.ops_notifications where user_id = v_admin and kind = 'envio.aprovar' and link = '/operacoes/envios'
                  and dedupe_key like 'envio-aprovar:' || e1 || ':%') then raise exception 'sem notificação no sino'; end if;
  v_ok := v_ok + 1;

  -- 3) rodar de novo não repete o aviso
  if private.envio_avisar() <> 0 then raise exception 'repetiu o aviso'; end if;
  if (select count(*) from public.ops_envio_avisos where envio_id = e1 and user_id = v_admin) <> 1 then raise exception 'aviso duplicado'; end if;
  v_ok := v_ok + 1;

  -- 4) fila do servidor leva o aviso (aparelho e e-mail pendentes); o resultado é anotado
  if not exists (select 1 from jsonb_array_elements(private.ops_envio_aviso_fila()) x where (x ->> 'id')::bigint = v_row.id and (x ->> 'push_pendente')::boolean and (x ->> 'email_pendente')::boolean)
    then raise exception 'fila sem o aviso'; end if;
  perform private.ops_envio_aviso_mark(v_row.id, 'push', 'sem_aparelho', null);
  perform private.ops_envio_aviso_mark(v_row.id, 'email', 'enviado', null);
  if not exists (select 1 from public.ops_envio_avisos where id = v_row.id and push_status = 'sem_aparelho' and email_status = 'enviado') then raise exception 'resultado não anotado'; end if;
  if exists (select 1 from jsonb_array_elements(private.ops_envio_aviso_fila()) x where (x ->> 'id')::bigint = v_row.id) then raise exception 'aviso resolvido continua na fila'; end if;
  begin
    perform private.ops_envio_aviso_mark(v_row.id, 'push', 'qualquer', null);
    raise exception 'resultado inválido deveria ser recusado';
  exception when sqlstate '22023' then null; end;
  v_ok := v_ok + 1;

  -- 5) depois de aprovado, não avisa mais (novo momento não cria aviso para o envio aprovado)
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  perform public.ops_envio_decidir(e1, 1, true);
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
  delete from public.ops_envio_avisos where envio_id = e1;
  if private.envio_avisar() <> 0 then raise exception 'avisou envio já aprovado'; end if;
  v_ok := v_ok + 1;

  -- 6) quem desligou o tipo "envio.aprovar" não recebe aviso
  insert into public.ops_notification_prefs (user_id, muted) values (v_admin, array['envio.aprovar'])
    on conflict (user_id) do update set muted = array['envio.aprovar'];
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  e2 := public.ops_envio_save(null, null, jsonb_build_object('nome', 'Aviso teste 2', 'mensagem', 'Oi', 'dia_semana', v_dow, 'horario', v_hor, 'clientes', mk));
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
  perform private.envio_avisar();
  if exists (select 1 from public.ops_envio_avisos where envio_id = e2 and user_id = v_admin) then raise exception 'avisou quem desligou'; end if;
  v_ok := v_ok + 1;

  -- A sequência dos códigos não volta com a transação desfeita: devolve o próximo número ao que era
  perform setval('public.ops_envios_codigo_seq', v_seq, v_seq_called);

  raise exception 'R: % verificações OK', v_ok;
end $$;
