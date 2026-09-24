-- =============================================================================
-- Testes da Etapa 8 — saúde das contas (account_health)
-- Rodar inteiro no SQL Editor. Transação desfeita no final: nada fica gravado.
-- =============================================================================
begin;

insert into auth.users (id, instance_id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000008a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'gestor@t8.local'),
  ('00000000-0000-0000-0000-0000000008c1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'visual@t8.local');
update public.profiles set active = true, role = 'gestor' where id = '00000000-0000-0000-0000-0000000008a1';
update public.profiles set active = true, role = 'visualizador' where id = '00000000-0000-0000-0000-0000000008c1';

insert into public.clients (id, name) values
  ('00000000-0000-0000-0000-0000000008f1', 'Excalibur Fitness'),
  ('00000000-0000-0000-0000-0000000008f2', 'Loja Internacional');
delete from public.user_client_access where user_id in ('00000000-0000-0000-0000-0000000008a1', '00000000-0000-0000-0000-0000000008c1');
insert into public.user_client_access (user_id, client_id) values
  ('00000000-0000-0000-0000-0000000008a1', '00000000-0000-0000-0000-0000000008f1'),
  ('00000000-0000-0000-0000-0000000008c1', '00000000-0000-0000-0000-0000000008f1');

insert into public.platform_connections (id, platform_id, label, status, last_error, external_user_id) values
  ('00000000-0000-0000-0000-0000000008e1', 'meta', 'BM teste', 'erro', 'O token do Meta expirou.', 'su-t8');

insert into public.ad_accounts (id, platform_id, external_id, client_id, name, currency, status, connection_id) values
  ('00000000-0000-0000-0000-000000000801', 'meta', '811', '00000000-0000-0000-0000-0000000008f1', 'Excalibur Meta', 'BRL', 'ativa', '00000000-0000-0000-0000-0000000008e1'),
  ('00000000-0000-0000-0000-000000000802', 'meta', '812', '00000000-0000-0000-0000-0000000008f2', 'Loja Meta', 'BRL', 'restrita', null);
insert into public.sync_state (ad_account_id, status, last_success_at, last_error_message) values
  ('00000000-0000-0000-0000-000000000801', 'erro', now() - interval '3 days', 'Falha ao buscar métricas.');

-- ---------------------------------------------------------------- gestor
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000008a1","role":"authenticated"}';
do $$
declare h record;
begin
  if (select count(*) from public.account_health()) <> 1 then raise exception 'FALHOU: gestor deveria ver só a conta do cliente liberado'; end if;
  select * into h from public.account_health();
  if h.sync_status <> 'erro' or h.last_error_message <> 'Falha ao buscar métricas.' or h.last_success_at is null then raise exception 'FALHOU: dados da sincronização'; end if;
  if h.connection_status <> 'erro' or h.connection_error <> 'O token do Meta expirou.' then raise exception 'FALHOU: gestor deveria ver o erro da conexão'; end if;
  if h.client_name <> 'Excalibur Fitness' or h.issues <> '{}' then raise exception 'FALHOU: dados básicos'; end if;
end $$;
reset role;

-- ---------------------------------------------------------------- visualizador: vê a conta, mas não a conexão
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000008c1","role":"authenticated"}';
do $$
declare h record;
begin
  select * into h from public.account_health();
  if h.ad_account_id is null then raise exception 'FALHOU: visualizador deveria ver a conta liberada'; end if;
  if h.connection_status is not null or h.connection_error is not null then raise exception 'FALHOU: visualizador viu dados da conexão'; end if;
  if h.connection_id is null then raise exception 'FALHOU: connection_id some e a conta pareceria sem conexão'; end if;
end $$;
reset role;

set local role anon;
do $$
begin
  perform public.account_health();
  raise exception 'FALHOU: anônimo consultou a saúde das contas';
exception when insufficient_privilege then null;
end $$;
reset role;

rollback;

select 'TODOS OS TESTES PASSARAM' as resultado;
