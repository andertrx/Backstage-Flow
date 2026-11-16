-- Teste da T5.38 (fase A) — instância de WhatsApp por cliente: quem pode, chave, estado, remover. Transação desfeita
-- (termina com "R: N verificações OK"). Roda como o servidor (service_role); a Edge Function passa o id da pessoa.
do $$
declare
  v_admin uuid; c record; v_outro uuid;
  g1 uuid := '00000000-0000-0000-0000-000000388001';  -- gestor com acesso ao cliente
  g2 uuid := '00000000-0000-0000-0000-000000388002';  -- gestor sem acesso
  am uuid := '00000000-0000-0000-0000-000000388003';  -- Account Manager do cliente
  op uuid := '00000000-0000-0000-0000-000000388004';  -- operador qualquer
  v_ok integer := 0; v_p jsonb; v_h1 text; v_h2 text; v_j jsonb;
begin
  select id into v_admin from public.profiles where role = 'admin' and active order by created_at limit 1;
  select w.id, w.client_id, w.display_phone into c from public.tracking_whatsapp_connections w
   where w.mode = 'nao_oficial' and private.client_is_active(w.client_id) order by w.created_at limit 1;
  if c.id is null then raise exception 'sem conexão não oficial para testar'; end if;
  update public.tracking_whatsapp_connections set enabled = false where id = c.id; -- começa desligada (a real pode estar ligada; tudo é desfeito)
  select id into v_outro from public.tracking_whatsapp_connections where mode = 'nao_oficial' and id <> c.id limit 1;

  insert into auth.users (id, instance_id, aud, role, email) values
    (g1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'g1@t388.local'),
    (g2, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'g2@t388.local'),
    (am, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'am@t388.local'),
    (op, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'op@t388.local');
  update public.profiles set active = true, role = 'gestor', full_name = 'G1 T388' where id = g1;
  update public.profiles set active = true, role = 'gestor', full_name = 'G2 T388' where id = g2;
  update public.profiles set active = true, role = 'equipe', full_name = 'AM T388' where id = am;
  update public.profiles set active = true, role = 'operador', full_name = 'OP T388' where id = op;
  insert into public.user_client_access (user_id, client_id) values (g1, c.client_id);
  -- Ficha de operações do cliente (se não houver, cria uma na mesma etapa de qualquer outra ficha; tudo é desfeito no fim)
  if exists (select 1 from public.ops_client_ops where client_id = c.client_id) then
    update public.ops_client_ops set am_user_id = am where client_id = c.client_id;
  else
    insert into public.ops_client_ops (client_id, stage_id, am_user_id) values (c.client_id, (select stage_id from public.ops_client_ops limit 1), am);
  end if;

  -- Quem pode: administrador, gestor com acesso, Account Manager do cliente. Não pode: gestor sem acesso, operador.
  if not (private.wa_instance_can(v_admin, c.id) and private.wa_instance_can(g1, c.id) and private.wa_instance_can(am, c.id)) then raise exception 'admin, gestor com acesso e AM podem'; end if;
  if private.wa_instance_can(g2, c.id) or private.wa_instance_can(op, c.id) or private.wa_instance_can(gen_random_uuid(), c.id) then raise exception 'gestor sem acesso, operador e desconhecido não podem'; end if;
  if private.wa_instance_can(v_admin, gen_random_uuid()) then raise exception 'conexão inexistente'; end if;
  v_ok := v_ok + 1;

  -- Preparar: nome da instância "bf-..." (nunca "backstage"), chave nova a cada vez, só o hash no banco
  v_p := public.wa_instance_prepare(g1, c.id);
  if v_p ->> 'instance' !~ '^bf-[0-9a-f]{12}$' or v_p ->> 'instance' = 'backstage' then raise exception 'nome da instância: %', v_p; end if;
  select inbound_key_hash into v_h1 from public.tracking_whatsapp_connections where id = c.id;
  if v_h1 <> encode(extensions.digest(v_p ->> 'key', 'sha256'), 'hex') then raise exception 'o banco guarda o hash da chave'; end if;
  v_j := public.wa_instance_prepare(am, c.id);
  select inbound_key_hash into v_h2 from public.tracking_whatsapp_connections where id = c.id;
  if v_h1 = v_h2 or v_j ->> 'instance' <> v_p ->> 'instance' then raise exception 'chave troca; nome da instância fica'; end if;
  if (select count(*) from public.audit_logs where action = 'wa_instance.preparar' and target_id = c.id::text) <> 2 then raise exception 'preparar fica no histórico'; end if;
  begin perform public.wa_instance_prepare(g2, c.id); raise exception 'gestor sem acesso não prepara';
  exception when sqlstate '42501' then null; end;
  v_ok := v_ok + 1;

  -- Estado: conectado liga sozinho; desconectado desliga; erro não mexe; estado inventado recusado
  perform public.wa_instance_state_set(g1, c.id, 'aguardando_leitura', null);
  if (select enabled from public.tracking_whatsapp_connections where id = c.id) then raise exception 'aguardando leitura não liga'; end if;
  perform public.wa_instance_state_set(g1, c.id, 'conectado', true);
  if not (select enabled and gateway_state = 'conectado' and gateway_state_at is not null from public.tracking_whatsapp_connections where id = c.id) then raise exception 'conectado liga'; end if;
  perform public.wa_instance_state_set(g1, c.id, 'erro', null);
  if not (select enabled from public.tracking_whatsapp_connections where id = c.id) then raise exception 'erro não mexe no ligado'; end if;
  perform public.wa_instance_state_set(g1, c.id, 'desconectado', false);
  if (select enabled from public.tracking_whatsapp_connections where id = c.id) then raise exception 'desconectado desliga'; end if;
  if (select count(*) from public.audit_logs where action in ('wa_instance.ligar', 'wa_instance.desligar') and target_id = c.id::text) <> 2 then raise exception 'ligar e desligar ficam no histórico (uma vez cada)'; end if;
  begin perform public.wa_instance_state_set(g1, c.id, 'inventado', null); raise exception 'estado inventado deveria ser recusado';
  exception when sqlstate '22023' then null; end;
  begin perform public.wa_instance_state_set(op, c.id, 'conectado', true); raise exception 'operador não muda estado';
  exception when sqlstate '42501' then null; end;
  v_ok := v_ok + 1;

  -- Ler: só quem pode
  v_j := public.wa_instance_get(am, c.id);
  if v_j ->> 'instance' <> v_p ->> 'instance' or v_j ->> 'state' <> 'desconectado' then raise exception 'get: %', v_j; end if;
  begin perform public.wa_instance_get(g2, c.id); raise exception 'get de quem não pode';
  exception when sqlstate '42501' then null; end;
  v_ok := v_ok + 1;

  -- Remover: desliga e limpa a instância; contatos e conversas continuam
  perform public.wa_instance_clear(am, c.id);
  if not (select instance_name is null and gateway_state is null and not enabled from public.tracking_whatsapp_connections where id = c.id) then raise exception 'remover limpa'; end if;
  if not exists (select 1 from public.tracking_whatsapp_connections where id = c.id) then raise exception 'a conexão continua cadastrada'; end if;
  begin perform public.wa_instance_clear(g2, c.id); raise exception 'gestor sem acesso não remove';
  exception when sqlstate '42501' then null; end;
  v_ok := v_ok + 1;

  -- Só o servidor executa: quem está logado no site não chama
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  begin perform public.wa_instance_prepare(v_admin, c.id); raise exception 'usuário logado não deveria executar';
  exception when sqlstate '42501' then null; end;
  perform set_config('role', 'anon', true);
  begin perform public.wa_instance_get(v_admin, c.id); raise exception 'visitante não deveria executar';
  exception when sqlstate '42501' then null; end;
  v_ok := v_ok + 1;

  -- A tela lê estas colunas com permissão por coluna: sem isso a consulta inteira falha e as conexões somem (erro real de 16/11/2026)
  if not (has_column_privilege('authenticated', 'public.tracking_whatsapp_connections', 'instance_name', 'select')
          and has_column_privilege('authenticated', 'public.tracking_whatsapp_connections', 'gateway_state', 'select')
          and has_column_privilege('authenticated', 'public.tracking_whatsapp_connections', 'gateway_state_at', 'select')) then
    raise exception 'a tela precisa ler instance_name, gateway_state e gateway_state_at';
  end if;
  if has_column_privilege('authenticated', 'public.tracking_whatsapp_connections', 'inbound_key_hash', 'select') then
    raise exception 'o hash da chave nunca pode ser lido pela tela';
  end if;
  v_ok := v_ok + 1;

  raise exception 'R: % verificações OK', v_ok;
end $$;
