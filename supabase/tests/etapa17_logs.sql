-- =============================================================================
-- Testes da Etapa 17 — Logs (auditoria sem ruído, login/logout, audit_log_list)
-- Rodar inteiro no SQL Editor. Transação desfeita no final: nada fica gravado.
-- =============================================================================
begin;

insert into auth.users (id, instance_id, aud, role, email) values
  ('00000000-0000-0000-0000-000000017a01', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@t17.local'),
  ('00000000-0000-0000-0000-000000017a02', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'gestor@t17.local');
update public.profiles set active = true, role = 'admin', full_name = 'Admin T17' where id = '00000000-0000-0000-0000-000000017a01';
update public.profiles set active = true, role = 'gestor' where id = '00000000-0000-0000-0000-000000017a02';

insert into public.clients (id, name) values ('00000000-0000-0000-0000-000000017c01', 'Cliente T17');
insert into public.platform_connections (id, platform_id, label, status, vault_secret_id) values
  ('00000000-0000-0000-0000-000000017b01', 'meta', 'Conexão T17', 'ativa', gen_random_uuid());
insert into public.ad_accounts (id, platform_id, external_id, client_id, connection_id, name, currency, status) values
  ('00000000-0000-0000-0000-000000017001', 'meta', 't17-1', '00000000-0000-0000-0000-000000017c01', '00000000-0000-0000-0000-000000017b01', 'Conta T17', 'BRL', 'ativa');

-- ---------------------------------------------------------------- auditoria sem ruído (servidor)
do $$
declare
  n int;
begin
  -- Sincronização de hora em hora: só a data de verificação muda → nada é registrado
  update public.ad_accounts set details_updated_at = now() where id = '00000000-0000-0000-0000-000000017001';
  update public.platform_connections set last_checked_at = now() where id = '00000000-0000-0000-0000-000000017b01';
  select count(*) into n from public.audit_logs
  where action in ('ad_account.update', 'connection.update')
    and target_id in ('00000000-0000-0000-0000-000000017001', '00000000-0000-0000-0000-000000017b01');
  if n <> 0 then raise exception 'FALHOU: verificação automática gerou % registro(s)', n; end if;

  -- Mudança de verdade continua registrada
  update public.ad_accounts set status = 'pagamento_pendente', details_updated_at = now() where id = '00000000-0000-0000-0000-000000017001';
  select count(*) into n from public.audit_logs
  where action = 'ad_account.update' and target_id = '00000000-0000-0000-0000-000000017001'
    and details ? 'status' and not details ? 'details_updated_at';
  if n <> 1 then raise exception 'FALHOU: mudança de status não registrada (%)', n; end if;
end $$;

-- ---------------------------------------------------------------- login / logout (gestor)
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000017a02","role":"authenticated"}';
do $$
declare
  n int;
begin
  perform public.log_auth_event('login');
  perform public.log_auth_event('login'); -- repetido em menos de 1 minuto: conta uma vez
  perform public.log_auth_event('logout');
  begin
    perform public.log_auth_event('apagar_tudo');
    raise exception 'FALHOU: aceitou evento inválido';
  exception when invalid_parameter_value then null;
  end;
  -- Gestor não lê a auditoria (só admin)
  select count(*) into n from public.audit_log_list();
  if n <> 0 then raise exception 'FALHOU: gestor leu a auditoria (% linhas)', n; end if;
  -- E não grava direto na tabela
  begin
    insert into public.audit_logs (actor_id, action, target_type) values ('00000000-0000-0000-0000-000000017a02', 'auth.login', 'user');
    raise exception 'FALHOU: gravou direto na auditoria';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- ---------------------------------------------------------------- admin lê a lista
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000017a01","role":"authenticated"}';
do $$
declare
  n int;
  r record;
begin
  select count(*) into n from public.audit_log_list(p_actor => '00000000-0000-0000-0000-000000017a02');
  if n <> 2 then raise exception 'FALHOU: esperava login + logout do gestor (%)', n; end if;

  select * into r from public.audit_log_list(p_actor => '00000000-0000-0000-0000-000000017a02', p_category => 'auth') where action = 'auth.login';
  if r.actor_email <> 'gestor@t17.local' or r.target_label <> 'gestor@t17.local' then raise exception 'FALHOU: nomes do login (%)', r; end if;

  select count(*) into n from public.audit_log_list(p_actor => '00000000-0000-0000-0000-000000017a02', p_category => 'user');
  if n <> 0 then raise exception 'FALHOU: categoria "usuários" misturou logins (%)', n; end if;

  select * into r from public.audit_log_list(p_category => 'ad_account') where target_id = '00000000-0000-0000-0000-000000017001' and action = 'ad_account.update';
  if r.target_label <> 'Conta T17' then raise exception 'FALHOU: nome da conta (%)', r.target_label; end if;

  -- Campos de credencial nunca aparecem
  select * into r from public.audit_log_list(p_category => 'connection') where target_id = '00000000-0000-0000-0000-000000017b01' and action = 'connection.insert';
  if r.details ? 'vault_secret_id' or not r.details ? 'label' then raise exception 'FALHOU: detalhes da conexão (%)', r.details; end if;
  if r.target_label <> 'Conexão T17' then raise exception 'FALHOU: nome da conexão'; end if;

  -- Paginação: "carregar mais" continua de onde parou, sem repetir
  select count(*) into n from (
    select id from public.audit_log_list(p_limit => 1)
    intersect
    select id from public.audit_log_list(p_before_id => (select max(id) from public.audit_log_list(p_limit => 1)), p_limit => 5)
  ) x;
  if n <> 0 then raise exception 'FALHOU: paginação repetiu linhas'; end if;
end $$;
reset role;

-- ---------------------------------------------------------------- visitante sem login
set local role anon;
do $$
begin
  begin
    perform public.log_auth_event('login');
    raise exception 'FALHOU: visitante registrou login';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.audit_log_list();
    raise exception 'FALHOU: visitante leu a auditoria';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

rollback;

select 'TODOS OS TESTES PASSARAM' as resultado;
