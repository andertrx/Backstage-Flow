-- =============================================================================
-- Testes da Etapa 6 — resumo do Dashboard principal (dashboard_summary)
-- Rodar inteiro no SQL Editor. Transação desfeita no final: nada fica gravado.
-- =============================================================================
begin;

-- ---------------------------------------------------------------- cenário
insert into auth.users (id, instance_id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000006a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@t6.local'),
  ('00000000-0000-0000-0000-0000000006c1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'gestor@t6.local');
update public.profiles set active = true, role = 'admin' where id = '00000000-0000-0000-0000-0000000006a1';
update public.profiles set active = true, role = 'gestor' where id = '00000000-0000-0000-0000-0000000006c1';

insert into public.clients (id, name) values
  ('00000000-0000-0000-0000-0000000006f1', 'Excalibur Fitness'),
  ('00000000-0000-0000-0000-0000000006f2', 'Loja Internacional');
delete from public.user_client_access where user_id = '00000000-0000-0000-0000-0000000006c1';
insert into public.user_client_access (user_id, client_id) values
  ('00000000-0000-0000-0000-0000000006c1', '00000000-0000-0000-0000-0000000006f1');

insert into public.ad_accounts (id, platform_id, external_id, client_id, name, currency, status) values
  ('00000000-0000-0000-0000-000000000601', 'meta',   '611',        '00000000-0000-0000-0000-0000000006f1', 'Excalibur Meta',   'BRL', 'ativa'),
  ('00000000-0000-0000-0000-000000000602', 'google', '6223334445', '00000000-0000-0000-0000-0000000006f1', 'Excalibur Google', 'BRL', 'ativa'),
  ('00000000-0000-0000-0000-000000000604', 'google', '6445556667', '00000000-0000-0000-0000-0000000006f2', 'Loja US',          'USD', 'ativa');

insert into public.campaigns (id, ad_account_id, client_id, platform_id, external_id, name, status) values
  ('00000000-0000-0000-0000-0000000006d1', '00000000-0000-0000-0000-000000000601', '00000000-0000-0000-0000-0000000006f1', 'meta', '9601', 'Leads', 'ativa'),
  ('00000000-0000-0000-0000-0000000006d2', '00000000-0000-0000-0000-000000000601', '00000000-0000-0000-0000-0000000006f1', 'meta', '9602', 'Remarketing', 'pausada');

select public.ingest_metrics_daily(jsonb_build_array(
  -- Nível conta (total oficial): Meta R$ 300 em 2 dias, Google R$ 50
  jsonb_build_object('date','2026-09-10','ad_account_id','00000000-0000-0000-0000-000000000601','level','account','entity_external_id','611',
    'spend_micros',100000000,'impressions',10000,'clicks',200,'leads',10,'messages',4,'conversions',10,'conversion_value_micros',400000000),
  jsonb_build_object('date','2026-09-11','ad_account_id','00000000-0000-0000-0000-000000000601','level','account','entity_external_id','611',
    'spend_micros',200000000,'impressions',20000,'clicks',400,'leads',20,'messages',6,'conversions',20,'conversion_value_micros',500000000),
  jsonb_build_object('date','2026-09-10','ad_account_id','00000000-0000-0000-0000-000000000602','level','account','entity_external_id','6223334445',
    'spend_micros',50000000,'impressions',5000,'clicks',100,'conversions',5),
  -- Nível campanha: Leads (ativa) R$ 250, Remarketing (pausada) R$ 50
  jsonb_build_object('date','2026-09-10','ad_account_id','00000000-0000-0000-0000-000000000601','level','campaign','entity_external_id','9601',
    'campaign_id','00000000-0000-0000-0000-0000000006d1','spend_micros',80000000,'impressions',8000,'clicks',160,'leads',9),
  jsonb_build_object('date','2026-09-11','ad_account_id','00000000-0000-0000-0000-000000000601','level','campaign','entity_external_id','9601',
    'campaign_id','00000000-0000-0000-0000-0000000006d1','spend_micros',170000000,'impressions',17000,'clicks',350,'leads',19),
  jsonb_build_object('date','2026-09-10','ad_account_id','00000000-0000-0000-0000-000000000601','level','campaign','entity_external_id','9602',
    'campaign_id','00000000-0000-0000-0000-0000000006d2','spend_micros',20000000,'impressions',2000,'clicks',40,'leads',1),
  jsonb_build_object('date','2026-09-11','ad_account_id','00000000-0000-0000-0000-000000000601','level','campaign','entity_external_id','9602',
    'campaign_id','00000000-0000-0000-0000-0000000006d2','spend_micros',30000000,'impressions',3000,'clicks',50,'leads',1),
  -- Loja US em dólar
  jsonb_build_object('date','2026-09-10','ad_account_id','00000000-0000-0000-0000-000000000604','level','account','entity_external_id','6445556667',
    'spend_micros',70000000,'impressions',7000,'clicks',70)
));

-- ---------------------------------------------------------------- 1. administrador
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000006a1","role":"authenticated"}';
do $$
declare s record;
begin
  -- Sem filtros: BRL e USD separados, BRL = 300 + 50 (nível conta, campanhas não somadas de novo)
  if (select count(*) from public.dashboard_summary('2026-09-01', '2026-09-30')) <> 2 then
    raise exception 'FALHOU: moedas deveriam vir separadas';
  end if;
  select * into s from public.dashboard_summary('2026-09-01', '2026-09-30') where currency = 'BRL';
  if s.spend_micros <> 350000000 or s.source_level <> 'account' then raise exception 'FALHOU: total BRL = % (%)', s.spend_micros, s.source_level; end if;
  if s.leads <> 30 then raise exception 'FALHOU: leads = % (Google sem leads não vira 0)', s.leads; end if;
  if s.accounts <> 2 or s.days_with_data <> 2 then raise exception 'FALHOU: contas/dias'; end if;

  -- Só Google: mensagens e leads continuam "não disponível" (NULL)
  select * into s from public.dashboard_summary('2026-09-01', '2026-09-30', array['00000000-0000-0000-0000-0000000006f1']::uuid[], array['google']);
  if s.messages is not null or s.leads is not null then raise exception 'FALHOU: Google deveria ter mensagens/leads NULL'; end if;

  -- Filtro por conta
  select * into s from public.dashboard_summary('2026-09-11', '2026-09-11', null, null, array['00000000-0000-0000-0000-000000000601']::uuid[]);
  if s.spend_micros <> 200000000 then raise exception 'FALHOU: filtro por conta/dia'; end if;

  -- Status "ativa" → só a campanha Leads, usando o nível campanha
  select * into s from public.dashboard_summary('2026-09-01', '2026-09-30', null, null, null, null, array['ativa']::public.entity_status[]);
  if s.spend_micros <> 250000000 or s.leads <> 28 or s.source_level <> 'campaign' or s.campaigns <> 1 then
    raise exception 'FALHOU: filtro por status ativa = % / %', s.spend_micros, s.leads;
  end if;

  -- Campanha específica
  select * into s from public.dashboard_summary('2026-09-01', '2026-09-30', null, null, null, array['00000000-0000-0000-0000-0000000006d2']::uuid[]);
  if s.spend_micros <> 50000000 then raise exception 'FALHOU: filtro por campanha'; end if;

  -- Campanha + status que não bate → nada
  if exists (select 1 from public.dashboard_summary('2026-09-01', '2026-09-30', null, null, null,
      array['00000000-0000-0000-0000-0000000006d2']::uuid[], array['ativa']::public.entity_status[])) then
    raise exception 'FALHOU: campanha pausada apareceu no filtro ativa';
  end if;

  -- Período sem dados → nenhuma linha (a tela mostra "sem dados", não zero inventado)
  if exists (select 1 from public.dashboard_summary('2026-01-01', '2026-01-31')) then raise exception 'FALHOU: período vazio'; end if;

  begin
    perform public.dashboard_summary('2026-09-30', '2026-09-01');
    raise exception 'FALHOU: período invertido aceito';
  exception when raise_exception then
    if sqlerrm like 'FALHOU%' then raise; end if;
  end;
end $$;
reset role;

-- ---------------------------------------------------------------- 2. gestor vê só o cliente liberado
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000006c1","role":"authenticated"}';
do $$
begin
  if exists (select 1 from public.dashboard_summary('2026-09-01', '2026-09-30') where currency = 'USD') then
    raise exception 'FALHOU: gestor viu números de cliente não liberado';
  end if;
  if exists (select 1 from public.dashboard_summary('2026-09-01', '2026-09-30', array['00000000-0000-0000-0000-0000000006f2']::uuid[])) then
    raise exception 'FALHOU: gestor filtrou cliente não liberado e recebeu números';
  end if;
  if (select spend_micros from public.dashboard_summary('2026-09-01', '2026-09-30')) <> 350000000 then
    raise exception 'FALHOU: gestor deveria ver o total do cliente liberado';
  end if;
end $$;
reset role;

-- ---------------------------------------------------------------- 3. visitante sem login não usa
set local role anon;
do $$
begin
  perform public.dashboard_summary('2026-09-01', '2026-09-30');
  raise exception 'FALHOU: anônimo executou o resumo';
exception when insufficient_privilege then null;
end $$;
reset role;

rollback;

select 'TODOS OS TESTES PASSARAM' as resultado;
