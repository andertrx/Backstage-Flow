-- Teste da Etapa 44.1 — conexão do WhatsApp por API não oficial. Transação desfeita: termina com "R: N verificações OK".
do $$
declare
  v_admin uuid; v_other uuid; v_ok int := 0; s public.wa_gateway_settings; v_cfg jsonb; v_n int;
begin
  select id into v_admin from public.profiles where role = 'admin' and active order by created_at limit 1;
  select id into v_other from public.profiles where role <> 'admin' and role <> 'cliente' and active order by created_at limit 1;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_other, 'role', 'authenticated')::text, true);
  -- 1) quem não é admin não configura, não liga e não vê
  begin perform public.wa_gateway_save('https://whats.exemplo.com.br', 'backstage', 'abcdefghijklmnop1234', true); raise exception 'não-admin salvou';
  exception when insufficient_privilege then null; end;
  begin perform public.wa_gateway_set_enabled(true); raise exception 'não-admin ligou';
  exception when insufficient_privilege then null; end;
  select count(*) into v_n from public.wa_gateway_settings;
  if v_n <> 0 then raise exception 'não-admin enxerga a configuração'; end if; v_ok := v_ok + 1;

  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  -- 2) endereços inseguros ou inválidos são recusados
  begin perform public.wa_gateway_save('http://whats.exemplo.com.br', 'backstage', null, true); raise exception 'aceitou http';
  exception when sqlstate '22023' then null; end;
  begin perform public.wa_gateway_save('https://127.0.0.1', 'backstage', null, true); raise exception 'aceitou IP';
  exception when sqlstate '22023' then null; end;
  begin perform public.wa_gateway_save('https://localhost', 'backstage', null, true); raise exception 'aceitou localhost';
  exception when sqlstate '22023' then null; end;
  begin perform public.wa_gateway_save('https://whats.exemplo.com.br/caminho', 'backstage', null, true); raise exception 'aceitou caminho';
  exception when sqlstate '22023' then null; end;
  begin perform public.wa_gateway_save('https://whats.exemplo.com.br', 'nome com espaço', null, true); raise exception 'aceitou instância inválida';
  exception when sqlstate '22023' then null; end;
  begin perform public.wa_gateway_save('https://whats.exemplo.com.br', 'backstage', 'curta', true); raise exception 'aceitou chave curta';
  exception when sqlstate '22023' then null; end;
  v_ok := v_ok + 1;

  -- 3) sem marcar que entende o risco, não salva
  begin perform public.wa_gateway_save('https://whats.exemplo.com.br', 'backstage', 'abcdefghijklmnop1234', false); raise exception 'salvou sem aceitar o risco';
  exception when sqlstate '22023' then null; end;
  v_ok := v_ok + 1;

  -- 4) salvar de verdade: chave vai para o cofre, tela só vê "tem chave"; trava segue desligada
  perform public.wa_gateway_save('HTTPS://Whats.Exemplo.com.br/', ' backstage ', 'abcdefghijklmnop1234', true);
  select * into s from public.wa_gateway_settings;
  if s.base_url <> 'https://whats.exemplo.com.br' or s.instance_name <> 'backstage' or not s.has_key or s.risk_accepted_at is null
     or s.risk_accepted_by <> v_admin or s.enabled or s.connection_state <> 'desconhecido' then raise exception 'configuração salva errada: %', to_jsonb(s); end if;
  if to_jsonb(s)::text like '%abcdefghijklmnop1234%' then raise exception 'chave apareceu na tabela'; end if;
  v_ok := v_ok + 1;

  -- 5) ligar a trava exige conexão ativa
  begin perform public.wa_gateway_set_enabled(true); raise exception 'ligou sem conexão';
  exception when sqlstate '22023' then null; end;
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
  v_cfg := public.wa_gateway_config_get();
  if v_cfg ->> 'key' <> 'abcdefghijklmnop1234' or v_cfg ->> 'base_url' <> 'https://whats.exemplo.com.br' then raise exception 'servidor não lê a configuração: %', v_cfg - 'key'; end if;
  perform public.wa_gateway_state_set('conectado', null);
  select * into s from public.wa_gateway_settings;
  if s.connection_state <> 'conectado' or s.connected_at is null or s.last_check_at is null then raise exception 'estado conectado não anotado'; end if;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  perform public.wa_gateway_set_enabled(true);
  if not (select enabled from public.wa_gateway_settings) then raise exception 'não ligou conectado'; end if;
  v_ok := v_ok + 1;

  -- 6) erro passageiro não desliga; o WhatsApp desconectar desliga sozinho
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
  perform public.wa_gateway_state_set('erro', 'servidor não respondeu');
  if not (select enabled from public.wa_gateway_settings) then raise exception 'erro passageiro não deveria desligar'; end if;
  perform public.wa_gateway_state_set('desconectado', null);
  select * into s from public.wa_gateway_settings;
  if s.enabled or s.connected_at is not null then raise exception 'desconectou e a trava continuou ligada'; end if;
  begin perform public.wa_gateway_state_set('qualquer', null); raise exception 'estado inválido aceito';
  exception when sqlstate '22023' then null; end;
  v_ok := v_ok + 1;

  -- 7) mudar o servidor desliga a trava e zera a conexão; o auditório registra sem a chave
  perform public.wa_gateway_state_set('conectado', null);
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  perform public.wa_gateway_set_enabled(true);
  perform public.wa_gateway_save('https://outro.exemplo.com.br', 'backstage', null, false);
  select * into s from public.wa_gateway_settings;
  if s.enabled or s.connection_state <> 'desconhecido' or not s.has_key then raise exception 'mudar o servidor deveria desligar e manter a chave'; end if;
  perform set_config('role', 'postgres', true);
  if exists (select 1 from public.audit_logs where action like 'wa_gateway.%' and details::text like '%abcdefghijklmnop1234%') then raise exception 'chave no registro de auditoria'; end if;
  if (select count(*) from public.audit_logs where action like 'wa_gateway.%' and actor_id = v_admin) < 3 then raise exception 'auditoria incompleta'; end if;
  v_ok := v_ok + 1;

  raise exception 'R: % verificações OK', v_ok;
end $$;
