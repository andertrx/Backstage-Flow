-- =============================================================================
-- Testes da Etapa 5 — banco histórico
--
-- Simula dados de 2 clientes (um em BRL, outro com contas em BRL e USD),
-- em agosto e setembro de 2026, mais um mês antigo (backfill de 2023).
-- Rodar inteiro no SQL Editor. Transação desfeita no final: nada fica gravado.
-- =============================================================================
begin;

-- ---------------------------------------------------------------- cenário
insert into auth.users (id, instance_id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000005a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@t5.local'),
  ('00000000-0000-0000-0000-0000000005c1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'visual@t5.local');
update public.profiles set active = true, role = 'admin' where id = '00000000-0000-0000-0000-0000000005a1';
update public.profiles set active = true, role = 'visualizador' where id = '00000000-0000-0000-0000-0000000005c1';

insert into public.clients (id, name) values
  ('00000000-0000-0000-0000-0000000005f1', 'Excalibur Fitness'),
  ('00000000-0000-0000-0000-0000000005f2', 'Loja Internacional');
insert into public.user_client_access (user_id, client_id) values
  ('00000000-0000-0000-0000-0000000005c1', '00000000-0000-0000-0000-0000000005f1');

insert into public.ad_accounts (id, platform_id, external_id, client_id, name, currency, status) values
  ('00000000-0000-0000-0000-000000000501', 'meta',   '111',        '00000000-0000-0000-0000-0000000005f1', 'Excalibur Meta',   'BRL', 'ativa'),
  ('00000000-0000-0000-0000-000000000502', 'google', '2223334445', '00000000-0000-0000-0000-0000000005f1', 'Excalibur Google', 'BRL', 'ativa'),
  ('00000000-0000-0000-0000-000000000503', 'meta',   '333',        '00000000-0000-0000-0000-0000000005f2', 'Loja BR',          'BRL', 'ativa'),
  ('00000000-0000-0000-0000-000000000504', 'google', '4445556667', '00000000-0000-0000-0000-0000000005f2', 'Loja US',          'USD', 'ativa');

insert into public.campaigns (id, ad_account_id, client_id, platform_id, external_id, name, status, budget_micros, budget_period) values
  ('00000000-0000-0000-0000-0000000005d1', '00000000-0000-0000-0000-000000000501', '00000000-0000-0000-0000-0000000005f1', 'meta', '9001', 'Leads Setembro', 'ativa', 50000000, 'diario');

-- ---------------------------------------------------------------- 1. gavetas mensais
do $$
begin
  if (select count(*) from pg_inherits i join pg_class c on c.oid = i.inhrelid join pg_namespace n on n.oid = c.relnamespace
      where i.inhparent = 'public.metrics_daily'::regclass and n.nspname = 'history') < 33 then
    raise exception 'FALHOU: gavetas mensais iniciais não foram criadas';
  end if;
  if not exists (select 1 from cron.job where jobname = 'metrics-daily-partitions') then
    raise exception 'FALHOU: agendamento mensal das gavetas não existe';
  end if;
end $$;

-- ---------------------------------------------------------------- 2. ingestão
do $$
declare r jsonb;
begin
  r := public.ingest_metrics_daily(jsonb_build_array(
    -- Excalibur Meta: agosto (2 dias) e setembro (1 dia) — R$ 1.250,00 no dia 23/09
    jsonb_build_object('date','2026-08-10','ad_account_id','00000000-0000-0000-0000-000000000501','level','account','entity_external_id','111',
      'spend_micros', 100000000,'impressions',10000,'clicks',400,'leads',30,'messages',5,'conversions',30,'conversion_value_micros',0),
    jsonb_build_object('date','2026-08-11','ad_account_id','00000000-0000-0000-0000-000000000501','level','account','entity_external_id','111',
      'spend_micros', 200000000,'impressions',20000,'clicks',800,'leads',70,'messages',10,'conversions',70,'conversion_value_micros',0),
    jsonb_build_object('date','2026-09-23','ad_account_id','00000000-0000-0000-0000-000000000501','level','account','entity_external_id','111',
      'spend_micros',1250000000,'impressions',100000,'clicks',4000,'leads',350,'messages',20,'conversions',350,'conversion_value_micros',0),
    -- Excalibur Google: Google não tem "mensagens" → NULL (não disponível)
    jsonb_build_object('date','2026-08-10','ad_account_id','00000000-0000-0000-0000-000000000502','level','account','entity_external_id','2223334445',
      'spend_micros', 50000000,'impressions',3000,'clicks',150,'leads',10.5,'conversions',10.5,'conversion_value_micros',0),
    -- mesma campanha no nível campanha (não pode ser somada de novo no resumo)
    jsonb_build_object('date','2026-09-23','ad_account_id','00000000-0000-0000-0000-000000000501','level','campaign','entity_external_id','9001',
      'campaign_id','00000000-0000-0000-0000-0000000005d1','spend_micros',1250000000,'impressions',100000,'clicks',4000,'leads',350),
    -- Loja: uma conta em BRL e outra em USD
    jsonb_build_object('date','2026-08-10','ad_account_id','00000000-0000-0000-0000-000000000503','level','account','entity_external_id','333',
      'spend_micros', 300000000,'impressions',5000,'clicks',100),
    jsonb_build_object('date','2026-08-10','ad_account_id','00000000-0000-0000-0000-000000000504','level','account','entity_external_id','4445556667',
      'spend_micros', 70000000,'impressions',7000,'clicks',70),
    -- backfill antigo (maio/2023): a gaveta é criada na hora
    jsonb_build_object('date','2023-05-15','ad_account_id','00000000-0000-0000-0000-000000000501','level','account','entity_external_id','111',
      'spend_micros', 10000000,'impressions',1000,'clicks',10)
  ));
  if (r ->> 'inserted')::int <> 8 or (r ->> 'updated')::int <> 0 then raise exception 'FALHOU: primeira ingestão %', r; end if;
  if to_regclass('history.metrics_daily_2023_05') is null then raise exception 'FALHOU: gaveta do backfill não foi criada'; end if;

  -- Mesmo dado de novo → nada regravado
  r := public.ingest_metrics_daily(jsonb_build_array(
    jsonb_build_object('date','2026-08-10','ad_account_id','00000000-0000-0000-0000-000000000501','level','account','entity_external_id','111',
      'spend_micros', 100000000,'impressions',10000,'clicks',400,'leads',30,'messages',5,'conversions',30,'conversion_value_micros',0)));
  if (r ->> 'unchanged')::int <> 1 or (r ->> 'updated')::int <> 0 or (r ->> 'inserted')::int <> 0 then
    raise exception 'FALHOU: dado igual foi regravado %', r;
  end if;

  -- Número mudou (atribuição atrasada) → atualiza; dia novo → insere
  r := public.ingest_metrics_daily(jsonb_build_array(
    jsonb_build_object('date','2026-08-10','ad_account_id','00000000-0000-0000-0000-000000000501','level','account','entity_external_id','111',
      'spend_micros', 100000000,'impressions',10000,'clicks',400,'leads',32,'messages',5,'conversions',32,'conversion_value_micros',0),
    jsonb_build_object('date','2026-08-12','ad_account_id','00000000-0000-0000-0000-000000000501','level','account','entity_external_id','111',
      'spend_micros', 0,'impressions',0,'clicks',0,'leads',0,'messages',0,'conversions',0,'conversion_value_micros',0)));
  if (r ->> 'updated')::int <> 1 or (r ->> 'inserted')::int <> 1 or (r ->> 'unchanged')::int <> 0 then
    raise exception 'FALHOU: contagem mista (1 atualizada + 1 nova) %', r;
  end if;

  -- Conta inexistente → erro (nada é descartado em silêncio)
  begin
    perform public.ingest_metrics_daily(jsonb_build_array(
      jsonb_build_object('date','2026-08-10','ad_account_id','00000000-0000-0000-0000-000000000599','level','account','entity_external_id','9','spend_micros',1)));
    raise exception 'FALHOU: conta inexistente foi aceita';
  exception when raise_exception then
    if sqlerrm like 'FALHOU%' then raise; end if;
  end;

  -- Cliente/plataforma vêm SEMPRE da conta (não dá para gravar dado no cliente errado)
  if (select client_id from public.metrics_daily where ad_account_id = '00000000-0000-0000-0000-000000000504' limit 1)
     <> '00000000-0000-0000-0000-0000000005f2' then
    raise exception 'FALHOU: cliente não veio da conta';
  end if;
end $$;

-- ---------------------------------------------------------------- 3. perguntas históricas (como admin)
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000005a1","role":"authenticated"}';
do $$
declare s record;
begin
  -- "Quanto a Excalibur gastou em agosto?" → Meta 300 + Google 50 = R$ 350,00
  select * into s from public.metrics_summary('2026-08-01', '2026-08-31', array['00000000-0000-0000-0000-0000000005f1']::uuid[]);
  if s.spend_micros <> 350000000 then raise exception 'FALHOU: gasto de agosto = %', s.spend_micros; end if;
  if s.leads <> 112.5 then raise exception 'FALHOU: leads de agosto = % (esperado 32+70+10,5)', s.leads; end if;
  if s.messages <> 15 then raise exception 'FALHOU: mensagens = % (Google sem mensagens não pode virar 0 nem somar)', s.messages; end if;
  if s.accounts <> 2 then raise exception 'FALHOU: contas = %', s.accounts; end if;

  -- Nível campanha NÃO entra na soma (evita contar 2x): setembro = R$ 1.250,00
  select * into s from public.metrics_summary('2026-09-01', '2026-09-30', array['00000000-0000-0000-0000-0000000005f1']::uuid[]);
  if s.spend_micros <> 1250000000 or s.leads <> 350 then raise exception 'FALHOU: setembro somou nível campanha junto'; end if;

  -- Só Google
  select * into s from public.metrics_summary('2026-08-01', '2026-08-31', null, array['google']);
  if (select count(*) from public.metrics_summary('2026-08-01', '2026-08-31', null, array['google'])) <> 2 then
    raise exception 'FALHOU: filtro por plataforma (esperado BRL e USD)';
  end if;
  if (select messages from public.metrics_summary('2026-08-01', '2026-08-31', array['00000000-0000-0000-0000-0000000005f1']::uuid[], array['google'])) is not null then
    raise exception 'FALHOU: Google não informa mensagens; deveria ser NULL (não disponível)';
  end if;

  -- Moedas nunca se misturam: Loja tem 1 linha BRL e 1 USD
  if (select count(*) from public.metrics_summary('2026-08-01', '2026-08-31', array['00000000-0000-0000-0000-0000000005f2']::uuid[])) <> 2 then
    raise exception 'FALHOU: BRL e USD foram somados';
  end if;

  -- Série por mês e por semana
  if (select count(*) from public.metrics_timeseries('2026-08-01', '2026-09-30', 'month', array['00000000-0000-0000-0000-0000000005f1']::uuid[])) <> 2 then
    raise exception 'FALHOU: série mensal';
  end if;
  if (select spend_micros from public.metrics_timeseries('2026-08-01', '2026-08-31', 'week', array['00000000-0000-0000-0000-0000000005f1']::uuid[])
      where bucket = '2026-08-10') <> 350000000 then
    raise exception 'FALHOU: série semanal (semana começa na segunda 10/08)';
  end if;
  begin
    perform public.metrics_timeseries('2026-08-01', '2026-08-31', 'hora');
    raise exception 'FALHOU: agrupamento inválido aceito';
  exception when raise_exception then
    if sqlerrm like 'FALHOU%' then raise; end if;
  end;
  begin
    perform public.metrics_summary('2026-09-01', '2026-08-01');
    raise exception 'FALHOU: período invertido aceito';
  exception when raise_exception then
    if sqlerrm like 'FALHOU%' then raise; end if;
  end;
end $$;
reset role;

-- ---------------------------------------------------------------- 4. visualizador vê só o cliente liberado
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000005c1","role":"authenticated"}';
do $$
begin
  if (select count(*) from public.metrics_summary('2020-01-01', '2026-12-31')) <> 1 then
    raise exception 'FALHOU: visualizador viu métricas de outro cliente';
  end if;
  if exists (select 1 from public.metrics_daily where client_id = '00000000-0000-0000-0000-0000000005f2') then
    raise exception 'FALHOU: visualizador leu metrics_daily de outro cliente';
  end if;
  begin
    perform 1 from history.metrics_daily_2026_08;
    raise exception 'FALHOU: gaveta mensal acessível diretamente';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.ingest_metrics_daily('[]'::jsonb);
    raise exception 'FALHOU: usuário conseguiu gravar métricas';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.refresh_daily_summaries('00000000-0000-0000-0000-0000000005f1', '2026-08-01', '2026-08-31');
    raise exception 'FALHOU: usuário recalculou resumos';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- ---------------------------------------------------------------- 5. histórico de alterações
update public.campaigns set status = 'pausada', budget_micros = 80000000 where id = '00000000-0000-0000-0000-0000000005d1';
update public.ad_accounts set status = 'pagamento_pendente' where id = '00000000-0000-0000-0000-000000000501';
do $$
begin
  if (select count(*) from public.entity_changes where entity_id = '00000000-0000-0000-0000-0000000005d1') <> 2 then
    raise exception 'FALHOU: mudança de status/orçamento da campanha não registrada';
  end if;
  if (select new_value #>> '{}' from public.entity_changes where entity_level = 'account' and field = 'status'
      and ad_account_id = '00000000-0000-0000-0000-000000000501') <> 'pagamento_pendente' then
    raise exception 'FALHOU: mudança de status da conta não registrada';
  end if;
end $$;

-- ---------------------------------------------------------------- 6. fotografia do dia
do $$
begin
  perform public.refresh_daily_summaries('00000000-0000-0000-0000-0000000005f1', '2026-08-01', '2026-09-30');
  if (select spend_micros from public.daily_summaries where client_id = '00000000-0000-0000-0000-0000000005f1' and date = '2026-09-23')
     <> 1250000000 then
    raise exception 'FALHOU: fotografia de 23/09 (R$ 1.250,00)';
  end if;
  if (select platforms from public.daily_summaries where client_id = '00000000-0000-0000-0000-0000000005f1' and date = '2026-08-10')
     <> array['google', 'meta'] then
    raise exception 'FALHOU: plataformas do dia 10/08';
  end if;
end $$;

rollback;

select 'TODOS OS TESTES PASSARAM' as resultado;
