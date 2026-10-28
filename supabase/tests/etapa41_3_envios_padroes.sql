-- Teste da Etapa 41.3 — grupo e @ padrão de cada cliente, com ligar/desligar. Transação desfeita (termina com "R: N verificações OK").
do $$
declare
  v_seq bigint; v_seq_called boolean;
  v_admin uuid; v_c1 uuid; v_c2 uuid; v_e uuid; v_ok integer := 0; v_j jsonb; v_cli jsonb; v_v int;
begin
  -- 41.5: guardar a sequência dos códigos (ENV-001…), que não volta com a transação desfeita
  select last_value, is_called into v_seq, v_seq_called from public.ops_envios_codigo_seq;
  select id into v_admin from public.profiles where role = 'admin' and active order by created_at limit 1;
  -- clientes sem grupo salvo (41.4: quem tem grupo salvo usa sempre o padrão)
  select id into v_c1 from public.clients c where excluded_at is null and not exists (select 1 from public.ops_envio_padroes p where p.cliente_id = c.id) order by name limit 1;
  select id into v_c2 from public.clients c where excluded_at is null and id <> v_c1 and not exists (select 1 from public.ops_envio_padroes p where p.cliente_id = c.id) order by name limit 1;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  perform set_config('request.headers', '{}', true);

  -- Salvar o envio com um @ desligado: o envio só marca os ligados; a tela vê todos
  v_e := public.ops_envio_save(null, null, jsonb_build_object('nome', 'Teste 41.3', 'mensagem', 'Oi', 'dia_semana', 1, 'horario', '09:00',
    'clientes', jsonb_build_array(jsonb_build_object('cliente_id', v_c1, 'nome_grupo', 'Grupo T1',
      'contatos_marcar', jsonb_build_array('Ana', 'Bruno', 'Caio'), 'contatos_desligados', jsonb_build_array('Bruno', 'Zé (não está na lista)')))));
  v_cli := (public.ops_envio_get(v_e) -> 'clientes') -> 0;
  if v_cli -> 'contatos_marcar' <> '["Ana", "Caio"]'::jsonb then raise exception 'só os ligados, na ordem: %', v_cli -> 'contatos_marcar'; end if;
  if v_cli -> 'contatos' <> '[{"nome": "Ana", "ativo": true}, {"nome": "Bruno", "ativo": false}, {"nome": "Caio", "ativo": true}]'::jsonb then
    raise exception 'contatos com ligado/desligado: %', v_cli -> 'contatos';
  end if;
  v_ok := v_ok + 1;

  -- O envio virou o padrão do cliente (desligado guardado; nome fora da lista ignorado)
  select x into v_j from jsonb_array_elements(public.ops_envio_padroes()) x where x ->> 'cliente_id' = v_c1::text;
  if v_j ->> 'nome_grupo' <> 'Grupo T1' or v_j -> 'contatos' <> v_cli -> 'contatos' then raise exception 'padrão do cliente: %', v_j; end if;
  if not (v_j -> 'envios') @> jsonb_build_array(jsonb_build_object('id', v_e, 'nome', 'Teste 41.3')) then raise exception 'padrão lista o envio'; end if;
  v_ok := v_ok + 1;

  -- Salvar o padrão (religar Bruno, trocar o grupo): vale para o envio, com versão nova
  select versao into v_v from public.ops_envios where id = v_e;
  v_j := public.ops_envio_padrao_save(v_c1, jsonb_build_object('nome_grupo', 'Grupo T1 novo', 'contatos_marcar', jsonb_build_array('Ana', 'Bruno', 'Caio'),
    'contatos_desligados', jsonb_build_array('Caio')));
  if (v_j ->> 'envios_atualizados')::int < 1 then raise exception 'envio atualizado pelo padrão'; end if;
  v_cli := (public.ops_envio_get(v_e) -> 'clientes') -> 0;
  if v_cli ->> 'nome_grupo' <> 'Grupo T1 novo' or v_cli -> 'contatos_marcar' <> '["Ana", "Bruno"]'::jsonb then raise exception 'padrão levado ao envio: %', v_cli; end if;
  if (select versao from public.ops_envios where id = v_e) <> v_v + 1 then raise exception 'versão nova (pede aprovação de novo)'; end if;
  -- Salvar igual não mexe no envio
  v_j := public.ops_envio_padrao_save(v_c1, jsonb_build_object('nome_grupo', 'Grupo T1 novo', 'contatos_marcar', jsonb_build_array('Ana', 'Bruno', 'Caio'),
    'contatos_desligados', jsonb_build_array('Caio')));
  if (v_j ->> 'envios_atualizados')::int <> 0 or (select versao from public.ops_envios where id = v_e) <> v_v + 1 then raise exception 'sem mudança, sem versão nova'; end if;
  v_ok := v_ok + 1;

  -- Envio arquivado não recebe o padrão
  perform public.ops_envio_archive(v_e, true);
  select versao into v_v from public.ops_envios where id = v_e;
  perform public.ops_envio_padrao_save(v_c1, jsonb_build_object('nome_grupo', 'Grupo T1 outro', 'contatos_marcar', '[]'::jsonb));
  if (select nome_grupo from public.ops_envio_clientes where envio_id = v_e and cliente_id = v_c1) <> 'Grupo T1 novo'
     or (select versao from public.ops_envios where id = v_e) <> v_v then raise exception 'arquivado fica como estava'; end if;
  v_ok := v_ok + 1;

  -- Validações do padrão: grupo obrigatório, telefone recusado, cliente inexistente
  begin
    perform public.ops_envio_padrao_save(v_c2, jsonb_build_object('nome_grupo', ' '));
    raise exception 'grupo vazio deveria ser recusado';
  exception when sqlstate '22023' then null; end;
  begin
    perform public.ops_envio_padrao_save(v_c2, jsonb_build_object('nome_grupo', 'G', 'contatos_marcar', jsonb_build_array('11 98765-4321')));
    raise exception 'telefone deveria ser recusado';
  exception when sqlstate '22023' then null; end;
  begin
    perform public.ops_envio_padrao_save(gen_random_uuid(), jsonb_build_object('nome_grupo', 'G'));
    raise exception 'cliente inexistente deveria ser recusado';
  exception when sqlstate '22023' then null; end;
  if not exists (select 1 from public.audit_logs where action = 'ops.envio.padrao' and target_id = v_c1::text and actor_id = v_admin) then
    raise exception 'mudança do padrão registrada';
  end if;
  v_ok := v_ok + 1;

  -- Sem a permissão: não lê nem grava
  perform set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
  begin
    perform public.ops_envio_padroes();
    raise exception 'sem permissão não deveria ler';
  exception when sqlstate '42501' then null; end;
  begin
    perform public.ops_envio_padrao_save(v_c1, jsonb_build_object('nome_grupo', 'G'));
    raise exception 'sem permissão não deveria gravar';
  exception when sqlstate '42501' then null; end;
  if exists (select 1 from public.ops_envio_padroes) then raise exception 'RLS: sem permissão não vê a tabela'; end if;
  v_ok := v_ok + 1;

  perform set_config('role', 'postgres', true);
  perform setval('public.ops_envios_codigo_seq', v_seq, v_seq_called);
  raise exception 'R: % verificações OK', v_ok;
end $$;
