-- Teste da fase Tracking T2 (regras sem Tag Manager). Roda numa transação desfeita
-- (termina com "R: N verificações OK", que desfaz tudo).
-- O script do site lê as regras pelo servidor (sem login): aqui, como o banco faria.
create function pg_temp.regras(p_key text) returns jsonb language sql security definer as $f$ select private.tracking_rules_for_key(p_key) $f$;

do $$
declare
  v_admin uuid; v_visu uuid; v_cli uuid; v_off uuid;
  v_ct uuid; v_ct_off uuid; v_key text; v_key_off text; v_dest uuid;
  v_ver integer; v_json jsonb; v_n integer; v_ok integer := 0;
  v_name text; v_cd jsonb;
begin
  select id into v_admin from public.profiles where role = 'admin' and active order by created_at limit 1;
  select id into v_visu from public.profiles where role = 'visualizador' and active order by created_at limit 1;
  select id into v_cli from public.clients where status <> 'encerrado' and excluded_at is null order by created_at limit 1;
  select id into v_off from public.clients where status = 'encerrado' and excluded_at is null limit 1;

  insert into public.tracking_containers (client_id, name, allowed_domains, test_mode) values (v_cli, 'teste-regras', '{loja.test}', false)
    returning id, public_key into v_ct, v_key;
  insert into public.tracking_containers (client_id, name, allowed_domains) values (v_off, 'teste-regras-off', '{off.test}')
    returning id, public_key into v_ct_off, v_key_off;
  insert into public.user_client_access (user_id, client_id) values (v_visu, v_cli) on conflict do nothing;

  -- Como o admin (com as regras de acesso do banco)
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);

  insert into public.tracking_rules (container_id, client_id, position, name, kind, match_op, match_text, event_name)
  values (v_ct, null, 2, 'Obrigado', 'pagina', 'contem', '/obrigado', 'CompleteRegistration');
  insert into public.tracking_rules (container_id, client_id, position, name, kind, field_name, field_values, event_name)
  values (v_ct, null, 0, 'Lojista', 'formulario', 'Tipo de cliente', '{Lojista}', 'Lead');
  insert into public.tracking_rules (container_id, client_id, position, name, kind, event_name, meta_mode, meta_event)
  values (v_ct, null, 1, 'Outros', 'formulario', 'Lead', 'personalizado', 'LeadOutros');
  select count(*) into v_n from public.tracking_rules where container_id = v_ct and client_id = v_cli;
  if v_n <> 3 then raise exception 'cliente da regra veio do site: %', v_n; end if;
  v_ok := v_ok + 1;

  begin
    insert into public.tracking_rules (container_id, client_id, name, kind, match_text, event_name)
    values (v_ct, null, 'Compra sem valor', 'pagina', '/pedido', 'Purchase');
    raise exception 'compra sem valor deveria ser recusada';
  exception when check_violation then v_ok := v_ok + 1;
  end;
  begin
    insert into public.tracking_rules (container_id, client_id, name, kind, event_name, meta_mode)
    values (v_ct, null, 'Personalizado sem nome', 'formulario', 'Lead', 'personalizado');
    raise exception 'personalizado sem nome deveria ser recusado';
  exception when check_violation then v_ok := v_ok + 1;
  end;

  -- Antes de publicar, o site não recebe regras
  if pg_temp.regras(v_key) is not null then raise exception 'sem publicação não deveria haver regras'; end if;
  v_ok := v_ok + 1;

  v_ver := public.tracking_rules_publish(v_ct);
  v_json := pg_temp.regras(v_key);
  if v_ver <> 1 or (v_json ->> 'v')::int <> 1 or jsonb_array_length(v_json -> 'r') <> 3
     or v_json -> 'r' -> 0 ->> 'name' <> 'Lojista' or v_json -> 'r' -> 2 ->> 'name' <> 'Obrigado'
     or v_json -> 'r' -> 0 -> 'field_values' ->> 0 <> 'Lojista' then
    raise exception 'publicação 1 errada: %', v_json;
  end if;
  v_ok := v_ok + 1;

  update public.tracking_rules set enabled = false where container_id = v_ct and name = 'Obrigado';
  if jsonb_array_length(pg_temp.regras(v_key) -> 'r') <> 3 then raise exception 'rascunho não pode mudar o site antes de publicar'; end if;
  v_ver := public.tracking_rules_publish(v_ct);
  if v_ver <> 2 or jsonb_array_length(pg_temp.regras(v_key) -> 'r') <> 2 then raise exception 'regra desligada saiu na versão 2'; end if;
  v_ok := v_ok + 1;

  v_ver := public.tracking_rules_restore(v_ct, 1);
  select count(*) into v_n from public.tracking_rules where container_id = v_ct and archived_at is null and enabled;
  if v_ver <> 3 or v_n <> 3 or jsonb_array_length(pg_temp.regras(v_key) -> 'r') <> 3
     or (select restored_from from public.tracking_rule_versions where container_id = v_ct and version = 3) <> 1 then
    raise exception 'voltar para a versão 1 falhou (versão %, regras %)', v_ver, v_n;
  end if;
  select count(*) into v_n from public.tracking_rules where container_id = v_ct and archived_at is not null;
  if v_n <> 3 then raise exception 'regras antigas deveriam ficar arquivadas (não apagadas): %', v_n; end if;
  v_ok := v_ok + 1;

  if not exists (select 1 from public.audit_logs where action = 'tracking.rules_publish' and target_id = v_ct::text and details ->> 'voltou_da_versao' = '1') then
    raise exception 'auditoria da publicação';
  end if;
  v_ok := v_ok + 1;

  -- Visualizador: vê, mas não cria nem publica
  perform set_config('request.jwt.claims', json_build_object('sub', v_visu, 'role', 'authenticated')::text, true);
  select count(*) into v_n from public.tracking_rules where container_id = v_ct;
  if v_n = 0 then raise exception 'visualizador deveria ver as regras'; end if;
  begin
    insert into public.tracking_rules (container_id, client_id, name, kind, match_text, event_name)
    values (v_ct, null, 'X', 'pagina', '/x', 'Lead');
    raise exception 'visualizador não pode criar regra';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.tracking_rules_publish(v_ct);
    raise exception 'visualizador não pode publicar';
  exception when insufficient_privilege then null;
  end;
  v_ok := v_ok + 1;

  -- Cliente desativado: o site não recebe regras mesmo publicadas
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'postgres', true);
  insert into public.tracking_rule_versions (container_id, client_id, version, rules, rules_count) values (v_ct_off, v_off, 1, '[]', 0);
  update public.tracking_containers set rules_version = 1 where id = v_ct_off;
  if pg_temp.regras(v_key_off) is not null then raise exception 'cliente desativado não deveria receber regras'; end if;
  v_ok := v_ok + 1;

  -- Fila do Meta: nome do evento vindo da regra, "não enviar" e lista de eventos do destino
  insert into public.tracking_destinations (container_id, client_id, pixel_id, enabled, vault_secret_id)
  values (v_ct, v_cli, '123456789', true, gen_random_uuid()) returning id into v_dest;
  perform private.tracking_capi_enqueue(jsonb_build_object('container_id', v_ct, 'visitor_id', 'vis12345', 'test', false,
    'event', jsonb_build_object('event_id', 'ev-outros-1', 'name', 'Lead', 'occurred_at', now(), 'page_url', 'https://loja.test/',
      'custom_data', jsonb_build_object('bf_meta', 'LeadOutros', 'bf_regra', 'Outros', 'resposta', 'Sacoleiro'))), null);
  select event_name, custom_data into v_name, v_cd from public.tracking_capi_queue where destination_id = v_dest and event_id = 'ev-outros-1';
  if v_name <> 'LeadOutros' or v_cd ? 'bf_meta' or v_cd ? 'bf_regra' or v_cd ->> 'resposta' <> 'Sacoleiro' then
    raise exception 'evento personalizado na fila: % %', v_name, v_cd;
  end if;
  v_ok := v_ok + 1;

  perform private.tracking_capi_enqueue(jsonb_build_object('container_id', v_ct, 'visitor_id', 'vis12345', 'test', false,
    'event', jsonb_build_object('event_id', 'ev-compra-1', 'name', 'Purchase', 'occurred_at', now(), 'page_url', 'https://loja.test/',
      'value_micros', 99900000, 'currency', 'BRL', 'transaction_id', 'P1',
      'custom_data', jsonb_build_object('bf_meta', 'nao_enviar'))), null);
  perform private.tracking_capi_enqueue(jsonb_build_object('container_id', v_ct, 'visitor_id', 'vis12345', 'test', false,
    'event', jsonb_build_object('event_id', 'ev-lead-1', 'name', 'Lead', 'occurred_at', now(), 'page_url', 'https://loja.test/',
      'custom_data', jsonb_build_object('resposta', 'Lojista'))), null);
  if exists (select 1 from public.tracking_capi_queue where event_id = 'ev-compra-1') then raise exception 'compra "não enviar" entrou na fila'; end if;
  if (select event_name from public.tracking_capi_queue where event_id = 'ev-lead-1') <> 'Lead' then raise exception 'Lead normal'; end if;
  v_ok := v_ok + 1;

  perform private.tracking_capi_enqueue(jsonb_build_object('container_id', v_ct, 'visitor_id', 'vis12345', 'test', false,
    'event', jsonb_build_object('event_id', 'ev-view-1', 'name', 'ViewContent', 'occurred_at', now(), 'page_url', 'https://loja.test/',
      'custom_data', jsonb_build_object('bf_meta', 'Lead'))), null);
  if exists (select 1 from public.tracking_capi_queue where event_id = 'ev-view-1') then
    raise exception 'evento fora da lista do destino não pode entrar só por ter outro nome no Meta';
  end if;
  v_ok := v_ok + 1;

  raise exception 'R: % verificações OK', v_ok;
end $$;
