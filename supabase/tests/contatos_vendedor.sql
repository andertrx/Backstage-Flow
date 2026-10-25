-- Teste da fase Tracking T3.1 (contatos, papel vendedor). Roda numa transação desfeita
-- (termina com "R: N verificações OK", que desfaz tudo). O visualizador vira "vendedor" só aqui dentro.
do $$
declare
  v_admin uuid; v_vend uuid; v_a uuid; v_b uuid; v_off uuid;
  v_ct uuid; v_dest uuid; v_c1 bigint; v_c2 bigint; v_c3 bigint; v_n integer; v_ok integer := 0;
  v_lojista uuid; v_sacoleiro uuid; v_novo uuid; v_venda uuid; v_res jsonb; v_txt text;
  v_ph text := encode(extensions.digest('5545999998888', 'sha256'), 'hex');
  v_ph2 text := encode(extensions.digest('5545988887777', 'sha256'), 'hex');
begin
  select id into v_admin from public.profiles where role = 'admin' and active order by created_at limit 1;
  select id into v_vend from public.profiles where role = 'visualizador' and active order by created_at limit 1;
  select id into v_a from public.clients where status <> 'encerrado' and excluded_at is null order by created_at limit 1;
  select id into v_b from public.clients where status <> 'encerrado' and excluded_at is null and id <> v_a order by created_at limit 1;
  select id into v_off from public.clients where status = 'encerrado' and excluded_at is null limit 1;

  -- Cenário (como o banco): site do cliente A com Meta ligado, um clique de WhatsApp com código
  update public.profiles set role = 'vendedor' where id = v_vend;
  insert into public.user_client_access (user_id, client_id) values (v_vend, v_a), (v_vend, v_off) on conflict do nothing;
  insert into public.tracking_containers (client_id, name, allowed_domains, test_mode) values (v_a, 'teste-contatos', '{loja.test}', false)
    returning id into v_ct;
  insert into public.tracking_destinations (container_id, client_id, pixel_id, enabled, vault_secret_id)
  values (v_ct, v_a, '123456789', true, gen_random_uuid()) returning id into v_dest;
  -- Clique no WhatsApp com código, pelo mesmo caminho do site de verdade
  v_res := jsonb_build_object('container_id', v_ct, 'client_id', v_a, 'visitor_id', 'visitanteWA01', 'session_id', 'sessaoWA0001',
    'test', false, 'device_type', 'mobile', 'consent_status', 'nao_exigido', 'consent_version', null, 'user', null,
    'capi', jsonb_build_object('user_agent', 'x', 'ip', null, 'fbp', null, 'fbc', 'fb.1.1790000000000.IwTeste'),
    'event', jsonb_build_object('event_id', 'ev-wa-click-1', 'name', 'Contact', 'occurred_at', now(), 'page_url', 'https://loja.test/', 'page_path', '/',
      'referrer_host', null, 'custom_data', jsonb_build_object('canal', 'whatsapp', 'ref', 'K7Q2M9')), 'touch', null);
  perform private.tracking_ingest(v_res);
  perform public.tracking_whatsapp_register(v_res);
  if not exists (select 1 from public.tracking_whatsapp_clicks where code = 'K7Q2M9' and client_id = v_a) then raise exception 'clique de teste'; end if;
  select id into v_lojista from public.tracking_contact_profiles where client_id = v_a and name = 'Lojista';
  select id into v_sacoleiro from public.tracking_contact_profiles where client_id = v_a and name = 'Sacoleiro';
  select id into v_novo from public.tracking_contact_stages where client_id = v_a and name = 'Novo';
  select id into v_venda from public.tracking_contact_stages where client_id = v_a and name = 'Venda';
  if v_lojista is null or v_venda is null
     or (select meta_event from public.tracking_contact_profiles where id = v_lojista) <> 'LeadLojista'
     or (select meta_event from public.tracking_contact_stages where id = v_venda) <> 'Purchase'
     or (select count(*) from public.tracking_contact_profiles where client_id = v_a and meta_event is not null) <> 1 then
    raise exception 'perfis e etapas padrão (só Lojista e Venda vão ao Meta)';
  end if;
  v_ok := v_ok + 1;

  -- Como o vendedor
  perform set_config('request.jwt.claims', json_build_object('sub', v_vend, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);

  if (select count(*) from public.contacts_clients()) <> 1 or (select id from public.contacts_clients()) <> v_a then
    raise exception 'vendedor deveria ver só o cliente A (o desativado não)';
  end if;
  v_ok := v_ok + 1;
  if (select count(*) from public.clients) + (select count(*) from public.tracking_containers) + (select count(*) from public.campaigns)
     + (select count(*) from public.tracking_leads) + (select count(*) from public.metrics_daily) <> 0 then
    raise exception 'vendedor não pode ver nada do resto do CRM';
  end if;
  v_ok := v_ok + 1;

  v_c1 := public.contact_create(v_a, 'ref. k7q-2m9');
  if v_c1 is null or public.contact_create(v_a, 'K7Q2M9') <> v_c1
     or (select origin from public.contacts_list(v_a) where id = v_c1) <> 'whatsapp' then
    raise exception 'contato pelo código do WhatsApp (e mesmo código = mesmo contato)';
  end if;
  v_ok := v_ok + 1;

  v_c2 := public.contact_create(v_a, null, v_ph);
  if public.contact_create(v_a, null, v_ph) <> v_c2 or (select origin from public.contacts_list(v_a) where id = v_c2) <> 'manual'
     or not (select has_phone from public.contacts_list(v_a) where id = v_c2) then
    raise exception 'contato manual pelo telefone cifrado (mesmo telefone = mesmo contato)';
  end if;
  v_ok := v_ok + 1;

  begin
    perform public.contact_create(v_b, null, v_ph2);
    raise exception 'vendedor não pode criar contato de outro cliente';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.contact_create(v_a, 'XX');
    raise exception 'código inválido deveria ser recusado';
  exception when invalid_parameter_value then null;
  end;
  v_ok := v_ok + 1;

  -- Lojista → LeadLojista no Meta (uma vez só)
  v_res := public.contact_update(v_c1, null, v_lojista);
  perform set_config('role', 'postgres', true);
  select count(*) into v_n from public.tracking_capi_queue
   where destination_id = v_dest and event_name = 'LeadLojista' and action_source = 'chat' and fbc = 'fb.1.1790000000000.IwTeste';
  if v_n <> 1 then raise exception 'Lojista deveria ir ao Meta como LeadLojista pelo chat com o fbc do clique: %', v_n; end if;
  if (select lead_id from public.tracking_contacts where id = v_c1) is null then raise exception 'contato virou lead do tracking'; end if;
  perform set_config('role', 'authenticated', true);
  perform public.contact_update(v_c1, null, v_sacoleiro);
  perform public.contact_update(v_c1, null, v_lojista);
  perform set_config('role', 'postgres', true);
  select count(*) into v_n from public.tracking_capi_queue where destination_id = v_dest and event_name = 'LeadLojista';
  if v_n <> 1 then raise exception 'marcar Lojista de novo não pode mandar outra vez: %', v_n; end if;
  if exists (select 1 from public.tracking_capi_queue where destination_id = v_dest and event_name in ('Sacoleiro', 'Lead')) then
    raise exception 'Sacoleiro não vai ao Meta';
  end if;
  v_ok := v_ok + 1;
  perform set_config('role', 'authenticated', true);

  -- Venda: exige valor; registra compra; pedido repetido recusado
  begin
    perform public.contact_update(v_c1, v_venda);
    raise exception 'venda sem valor deveria ser recusada';
  exception when invalid_parameter_value then null;
  end;
  v_res := public.contact_update(v_c1, v_venda, null, 297, 'BRL', 'P1');
  perform set_config('role', 'postgres', true);
  if not exists (select 1 from public.tracking_purchases where container_id = v_ct and transaction_id = 'P1' and value_micros = 297000000 and currency = 'BRL')
     or not exists (select 1 from public.tracking_capi_queue where destination_id = v_dest and event_name = 'Purchase' and custom_data ->> 'order_id' = 'P1')
     or (select sales from public.tracking_contacts where id = v_c1) <> 1 then
    raise exception 'venda registrada como compra e enviada ao Meta: %', v_res;
  end if;
  v_ok := v_ok + 1;
  perform set_config('role', 'authenticated', true);
  perform public.contact_update(v_c1, v_novo);
  begin
    perform public.contact_update(v_c1, v_venda, null, 100, 'BRL', 'P1');
    raise exception 'pedido repetido deveria ser recusado';
  exception when unique_violation then null;
  end;
  v_ok := v_ok + 1;

  select count(*) into v_n from public.tracking_contact_history where contact_id = v_c1;
  if v_n < 6 then raise exception 'histórico de cada mudança: %', v_n; end if;
  if (select kind from public.tracking_contact_history where contact_id = v_c1 order by id limit 1) <> 'criado' then raise exception 'histórico começa no criado'; end if;
  v_ok := v_ok + 1;

  begin
    perform public.contact_archive(v_c2);
    raise exception 'vendedor não arquiva';
  exception when insufficient_privilege then null;
  end;
  -- O que a tela do vendedor lê da tabela não traz o hash do telefone
  begin
    perform ph_hash from public.tracking_contacts limit 1;
    raise exception 'hash do telefone não pode ser lido pela tela';
  exception when insufficient_privilege then null;
  end;
  v_ok := v_ok + 1;

  -- Lead que chega pelo site com a resposta "Lojista" (regra T2) já vira contato Lojista, sem mandar de novo
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'postgres', true);
  perform private.tracking_ingest(jsonb_build_object('container_id', v_ct, 'client_id', v_a, 'visitor_id', 'visitanteSite1', 'session_id', 'sessaoSite001',
    'test', false, 'device_type', 'mobile', 'consent_status', 'nao_exigido', 'consent_version', null, 'user', jsonb_build_object('ph', v_ph2),
    'capi', jsonb_build_object('user_agent', 'x', 'ip', null, 'fbp', null, 'fbc', null),
    'event', jsonb_build_object('event_id', 'ev-site-lead-1', 'name', 'Lead', 'occurred_at', now(), 'page_url', 'https://loja.test/', 'page_path', '/',
      'referrer_host', null, 'custom_data', jsonb_build_object('resposta', 'Lojista', 'bf_meta', 'LeadLojista')), 'touch', null));
  select id into v_c3 from public.tracking_contacts where client_id = v_a and ph_hash = v_ph2;
  if v_c3 is null or (select origin from public.tracking_contacts where id = v_c3) <> 'site'
     or (select profile_id from public.tracking_contacts where id = v_c3) <> v_lojista
     or not exists (select 1 from public.tracking_contacts where id = v_c3 and 'LeadLojista' = any (meta_sent)) then
    raise exception 'lead do site deveria virar contato Lojista já enviado';
  end if;
  v_ok := v_ok + 1;

  -- Trava: vendedor não vê o cliente nem pelo can_view_client
  perform set_config('request.jwt.claims', json_build_object('sub', v_vend, 'role', 'authenticated')::text, true);
  if private.can_view_client(v_a) or exists (select 1 from private.visible_client_ids()) then
    raise exception 'vendedor travado no resto do CRM';
  end if;
  v_ok := v_ok + 1;

  -- Admin vê os contatos e arquiva (não apaga)
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  perform public.contact_archive(v_c2);
  if not (select archived from public.contacts_list(v_a) where id = v_c2) then raise exception 'admin arquiva'; end if;
  v_ok := v_ok + 1;

  raise exception 'R: % verificações OK', v_ok;
end $$;
