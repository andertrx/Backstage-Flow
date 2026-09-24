-- =============================================================================
-- Testes da Etapa 16 — Sincronização (sync_claim_due / sync_lock / sync_overview)
-- Rodar inteiro no SQL Editor. Transação desfeita no final: nada fica gravado.
-- =============================================================================
begin;

insert into auth.users (id, instance_id, aud, role, email) values
  ('00000000-0000-0000-0000-000000016a01', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@t16.local'),
  ('00000000-0000-0000-0000-000000016a02', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'gestor@t16.local'),
  ('00000000-0000-0000-0000-000000016a03', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cliente@t16.local');
update public.profiles set active = true, role = 'admin' where id = '00000000-0000-0000-0000-000000016a01';
update public.profiles set active = true, role = 'gestor' where id = '00000000-0000-0000-0000-000000016a02';
update public.profiles set active = true, role = 'cliente' where id = '00000000-0000-0000-0000-000000016a03';

insert into public.clients (id, name) values
  ('00000000-0000-0000-0000-000000016c01', 'Cliente Liberado T16'),
  ('00000000-0000-0000-0000-000000016c02', 'Cliente Bloqueado T16');
insert into public.user_client_access (user_id, client_id) values
  ('00000000-0000-0000-0000-000000016a02', '00000000-0000-0000-0000-000000016c01'),
  ('00000000-0000-0000-0000-000000016a03', '00000000-0000-0000-0000-000000016c01');

insert into public.platform_connections (id, platform_id, label, status) values
  ('00000000-0000-0000-0000-000000016b01', 'meta', 'Conexão ativa T16', 'ativa'),
  ('00000000-0000-0000-0000-000000016b02', 'meta', 'Conexão revogada T16', 'revogada');

insert into public.ad_accounts (id, platform_id, external_id, client_id, connection_id, name, currency, is_test_account, unlinked_at) values
  -- 1: na vez (nunca sincronizou)          2: próxima só daqui 1 hora
  -- 3: conta de teste (fica fora)          4: conexão revogada (fica fora)
  -- 5: sem conexão (fica fora)             6: desvinculada (fica fora)
  -- 7: cliente bloqueado, na vez
  ('00000000-0000-0000-0000-000000016001', 'meta', 't16-1', '00000000-0000-0000-0000-000000016c01', '00000000-0000-0000-0000-000000016b01', 'Na vez',        'BRL', false, null),
  ('00000000-0000-0000-0000-000000016002', 'meta', 't16-2', '00000000-0000-0000-0000-000000016c01', '00000000-0000-0000-0000-000000016b01', 'Mais tarde',    'BRL', false, null),
  ('00000000-0000-0000-0000-000000016003', 'meta', 't16-3', '00000000-0000-0000-0000-000000016c01', '00000000-0000-0000-0000-000000016b01', 'Teste',         'BRL', true,  null),
  ('00000000-0000-0000-0000-000000016004', 'meta', 't16-4', '00000000-0000-0000-0000-000000016c01', '00000000-0000-0000-0000-000000016b02', 'Revogada',      'BRL', false, null),
  ('00000000-0000-0000-0000-000000016005', 'meta', 't16-5', '00000000-0000-0000-0000-000000016c01', null,                                   'Sem conexão',   'BRL', false, null),
  ('00000000-0000-0000-0000-000000016006', 'meta', 't16-6', '00000000-0000-0000-0000-000000016c01', '00000000-0000-0000-0000-000000016b01', 'Desvinculada',  'BRL', false, now()),
  ('00000000-0000-0000-0000-000000016007', 'meta', 't16-7', '00000000-0000-0000-0000-000000016c02', '00000000-0000-0000-0000-000000016b01', 'Outro cliente', 'USD', false, null);

insert into public.sync_state (ad_account_id, status, last_success_at, next_run_at) values
  ('00000000-0000-0000-0000-000000016002', 'sucesso', now() - interval '5 minutes', now() + interval '55 minutes');

insert into public.sync_runs (ad_account_id, client_id, platform_id, trigger, status, started_at, finished_at, duration_ms, records_updated) values
  ('00000000-0000-0000-0000-000000016002', '00000000-0000-0000-0000-000000016c01', 'meta', 'agendada', 'sucesso', now() - interval '6 minutes', now() - interval '5 minutes', 60000, 321),
  ('00000000-0000-0000-0000-000000016007', '00000000-0000-0000-0000-000000016c02', 'meta', 'agendada', 'erro',    now() - interval '6 minutes', now() - interval '5 minutes', 1000, 0);

-- ---------------------------------------------------------------- agendador (chave de serviço)
do $$
declare
  ids uuid[];
  again uuid[];
  n int;
begin
  -- Log: "executando" não pode ter fim; terminado precisa ter fim.
  begin
    insert into public.sync_runs (ad_account_id, client_id, platform_id, trigger, status, finished_at)
    values ('00000000-0000-0000-0000-000000016001', '00000000-0000-0000-0000-000000016c01', 'meta', 'manual', 'executando', now());
    raise exception 'FALHOU: aceitou "executando" com fim';
  exception when check_violation then null;
  end;

  select array_agg(x) into ids from public.sync_claim_due(20) x;
  ids := coalesce(ids, '{}');
  if not ('00000000-0000-0000-0000-000000016001'::uuid = any (ids)) then raise exception 'FALHOU: conta na vez não foi escolhida'; end if;
  if not ('00000000-0000-0000-0000-000000016007'::uuid = any (ids)) then raise exception 'FALHOU: conta de outro cliente na vez não foi escolhida'; end if;
  if '00000000-0000-0000-0000-000000016002'::uuid = any (ids) then raise exception 'FALHOU: pegou conta que só roda daqui 1 hora'; end if;
  if '00000000-0000-0000-0000-000000016003'::uuid = any (ids) then raise exception 'FALHOU: pegou conta de teste'; end if;
  if '00000000-0000-0000-0000-000000016004'::uuid = any (ids) then raise exception 'FALHOU: pegou conta com conexão revogada'; end if;
  if '00000000-0000-0000-0000-000000016005'::uuid = any (ids) then raise exception 'FALHOU: pegou conta sem conexão'; end if;
  if '00000000-0000-0000-0000-000000016006'::uuid = any (ids) then raise exception 'FALHOU: pegou conta desvinculada'; end if;

  -- Trava: marcada como executando, com prazo
  select count(*) into n from public.sync_state
  where ad_account_id = '00000000-0000-0000-0000-000000016001' and status = 'executando'
    and locked_until > now() + interval '14 minutes' and last_attempt_at is not null;
  if n <> 1 then raise exception 'FALHOU: trava não registrada'; end if;

  -- Chamando de novo, a conta travada não volta (sem sincronizar em dobro)
  select array_agg(x) into again from public.sync_claim_due(20) x;
  if '00000000-0000-0000-0000-000000016001'::uuid = any (coalesce(again, '{}')) then raise exception 'FALHOU: conta travada escolhida duas vezes'; end if;

  -- "Sincronizar agora": a travada fica de fora; a livre (mesmo fora da vez) é travada
  select array_agg(x) into again from public.sync_lock(array['00000000-0000-0000-0000-000000016001', '00000000-0000-0000-0000-000000016002']::uuid[]) x;
  if again is distinct from array['00000000-0000-0000-0000-000000016002']::uuid[] then raise exception 'FALHOU: sync_lock (%)', again; end if;

  -- Toda conta vinculada ganhou linha de estado
  select count(*) into n from public.sync_state where ad_account_id in (
    '00000000-0000-0000-0000-000000016003', '00000000-0000-0000-0000-000000016005');
  if n <> 2 then raise exception 'FALHOU: estado não criado para contas antigas (%)', n; end if;

  -- Senha interna do agendador
  if public.sync_cron_secret_ok('senha-errada-senha-errada-senha-errada-123') then raise exception 'FALHOU: aceitou senha errada'; end if;
  if public.sync_cron_secret_ok('') or public.sync_cron_secret_ok(null) then raise exception 'FALHOU: aceitou senha vazia'; end if;
  if not public.sync_cron_secret_ok((select decrypted_secret from vault.decrypted_secrets where name = 'sync_cron_secret')) then
    raise exception 'FALHOU: recusou a senha certa';
  end if;

  -- Agendamento existe (a cada 5 minutos)
  if not exists (select 1 from cron.job where jobname = 'scheduled-sync' and schedule = '*/5 * * * *') then
    raise exception 'FALHOU: agendamento não encontrado';
  end if;
end $$;

-- ---------------------------------------------------------------- admin
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000016a01","role":"authenticated"}';
do $$
declare
  n int;
  r record;
begin
  select count(*) into n from public.sync_overview() where client_id in ('00000000-0000-0000-0000-000000016c01', '00000000-0000-0000-0000-000000016c02');
  if n <> 6 then raise exception 'FALHOU: admin deveria ver 6 contas vinculadas (viu %)', n; end if;
  select * into r from public.sync_overview() where ad_account_id = '00000000-0000-0000-0000-000000016002';
  if r.run_status <> 'sucesso' or r.run_records <> 321 or r.run_duration_ms <> 60000 or not r.running then
    raise exception 'FALHOU: último resultado da conta (%)', r;
  end if;
  select * into r from public.sync_overview() where ad_account_id = '00000000-0000-0000-0000-000000016005';
  if r.has_connection or r.run_status is not null then raise exception 'FALHOU: conta sem conexão (%)', r; end if;
  -- Funções do servidor fechadas para usuários
  begin
    perform public.sync_claim_due(1);
    raise exception 'FALHOU: usuário chamou sync_claim_due';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.sync_cron_secret_ok('x');
    raise exception 'FALHOU: usuário chamou sync_cron_secret_ok';
  exception when insufficient_privilege then null;
  end;
  -- Log só leitura
  begin
    insert into public.sync_runs (ad_account_id, client_id, platform_id, trigger) values
      ('00000000-0000-0000-0000-000000016001', '00000000-0000-0000-0000-000000016c01', 'meta', 'manual');
    raise exception 'FALHOU: usuário gravou no log';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- ---------------------------------------------------------------- gestor (só o cliente liberado)
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000016a02","role":"authenticated"}';
do $$
declare
  n int;
begin
  select count(*) into n from public.sync_overview() where client_id = '00000000-0000-0000-0000-000000016c02';
  if n <> 0 then raise exception 'FALHOU: gestor viu conta de cliente bloqueado'; end if;
  select count(*) into n from public.sync_overview() where client_id = '00000000-0000-0000-0000-000000016c01';
  if n <> 5 then raise exception 'FALHOU: gestor deveria ver 5 contas (viu %)', n; end if;
  select count(*) into n from public.sync_runs where client_id in ('00000000-0000-0000-0000-000000016c01', '00000000-0000-0000-0000-000000016c02');
  if n <> 1 then raise exception 'FALHOU: gestor deveria ver 1 registro do log (viu %)', n; end if;
end $$;
reset role;

-- ---------------------------------------------------------------- cliente (não vê o log interno)
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000016a03","role":"authenticated"}';
do $$
declare
  n int;
begin
  select count(*) into n from public.sync_runs;
  if n <> 0 then raise exception 'FALHOU: cliente viu o log de sincronização'; end if;
  select count(*) into n from public.sync_overview() where run_status is not null;
  if n <> 0 then raise exception 'FALHOU: cliente viu resultado de sincronização'; end if;
end $$;
reset role;

-- ---------------------------------------------------------------- visitante sem login
set local role anon;
do $$
begin
  begin
    perform 1 from public.sync_runs limit 1;
    raise exception 'FALHOU: visitante leu o log';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.sync_overview();
    raise exception 'FALHOU: visitante chamou sync_overview';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

rollback;

select 'TODOS OS TESTES PASSARAM' as resultado;
