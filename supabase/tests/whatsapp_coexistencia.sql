-- Teste da fase Tracking T4.2 (ligar o WhatsApp pelo cadastro oficial do Meta, Coexistence).
-- Roda numa transação desfeita (termina com "R: N verificações OK", que desfaz tudo).
do $$
declare
  v_admin uuid; v_visu uuid; v_a uuid; v_ct uuid; v_ct2 uuid; v_conn uuid; v_res jsonb; v_ok integer := 0;
begin
  select id into v_admin from public.profiles where role = 'admin' and active order by created_at limit 1;
  select id into v_visu from public.profiles where role = 'visualizador' and active order by created_at limit 1;
  select id into v_a from public.clients where status = 'ativo' and excluded_at is null order by created_at limit 1;
  insert into public.tracking_containers (client_id, name, allowed_domains, test_mode) values (v_a, 'teste-coex', '{coex.test}', true) returning id into v_ct;
  insert into public.tracking_containers (client_id, name, allowed_domains, test_mode) values (v_a, 'teste-coex2', '{coex2.test}', true) returning id into v_ct2;

  -- Visualizador (e qualquer um que não seja admin) não configura o app da agência
  perform set_config('request.jwt.claims', json_build_object('sub', v_visu, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  begin
    perform public.wa_app_settings_save('123456789012', '987654321098', repeat('a', 32));
    raise exception 'não-admin não configura o app';
  exception when insufficient_privilege then null;
  end;
  -- Sem usuário (papel vazio) também é recusado (achado pelo teste; correção 20261025225637)
  perform set_config('request.jwt.claims', json_build_object('role', 'authenticated')::text, true);
  begin
    perform public.wa_app_settings_save('123456789012', '987654321098', repeat('a', 32));
    raise exception 'sem usuário não configura o app';
  exception when insufficient_privilege then null;
  end;
  begin
    perform * from public.wa_app_settings;
    raise exception 'a tela não lê a tabela do app';
  exception when insufficient_privilege then null;
  end;
  v_ok := v_ok + 1;

  -- Admin: dados inválidos recusados; salvar guarda o segredo no cofre e gera o token de verificação
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  begin
    perform public.wa_app_settings_save('abc', '987654321098', null);
    raise exception 'ID do app inválido deveria ser recusado';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.wa_app_settings_save('123456789012', '987654321098', 'segredo-curto');
    raise exception 'segredo inválido deveria ser recusado';
  exception when invalid_parameter_value then null;
  end;
  v_res := public.wa_app_settings_save('123456789012', '987654321098', null);
  if (v_res ->> 'ready')::boolean or (v_res ->> 'has_secret')::boolean or v_res ->> 'verify_token' !~ '^[0-9a-f]{48}$' then
    raise exception 'sem segredo: ainda não está pronto, mas já tem token de verificação: %', v_res;
  end if;
  v_res := public.wa_app_settings_save('123456789012', '987654321098', repeat('b', 32));
  if not (v_res ->> 'ready')::boolean or v_res ? 'app_secret' or v_res::text like '%bbbbbbbb%' then
    raise exception 'pronto, e a tela nunca recebe o segredo: %', v_res;
  end if;
  v_ok := v_ok + 1;

  -- Servidor: lê as credenciais (com o segredo) e liga o número
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'postgres', true);
  v_res := private.wa_app_credentials();
  if v_res ->> 'app_secret' <> repeat('b', 32) or v_res ->> 'app_id' <> '123456789012' or v_res ->> 'verify_token' !~ '^[0-9a-f]{48}$' then
    raise exception 'credenciais para o servidor';
  end if;
  v_ok := v_ok + 1;

  v_conn := private.wa_coex_connect(jsonb_build_object('container_id', v_ct, 'phone_number_id', '990000000042001', 'waba_id', '880000000042001',
    'token', 'EAAtokendeteste', 'display_phone', '+55 45 3000-4242', 'verified_name', 'Loja Teste', 'user_id', v_admin));
  if (select mode from public.tracking_whatsapp_connections where id = v_conn) <> 'coexistencia'
     or not (select enabled from public.tracking_whatsapp_connections where id = v_conn)
     or (select decrypted_secret from vault.decrypted_secrets where id = (select token_vault_id from public.tracking_whatsapp_connections where id = v_conn)) <> 'EAAtokendeteste'
     or not exists (select 1 from public.audit_logs where action = 'tracking_whatsapp.coexistencia' and details ->> 'token' = 'guardado no Vault') then
    raise exception 'número ligado por Coexistence, com o token no cofre';
  end if;
  if exists (select 1 from public.audit_logs where details::text like '%EAAtokendeteste%') then raise exception 'token nunca vai para o registro'; end if;
  v_ok := v_ok + 1;

  -- Ligar de novo (troca o token, não duplica); o mesmo número em outro site é recusado
  perform private.wa_coex_connect(jsonb_build_object('container_id', v_ct, 'phone_number_id', '990000000042001', 'waba_id', '880000000042001',
    'token', 'EAAtokennovo', 'user_id', v_admin));
  if (select count(*) from public.tracking_whatsapp_connections where container_id = v_ct) <> 1
     or (select decrypted_secret from vault.decrypted_secrets where id = (select token_vault_id from public.tracking_whatsapp_connections where id = v_conn)) <> 'EAAtokennovo' then
    raise exception 'religar troca o token sem duplicar';
  end if;
  begin
    perform private.wa_coex_connect(jsonb_build_object('container_id', v_ct2, 'phone_number_id', '990000000042001', 'waba_id', '880000000042001', 'token', 'x'));
    raise exception 'mesmo número em outro site deveria ser recusado';
  exception when unique_violation then null;
  end;
  v_ok := v_ok + 1;

  -- O webhook do app acha a conexão pelo número; a tela não lê a referência do token
  if private.wa_coex_connection_for('990000000042001') ->> 'id' <> v_conn::text or private.wa_coex_connection_for('111') is not null then
    raise exception 'conexão pelo número';
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  begin
    perform token_vault_id from public.tracking_whatsapp_connections;
    raise exception 'a tela não lê a referência do token';
  exception when insufficient_privilege then null;
  end;
  if (select mode from public.tracking_whatsapp_connections where id = v_conn) <> 'coexistencia' then raise exception 'a tela vê o modo da conexão'; end if;
  begin
    perform private.wa_app_credentials();
    raise exception 'a tela não lê as credenciais';
  exception when insufficient_privilege then null;
  end;
  v_ok := v_ok + 1;

  raise exception 'R: % verificações OK', v_ok;
end $$;
