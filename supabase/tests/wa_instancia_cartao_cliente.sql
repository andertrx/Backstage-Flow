-- Teste da T5.38 (acesso do Account Manager) — public.wa_instance_minha_conexao: quem pode e o que volta.
-- Transação desfeita (termina com "R: N verificações OK"). Roda como cada pessoa (authenticated).
do $$
declare
  v_admin uuid; c record; j jsonb; v_ok integer := 0;
  g1 uuid := '00000000-0000-0000-0000-000000389001';
  g2 uuid := '00000000-0000-0000-0000-000000389002';
  am uuid := '00000000-0000-0000-0000-000000389003';
  op uuid := '00000000-0000-0000-0000-000000389004';
  am2 uuid := '00000000-0000-0000-0000-000000389005';
begin
  select id into v_admin from public.profiles where role = 'admin' and active order by created_at limit 1;
  select w.id, w.client_id, w.display_phone into c from public.tracking_whatsapp_connections w
   where w.mode = 'nao_oficial' and private.client_is_active(w.client_id) order by w.created_at limit 1;
  if c.id is null then raise exception 'sem conexão não oficial para testar'; end if;
  insert into auth.users (id, instance_id, aud, role, email) values
    (g1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'g1@t389.local'),
    (g2, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'g2@t389.local'),
    (am, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'am@t389.local'),
    (op, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'op@t389.local'),
    (am2, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'am2@t389.local');
  update public.profiles set active = true, role = 'gestor', full_name = 'G1 T389' where id = g1;
  update public.profiles set active = true, role = 'gestor', full_name = 'G2 T389' where id = g2;
  update public.profiles set active = true, role = 'equipe', full_name = 'AM T389' where id = am;
  update public.profiles set active = true, role = 'operador', full_name = 'OP T389' where id = op;
  update public.profiles set active = true, role = 'equipe', full_name = 'AM2 T389' where id = am2;
  insert into public.user_client_access (user_id, client_id) values (g1, c.client_id);
  if exists (select 1 from public.ops_client_ops where client_id = c.client_id) then
    update public.ops_client_ops set am_user_id = am where client_id = c.client_id;
  else
    insert into public.ops_client_ops (client_id, stage_id, am_user_id) values (c.client_id, (select stage_id from public.ops_client_ops limit 1), am);
  end if;

  perform set_config('role', 'authenticated', true);
  -- Administrador, gestor com acesso e o AM do cliente: podem e recebem a conexão
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  j := public.wa_instance_minha_conexao(c.client_id);
  if not (j ->> 'pode')::boolean or jsonb_array_length(j -> 'conexoes') < 1 then raise exception 'admin: %', j; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', g1, 'role', 'authenticated')::text, true);
  if not (public.wa_instance_minha_conexao(c.client_id) ->> 'pode')::boolean then raise exception 'gestor com acesso pode'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', am, 'role', 'authenticated')::text, true);
  j := public.wa_instance_minha_conexao(c.client_id);
  if not (j ->> 'pode')::boolean or jsonb_array_length(j -> 'conexoes') < 1 then raise exception 'AM do cliente pode: %', j; end if;
  v_ok := v_ok + 1;

  -- O que volta: sem chave, sem token, sem segredo
  if j::text ~* '(inbound_key|token|secret|vault|hash)' then raise exception 'não pode vazar segredo: %', j; end if;
  if not (j -> 'conexoes' -> 0) ?& array['id', 'display_phone', 'instance_name', 'gateway_state', 'enabled'] then raise exception 'campos esperados: %', j; end if;
  v_ok := v_ok + 1;

  -- Não podem: gestor sem acesso, operador, outro AM (de outro cliente), desconhecido, visitante, cliente inexistente
  perform set_config('request.jwt.claims', json_build_object('sub', g2, 'role', 'authenticated')::text, true);
  if (public.wa_instance_minha_conexao(c.client_id) ->> 'pode')::boolean then raise exception 'gestor sem acesso não pode'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', op, 'role', 'authenticated')::text, true);
  if (public.wa_instance_minha_conexao(c.client_id) ->> 'pode')::boolean then raise exception 'operador não pode'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', am2, 'role', 'authenticated')::text, true);
  j := public.wa_instance_minha_conexao(c.client_id);
  if (j ->> 'pode')::boolean or jsonb_array_length(j -> 'conexoes') <> 0 then raise exception 'AM de outro cliente não pode e não recebe nada: %', j; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
  if (public.wa_instance_minha_conexao(c.client_id) ->> 'pode')::boolean then raise exception 'desconhecido não pode'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  if (public.wa_instance_minha_conexao(gen_random_uuid()) ->> 'pode')::boolean and jsonb_array_length(public.wa_instance_minha_conexao(gen_random_uuid()) -> 'conexoes') <> 0 then raise exception 'cliente inexistente não devolve conexão'; end if;
  v_ok := v_ok + 1;

  perform set_config('role', 'anon', true);
  begin perform public.wa_instance_minha_conexao(c.client_id); raise exception 'visitante não deveria executar';
  exception when sqlstate '42501' then null; end;
  v_ok := v_ok + 1;

  raise exception 'R: % verificações OK', v_ok;
end $$;
