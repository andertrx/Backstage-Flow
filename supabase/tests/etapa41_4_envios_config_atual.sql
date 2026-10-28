-- Teste da Etapa 41.4 — o envio usa sempre a configuração atual de "Grupos e @". Transação desfeita (termina com "R: N verificações OK").
do $$
declare
  v_seq bigint; v_seq_called boolean;
  v_admin uuid; v_c1 uuid; v_c2 uuid; v_e uuid; v_ok integer := 0; v_cli jsonb; v_j jsonb;
begin
  -- 41.5: guardar a sequência dos códigos (ENV-001…), que não volta com a transação desfeita
  select last_value, is_called into v_seq, v_seq_called from public.ops_envios_codigo_seq;
  select id into v_admin from public.profiles where role = 'admin' and active order by created_at limit 1;
  select id into v_c1 from public.clients c where excluded_at is null and not exists (select 1 from public.ops_envio_padroes p where p.cliente_id = c.id) order by name limit 1;
  select id into v_c2 from public.clients c where excluded_at is null and id <> v_c1 and not exists (select 1 from public.ops_envio_padroes p where p.cliente_id = c.id) order by name limit 1;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  perform set_config('request.headers', '{}', true);

  -- c1 tem grupo salvo; no envio só vai "ligado" (o que vier de grupo/@ é ignorado)
  perform public.ops_envio_padrao_save(v_c1, jsonb_build_object('nome_grupo', 'Grupo padrão', 'contatos_marcar', jsonb_build_array('Ana', 'Bruno'),
    'contatos_desligados', jsonb_build_array('Bruno')));
  v_e := public.ops_envio_save(null, null, jsonb_build_object('nome', 'Teste 41.4', 'mensagem', 'Oi', 'dia_semana', 1, 'horario', '09:00',
    'clientes', jsonb_build_array(jsonb_build_object('cliente_id', v_c1, 'ativo', true),
                                  jsonb_build_object('cliente_id', v_c2, 'nome_grupo', 'Grupo antigo', 'contatos_marcar', jsonb_build_array('Caio'), 'ativo', false))));
  select x into v_cli from jsonb_array_elements(public.ops_envio_get(v_e) -> 'clientes') x where x ->> 'cliente_id' = v_c1::text;
  if v_cli ->> 'nome_grupo' <> 'Grupo padrão' or v_cli -> 'contatos_marcar' <> '["Ana"]'::jsonb or not (v_cli ->> 'tem_padrao')::boolean then
    raise exception 'usa o grupo salvo: %', v_cli;
  end if;
  -- c2 sem grupo salvo: usa o que veio e vira o padrão dele
  select x into v_cli from jsonb_array_elements(public.ops_envio_get(v_e) -> 'clientes') x where x ->> 'cliente_id' = v_c2::text;
  if v_cli ->> 'nome_grupo' <> 'Grupo antigo' or (v_cli ->> 'ativo')::boolean then raise exception 'cliente sem grupo salvo: %', v_cli; end if;
  if not exists (select 1 from public.ops_envio_padroes where cliente_id = v_c2 and nome_grupo = 'Grupo antigo') then raise exception 'vira o padrão'; end if;
  v_ok := v_ok + 1;

  -- Mudar o grupo salvo: o envio já mostra a configuração nova (inclusive arquivado, ao ler)
  perform public.ops_envio_archive(v_e, true);
  perform public.ops_envio_padrao_save(v_c1, jsonb_build_object('nome_grupo', 'Grupo padrão 2', 'contatos_marcar', jsonb_build_array('Ana', 'Bruno')));
  select x into v_cli from jsonb_array_elements(public.ops_envio_get(v_e) -> 'clientes') x where x ->> 'cliente_id' = v_c1::text;
  if v_cli ->> 'nome_grupo' <> 'Grupo padrão 2' or v_cli -> 'contatos_marcar' <> '["Ana", "Bruno"]'::jsonb then raise exception 'sempre a última configuração: %', v_cli; end if;
  perform public.ops_envio_archive(v_e, false);
  v_ok := v_ok + 1;

  -- Desligar o cliente no envio: fica guardado (ativo = false), não some
  perform public.ops_envio_save(v_e, (select versao from public.ops_envios where id = v_e), jsonb_build_object('nome', 'Teste 41.4', 'mensagem', 'Oi',
    'dia_semana', 1, 'horario', '09:00', 'clientes', jsonb_build_array(jsonb_build_object('cliente_id', v_c1, 'ativo', false),
      jsonb_build_object('cliente_id', v_c2, 'ativo', true))));
  if (select ativo from public.ops_envio_clientes where envio_id = v_e and cliente_id = v_c1) or
     (select removido_em from public.ops_envio_clientes where envio_id = v_e and cliente_id = v_c1) is not null then raise exception 'desligado fica guardado'; end if;
  if (select nome_grupo from public.ops_envio_clientes where envio_id = v_e and cliente_id = v_c2) <> 'Grupo antigo' then raise exception 'c2 usa o padrão dele'; end if;
  v_ok := v_ok + 1;

  perform set_config('role', 'postgres', true);
  perform setval('public.ops_envios_codigo_seq', v_seq, v_seq_called);
  raise exception 'R: % verificações OK', v_ok;
end $$;
