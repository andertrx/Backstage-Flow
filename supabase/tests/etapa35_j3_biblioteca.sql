-- Teste da Fase J.3 — Biblioteca de textos do Criador (pacotes por cliente).
-- Transação desfeita (termina com "R: N verificações OK"). Nada fica gravado.
do $$
declare
  v_admin uuid; v_client uuid; v_other_client uuid;
  g uuid := '00000000-0000-0000-0000-000000353001';  -- gestor com acesso e permissão de editar
  o uuid := '00000000-0000-0000-0000-000000353002';  -- operador sem permissão de editar
  v_ok integer := 0; v_r jsonb; v_id uuid; s public.builder_copy_sets;
begin
  select id into v_admin from public.profiles where role = 'admin' and active order by created_at limit 1;
  select a.client_id into v_client from public.ad_accounts a where a.platform_id = 'meta' and a.unlinked_at is null and a.client_id is not null limit 1;
  select id into v_other_client from public.clients where id <> v_client limit 1;

  insert into auth.users (id, instance_id, aud, role, email) values
    (g, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'gestor@t353.local'),
    (o, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'operador@t353.local');
  update public.profiles set active = true, role = 'gestor', full_name = 'Gestor T353' where id = g;
  update public.profiles set active = true, role = 'operador', full_name = 'Operador T353' where id = o;
  insert into public.user_client_access (user_id, client_id) values (g, v_client), (o, v_client);
  insert into public.builder_permissions (user_id, can_create, can_edit, can_publish) values (g, false, true, false);

  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', g, 'role', 'authenticated')::text, true);

  -- Cria: tira os vazios, guarda textos, títulos, link, botão, UTM e mensagens
  v_r := public.builder_copy_set_save(null, null, v_client, ' Black — WhatsApp ', jsonb_build_object(
    'bodies', jsonb_build_array('Texto 1', '', 'Texto 2', 'Texto 3'), 'titles', jsonb_build_array('Título 1', 'Título 2'),
    'description', 'Desc', 'link', 'https://api.whatsapp.com/send', 'cta', 'WHATSAPP_MESSAGE', 'url_tags', 'utm_source=meta',
    'messages', jsonb_build_array('Olá! Quero saber do atacado.', 'Oi, vi o anúncio da Black.')));
  v_id := (v_r ->> 'id')::uuid;
  select * into s from public.builder_copy_sets where id = v_id;
  if s.name <> 'Black — WhatsApp' or s.bodies <> array['Texto 1','Texto 2','Texto 3'] or cardinality(s.messages) <> 2 or s.version <> 1 then raise exception 'criou errado: %', row_to_json(s); end if;
  v_ok := v_ok + 1;

  -- Edita com versão; versão velha é recusada; nome repetido no mesmo cliente é recusado
  v_r := public.builder_copy_set_save(v_id, 1, null, 'Black — WhatsApp', '{"bodies":["Novo texto"]}');
  if (v_r ->> 'version')::int <> 2 then raise exception 'versão sobe'; end if;
  begin perform public.builder_copy_set_save(v_id, 1, null, 'Velho', '{}'); raise exception 'versão velha deveria ser recusada';
  exception when sqlstate '40001' then null; end;
  begin perform public.builder_copy_set_save(null, null, v_client, 'black — whatsapp', '{}'); raise exception 'nome repetido deveria ser recusado';
  exception when sqlstate '22023' then null; end;
  v_ok := v_ok + 1;

  -- Limites e segredos
  begin perform public.builder_copy_set_save(null, null, v_client, 'Seis textos', '{"bodies":["a","b","c","d","e","f"]}'); raise exception '6 textos deveriam ser recusados';
  exception when sqlstate '22023' then null; end;
  begin perform public.builder_copy_set_save(null, null, v_client, 'Link http', '{"link":"http://x.com"}'); raise exception 'link sem https deveria ser recusado';
  exception when sqlstate '22023' then null; end;
  begin perform public.builder_copy_set_save(null, null, v_client, 'Com token', '{"bodies":["EAABwzLixnjYBAKZCZB1234567890abcdef"]}'); raise exception 'token deveria ser recusado';
  exception when others then if sqlerrm like '%deveria%' then raise; end if; end;
  v_ok := v_ok + 1;

  -- Cliente sem acesso: recusado; operador sem "editar": recusado, mas enxerga
  begin perform public.builder_copy_set_save(null, null, v_other_client, 'Sem acesso', '{}'); raise exception 'cliente sem acesso deveria ser recusado';
  exception when sqlstate '42501' then null; end;
  perform set_config('request.jwt.claims', json_build_object('sub', o, 'role', 'authenticated')::text, true);
  if (select count(*) from public.builder_copy_sets where id = v_id) <> 1 then raise exception 'operador do cliente vê o pacote'; end if;
  begin perform public.builder_copy_set_save(v_id, 2, null, 'Tentativa', '{}'); raise exception 'operador sem editar deveria ser recusado';
  exception when sqlstate '42501' then null; end;
  v_ok := v_ok + 1;

  -- Arquivar e desfazer (nunca apaga)
  perform set_config('request.jwt.claims', json_build_object('sub', g, 'role', 'authenticated')::text, true);
  perform public.builder_copy_set_archive(v_id, true);
  if (select archived_at from public.builder_copy_sets where id = v_id) is null then raise exception 'arquivou'; end if;
  perform public.builder_copy_set_archive(v_id, false);
  if (select archived_at from public.builder_copy_sets where id = v_id) is not null then raise exception 'desarquivou'; end if;
  v_ok := v_ok + 1;

  -- Visitante não lê nem escreve
  perform set_config('role', 'anon', true);
  begin perform 1 from public.builder_copy_sets limit 1; raise exception 'visitante não lê';
  exception when sqlstate '42501' then null; end;
  begin perform public.builder_copy_set_save(null, null, v_client, 'Anon', '{}'); raise exception 'visitante não executa';
  exception when sqlstate '42501' then null; end;
  v_ok := v_ok + 1;

  -- Histórico (lido com o papel do sistema: o gestor não lê audit_logs)
  perform set_config('role', 'postgres', true);
  if not exists (select 1 from public.audit_logs where action = 'builder.pacote.criar' and target_id = v_id::text) then raise exception 'criação fica no histórico'; end if;
  if (select count(*) from public.audit_logs where target_id = v_id::text and action like 'builder.pacote.%arquivar') <> 2 then raise exception 'arquivar fica no histórico'; end if;
  v_ok := v_ok + 1;

  raise exception 'R: % verificações OK', v_ok;
end $$;
