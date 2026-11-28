-- Teste da Fase J.5 — Modelos de campanha do Criador.
-- Transação desfeita (termina com "R: N verificações OK"). Nada fica gravado.
do $$
declare
  g uuid := '00000000-0000-0000-0000-000000355001';  -- gestor com "criar"
  o uuid := '00000000-0000-0000-0000-000000355002';  -- operador só com "editar"
  v_ok integer := 0; v_r jsonb; v_id uuid; t public.builder_templates;
begin
  insert into auth.users (id, instance_id, aud, role, email) values
    (g, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'gestor@t355.local'),
    (o, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'operador@t355.local');
  update public.profiles set active = true, role = 'gestor', full_name = 'Gestor T355' where id = g;
  update public.profiles set active = true, role = 'operador', full_name = 'Operador T355' where id = o;
  insert into public.builder_permissions (user_id, can_create, can_edit, can_publish) values (g, true, true, false), (o, false, true, false);
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', g, 'role', 'authenticated')::text, true);

  -- Cria: guarda o objetivo do conteúdo e a origem
  v_r := public.builder_template_save(null, null, ' WhatsApp atacado ', 'Engajamento para WhatsApp', 'meta', '{"campaign":{"objective":"OUTCOME_ENGAGEMENT"},"adSets":[]}');
  v_id := (v_r ->> 'id')::uuid;
  select * into t from public.builder_templates where id = v_id;
  if t.name <> 'WhatsApp atacado' or t.objective <> 'OUTCOME_ENGAGEMENT' or t.source <> 'meta' or t.version <> 1 then raise exception 'criou errado: %', row_to_json(t); end if;
  v_ok := v_ok + 1;

  -- Versão e nome repetido
  v_r := public.builder_template_save(v_id, 1, 'WhatsApp atacado', 'Nova descrição', null, '{"campaign":{"objective":"OUTCOME_LEADS"}}');
  if (v_r ->> 'version')::int <> 2 or (select objective from public.builder_templates where id = v_id) <> 'OUTCOME_LEADS' then raise exception 'editou errado'; end if;
  begin perform public.builder_template_save(v_id, 1, 'Velho', '', null, '{}'); raise exception 'versão velha deveria ser recusada';
  exception when sqlstate '40001' then null; end;
  begin perform public.builder_template_save(null, null, 'whatsapp ATACADO', '', null, '{}'); raise exception 'nome repetido deveria ser recusado';
  exception when sqlstate '22023' then null; end;
  begin perform public.builder_template_save(null, null, 'Com token', '', null, '{"x":"EAABwzLixnjYBAKZCZB1234567890abcdef"}'); raise exception 'token deveria ser recusado';
  exception when others then if sqlerrm like '%deveria%' then raise; end if; end;
  v_ok := v_ok + 1;

  -- Operador sem "criar": lê, mas não cria nem arquiva
  perform set_config('request.jwt.claims', json_build_object('sub', o, 'role', 'authenticated')::text, true);
  if (select count(*) from public.builder_templates where id = v_id) <> 1 then raise exception 'operador vê o modelo'; end if;
  begin perform public.builder_template_save(null, null, 'Do operador', '', null, '{}'); raise exception 'operador sem criar deveria ser recusado';
  exception when sqlstate '42501' then null; end;
  begin perform public.builder_template_archive(v_id, true); raise exception 'operador sem criar não arquiva';
  exception when sqlstate '42501' then null; end;
  v_ok := v_ok + 1;

  -- Arquivar e desfazer
  perform set_config('request.jwt.claims', json_build_object('sub', g, 'role', 'authenticated')::text, true);
  perform public.builder_template_archive(v_id, true);
  if (select archived_at from public.builder_templates where id = v_id) is null then raise exception 'arquivou'; end if;
  perform public.builder_template_archive(v_id, false);
  if (select archived_at from public.builder_templates where id = v_id) is not null then raise exception 'desarquivou'; end if;
  v_ok := v_ok + 1;

  -- Visitante bloqueado
  perform set_config('role', 'anon', true);
  begin perform 1 from public.builder_templates limit 1; raise exception 'visitante não lê';
  exception when sqlstate '42501' then null; end;
  v_ok := v_ok + 1;

  -- Histórico
  perform set_config('role', 'postgres', true);
  if (select count(*) from public.audit_logs where target_id = v_id::text and action like 'builder.modelo.%') <> 4 then raise exception 'histórico: criar, editar, arquivar, desarquivar'; end if;
  v_ok := v_ok + 1;

  raise exception 'R: % verificações OK', v_ok;
end $$;
