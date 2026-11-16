-- Teste da Fase 35.2 (passo 1) — Campaign Builder: permissões por pessoa e rascunhos.
-- Transação desfeita (termina com "R: N verificações OK"). Nada fica gravado.
do $$
declare
  v_admin uuid; v_client uuid; v_acc uuid; v_other_client uuid;
  g uuid := '00000000-0000-0000-0000-000000352001';  -- gestor com acesso ao cliente
  o uuid := '00000000-0000-0000-0000-000000352002';  -- operador sem acesso
  v_ok integer := 0; v_d jsonb; v_id uuid; v_j jsonb;
begin
  select id into v_admin from public.profiles where role = 'admin' and active order by created_at limit 1;
  select a.client_id, a.id into v_client, v_acc from public.ad_accounts a where a.platform_id = 'meta' and a.unlinked_at is null and a.client_id is not null limit 1;
  select id into v_other_client from public.clients where id <> v_client limit 1;

  insert into auth.users (id, instance_id, aud, role, email) values
    (g, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'gestor@t352.local'),
    (o, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'operador@t352.local');
  update public.profiles set active = true, role = 'gestor', full_name = 'Gestor T352' where id = g;
  update public.profiles set active = true, role = 'operador', full_name = 'Operador T352' where id = o;
  insert into public.user_client_access (user_id, client_id) values (g, v_client);

  -- Administrador: tudo liberado; lista de pessoas só para ele
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  v_j := public.builder_my_permissions();
  if v_j <> '{"ver": true, "criar": true, "editar": true, "publicar": true}'::jsonb then raise exception 'admin tem tudo: %', v_j; end if;
  if not exists (select 1 from jsonb_array_elements(public.builder_permissions_list()) x where x ->> 'user_id' = g::text) then raise exception 'lista mostra o gestor'; end if;
  v_ok := v_ok + 1;

  -- Regras ao dar permissão: criar/publicar exigem editar; só gestor e operador
  begin perform public.builder_permission_save(g, true, false, false); raise exception 'criar sem editar deveria ser recusado';
  exception when sqlstate '22023' then null; end;
  begin perform public.builder_permission_save(v_admin, true, true, true); raise exception 'administrador não recebe linha';
  exception when sqlstate '22023' then null; end;
  perform public.builder_permission_save(g, true, true, false);
  if not exists (select 1 from public.audit_logs where action = 'builder.permissao' and target_id = g::text) then raise exception 'permissão fica no histórico'; end if;
  v_ok := v_ok + 1;

  -- Gestor com acesso: cria, edita (versão), não publica
  perform set_config('request.jwt.claims', json_build_object('sub', g, 'role', 'authenticated')::text, true);
  v_j := public.builder_my_permissions();
  if v_j <> '{"ver": true, "criar": true, "editar": true, "publicar": false}'::jsonb then raise exception 'gestor: %', v_j; end if;
  v_d := public.builder_draft_save(null, null, v_client, v_acc, 'Rascunho T352', '{"campanha":{"nome":"X"}}');
  v_id := (v_d ->> 'id')::uuid;
  if (v_d ->> 'version')::int <> 1 then raise exception 'versão começa em 1'; end if;
  v_d := public.builder_draft_save(v_id, 1, null, null, 'Rascunho T352 v2', '{"campanha":{"nome":"Y"}}');
  if (v_d ->> 'version')::int <> 2 then raise exception 'versão sobe a cada salvar'; end if;
  begin perform public.builder_draft_save(v_id, 1, null, null, 'Velho', '{}'); raise exception 'versão velha deveria ser recusada';
  exception when sqlstate '40001' then null; end;
  v_j := public.builder_draft_get(v_id);
  if v_j -> 'data' -> 'campanha' ->> 'nome' <> 'Y' then raise exception 'get devolve os dados: %', v_j; end if;
  if jsonb_array_length(public.builder_draft_list(v_client)) <> 1 then raise exception 'lista mostra o rascunho'; end if;
  if (select count(*) from public.builder_drafts) <> 1 then raise exception 'RLS: gestor vê o rascunho do cliente dele'; end if;
  v_ok := v_ok + 1;

  -- Conta de outro cliente, cliente sem acesso e segredos: recusados
  begin perform public.builder_draft_save(null, null, v_other_client, null, 'Sem acesso', '{}'); raise exception 'cliente sem acesso deveria ser recusado';
  exception when sqlstate '42501' then null; end;
  begin perform public.builder_draft_save(null, null, v_client, '00000000-0000-0000-0000-00000000dead', 'Conta falsa', '{}'); raise exception 'conta inexistente deveria ser recusada';
  exception when sqlstate '22023' then null; end;
  begin perform public.builder_draft_save(v_id, 2, null, null, 'Com token', '{"x":"EAABwzLixnjYBAKZCZB1234567890abcdef"}'); raise exception 'token deveria ser recusado';
  exception when sqlstate '22023' then null; end;
  begin perform public.builder_permission_save(g, true, true, true); raise exception 'gestor não muda permissões';
  exception when sqlstate '42501' then null; end;
  begin perform public.builder_permissions_list(); raise exception 'gestor não vê a lista';
  exception when sqlstate '42501' then null; end;
  v_ok := v_ok + 1;

  -- Operador sem permissão e sem acesso: vê o módulo, mas não cria nem enxerga o rascunho
  perform set_config('request.jwt.claims', json_build_object('sub', o, 'role', 'authenticated')::text, true);
  v_j := public.builder_my_permissions();
  if v_j <> '{"ver": true, "criar": false, "editar": false, "publicar": false}'::jsonb then raise exception 'operador: %', v_j; end if;
  begin perform public.builder_draft_save(null, null, v_client, null, 'Operador', '{}'); raise exception 'sem permissão não cria';
  exception when sqlstate '42501' then null; end;
  begin perform public.builder_draft_archive(v_id); raise exception 'sem permissão não arquiva';
  exception when sqlstate '42501' then null; end;
  if (select count(*) from public.builder_drafts) <> 0 then raise exception 'RLS: operador sem acesso não vê'; end if;
  begin perform public.builder_draft_get(v_id); raise exception 'sem acesso ao cliente não abre';
  exception when sqlstate '22023' then null; end;
  v_ok := v_ok + 1;

  -- Arquivar não apaga; visitante e papéis sem acesso ao módulo não entram
  perform set_config('request.jwt.claims', json_build_object('sub', g, 'role', 'authenticated')::text, true);
  perform public.builder_draft_archive(v_id);
  if jsonb_array_length(public.builder_draft_list(null)) <> 0 then raise exception 'arquivado some da lista'; end if;
  if not exists (select 1 from public.builder_drafts where id = v_id and archived_at is not null) then raise exception 'arquivar não apaga'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
  begin perform public.builder_draft_list(null); raise exception 'sem perfil não lê';
  exception when sqlstate '42501' then null; end;
  perform set_config('role', 'anon', true);
  begin perform public.builder_draft_list(null); raise exception 'visitante não executa';
  exception when sqlstate '42501' then null; end;
  v_ok := v_ok + 1;

  raise exception 'R: % verificações OK', v_ok;
end $$;
