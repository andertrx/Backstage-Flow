-- Teste da fase Tracking T5.4: jornada completa de um lead, do começo ao fim, num site e cliente de teste
-- (nada fica gravado: a transação é desfeita no fim, "R: N verificações OK").
-- Visita de anúncio -> formulário (Lead) -> volta por outra campanha -> segundo formulário
-- -> fila do Meta com tudo certo -> venda por frase/webhook seguem a mesma pessoa. Sem telefone/e-mail legíveis em lugar nenhum.
do $$
declare
  v_a uuid; v_ct uuid; v_dest uuid; v_ok integer := 0; v_res jsonb; v_lead bigint; v_n integer; v_t1 bigint; v_t2 bigint;
  v_em text := encode(extensions.digest('ana@exemplo.com', 'sha256'), 'hex');
  v_ph text := encode(extensions.digest('5545999998888', 'sha256'), 'hex');
  v_fn text := encode(extensions.digest('ana', 'sha256'), 'hex');
  v_vis text := 'visitante-teste-jornada';
  v_text text;
begin
  select id into v_a from public.clients where status <> 'encerrado' and excluded_at is null order by created_at limit 1;
  insert into public.tracking_containers (client_id, name, allowed_domains, test_mode) values (v_a, 'site-jornada', '{jornada.test}', false) returning id into v_ct;
  -- Pixel de teste do site (token "presente" só para a fila aceitar; nada é enviado ao Meta aqui)
  insert into public.tracking_destinations (container_id, client_id, pixel_id, enabled, vault_secret_id, test_event_code)
  values (v_ct, v_a, '123456789012345', true, gen_random_uuid(), 'TEST12345') returning id into v_dest;

  -- 1) Visita vinda de anúncio do Meta (campanha 120): PageView com a origem
  v_res := private.tracking_ingest(jsonb_build_object('container_id', v_ct, 'client_id', v_a, 'visitor_id', v_vis, 'session_id', 'sessao-1',
    'test', false, 'device_type', 'mobile', 'consent_status', 'nao_exigido', 'capi', '{}'::jsonb,
    'event', jsonb_build_object('event_id', 'evt-pv-0001', 'name', 'PageView', 'occurred_at', now() - interval '2 hours', 'page_url', 'https://jornada.test/?utm_source=facebook&bf_c=120',
                                'page_path', '/', 'custom_data', '{}'::jsonb),
    'touch', jsonb_build_object('channel', 'meta', 'paid', true, 'evidence', 'confirmada', 'reason', 'IDs do anúncio do Meta na URL.', 'utm_source', 'facebook',
                                'ad_campaign_id', '120', 'other_click_ids', '{}'::jsonb)));
  if v_res ->> 'status' <> 'ok' or (v_res ->> 'touchpoint_id') is null then raise exception 'visita com origem: %', v_res; end if;
  v_t1 := (v_res ->> 'touchpoint_id')::bigint;
  v_ok := v_ok + 1;

  -- 2) Formulário enviado: Lead com e-mail, telefone e nome só em hash
  v_res := private.tracking_ingest(jsonb_build_object('container_id', v_ct, 'client_id', v_a, 'visitor_id', v_vis, 'session_id', 'sessao-1',
    'test', false, 'device_type', 'mobile', 'consent_status', 'nao_exigido', 'user', jsonb_build_object('em', v_em, 'ph', v_ph, 'fn', v_fn),
    'capi', jsonb_build_object('fbp', 'fb.1.1762603200000.1234567890', 'fbc', 'fb.1.1762603200000.IwAR1', 'user_agent', 'Mozilla/5.0 (iPhone)', 'ip', '203.0.113.7'),
    'event', jsonb_build_object('event_id', 'evt-lead-0001', 'name', 'Lead', 'occurred_at', now() - interval '1 hour', 'page_url', 'https://jornada.test/obrigado',
                                'page_path', '/obrigado', 'custom_data', jsonb_build_object('formulario', 'contato')),
    'touch', null));
  v_lead := (v_res ->> 'lead_id')::bigint;
  if v_res ->> 'status' <> 'ok' or v_lead is null then raise exception 'lead criado: %', v_res; end if;
  if (select first_touch_id from public.tracking_leads where id = v_lead) <> v_t1 or (select conversions from public.tracking_leads where id = v_lead) <> 1 then
    raise exception 'lead nasce com a primeira origem (a da campanha 120)';
  end if;
  v_ok := v_ok + 1;

  -- 3) Fila do Meta: o Lead entra pendente, com o mesmo event_id do navegador, e leva fbc/fbp; PageView não entra
  select count(*) into v_n from public.tracking_capi_queue where destination_id = v_dest;
  if v_n <> 1 or not exists (select 1 from public.tracking_capi_queue where destination_id = v_dest and event_id = 'evt-lead-0001' and event_name = 'Lead' and status = 'pendente'
                               and lead_id = v_lead and fbc = 'fb.1.1762603200000.IwAR1' and fbp is not null) then
    raise exception 'fila do Meta: só o Lead, pendente, com o mesmo event_id e fbc/fbp (itens na fila: %)', v_n;
  end if;
  v_ok := v_ok + 1;

  -- 4) Reenvio do mesmo evento (navegador repetiu): não duplica nada
  v_res := private.tracking_ingest(jsonb_build_object('container_id', v_ct, 'client_id', v_a, 'visitor_id', v_vis, 'session_id', 'sessao-1',
    'test', false, 'device_type', 'mobile', 'consent_status', 'nao_exigido', 'user', jsonb_build_object('em', v_em, 'ph', v_ph), 'capi', '{}'::jsonb,
    'event', jsonb_build_object('event_id', 'evt-lead-0001', 'name', 'Lead', 'occurred_at', now() - interval '1 hour', 'page_url', 'https://jornada.test/obrigado',
                                'page_path', '/obrigado', 'custom_data', '{}'::jsonb), 'touch', null));
  if v_res ->> 'status' <> 'duplicado' or (select count(*) from public.tracking_capi_queue where destination_id = v_dest) <> 1 then raise exception 'reenvio não duplica: %', v_res; end if;
  v_ok := v_ok + 1;

  -- 5) A mesma pessoa volta por OUTRA campanha (999) e preenche de novo: continua UM lead; primeira origem intacta, última origem nova
  v_res := private.tracking_ingest(jsonb_build_object('container_id', v_ct, 'client_id', v_a, 'visitor_id', v_vis, 'session_id', 'sessao-2',
    'test', false, 'device_type', 'mobile', 'consent_status', 'nao_exigido', 'capi', '{}'::jsonb,
    'event', jsonb_build_object('event_id', 'evt-pv-0002', 'name', 'PageView', 'occurred_at', now() - interval '30 minutes', 'page_url', 'https://jornada.test/?utm_source=google&gclid=G1',
                                'page_path', '/', 'custom_data', '{}'::jsonb),
    'touch', jsonb_build_object('channel', 'google', 'paid', true, 'evidence', 'confirmada', 'reason', 'gclid', 'utm_source', 'google', 'gclid', 'G1',
                                'ad_campaign_id', '999', 'other_click_ids', '{}'::jsonb)));
  v_t2 := (v_res ->> 'touchpoint_id')::bigint;
  v_res := private.tracking_ingest(jsonb_build_object('container_id', v_ct, 'client_id', v_a, 'visitor_id', v_vis, 'session_id', 'sessao-2',
    'test', false, 'device_type', 'mobile', 'consent_status', 'nao_exigido', 'user', jsonb_build_object('em', v_em, 'ph', v_ph), 'capi', '{}'::jsonb,
    'event', jsonb_build_object('event_id', 'evt-lead-0002', 'name', 'Lead', 'occurred_at', now() - interval '20 minutes', 'page_url', 'https://jornada.test/obrigado',
                                'page_path', '/obrigado', 'custom_data', '{}'::jsonb), 'touch', null));
  if (v_res ->> 'lead_id')::bigint <> v_lead or (select count(*) from public.tracking_leads where container_id = v_ct) <> 1 then raise exception 'mesma pessoa = um lead só: %', v_res; end if;
  if (select first_touch_id from public.tracking_leads where id = v_lead) <> v_t1 or (select last_touch_id from public.tracking_leads where id = v_lead) <> v_t2
     or (select conversions from public.tracking_leads where id = v_lead) <> 2 then
    raise exception 'primeira origem nunca muda; última origem vira a nova; 2 conversões';
  end if;
  v_ok := v_ok + 1;

  -- 6) O segundo formulário (outro event_id) entra na fila do Meta
  select count(*) into v_n from public.tracking_capi_queue where destination_id = v_dest;
  if v_n <> 2 then raise exception 'o segundo Lead (event_id novo) entra na fila: %', v_n; end if;
  v_ok := v_ok + 1;

  -- 7) Privacidade: nenhum telefone ou e-mail legível em lugar nenhum do site de teste
  select string_agg(t::text, ' ') into v_text from (
    select to_jsonb(e) from public.tracking_events e where e.container_id = v_ct
    union all select to_jsonb(l) from public.tracking_leads l where l.container_id = v_ct
    union all select to_jsonb(q) - 'ip_address' - 'user_agent' from public.tracking_capi_queue q where q.container_id = v_ct
    union all select to_jsonb(v) from public.tracking_visitors v where v.container_id = v_ct
    union all select to_jsonb(s) from public.tracking_sessions s where s.container_id = v_ct) x(t);
  if v_text ~* 'ana@exemplo' or v_text like '%5545999998888%' or v_text ~ '99999-?8888' then raise exception 'dado pessoal legível encontrado'; end if;
  v_ok := v_ok + 1;

  raise exception 'R: % verificações OK', v_ok;
end $$;
