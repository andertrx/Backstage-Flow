-- =============================================================================
-- Testes da Etapa 9 — tabela de campanhas (campaign_table)
-- Rodar inteiro no SQL Editor. Transação desfeita no final: nada fica gravado.
-- =============================================================================
begin;

insert into auth.users (id, instance_id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000009a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@t9.local'),
  ('00000000-0000-0000-0000-0000000009c1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'gestor@t9.local');
update public.profiles set active = true, role = 'admin' where id = '00000000-0000-0000-0000-0000000009a1';
update public.profiles set active = true, role = 'gestor' where id = '00000000-0000-0000-0000-0000000009c1';

insert into public.clients (id, name) values
  ('00000000-0000-0000-0000-0000000009f1', 'Excalibur Fitness'),
  ('00000000-0000-0000-0000-0000000009f2', 'Loja Internacional');
delete from public.user_client_access where user_id = '00000000-0000-0000-0000-0000000009c1';
insert into public.user_client_access (user_id, client_id) values ('00000000-0000-0000-0000-0000000009c1', '00000000-0000-0000-0000-0000000009f1');

insert into public.ad_accounts (id, platform_id, external_id, client_id, name, currency, status) values
  ('00000000-0000-0000-0000-000000000901', 'meta',   '911',        '00000000-0000-0000-0000-0000000009f1', 'Excalibur Meta',   'BRL', 'ativa'),
  ('00000000-0000-0000-0000-000000000902', 'google', '9223334445', '00000000-0000-0000-0000-0000000009f1', 'Excalibur Google', 'BRL', 'ativa'),
  ('00000000-0000-0000-0000-000000000904', 'google', '9445556667', '00000000-0000-0000-0000-0000000009f2', 'Loja US',          'USD', 'ativa');

insert into public.campaigns (id, ad_account_id, client_id, platform_id, external_id, name, objective, status, budget_micros, budget_period) values
  ('00000000-0000-0000-0000-0000000009d1', '00000000-0000-0000-0000-000000000901', '00000000-0000-0000-0000-0000000009f1', 'meta',   'c91', 'Leads Setembro',    'OUTCOME_LEADS', 'ativa',     50000000, 'diario'),
  ('00000000-0000-0000-0000-0000000009d2', '00000000-0000-0000-0000-000000000901', '00000000-0000-0000-0000-0000000009f1', 'meta',   'c92', 'Remarketing',       'OUTCOME_SALES', 'pausada',   null, null),
  ('00000000-0000-0000-0000-0000000009d3', '00000000-0000-0000-0000-000000000902', '00000000-0000-0000-0000-0000000009f1', 'google', 'c93', 'Pesquisa Marca',    'SEARCH',        'ativa',     30000000, 'diario'),
  ('00000000-0000-0000-0000-0000000009d4', '00000000-0000-0000-0000-000000000901', '00000000-0000-0000-0000-0000000009f1', 'meta',   'c94', 'Black Friday 2025', 'OUTCOME_SALES', 'encerrada', null, null),
  ('00000000-0000-0000-0000-0000000009d5', '00000000-0000-0000-0000-000000000904', '00000000-0000-0000-0000-0000000009f2', 'google', 'c95', 'Loja US Search',    'SEARCH',        'erro',      null, null),
  ('00000000-0000-0000-0000-0000000009d6', '00000000-0000-0000-0000-000000000901', '00000000-0000-0000-0000-0000000009f1', 'meta',   'c96', 'Teste_100%',        null,            'arquivada', null, null);

select public.ingest_metrics_daily(jsonb_build_array(
  jsonb_build_object('date','2026-09-10','ad_account_id','00000000-0000-0000-0000-000000000901','level','campaign','entity_external_id','c91','campaign_id','00000000-0000-0000-0000-0000000009d1',
    'spend_micros',100000000,'impressions',10000,'clicks',200,'leads',10,'messages',4,'conversions',10,'conversion_value_micros',400000000),
  jsonb_build_object('date','2026-09-11','ad_account_id','00000000-0000-0000-0000-000000000901','level','campaign','entity_external_id','c91','campaign_id','00000000-0000-0000-0000-0000000009d1',
    'spend_micros',200000000,'impressions',20000,'clicks',400,'leads',20,'messages',6,'conversions',20,'conversion_value_micros',500000000),
  jsonb_build_object('date','2026-09-10','ad_account_id','00000000-0000-0000-0000-000000000901','level','campaign','entity_external_id','c92','campaign_id','00000000-0000-0000-0000-0000000009d2',
    'spend_micros',50000000,'impressions',5000,'clicks',100,'leads',0),
  jsonb_build_object('date','2026-09-10','ad_account_id','00000000-0000-0000-0000-000000000902','level','campaign','entity_external_id','c93','campaign_id','00000000-0000-0000-0000-0000000009d3',
    'spend_micros',80000000,'impressions',1000,'clicks',100,'conversions',4),
  jsonb_build_object('date','2026-09-10','ad_account_id','00000000-0000-0000-0000-000000000904','level','campaign','entity_external_id','c95','campaign_id','00000000-0000-0000-0000-0000000009d5',
    'spend_micros',70000000,'impressions',7000,'clicks',70)
));
insert into public.period_reach (ad_account_id, level, entity_external_id, period_start, period_end, client_id, reach) values
  ('00000000-0000-0000-0000-000000000901', 'campaign', 'c91', '2026-09-10', '2026-09-11', '00000000-0000-0000-0000-0000000009f1', 15000);

-- ---------------------------------------------------------------- administrador
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000009a1","role":"authenticated"}';
do $$
declare r record; names text;
begin
  -- Padrão: maior gasto primeiro; campanhas sem dados no fim
  select string_agg(name, ' | ' order by ord) into names
  from (select name, row_number() over () ord from public.campaign_table('2026-09-01', '2026-09-30')) x;
  if names <> 'Leads Setembro | Pesquisa Marca | Loja US Search | Remarketing | Black Friday 2025 | Teste_100%' then
    raise exception 'FALHOU: ordem padrão = %', names;
  end if;
  if (select max(total_count) from public.campaign_table('2026-09-01', '2026-09-30')) <> 6 then raise exception 'FALHOU: total'; end if;

  -- Taxas calculadas (mesma regra do código compartilhado)
  select * into r from public.campaign_table('2026-09-01', '2026-09-30') where name = 'Leads Setembro';
  if r.spend_micros <> 300000000 or r.ctr <> 2 or r.cpc_micros <> 500000 or r.cpm_micros <> 10000000
     or r.cpl_micros <> 10000000 or r.cpa_micros <> 10000000 or r.roas <> 3 or r.currency <> 'BRL' then
    raise exception 'FALHOU: taxas da campanha Leads (%)', row_to_json(r);
  end if;
  if r.reach is not null or r.frequency is not null then raise exception 'FALHOU: alcance de outro período não pode ser usado'; end if;

  -- Alcance só no período exato informado pela plataforma
  select * into r from public.campaign_table('2026-09-10', '2026-09-11') where name = 'Leads Setembro';
  if r.reach <> 15000 or r.frequency <> 2 then raise exception 'FALHOU: alcance/frequência do período exato'; end if;

  -- Divisor zero ou não informado → vazio (não zero, não infinito)
  select * into r from public.campaign_table('2026-09-01', '2026-09-30') where name = 'Remarketing';
  if r.leads <> 0 or r.cpl_micros is not null or r.roas is not null then raise exception 'FALHOU: CPL com zero leads'; end if;
  select * into r from public.campaign_table('2026-09-01', '2026-09-30') where name = 'Pesquisa Marca';
  if r.leads is not null or r.messages is not null or r.cpa_micros <> 20000000 then raise exception 'FALHOU: Google sem leads/mensagens'; end if;

  -- Sem dados no período → has_data false e números vazios
  select * into r from public.campaign_table('2026-09-01', '2026-09-30') where name = 'Black Friday 2025';
  if r.has_data or r.spend_micros is not null or r.impressions is not null then raise exception 'FALHOU: campanha sem dados virou zero'; end if;

  -- Filtros de status
  if (select string_agg(name, ',' order by name) from public.campaign_table('2026-09-01', '2026-09-30', null, null, null, array['ativa']::public.entity_status[]))
     <> 'Leads Setembro,Pesquisa Marca' then raise exception 'FALHOU: filtro ativa'; end if;
  if (select count(*) from public.campaign_table('2026-09-01', '2026-09-30', null, null, null, array['encerrada', 'arquivada']::public.entity_status[])) <> 2
     then raise exception 'FALHOU: filtro encerrada/arquivada'; end if;
  if (select string_agg(name, ',') from public.campaign_table('2026-09-01', '2026-09-30', null, null, null, array['erro']::public.entity_status[]))
     <> 'Loja US Search' then raise exception 'FALHOU: filtro erro'; end if;

  -- Busca (sem acento de diferença de maiúsculas; % e _ são texto, não curinga)
  if (select string_agg(name, ',') from public.campaign_table('2026-09-01', '2026-09-30', p_search => 'MARCA')) <> 'Pesquisa Marca' then raise exception 'FALHOU: busca por nome'; end if;
  if (select count(*) from public.campaign_table('2026-09-01', '2026-09-30', p_search => 'loja internac')) <> 1 then raise exception 'FALHOU: busca por cliente'; end if;
  if (select string_agg(name, ',') from public.campaign_table('2026-09-01', '2026-09-30', p_search => '100%')) <> 'Teste_100%' then raise exception 'FALHOU: %% como texto'; end if;
  if (select string_agg(name, ',') from public.campaign_table('2026-09-01', '2026-09-30', p_search => '_')) <> 'Teste_100%' then raise exception 'FALHOU: _ como texto'; end if;
  if (select string_agg(name, ',') from public.campaign_table('2026-09-01', '2026-09-30', p_search => 'c93')) <> 'Pesquisa Marca' then raise exception 'FALHOU: busca pelo ID'; end if;

  -- Ordenação por qualquer coluna, nos dois sentidos
  if (select name from public.campaign_table('2026-09-01', '2026-09-30', p_sort => 'cpl', p_desc => false) limit 1) <> 'Leads Setembro' then raise exception 'FALHOU: ordem por CPL'; end if;
  if (select name from public.campaign_table('2026-09-01', '2026-09-30', p_sort => 'name', p_desc => false) limit 1) <> 'Black Friday 2025' then raise exception 'FALHOU: ordem por nome'; end if;
  if (select name from public.campaign_table('2026-09-01', '2026-09-30', p_sort => 'cpc', p_desc => true, p_client_ids => array['00000000-0000-0000-0000-0000000009f1']::uuid[]) limit 1) <> 'Pesquisa Marca' then raise exception 'FALHOU: ordem por CPC'; end if;
  if (select name from public.campaign_table('2026-09-01', '2026-09-30', p_sort => 'budget', p_desc => true) limit 1) <> 'Leads Setembro' then raise exception 'FALHOU: ordem por orçamento'; end if;

  -- Paginação
  if (select count(*) from public.campaign_table('2026-09-01', '2026-09-30', p_limit => 2, p_offset => 2)) <> 2
     or (select max(total_count) from public.campaign_table('2026-09-01', '2026-09-30', p_limit => 2, p_offset => 2)) <> 6
     or (select name from public.campaign_table('2026-09-01', '2026-09-30', p_limit => 2, p_offset => 2) limit 1) <> 'Loja US Search' then
    raise exception 'FALHOU: paginação';
  end if;

  -- Entradas inválidas são recusadas
  begin perform public.campaign_table('2026-09-01', '2026-09-30', p_sort => 'drop table'); raise exception 'FALHOU: ordenação arbitrária aceita';
  exception when raise_exception then if sqlerrm like 'FALHOU%' then raise; end if; end;
  begin perform public.campaign_table('2026-09-01', '2026-09-30', p_limit => 500); raise exception 'FALHOU: página gigante aceita';
  exception when raise_exception then if sqlerrm like 'FALHOU%' then raise; end if; end;
end $$;
reset role;

-- ---------------------------------------------------------------- gestor
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000009c1","role":"authenticated"}';
do $$
begin
  if (select max(total_count) from public.campaign_table('2026-09-01', '2026-09-30')) <> 5 then raise exception 'FALHOU: gestor deveria ver 5 campanhas'; end if;
  if exists (select 1 from public.campaign_table('2026-09-01', '2026-09-30') where currency = 'USD') then raise exception 'FALHOU: gestor viu cliente não liberado'; end if;
end $$;
reset role;

set local role anon;
do $$
begin
  perform public.campaign_table('2026-09-01', '2026-09-30');
  raise exception 'FALHOU: anônimo consultou campanhas';
exception when insufficient_privilege then null;
end $$;
reset role;

rollback;

select 'TODOS OS TESTES PASSARAM' as resultado;
