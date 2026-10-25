-- Teste da fase Tracking T3.2 (vendas pelo webhook do sistema de vendas). Roda numa transação desfeita
-- (termina com "R: N verificações OK", que desfaz tudo).
do $$
declare
  v_admin uuid; v_visu uuid; v_a uuid; v_ct uuid; v_dest uuid; v_c1 bigint; v_c2 bigint;
  v_wh jsonb; v_id uuid; v_key text; v_res jsonb; v_n integer; v_ok integer := 0;
  v_ph text := encode(extensions.digest('5545999998888', 'sha256'), 'hex');
  v_ph2 text := encode(extensions.digest('5545911112222', 'sha256'), 'hex');
begin
  select id into v_admin from public.profiles where role = 'admin' and active order by created_at limit 1;
  select id into v_visu from public.profiles where role = 'visualizador' and active order by created_at limit 1;
  select id into v_a from public.clients where status <> 'encerrado' and excluded_at is null order by created_at limit 1;
  insert into public.tracking_containers (client_id, name, allowed_domains, test_mode) values (v_a, 'teste-vendas', '{loja.test}', false) returning id into v_ct;
  insert into public.tracking_destinations (container_id, client_id, pixel_id, enabled, vault_secret_id)
  values (v_ct, v_a, '123456789', true, gen_random_uuid()) returning id into v_dest;

  -- Admin cria o endereço (a chave aparece uma vez) e um contato manual
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  v_wh := public.sales_webhook_create(v_a, 'Loja virtual');
  v_id := (v_wh ->> 'id')::uuid; v_key := v_wh ->> 'key';
  v_c1 := public.contact_create(v_a, null, v_ph);
  if v_key !~ '^[0-9a-f]{48}$' or (select test_mode from public.tracking_sales_webhooks where id = v_id) is not true then
    raise exception 'endereço novo com chave e em modo teste';
  end if;
  begin
    perform key_hash from public.tracking_sales_webhooks;
    raise exception 'a tela não pode ler o hash da chave';
  exception when insufficient_privilege then null;
  end;
  v_ok := v_ok + 1;

  -- Visualizador não cria
  perform set_config('request.jwt.claims', json_build_object('sub', v_visu, 'role', 'authenticated')::text, true);
  begin
    perform public.sales_webhook_create(v_a, 'X');
    raise exception 'visualizador não cria endereço';
  exception when insufficient_privilege then null;
  end;
  v_ok := v_ok + 1;

  -- Servidor (sem login)
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'postgres', true);
  if private.sales_webhook_auth(v_id, v_key) is null or private.sales_webhook_auth(v_id, 'errada') is not null then
    raise exception 'conferência da chave';
  end if;
  v_ok := v_ok + 1;

  v_res := private.sales_webhook_receive(jsonb_build_object('webhook_id', v_id, 'keys', '["order.id","order.total","customer.phone"]'::jsonb,
    'order_id', 'A100', 'value', 297.5, 'currency', 'BRL', 'ph_hash', v_ph));
  if v_res ->> 'result' <> 'teste' or (select sales from public.tracking_contacts where id = v_c1) <> 0
     or (select last_keys from public.tracking_sales_webhooks where id = v_id) <> array['order.id', 'order.total', 'customer.phone'] then
    raise exception 'modo teste: confere, guarda os nomes dos campos e não registra: %', v_res;
  end if;
  v_ok := v_ok + 1;

  update public.tracking_sales_webhooks set test_mode = false where id = v_id;
  v_res := private.sales_webhook_receive(jsonb_build_object('webhook_id', v_id, 'keys', '[]'::jsonb, 'value', 10, 'ph_hash', v_ph));
  if v_res ->> 'result' <> 'recusado' then raise exception 'sem nº do pedido é recusado: %', v_res; end if;
  v_res := private.sales_webhook_receive(jsonb_build_object('webhook_id', v_id, 'keys', '[]'::jsonb, 'order_id', 'A0', 'ph_hash', v_ph));
  if v_res ->> 'result' <> 'recusado' then raise exception 'sem valor é recusado: %', v_res; end if;
  v_res := private.sales_webhook_receive(jsonb_build_object('webhook_id', v_id, 'keys', '[]'::jsonb, 'result', 'ignorado', 'reason', 'Status: pendente'));
  if v_res ->> 'result' <> 'ignorado' then raise exception 'status que não conta é ignorado'; end if;
  v_ok := v_ok + 1;

  -- Venda de quem já é contato: liga ao contato, compra no tracking, Meta, histórico
  v_res := private.sales_webhook_receive(jsonb_build_object('webhook_id', v_id, 'keys', '[]'::jsonb,
    'order_id', 'A100', 'value', 297.5, 'currency', 'brl', 'ph_hash', v_ph));
  if v_res ->> 'result' <> 'aceito' or (v_res ->> 'contact_id')::bigint <> v_c1 or not (v_res ->> 'contact_found')::boolean
     or (select sales from public.tracking_contacts where id = v_c1) <> 1
     or (select kind from public.tracking_contact_stages where id = (select stage_id from public.tracking_contacts where id = v_c1)) <> 'ganha' then
    raise exception 'venda ligada ao contato existente: %', v_res;
  end if;
  if not exists (select 1 from public.tracking_purchases where container_id = v_ct and transaction_id = 'A100' and value_micros = 297500000 and currency = 'BRL')
     or not exists (select 1 from public.tracking_capi_queue where destination_id = v_dest and event_name = 'Purchase' and custom_data ->> 'order_id' = 'A100')
     or not exists (select 1 from public.tracking_contact_history where contact_id = v_c1 and kind = 'venda' and order_id = 'A100' and by_user is null) then
    raise exception 'compra registrada, na fila do Meta e no histórico';
  end if;
  v_ok := v_ok + 1;

  v_res := private.sales_webhook_receive(jsonb_build_object('webhook_id', v_id, 'keys', '[]'::jsonb, 'order_id', 'A100', 'value', 297.5, 'currency', 'BRL', 'ph_hash', v_ph));
  if v_res ->> 'result' <> 'repetido' or (select sales from public.tracking_contacts where id = v_c1) <> 1 then raise exception 'pedido repetido não conta duas vezes'; end if;
  v_ok := v_ok + 1;

  -- Venda de quem não é contato: cria contato "sistema de vendas"
  v_res := private.sales_webhook_receive(jsonb_build_object('webhook_id', v_id, 'keys', '[]'::jsonb, 'order_id', 'A101', 'value', 50, 'currency', 'USD', 'ph_hash', v_ph2));
  v_c2 := (v_res ->> 'contact_id')::bigint;
  if v_res ->> 'result' <> 'aceito' or (v_res ->> 'contact_found')::boolean
     or (select origin from public.tracking_contacts where id = v_c2) <> 'sistema' or (select ph_hash from public.tracking_contacts where id = v_c2) <> v_ph2 then
    raise exception 'venda sem contato cria contato do sistema de vendas: %', v_res;
  end if;
  v_ok := v_ok + 1;

  -- Desligado: ignora
  update public.tracking_sales_webhooks set enabled = false where id = v_id;
  v_res := private.sales_webhook_receive(jsonb_build_object('webhook_id', v_id, 'keys', '[]'::jsonb, 'order_id', 'A102', 'value', 1, 'currency', 'BRL'));
  if v_res ->> 'result' <> 'ignorado' then raise exception 'endereço desligado ignora'; end if;
  v_ok := v_ok + 1;

  select count(*) into v_n from public.tracking_sales_webhook_log where webhook_id = v_id;
  if v_n <> 8 or exists (select 1 from public.tracking_sales_webhook_log where webhook_id = v_id and (reason ~ '[0-9]{10}' or order_id ~ '@')) then
    raise exception 'registro de cada aviso, sem dado pessoal: %', v_n;
  end if;
  v_ok := v_ok + 1;

  -- Trocar a chave: a antiga para de valer
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  v_wh := to_jsonb(public.sales_webhook_new_key(v_id));
  perform set_config('role', 'postgres', true);
  if private.sales_webhook_auth(v_id, v_key) is not null or private.sales_webhook_auth(v_id, v_wh #>> '{}') is null then
    raise exception 'chave nova vale, a antiga não';
  end if;
  v_ok := v_ok + 1;

  raise exception 'R: % verificações OK', v_ok;
end $$;
