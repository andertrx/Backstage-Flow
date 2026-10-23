-- Teste: acesso do cliente desativado (correção) + excluir cliente (23/10/2026). Termina com erro de propósito: nada fica gravado.
do $$
declare
  v_admin uuid; v_user uuid; v_cli uuid; v_other uuid; v_ok int := 0; n int;
begin
  select id into v_admin from public.profiles where role = 'admin' and active limit 1;
  select id into v_user from public.profiles where role <> 'admin' and active limit 1;
  select a.client_id into v_cli from public.ad_accounts a join public.clients c on c.id = a.client_id
   where c.status = 'ativo' and c.excluded_at is null and a.unlinked_at is null limit 1;
  select id into v_other from public.clients where status = 'ativo' and excluded_at is null and id <> v_cli limit 1;

  -- usuário de teste vira "cliente" com login liberado para v_cli
  update public.profiles set role = 'cliente' where id = v_user;
  insert into public.user_client_access (user_id, client_id) values (v_user, v_cli) on conflict do nothing;
  insert into public.client_portal (client_id, login_enabled) values (v_cli, true)
    on conflict (client_id) do update set login_enabled = true;

  perform set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  select count(*) into n from public.clients where id = v_cli;
  if n <> 1 then raise exception 'FALHOU: cliente ativo deveria ver o próprio cadastro'; end if; v_ok := v_ok + 1;
  perform set_config('role', 'postgres', true);

  perform set_config('request.jwt.claims', '', true);
  update public.clients set status = 'encerrado' where id = v_cli;   -- desativa (sem usuário = manutenção)
  perform set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);

  perform set_config('role', 'authenticated', true);
  select count(*) into n from public.clients where id = v_cli;
  if n <> 0 then raise exception 'FALHOU: login de cliente desativado ainda vê o cadastro'; end if; v_ok := v_ok + 1;
  select count(*) into n from public.ad_accounts where client_id = v_cli;
  if n <> 0 then raise exception 'FALHOU: login de cliente desativado ainda vê as contas'; end if; v_ok := v_ok + 1;
  if exists (select 1 from private.visible_client_ids() x where x = v_cli) then raise exception 'FALHOU: métricas ainda visíveis'; end if; v_ok := v_ok + 1;
  perform set_config('role', 'postgres', true);

  -- admin: excluir
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  begin perform public.client_exclude(v_other, (select name from public.clients where id = v_other)); raise exception 'FALHOU: excluiu cliente ativo';
  exception when invalid_parameter_value then v_ok := v_ok + 1; end;
  begin perform public.client_exclude(v_cli, 'nome errado'); raise exception 'FALHOU: aceitou nome errado';
  exception when invalid_parameter_value then v_ok := v_ok + 1; end;
  perform public.client_exclude(v_cli, upper((select name from public.clients where id = v_cli)));
  v_ok := v_ok + 1;
  perform set_config('role', 'authenticated', true);
  select count(*) into n from public.clients where id = v_cli;
  if n <> 0 then raise exception 'FALHOU: admin ainda vê o excluído'; end if; v_ok := v_ok + 1;
  select count(*) into n from public.ad_accounts where client_id = v_cli;
  if n <> 0 then raise exception 'FALHOU: contas do excluído ainda aparecem'; end if; v_ok := v_ok + 1;
  select count(*) into n from public.clients where id = v_other;
  if n <> 1 then raise exception 'FALHOU: admin deixou de ver outro cliente'; end if; v_ok := v_ok + 1;
  perform set_config('role', 'postgres', true);
  if not exists (select 1 from public.clients where id = v_cli and excluded_at is not null) then raise exception 'FALHOU: dados não guardados'; end if; v_ok := v_ok + 1;
  if not exists (select 1 from public.audit_logs where action = 'client.exclude' and target_id = v_cli::text) then raise exception 'FALHOU: auditoria'; end if; v_ok := v_ok + 1;

  -- não-admin não exclui
  perform set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
  begin perform public.client_exclude(v_other, 'x'); raise exception 'FALHOU: não-admin excluiu';
  exception when insufficient_privilege then v_ok := v_ok + 1; end;

  raise exception 'R: % verificações OK', v_ok;
end $$;
