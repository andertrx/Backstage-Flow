-- =============================================================================
-- Testes da Etapa 3 — conexões, cofre de tokens e contas de anúncio
--
-- Rodar inteiro no SQL Editor do Supabase. Transação desfeita no final.
-- Sucesso: última linha 'TODOS OS TESTES PASSARAM'.
-- =============================================================================
begin;

insert into auth.users (id, instance_id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000003a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@t3.local'),
  ('00000000-0000-0000-0000-0000000003b1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'gestor@t3.local'),
  ('00000000-0000-0000-0000-0000000003c1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'visual@t3.local'),
  ('00000000-0000-0000-0000-0000000003d1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cliente@t3.local');
update public.profiles set active = true, role = 'admin'        where id = '00000000-0000-0000-0000-0000000003a1';
update public.profiles set active = true, role = 'gestor'       where id = '00000000-0000-0000-0000-0000000003b1';
update public.profiles set active = true, role = 'visualizador' where id = '00000000-0000-0000-0000-0000000003c1';
update public.profiles set active = true, role = 'cliente'      where id = '00000000-0000-0000-0000-0000000003d1';

insert into public.clients (id, name) values
  ('00000000-0000-0000-0000-0000000003f1', 'Cliente A'),
  ('00000000-0000-0000-0000-0000000003f2', 'Cliente B');
insert into public.user_client_access (user_id, client_id) values
  ('00000000-0000-0000-0000-0000000003c1', '00000000-0000-0000-0000-0000000003f1'),
  ('00000000-0000-0000-0000-0000000003d1', '00000000-0000-0000-0000-0000000003f2');

-- Conexão e token (como a Edge Function faz, com o papel do servidor)
insert into public.platform_connections (id, platform_id, label, external_user_id, updated_by)
values ('00000000-0000-0000-0000-0000000003e1', 'meta', 'BM Agência', 'su-1', '00000000-0000-0000-0000-0000000003a1');
select public.connection_secret_set('00000000-0000-0000-0000-0000000003e1', 'TOKEN-SECRETO-DE-TESTE');

insert into public.ad_accounts (id, platform_id, external_id, client_id, connection_id, name, currency, status, updated_by) values
  ('00000000-0000-0000-0000-000000000301', 'meta', '111', '00000000-0000-0000-0000-0000000003f1', '00000000-0000-0000-0000-0000000003e1', 'Conta A', 'BRL', 'ativa', '00000000-0000-0000-0000-0000000003a1'),
  ('00000000-0000-0000-0000-000000000302', 'meta', '222', '00000000-0000-0000-0000-0000000003f2', '00000000-0000-0000-0000-0000000003e1', 'Conta B', 'BRL', 'pagamento_pendente', '00000000-0000-0000-0000-0000000003a1');
insert into public.ad_account_assets (ad_account_id, asset_type, external_id, name) values
  ('00000000-0000-0000-0000-000000000301', 'page', 'p1', 'Página A'),
  ('00000000-0000-0000-0000-000000000302', 'page', 'p2', 'Página B');
insert into public.sync_state (ad_account_id) values ('00000000-0000-0000-0000-000000000301'), ('00000000-0000-0000-0000-000000000302');

-- ---------------------------------------------------------------- cofre
do $$
begin
  if public.connection_secret_get('00000000-0000-0000-0000-0000000003e1') <> 'TOKEN-SECRETO-DE-TESTE' then
    raise exception 'FALHOU: servidor deveria ler o token';
  end if;
  if exists (select 1 from vault.secrets where secret = 'TOKEN-SECRETO-DE-TESTE') then
    raise exception 'FALHOU: token gravado sem criptografia';
  end if;
end $$;

-- A mesma conta não pode estar vinculada a dois clientes ao mesmo tempo
do $$
begin
  begin
    insert into public.ad_accounts (platform_id, external_id, client_id, name) values ('meta', '111', '00000000-0000-0000-0000-0000000003f2', 'Duplicada');
    raise exception 'FALHOU: conta vinculada a dois clientes';
  exception when unique_violation then null;
  end;
end $$;

-- Desvincular libera para vincular de novo (histórico preservado)
update public.ad_accounts set unlinked_at = now() where id = '00000000-0000-0000-0000-000000000302';
insert into public.ad_accounts (id, platform_id, external_id, client_id, name, updated_by)
values ('00000000-0000-0000-0000-000000000303', 'meta', '222', '00000000-0000-0000-0000-0000000003f1', 'Conta B (novo vínculo)', '00000000-0000-0000-0000-0000000003a1');
do $$
begin
  if (select count(*) from public.ad_accounts where external_id = '222') <> 2 then
    raise exception 'FALHOU: histórico do vínculo antigo deveria continuar existindo';
  end if;
end $$;

-- Auditoria usa o autor informado pelo servidor
do $$
begin
  if (select actor_id from public.audit_logs where action = 'ad_account.insert' and target_id = '00000000-0000-0000-0000-000000000301')
     <> '00000000-0000-0000-0000-0000000003a1' then
    raise exception 'FALHOU: auditoria sem autor';
  end if;
  if (select details -> 'unlinked_at' ->> 'before' from public.audit_logs
      where action = 'ad_account.update' and target_id = '00000000-0000-0000-0000-000000000302') is not null then
    raise exception 'FALHOU: auditoria do desvínculo deveria mostrar antes = null';
  end if;
end $$;

-- ---------------------------------------------------------------- visualizador (vê só Cliente A)
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000003c1","role":"authenticated"}';
do $$
begin
  if (select count(*) from public.ad_accounts where unlinked_at is null) <> 2 then
    raise exception 'FALHOU: visualizador deveria ver as 2 contas ativas do Cliente A';
  end if;
  if exists (select 1 from public.ad_accounts where client_id = '00000000-0000-0000-0000-0000000003f2') then
    raise exception 'FALHOU: visualizador vê contas de outro cliente';
  end if;
  if (select count(*) from public.ad_account_assets) <> 1 then raise exception 'FALHOU: visualizador vê páginas de outro cliente'; end if;
  if (select count(*) from public.platform_connections) <> 0 then raise exception 'FALHOU: visualizador vê conexões'; end if;

  begin
    update public.ad_accounts set name = 'x';
    raise exception 'FALHOU: site conseguiu alterar conta de anúncio';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.ad_accounts (platform_id, external_id, client_id, name) values ('meta', '999', '00000000-0000-0000-0000-0000000003f1', 'x');
    raise exception 'FALHOU: site conseguiu vincular conta sem passar pelo servidor';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.connection_secret_get('00000000-0000-0000-0000-0000000003e1');
    raise exception 'FALHOU: usuário leu o token pelo site';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from vault.decrypted_secrets;
    raise exception 'FALHOU: usuário acessou o cofre';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- ---------------------------------------------------------------- cliente (vê só Cliente B, que agora não tem conta ativa)
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000003d1","role":"authenticated"}';
do $$
begin
  if (select count(*) from public.ad_accounts) <> 1 or (select name from public.ad_accounts) <> 'Conta B' then
    raise exception 'FALHOU: usuário cliente deveria ver só o histórico da própria conta';
  end if;
  -- Etapa 20: o estado de sincronização é informação interna (o cliente não vê nem o da própria conta).
  if (select count(*) from public.sync_state) <> 0 then raise exception 'FALHOU: cliente vê sync_state'; end if;
end $$;
reset role;

-- ---------------------------------------------------------------- gestor: vê conexões, mas nunca o id do segredo
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000003b1","role":"authenticated"}';
do $$
begin
  if (select count(*) from public.platform_connections where id = '00000000-0000-0000-0000-0000000003e1') <> 1 then raise exception 'FALHOU: gestor deveria ver a conexão'; end if;
  begin
    perform vault_secret_id from public.platform_connections;
    raise exception 'FALHOU: gestor viu a coluna vault_secret_id';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.platform_connections set status = 'revogada' where id = '00000000-0000-0000-0000-0000000003e1';
    raise exception 'FALHOU: gestor alterou conexão pelo site';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- ---------------------------------------------------------------- apagar o token
select public.connection_secret_delete('00000000-0000-0000-0000-0000000003e1');
do $$
begin
  if public.connection_secret_get('00000000-0000-0000-0000-0000000003e1') is not null then
    raise exception 'FALHOU: token continua no cofre após desconectar';
  end if;
end $$;

rollback;

select 'TODOS OS TESTES PASSARAM' as resultado;
