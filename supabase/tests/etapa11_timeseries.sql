-- =============================================================================
-- Testes da Etapa 11 — série no tempo do Dashboard (dashboard_timeseries)
-- Rodar inteiro no SQL Editor. Transação desfeita no final: nada fica gravado.
-- =============================================================================
begin;

insert into auth.users (id, instance_id, aud, role, email) values
  ('00000000-0000-0000-0000-00000000b0a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@t11.local'),
  ('00000000-0000-0000-0000-00000000b0c1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'gestor@t11.local');
update public.profiles set active = true, role = 'admin' where id = '00000000-0000-0000-0000-00000000b0a1';
update public.profiles set active = true, role = 'gestor' where id = '00000000-0000-0000-0000-00000000b0c1';

insert into public.clients (id, name) values
  ('00000000-0000-0000-0000-00000000b0f1', 'Excalibur Fitness'),
  ('00000000-0000-0000-0000-00000000b0f2', 'Loja Internacional');
delete from public.user_client_access where user_id = '00000000-0000-0000-0000-00000000b0c1';
insert into public.user_client_access (user_id, client_id) values ('00000000-0000-0000-0000-00000000b0c1', '00000000-0000-0000-0000-00000000b0f1');

insert into public.ad_accounts (id, platform_id, external_id, client_id, name, currency, status) values
  ('00000000-0000-0000-0000-00000000b001', 'meta',   'b01',        '00000000-0000-0000-0000-00000000b0f1', 'Excalibur Meta',   'BRL', 'ativa'),
  ('00000000-0000-0000-0000-00000000b002', 'google', '7223334445', '00000000-0000-0000-0000-00000000b0f1', 'Excalibur Google', 'BRL', 'ativa'),
  ('00000000-0000-0000-0000-00000000b004', 'google', '7445556667', '00000000-0000-0000-0000-00000000b0f2', 'Loja US',          'USD', 'ativa');

-- Segunda 07/09 a domingo 13/09 é uma semana; 14/09 começa outra. 31/08 é outro mês.
select public.ingest_metrics_daily(jsonb_build_array(
  jsonb_build_object('date','2026-08-31','ad_account_id','00000000-0000-0000-0000-00000000b001','level','account','entity_external_id','b01','spend_micros', 50000000,'impressions',5000,'clicks',50,'leads',5,'reach',4000),
  jsonb_build_object('date','2026-09-07','ad_account_id','00000000-0000-0000-0000-00000000b001','level','account','entity_external_id','b01','spend_micros',100000000,'impressions',10000,'clicks',100,'leads',10,'reach',8000),
  jsonb_build_object('date','2026-09-08','ad_account_id','00000000-0000-0000-0000-00000000b001','level','account','entity_external_id','b01','spend_micros',100000000,'impressions',10000,'clicks',100,'leads',10,'reach',7000),
  jsonb_build_object('date','2026-09-08','ad_account_id','00000000-0000-0000-0000-00000000b002','level','account','entity_external_id','7223334445','spend_micros',40000000,'impressions',2000,'clicks',80,'conversions',4),
  jsonb_build_object('date','2026-09-14','ad_account_id','00000000-0000-0000-0000-00000000b001','level','account','entity_external_id','b01','spend_micros',60000000,'impressions',6000,'clicks',60,'leads',6),
  jsonb_build_object('date','2026-09-08','ad_account_id','00000000-0000-0000-0000-00000000b004','level','account','entity_external_id','7445556667','spend_micros',70000000,'impressions',7000,'clicks',70)
));

-- ---------------------------------------------------------------- administrador
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000b0a1","role":"authenticated"}';
do $$
declare r record;
begin
  -- Diário, só BRL do cliente Excalibur: dia 08 soma Meta + Google
  select * into r from public.dashboard_timeseries('2026-09-01', '2026-09-30', 'day', array['00000000-0000-0000-0000-00000000b0f1']::uuid[])
  where bucket = '2026-09-08';
  if r.spend_micros <> 140000000 or r.clicks <> 180 or r.leads <> 10 or r.conversions <> 4 then raise exception 'FALHOU: dia 08 (%)', row_to_json(r); end if;
  if r.reach is not null then raise exception 'FALHOU: alcance de 2 contas somado no mesmo dia'; end if;

  -- Alcance diário só com um único item (uma conta)
  select * into r from public.dashboard_timeseries('2026-09-01', '2026-09-30', 'day', null, null, array['00000000-0000-0000-0000-00000000b001']::uuid[])
  where bucket = '2026-09-07';
  if r.reach <> 8000 then raise exception 'FALHOU: alcance diário de uma conta'; end if;

  -- Semanal: semana começa na segunda (07/09); alcance nunca somado entre dias
  select * into r from public.dashboard_timeseries('2026-09-01', '2026-09-30', 'week', null, null, array['00000000-0000-0000-0000-00000000b001']::uuid[])
  where bucket = '2026-09-07';
  if r.spend_micros <> 200000000 or r.days_with_data <> 2 or r.reach is not null then raise exception 'FALHOU: semana de 07/09 (%)', row_to_json(r); end if;

  -- Mensal: agosto e setembro separados
  if (select count(*) from public.dashboard_timeseries('2026-08-01', '2026-09-30', 'month', array['00000000-0000-0000-0000-00000000b0f1']::uuid[])) <> 2 then
    raise exception 'FALHOU: agrupamento mensal';
  end if;
  if (select spend_micros from public.dashboard_timeseries('2026-08-01', '2026-09-30', 'month', array['00000000-0000-0000-0000-00000000b0f1']::uuid[])
      where bucket = '2026-09-01') <> 300000000 then raise exception 'FALHOU: total de setembro'; end if;

  -- Por plataforma: Meta e Google em linhas separadas
  if (select count(*) from public.dashboard_timeseries('2026-09-08', '2026-09-08', 'day', array['00000000-0000-0000-0000-00000000b0f1']::uuid[], p_by_platform => true)) <> 2 then
    raise exception 'FALHOU: separar por plataforma';
  end if;
  if (select spend_micros from public.dashboard_timeseries('2026-09-08', '2026-09-08', 'day', array['00000000-0000-0000-0000-00000000b0f1']::uuid[], p_by_platform => true)
      where platform_id = 'google') <> 40000000 then raise exception 'FALHOU: série do Google'; end if;
  if exists (select 1 from public.dashboard_timeseries('2026-09-08', '2026-09-08', 'day') where platform_id is not null) then
    raise exception 'FALHOU: sem separar, plataforma deveria vir vazia';
  end if;

  -- Moedas nunca se misturam
  if (select count(*) from public.dashboard_timeseries('2026-09-08', '2026-09-08', 'day')) <> 2 then raise exception 'FALHOU: BRL e USD separados'; end if;

  -- Entradas inválidas
  begin perform public.dashboard_timeseries('2026-09-01', '2026-09-30', 'hora'); raise exception 'FALHOU: agrupamento inválido aceito';
  exception when raise_exception then if sqlerrm like 'FALHOU%' then raise; end if; end;
  begin perform public.dashboard_timeseries('2024-01-01', '2026-09-30', 'day'); raise exception 'FALHOU: diário de 2 anos aceito';
  exception when raise_exception then if sqlerrm like 'FALHOU%' then raise; end if; end;
  perform public.dashboard_timeseries('2024-01-01', '2026-09-30', 'month');
end $$;
reset role;

-- ---------------------------------------------------------------- gestor
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000b0c1","role":"authenticated"}';
do $$
begin
  if exists (select 1 from public.dashboard_timeseries('2026-09-01', '2026-09-30', 'day') where currency = 'USD') then
    raise exception 'FALHOU: gestor viu série de cliente não liberado';
  end if;
end $$;
reset role;

set local role anon;
do $$
begin
  perform public.dashboard_timeseries('2026-09-01', '2026-09-30', 'day');
  raise exception 'FALHOU: anônimo consultou a série';
exception when insufficient_privilege then null;
end $$;
reset role;

rollback;

select 'TODOS OS TESTES PASSARAM' as resultado;
