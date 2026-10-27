-- Teste da Etapa 41.2 — aprovação semanal dos envios. Roda numa transação desfeita (termina com "R: N verificações OK").
-- Monta envios para HOJE com horário relativo a agora (Brasília); precisa rodar entre 7h e 22h de Brasília.
do $$
declare
  v_admin uuid; v_c1 uuid; e1 uuid; e2 uuid; e3 uuid; v_ok integer := 0; v_s jsonb;
  v_dow int := extract(dow from now() at time zone 'America/Sao_Paulo')::int;
  v_futuro text := to_char((now() at time zone 'America/Sao_Paulo') + interval '90 minutes', 'HH24:MI');
  v_passado text := to_char((now() at time zone 'America/Sao_Paulo') - interval '10 minutes', 'HH24:MI');
  mk jsonb;
begin
  if (now() at time zone 'America/Sao_Paulo')::time not between time '07:15' and time '22:00' then
    raise exception 'Rode este teste entre 7h15 e 22h de Brasília.';
  end if;
  select id into v_admin from public.profiles where role = 'admin' and active order by created_at limit 1;
  select id into v_c1 from public.clients where excluded_at is null order by name limit 1;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  perform set_config('request.headers', '{}', true);
  mk := jsonb_build_array(jsonb_build_object('cliente_id', v_c1, 'nome_grupo', 'Grupo teste'));

  -- Envio de hoje, horário daqui a 90 min: esperando aprovação e no pop-up
  e1 := public.ops_envio_save(null, null, jsonb_build_object('nome', 'Hoje futuro', 'mensagem', 'Oi', 'dia_semana', v_dow, 'horario', v_futuro, 'clientes', mk));
  v_s := public.ops_envio_get(e1);
  if v_s ->> 'situacao_hoje' <> 'aguardando_aprovacao' or (v_s ->> 'pode_enviar_agora')::boolean then raise exception 'esperando aprovação: %', v_s; end if;
  if not exists (select 1 from jsonb_array_elements(public.ops_envio_pendentes()) x where x ->> 'id' = e1::text) then raise exception 'aparece no pop-up'; end if;
  v_ok := v_ok + 1;

  -- Sem aprovação, o agente (MCP) não consegue registrar "enviado"
  perform set_config('request.headers', '{"x-backstage-origin": "mcp"}', true);
  begin
    perform public.ops_envio_execucao_add(e1, v_c1, 'enviado', null, null);
    raise exception 'enviado sem aprovação deveria ser recusado';
  exception when sqlstate '22023' then null; end;
  perform set_config('request.headers', '{}', true);
  v_ok := v_ok + 1;

  -- Versão errada: conflito. Aprovar: sai do pop-up; ainda não pode enviar (antes do horário)
  begin
    perform public.ops_envio_decidir(e1, 99, true);
    raise exception 'versão errada deveria dar conflito';
  exception when sqlstate '40001' then null; end;
  v_s := public.ops_envio_decidir(e1, 1, true);
  if v_s ->> 'situacao_hoje' <> 'aprovado' or (v_s ->> 'pode_enviar_agora')::boolean then raise exception 'aprovado, mas antes do horário: %', v_s; end if;
  if exists (select 1 from jsonb_array_elements(public.ops_envio_pendentes()) x where x ->> 'id' = e1::text) then raise exception 'sai do pop-up'; end if;
  v_ok := v_ok + 1;

  -- Editou depois de aprovar: precisa aprovar de novo
  perform public.ops_envio_save(e1, 1, jsonb_build_object('nome', 'Hoje futuro', 'mensagem', 'Oi, mudou', 'dia_semana', v_dow, 'horario', v_futuro, 'clientes', mk));
  v_s := public.ops_envio_get(e1);
  if v_s ->> 'situacao_hoje' <> 'aguardando_aprovacao' or (v_s -> 'aprovacao' ->> 'valida')::boolean then raise exception 'edição invalida a aprovação: %', v_s; end if;
  perform public.ops_envio_decidir(e1, 2, true);
  v_ok := v_ok + 1;

  -- Chegou o horário (simulado): pode enviar; o agente registra "enviado"
  perform set_config('role', 'postgres', true);
  update public.ops_envios set horario = v_passado::time where id = e1;
  perform set_config('role', 'authenticated', true);
  v_s := public.ops_envio_get(e1);
  if not (v_s ->> 'pode_enviar_agora')::boolean then raise exception 'pode enviar no horário: %', v_s; end if;
  perform set_config('request.headers', '{"x-backstage-origin": "mcp"}', true);
  perform public.ops_envio_execucao_add(e1, v_c1, 'enviado', 'ok', null);
  perform set_config('request.headers', '{}', true);
  if not ((public.ops_envio_get(e1) -> 'clientes' -> 0 ->> 'ja_enviado_nesta_semana')::boolean) then raise exception 'já enviado'; end if;
  begin
    perform public.ops_envio_decidir(e1, 2, false);
    raise exception 'decidir depois do horário deveria ser recusado';
  exception when sqlstate '22023' then null; end;
  v_ok := v_ok + 1;

  -- Recusado: não pode enviar; sem resposta: o sistema fecha a semana
  e2 := public.ops_envio_save(null, null, jsonb_build_object('nome', 'Hoje recusado', 'mensagem', 'Oi', 'dia_semana', v_dow, 'horario', v_futuro, 'clientes', mk));
  v_s := public.ops_envio_decidir(e2, 1, false);
  if v_s ->> 'situacao_hoje' <> 'recusado' then raise exception 'recusado: %', v_s; end if;
  e3 := public.ops_envio_save(null, null, jsonb_build_object('nome', 'Hoje sem resposta', 'mensagem', 'Oi', 'dia_semana', v_dow, 'horario', v_passado, 'clientes', mk));
  if public.ops_envio_get(e3) ->> 'situacao_hoje' <> 'nao_aprovado_a_tempo' or (public.ops_envio_get(e3) ->> 'pode_enviar_agora')::boolean then
    raise exception 'sem aprovação até o horário: não sai';
  end if;
  perform set_config('role', 'postgres', true);
  perform private.envio_fechar_sem_resposta();
  perform set_config('role', 'authenticated', true);
  if (select decisao from public.ops_envio_aprovacoes where envio_id = e3) <> 'sem_resposta' then raise exception 'semana fechada sem resposta'; end if;
  if jsonb_array_length(public.ops_envio_aprovacoes(jsonb_build_object('envio_id', e3))) <> 1 then raise exception 'histórico de aprovações'; end if;
  v_ok := v_ok + 1;

  raise exception 'R: % verificações OK', v_ok;
end $$;
