-- Teste da Etapa 41.1 — Envios semanais. Roda numa transação desfeita (termina com "R: N verificações OK").
do $$
declare
  v_admin uuid; v_c1 uuid; v_c2 uuid; v_e uuid; v_x bigint; v_ok integer := 0; v_j jsonb; v_sem uuid := gen_random_uuid();
begin
  select id into v_admin from public.profiles where role = 'admin' and active order by created_at limit 1;
  select id into v_c1 from public.clients where excluded_at is null order by name limit 1;
  select id into v_c2 from public.clients where excluded_at is null and id <> v_c1 order by name limit 1;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  perform set_config('request.headers', '{}', true);

  -- Validações: mensagem, cliente ativo, nome do grupo, telefone em "quem marcar"
  begin
    perform public.ops_envio_save(null, null, jsonb_build_object('nome', 'Teste', 'mensagem', '  ', 'dia_semana', 1, 'horario', '09:00',
      'clientes', jsonb_build_array(jsonb_build_object('cliente_id', v_c1, 'nome_grupo', 'G'))));
    raise exception 'mensagem vazia deveria ser recusada';
  exception when sqlstate '22023' then null; end;
  begin
    perform public.ops_envio_save(null, null, jsonb_build_object('nome', 'Teste', 'mensagem', 'Oi', 'dia_semana', 1, 'horario', '09:00',
      'clientes', jsonb_build_array(jsonb_build_object('cliente_id', v_c1, 'nome_grupo', 'G', 'ativo', false))));
    raise exception 'sem cliente ativo deveria ser recusado';
  exception when sqlstate '22023' then null; end;
  begin
    perform public.ops_envio_save(null, null, jsonb_build_object('nome', 'Teste', 'mensagem', 'Oi', 'dia_semana', 1, 'horario', '09:00',
      'clientes', jsonb_build_array(jsonb_build_object('cliente_id', v_c1, 'nome_grupo', ' '))));
    raise exception 'grupo sem nome deveria ser recusado';
  exception when sqlstate '22023' then null; end;
  begin
    perform public.ops_envio_save(null, null, jsonb_build_object('nome', 'Teste', 'mensagem', 'Oi', 'dia_semana', 1, 'horario', '09:00',
      'clientes', jsonb_build_array(jsonb_build_object('cliente_id', v_c1, 'nome_grupo', 'G', 'contatos_marcar', jsonb_build_array('+55 11 91234-5678')))));
    raise exception 'telefone em quem marcar deveria ser recusado';
  exception when sqlstate '22023' then null; end;
  v_ok := v_ok + 1;

  -- Criar: mensagem com quebra de linha e emoji, ordem dos nomes mantida
  v_e := public.ops_envio_save(null, null, jsonb_build_object('nome', 'Feedback semanal', 'mensagem', E'Oi! 👋\nComo foi a semana?', 'dia_semana', 5,
    'horario', '10:30', 'clientes', jsonb_build_array(
      jsonb_build_object('cliente_id', v_c1, 'nome_grupo', 'Cliente 1 — Agência', 'contatos_marcar', jsonb_build_array('Bruno', 'Ana', ' ')),
      jsonb_build_object('cliente_id', v_c2, 'nome_grupo', 'Cliente 2 — Agência', 'ativo', false))));
  v_j := public.ops_envio_get(v_e);
  if v_j ->> 'mensagem' <> E'Oi! 👋\nComo foi a semana?' or v_j ->> 'horario' <> '10:30' then raise exception 'mensagem e horário guardados'; end if;
  if (select contatos_marcar from public.ops_envio_clientes where envio_id = v_e and cliente_id = v_c1) <> array['Bruno', 'Ana'] then
    raise exception 'ordem dos nomes mantida e vazios ignorados';
  end if;
  v_ok := v_ok + 1;

  -- Listar só ativos: grupo inativo não aparece
  v_j := public.ops_envio_list(jsonb_build_object('so_ativos', true));
  if jsonb_array_length((select x -> 'clientes' from jsonb_array_elements(v_j -> 'envios') x where x ->> 'id' = v_e::text)) <> 1 then
    raise exception 'só grupos ativos na lista de ativos';
  end if;
  v_ok := v_ok + 1;

  -- Editar com versão errada: conflito; tirar cliente: marcado, não apagado
  begin
    perform public.ops_envio_save(v_e, 99, jsonb_build_object('nome', 'Outro nome', 'mensagem', 'Oi', 'dia_semana', 1, 'horario', '09:00',
      'clientes', jsonb_build_array(jsonb_build_object('cliente_id', v_c1, 'nome_grupo', 'G'))));
    raise exception 'versão errada deveria dar conflito';
  exception when sqlstate '40001' then null; end;
  perform public.ops_envio_save(v_e, 1, jsonb_build_object('nome', 'Feedback semanal', 'mensagem', 'Oi', 'dia_semana', 5, 'horario', '10:30',
    'clientes', jsonb_build_array(jsonb_build_object('cliente_id', v_c1, 'nome_grupo', 'Cliente 1 — Agência'))));
  if (select removido_em is null from public.ops_envio_clientes where envio_id = v_e and cliente_id = v_c2) then raise exception 'cliente tirado fica marcado'; end if;
  if jsonb_array_length(public.ops_envio_get(v_e) -> 'clientes') <> 1 then raise exception 'cliente tirado some da tela'; end if;
  v_ok := v_ok + 1;

  -- Execuções: cliente fora do envio recusado; status inválido recusado; "via MCP" marcado; já enviado na semana
  begin
    perform public.ops_envio_execucao_add(v_e, v_c2, 'enviado', null, null);
    raise exception 'cliente fora do envio deveria ser recusado';
  exception when sqlstate '22023' then null; end;
  begin
    perform public.ops_envio_execucao_add(v_e, v_c1, 'ok', null, null);
    raise exception 'status inválido deveria ser recusado';
  exception when sqlstate '22023' then null; end;
  perform set_config('request.headers', '{"x-backstage-origin": "mcp"}', true);
  v_x := public.ops_envio_execucao_add(v_e, v_c1, 'enviado', 'Enviado e marcado', null);
  if (select origem from public.ops_envio_execucoes where id = v_x) <> 'mcp' then raise exception 'execução via MCP marcada'; end if;
  if not ((public.ops_envio_get(v_e) -> 'clientes' -> 0 ->> 'ja_enviado_nesta_semana')::boolean) then raise exception 'já enviado nesta semana'; end if;
  if jsonb_array_length(public.ops_envio_historico(jsonb_build_object('envio_id', v_e))) <> 1 then raise exception 'histórico'; end if;
  perform set_config('request.headers', '{}', true);
  v_ok := v_ok + 1;

  -- Arquivar: some da lista, não recebe execução, auditoria registrada
  perform public.ops_envio_archive(v_e, true);
  if exists (select 1 from jsonb_array_elements(public.ops_envio_list('{}') -> 'envios') x where x ->> 'id' = v_e::text) then raise exception 'arquivado some'; end if;
  begin
    perform public.ops_envio_execucao_add(v_e, v_c1, 'enviado', null, null);
    raise exception 'arquivado não recebe execução';
  exception when sqlstate '22023' then null; end;
  if (select count(*) from public.audit_logs where target_type = 'ops_envio' and target_id = v_e::text) < 3 then raise exception 'auditoria'; end if;
  v_ok := v_ok + 1;

  -- Sem a permissão: nada (pessoa sem papel no CRM)
  perform set_config('request.jwt.claims', json_build_object('sub', v_sem, 'role', 'authenticated')::text, true);
  begin
    perform public.ops_envio_list('{}');
    raise exception 'sem permissão deveria ser recusado';
  exception when insufficient_privilege then null; end;
  if (select count(*) from public.ops_envios) <> 0 then raise exception 'RLS: sem permissão não vê'; end if;
  v_ok := v_ok + 1;

  raise exception 'R: % verificações OK', v_ok;
end $$;
