-- =============================================================================
-- Testes da correção de 13/10/2026 — saldo PIX informado no CRM.
-- Só a conta marcada (CA - Estilo de Ser Kids) usa o saldo informado; as demais não mudam.
-- disponível = partida ("saldo atual" ou 1ª recarga) + recargas depois − gasto depois.
-- Rodar inteiro no SQL Editor. Transação desfeita no final: nada fica gravado.
-- (Usa a conta real só dentro da transação; o gasto de hoje é alterado só aqui.)
-- =============================================================================
begin;
insert into auth.users (id, instance_id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000013a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@pix.local'),
  ('00000000-0000-0000-0000-0000000013a2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'operador@pix.local'),
  ('00000000-0000-0000-0000-0000000013a3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cliente@pix.local');
update public.profiles set active = true, role = 'admin'    where id = '00000000-0000-0000-0000-0000000013a1';
update public.profiles set active = true, role = 'operador' where id = '00000000-0000-0000-0000-0000000013a2';
update public.profiles set active = true, role = 'cliente'  where id = '00000000-0000-0000-0000-0000000013a3';

create temp table r (what text, v text);
grant all on r to authenticated;

create function pg_temp.acc() returns uuid language sql as $$
  select id from public.ad_accounts where platform_id = 'meta' and external_id = '920458724035388' $$;
create function pg_temp.avail() returns text language sql as $$
  select coalesce((available_micros / 1000000)::text, 'nulo') || '|' || coalesce(available_basis, 'nulo') || '|' || array_to_string(issues, ',')
  from public.account_balances(null, null, array[pg_temp.acc()]) $$;
-- Simula gasto novo hoje (fuso da conta).
create function pg_temp.spend(p_reais int) returns void language sql as $$
  update public.metrics_daily set spend_micros = spend_micros + p_reais * 1000000::bigint
   where ad_account_id = pg_temp.acc() and level = 'account'
     and date = (now() at time zone coalesce((select timezone from public.ad_accounts where id = pg_temp.acc()), 'America/Sao_Paulo'))::date $$;
grant execute on function pg_temp.acc(), pg_temp.avail(), pg_temp.spend(int) to authenticated;

insert into r select 'conta marcada', (select manual_prepaid::text from public.ad_accounts where id = pg_temp.acc());
insert into r select 'outras contas sem marcação', (select count(*)::text from public.ad_accounts where manual_prepaid and id <> pg_temp.acc());
insert into r select 'existe gasto de hoje', (select count(*)::text from public.metrics_daily
  where ad_account_id = pg_temp.acc() and level = 'account'
    and date = (now() at time zone coalesce((select timezone from public.ad_accounts where id = pg_temp.acc()), 'America/Sao_Paulo'))::date);
insert into r select 'antes de informar', pg_temp.avail();

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000013a1","role":"authenticated"}';
select public.manual_balance_add(pg_temp.acc(), 'recarga', 500000000, 'PIX teste');
insert into r select 'recarga 500', pg_temp.avail();
reset role;
select pg_temp.spend(30);
set local role authenticated;
insert into r select 'gastou 30', pg_temp.avail();
select public.manual_balance_add(pg_temp.acc(), 'saldo', 1000000000, 'conferido no Meta');
insert into r select 'saldo atual 1000 (nova partida)', pg_temp.avail();
select public.manual_balance_add(pg_temp.acc(), 'recarga', 200000000, null);
insert into r select 'mais recarga 200', pg_temp.avail();
select public.manual_balance_void((select max(id) from public.account_manual_balance_entries where ad_account_id = pg_temp.acc()), 'digitado errado');
insert into r select 'recarga 200 cancelada', pg_temp.avail();
insert into r select 'cancelado continua na lista', (select (public.manual_balance_status(pg_temp.acc()) -> 'entries' -> 0 ->> 'void_reason'));
insert into r select 'situação: gasto desde a partida', (select (public.manual_balance_status(pg_temp.acc()) ->> 'spent_micros'));
reset role;
select pg_temp.spend(1200);
set local role authenticated;
insert into r select 'gastou mais que o saldo', pg_temp.avail();
reset role;
insert into r select 'alerta sem saldo', (select count(*)::text from private.alert_candidates() where alert_key = 'sem_saldo:' || pg_temp.acc());
set local role authenticated;

do $$ begin
  perform public.manual_balance_add(pg_temp.acc(), 'recarga', 0, null);
  insert into r values ('recarga zero', 'aceitou');
exception when others then insert into r values ('recarga zero', 'recusou'); end $$;
do $$ begin
  perform public.manual_balance_add((select id from public.ad_accounts where platform_id = 'meta' and not manual_prepaid and unlinked_at is null limit 1), 'recarga', 1000000, null);
  insert into r values ('conta não marcada', 'aceitou');
exception when others then insert into r values ('conta não marcada', 'recusou'); end $$;

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000013a2","role":"authenticated"}';
do $$ begin
  perform public.manual_balance_add(pg_temp.acc(), 'recarga', 1000000, null);
  insert into r values ('operador informa', 'aceitou');
exception when others then insert into r values ('operador informa', 'recusou'); end $$;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000013a3","role":"authenticated"}';
do $$ begin
  perform public.manual_balance_status(pg_temp.acc());
  insert into r values ('cliente vê situação', 'aceitou');
exception when others then insert into r values ('cliente vê situação', 'recusou'); end $$;
insert into r select 'cliente lê a tabela', (select count(*)::text from public.account_manual_balance_entries);
reset role;

insert into r select 'registro na auditoria', (select count(*)::text from public.audit_logs
  where target_id = pg_temp.acc()::text and action like 'balance.manual.%' and actor_id = '00000000-0000-0000-0000-0000000013a1');
insert into r select 'outra conta não muda (cartão)', (select coalesce(available_basis, 'nulo') from public.account_balances(null, array['meta'])
  where client_name = 'Golfinho Moda Praia' limit 1);

do $$
declare
  e jsonb := jsonb_build_object(
    'conta marcada', 'true',
    'outras contas sem marcação', '0',
    'existe gasto de hoje', '1',
    'antes de informar', 'nulo|manual_prepaid|',
    'recarga 500', '500|manual_prepaid|',
    'gastou 30', '470|manual_prepaid|',
    'saldo atual 1000 (nova partida)', '1000|manual_prepaid|',
    'mais recarga 200', '1200|manual_prepaid|',
    'recarga 200 cancelada', '1000|manual_prepaid|',
    'cancelado continua na lista', 'digitado errado',
    'situação: gasto desde a partida', '0',
    'gastou mais que o saldo', '0|manual_prepaid|sem_saldo',
    'alerta sem saldo', '1',
    'recarga zero', 'recusou',
    'conta não marcada', 'recusou',
    'operador informa', 'recusou',
    'cliente vê situação', 'recusou',
    'cliente lê a tabela', '0',
    'registro na auditoria', '4',
    'outra conta não muda (cartão)', 'meta_card');
  x record;
begin
  for x in select * from r loop
    if e ->> x.what is distinct from x.v then raise exception 'FALHOU: % = % (esperado %)', x.what, x.v, e ->> x.what; end if;
  end loop;
  if (select count(*) from r) <> (select count(*) from jsonb_object_keys(e)) then raise exception 'FALHOU: faltou verificação'; end if;
  raise notice 'Saldo PIX informado: % verificações OK', (select count(*) from r);
end $$;

rollback;
