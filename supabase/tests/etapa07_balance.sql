-- =============================================================================
-- Testes da Etapa 7 — saldo das contas (account_balances + fotografias)
-- Rodar inteiro no SQL Editor. Transação desfeita no final: nada fica gravado.
-- =============================================================================
begin;

insert into auth.users (id, instance_id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000007a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@t7.local'),
  ('00000000-0000-0000-0000-0000000007c1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'gestor@t7.local');
update public.profiles set active = true, role = 'admin' where id = '00000000-0000-0000-0000-0000000007a1';
update public.profiles set active = true, role = 'gestor' where id = '00000000-0000-0000-0000-0000000007c1';

insert into public.clients (id, name) values
  ('00000000-0000-0000-0000-0000000007f1', 'Excalibur Fitness'),
  ('00000000-0000-0000-0000-0000000007f2', 'Loja Internacional');
delete from public.user_client_access where user_id = '00000000-0000-0000-0000-0000000007c1';
insert into public.user_client_access (user_id, client_id) values ('00000000-0000-0000-0000-0000000007c1', '00000000-0000-0000-0000-0000000007f1');

insert into public.ad_accounts (id, platform_id, external_id, client_id, name, currency, timezone, status) values
  ('00000000-0000-0000-0000-000000000701', 'meta',   '711',        '00000000-0000-0000-0000-0000000007f1', 'Excalibur Meta',   'BRL', 'America/Sao_Paulo', 'ativa'),
  ('00000000-0000-0000-0000-000000000702', 'google', '7223334445', '00000000-0000-0000-0000-0000000007f1', 'Excalibur Google', 'BRL', 'America/Sao_Paulo', 'ativa'),
  ('00000000-0000-0000-0000-000000000704', 'google', '7445556667', '00000000-0000-0000-0000-0000000007f2', 'Loja US',          'USD', 'America/New_York',  'pagamento_pendente');

-- Duas fotografias da conta Meta: vale a mais recente
insert into public.account_snapshots (ad_account_id, client_id, platform_id, status, currency, captured_at, spend_cap_micros, amount_spent_micros, available_micros, available_basis, funding_description, issues) values
  ('00000000-0000-0000-0000-000000000701', '00000000-0000-0000-0000-0000000007f1', 'meta', 'ativa', 'BRL', now() - interval '2 days', 1000000000, 100000000, 900000000, 'meta_spend_cap', null, '{}'),
  ('00000000-0000-0000-0000-000000000701', '00000000-0000-0000-0000-0000000007f1', 'meta', 'ativa', 'BRL', now() - interval '1 hour', 1000000000, 700000000, 300000000, 'meta_spend_cap', 'Visa final 1234', '{}'),
  ('00000000-0000-0000-0000-000000000704', '00000000-0000-0000-0000-0000000007f2', 'google', 'pagamento_pendente', 'USD', now(), null, null, null, null, null, '{pagamento_pendente}');

-- Gasto dos últimos 7 dias completos (no fuso da conta): 2 dias, R$ 200 no total; hoje não conta
select public.ingest_metrics_daily(jsonb_build_array(
  jsonb_build_object('date', ((now() at time zone 'America/Sao_Paulo')::date - 1)::text, 'ad_account_id','00000000-0000-0000-0000-000000000701','level','account','entity_external_id','711','spend_micros',150000000),
  jsonb_build_object('date', ((now() at time zone 'America/Sao_Paulo')::date - 3)::text, 'ad_account_id','00000000-0000-0000-0000-000000000701','level','account','entity_external_id','711','spend_micros',50000000),
  jsonb_build_object('date', ((now() at time zone 'America/Sao_Paulo')::date)::text,     'ad_account_id','00000000-0000-0000-0000-000000000701','level','account','entity_external_id','711','spend_micros',999000000),
  jsonb_build_object('date', ((now() at time zone 'America/Sao_Paulo')::date - 9)::text, 'ad_account_id','00000000-0000-0000-0000-000000000701','level','account','entity_external_id','711','spend_micros',999000000)
));

-- Problema desconhecido é recusado pelo banco
do $$
begin
  insert into public.account_snapshots (ad_account_id, client_id, platform_id, status, issues)
  values ('00000000-0000-0000-0000-000000000701', '00000000-0000-0000-0000-0000000007f1', 'meta', 'ativa', '{inventado}');
  raise exception 'FALHOU: problema desconhecido aceito';
exception when check_violation then null;
end $$;

-- ---------------------------------------------------------------- administrador
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000007a1","role":"authenticated"}';
do $$
declare b record;
begin
  if (select count(*) from public.account_balances()) <> 3 then raise exception 'FALHOU: admin deveria ver 3 contas'; end if;

  select * into b from public.account_balances() where ad_account_id = '00000000-0000-0000-0000-000000000701';
  if b.available_micros <> 300000000 or b.funding_description <> 'Visa final 1234' then raise exception 'FALHOU: não usou a fotografia mais recente'; end if;
  if b.spend_last_7_days_micros <> 200000000 or b.spend_days <> 2 then
    raise exception 'FALHOU: gasto dos últimos 7 dias = % em % dias (hoje e dias antigos não contam)', b.spend_last_7_days_micros, b.spend_days;
  end if;
  if b.low_balance_days <> 3 or b.low_balance_amount_micros is not null then raise exception 'FALHOU: limite padrão de alerta'; end if;

  -- Conta sem fotografia: tudo "não disponível", sem erro
  select * into b from public.account_balances() where ad_account_id = '00000000-0000-0000-0000-000000000702';
  if b.captured_at is not null or b.available_micros is not null or b.issues <> '{}' or b.spend_days <> 0 then raise exception 'FALHOU: conta sem fotografia'; end if;

  select * into b from public.account_balances() where ad_account_id = '00000000-0000-0000-0000-000000000704';
  if b.issues <> '{pagamento_pendente}' or b.currency <> 'USD' then raise exception 'FALHOU: problema de cobrança da conta US'; end if;

  if (select count(*) from public.account_balances(null, array['google'])) <> 2 then raise exception 'FALHOU: filtro por plataforma'; end if;
  if (select count(*) from public.account_balances(array['00000000-0000-0000-0000-0000000007f2']::uuid[])) <> 1 then raise exception 'FALHOU: filtro por cliente'; end if;

  -- O site não grava fotografias nem limites de alerta (só o servidor)
  begin
    insert into public.account_snapshots (ad_account_id, client_id, platform_id, status)
    values ('00000000-0000-0000-0000-000000000701', '00000000-0000-0000-0000-0000000007f1', 'meta', 'ativa');
    raise exception 'FALHOU: site gravou fotografia';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.ad_accounts set low_balance_days = 10 where id = '00000000-0000-0000-0000-000000000701';
    if found then raise exception 'FALHOU: site alterou limite de alerta'; end if;
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- ---------------------------------------------------------------- gestor
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000007c1","role":"authenticated"}';
do $$
begin
  if (select count(*) from public.account_balances()) <> 2 then raise exception 'FALHOU: gestor deveria ver só as 2 contas do cliente liberado'; end if;
  if exists (select 1 from public.account_balances(array['00000000-0000-0000-0000-0000000007f2']::uuid[])) then
    raise exception 'FALHOU: gestor viu saldo de cliente não liberado';
  end if;
end $$;
reset role;

set local role anon;
do $$
begin
  perform public.account_balances();
  raise exception 'FALHOU: anônimo consultou saldos';
exception when insufficient_privilege then null;
end $$;
reset role;

rollback;

select 'TODOS OS TESTES PASSARAM' as resultado;
