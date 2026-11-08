-- Teste da fase Tracking T5.2b (lead por webhook de formulário de outro sistema). Roda numa transação desfeita
-- (termina com "R: N verificações OK", que desfaz tudo).
do $$
declare
  v_admin uuid; v_visu uuid; v_a uuid; v_b uuid; v_ct uuid; v_ct_b uuid; v_wh jsonb; v_id uuid; v_key text; v_n integer; v_ok integer := 0;
  v_auth jsonb; v_res jsonb;
  v_ph text := encode(extensions.digest('5545999998888', 'sha256'), 'hex');
  v_em text := encode(extensions.digest('ana@x.com', 'sha256'), 'hex');
begin
  select id into v_admin from public.profiles where role = 'admin' and active order by created_at limit 1;
  select id into v_visu from public.profiles where role = 'visualizador' and active order by created_at limit 1;
  select id into v_a from public.clients where status <> 'encerrado' and excluded_at is null order by created_at limit 1;
  select id into v_b from public.clients where status <> 'encerrado' and excluded_at is null and id <> v_a order by created_at limit 1;
  insert into public.tracking_containers (client_id, name, allowed_domains, test_mode) values (v_a, 'teste-lead', '{loja.test}', false) returning id into v_ct;
  insert into public.tracking_containers (client_id, name, allowed_domains, test_mode) values (v_b, 'teste-lead-b', '{outra.test}', false) returning id into v_ct_b;

  -- Admin cria o endereço de lead (chave uma vez, modo teste, finalidade lead, ligado ao site)
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  v_wh := public.lead_webhook_create(v_a, 'Responde App', v_ct);
  v_id := (v_wh ->> 'id')::uuid; v_key := v_wh ->> 'key';
  if v_key !~ '^[0-9a-f]{48}$' or (select purpose from public.tracking_sales_webhooks where id = v_id) <> 'lead'
     or (select container_id from public.tracking_sales_webhooks where id = v_id) <> v_ct
     or (select test_mode from public.tracking_sales_webhooks where id = v_id) is not true then
    raise exception 'endereço de lead novo: chave, finalidade, site e modo teste';
  end if;
  begin
    perform key_hash from public.tracking_sales_webhooks;
    raise exception 'a tela não pode ler o hash da chave';
  exception when insufficient_privilege then null;
  end;
  v_ok := v_ok + 1;

  -- Site de outro cliente não vale; visualizador não cria
  begin
    perform public.lead_webhook_create(v_a, 'X', v_ct_b);
    raise exception 'site de outro cliente não pode';
  exception when sqlstate '22023' then null;
  end;
  perform set_config('request.jwt.claims', json_build_object('sub', v_visu, 'role', 'authenticated')::text, true);
  begin
    perform public.lead_webhook_create(v_a, 'X', v_ct);
    raise exception 'visualizador não cria';
  exception when insufficient_privilege then null;
  end;
  v_ok := v_ok + 1;

  -- Servidor: a conferência da chave diz a finalidade e o site; endereço de venda continua sem site
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'postgres', true);
  v_auth := private.sales_webhook_auth(v_id, v_key);
  if v_auth ->> 'purpose' <> 'lead' or (v_auth #>> '{container,id}')::uuid <> v_ct or v_auth #>> '{container,allowed_domains,0}' <> 'loja.test'
     or private.sales_webhook_auth(v_id, 'errada') is not null then
    raise exception 'conferência da chave com finalidade e site: %', v_auth;
  end if;
  v_ok := v_ok + 1;

  -- Registro do aviso (modo teste): guarda só os nomes dos campos e o resultado
  perform private.lead_webhook_log(jsonb_build_object('webhook_id', v_id, 'keys', '["tel","utm_source"]'::jsonb, 'result', 'teste', 'reason', 'Modo teste'));
  if (select last_result from public.tracking_sales_webhooks where id = v_id) <> 'teste'
     or (select last_keys from public.tracking_sales_webhooks where id = v_id) <> array['tel', 'utm_source']
     or (select count(*) from public.tracking_sales_webhook_log where webhook_id = v_id) <> 1 then
    raise exception 'registro do aviso de teste';
  end if;
  v_ok := v_ok + 1;

  -- O lead entra pela porta do script: lead com hashes, nova origem e SEM guardar telefone/e-mail legíveis
  v_res := public.tracking_ingest(jsonb_build_object(
    'container_id', v_ct, 'client_id', v_a, 'visitor_id', 'lw' || left(v_ph, 24), 'session_id', 'lw' || left(v_ph, 12) || '20261108',
    'test', false, 'device_type', 'desconhecido', 'consent_status', 'nao_exigido',
    'user', jsonb_build_object('ph', v_ph, 'em', v_em), 'capi', jsonb_build_object('fbc', 'fb.1.1762603200000.IwAR1'),
    'event', jsonb_build_object('event_id', 'lw.' || left(v_id::text, 8) || '.' || left(v_ph, 24) || '.20261108', 'name', 'Lead',
                                'occurred_at', now(), 'page_url', 'https://loja.test/?utm_source=facebook&bf_c=120', 'page_path', '/',
                                'custom_data', jsonb_build_object('canal', 'formulario_externo')),
    'touch', jsonb_build_object('channel', 'meta', 'paid', true, 'evidence', 'confirmada', 'reason', 'teste', 'utm_source', 'facebook',
                                'ad_campaign_id', '120', 'other_click_ids', '{}'::jsonb)));
  if exists (select 1 from public.tracking_leads l where l.container_id = v_ct and l.ph_hash = v_ph and l.em_hash = v_em) is not true then
    raise exception 'lead criado com os hashes: %', v_res;
  end if;
  if (select count(*) from public.tracking_touchpoints t where t.container_id = v_ct and t.ad_campaign_id = '120') <> 1 then
    raise exception 'nova origem gravada com o ID da campanha';
  end if;
  v_ok := v_ok + 1;

  -- Mesmo envio de novo: não duplica
  v_res := public.tracking_ingest(jsonb_build_object(
    'container_id', v_ct, 'client_id', v_a, 'visitor_id', 'lw' || left(v_ph, 24), 'session_id', 'lw' || left(v_ph, 12) || '20261108',
    'test', false, 'device_type', 'desconhecido', 'consent_status', 'nao_exigido', 'user', jsonb_build_object('ph', v_ph, 'em', v_em),
    'capi', '{}'::jsonb,
    'event', jsonb_build_object('event_id', 'lw.' || left(v_id::text, 8) || '.' || left(v_ph, 24) || '.20261108', 'name', 'Lead',
                                'occurred_at', now(), 'page_url', 'https://loja.test/', 'page_path', '/', 'custom_data', '{}'::jsonb), 'touch', null));
  select count(*) into v_n from public.tracking_leads l where l.container_id = v_ct;
  if v_res ->> 'status' <> 'duplicado' or v_n <> 1 then raise exception 'reenvio não duplica o lead: % / %', v_res, v_n; end if;
  v_ok := v_ok + 1;

  raise exception 'R: % verificações OK', v_ok;
end $$;
