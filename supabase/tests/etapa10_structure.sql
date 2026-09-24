-- =============================================================================
-- Testes da Etapa 10 — conjuntos/grupos e anúncios (entity_rows)
-- Rodar inteiro no SQL Editor. Transação desfeita no final: nada fica gravado.
-- =============================================================================
begin;

insert into auth.users (id, instance_id, aud, role, email) values
  ('00000000-0000-0000-0000-00000000a0a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@t10.local'),
  ('00000000-0000-0000-0000-00000000a0c1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'gestor@t10.local');
update public.profiles set active = true, role = 'admin' where id = '00000000-0000-0000-0000-00000000a0a1';
update public.profiles set active = true, role = 'gestor' where id = '00000000-0000-0000-0000-00000000a0c1';

insert into public.clients (id, name) values
  ('00000000-0000-0000-0000-00000000a0f1', 'Excalibur Fitness'),
  ('00000000-0000-0000-0000-00000000a0f2', 'Loja Internacional');
delete from public.user_client_access where user_id = '00000000-0000-0000-0000-00000000a0c1';
insert into public.user_client_access (user_id, client_id) values ('00000000-0000-0000-0000-00000000a0c1', '00000000-0000-0000-0000-00000000a0f1');

insert into public.ad_accounts (id, platform_id, external_id, client_id, name, currency, status) values
  ('00000000-0000-0000-0000-00000000a001', 'meta', 'a01', '00000000-0000-0000-0000-00000000a0f1', 'Excalibur Meta', 'BRL', 'ativa'),
  ('00000000-0000-0000-0000-00000000a004', 'meta', 'a04', '00000000-0000-0000-0000-00000000a0f2', 'Loja Meta', 'USD', 'ativa');

insert into public.campaigns (id, ad_account_id, client_id, platform_id, external_id, name, objective, status) values
  ('00000000-0000-0000-0000-00000000a0d1', '00000000-0000-0000-0000-00000000a001', '00000000-0000-0000-0000-00000000a0f1', 'meta', 'c1', 'Leads Setembro', 'OUTCOME_LEADS', 'ativa'),
  ('00000000-0000-0000-0000-00000000a0d4', '00000000-0000-0000-0000-00000000a004', '00000000-0000-0000-0000-00000000a0f2', 'meta', 'c4', 'Loja Campanha', 'OUTCOME_SALES', 'ativa');

insert into public.ad_groups (id, campaign_id, ad_account_id, client_id, platform_id, external_id, name, status, budget_micros, budget_period, optimization_goal) values
  ('00000000-0000-0000-0000-00000000a0e1', '00000000-0000-0000-0000-00000000a0d1', '00000000-0000-0000-0000-00000000a001', '00000000-0000-0000-0000-00000000a0f1', 'meta', 'g1', 'Público Frio', 'ativa', 30000000, 'diario', 'LEAD_GENERATION'),
  ('00000000-0000-0000-0000-00000000a0e2', '00000000-0000-0000-0000-00000000a0d1', '00000000-0000-0000-0000-00000000a001', '00000000-0000-0000-0000-00000000a0f1', 'meta', 'g2', 'Remarketing 7d', 'pausada', null, null, 'LEAD_GENERATION'),
  ('00000000-0000-0000-0000-00000000a0e4', '00000000-0000-0000-0000-00000000a0d4', '00000000-0000-0000-0000-00000000a004', '00000000-0000-0000-0000-00000000a0f2', 'meta', 'g4', 'Loja Conjunto', 'ativa', null, null, null);

insert into public.ads (id, ad_group_id, campaign_id, ad_account_id, client_id, platform_id, external_id, name, status, creative_type, review_status, thumbnail_url) values
  ('00000000-0000-0000-0000-00000000a0b1', '00000000-0000-0000-0000-00000000a0e1', '00000000-0000-0000-0000-00000000a0d1', '00000000-0000-0000-0000-00000000a001', '00000000-0000-0000-0000-00000000a0f1', 'meta', 'ad1', 'Vídeo Depoimento', 'ativa', 'VIDEO', 'APPROVED', 'https://example.com/t1.jpg'),
  ('00000000-0000-0000-0000-00000000a0b2', '00000000-0000-0000-0000-00000000a0e1', '00000000-0000-0000-0000-00000000a0d1', '00000000-0000-0000-0000-00000000a001', '00000000-0000-0000-0000-00000000a0f1', 'meta', 'ad2', 'Imagem Promoção', 'erro', 'IMAGE', 'DISAPPROVED', null);

select public.ingest_metrics_daily(jsonb_build_array(
  -- nível conjunto
  jsonb_build_object('date','2026-09-10','ad_account_id','00000000-0000-0000-0000-00000000a001','level','ad_group','entity_external_id','g1',
    'campaign_id','00000000-0000-0000-0000-00000000a0d1','ad_group_id','00000000-0000-0000-0000-00000000a0e1','spend_micros',120000000,'impressions',12000,'clicks',240,'leads',12),
  jsonb_build_object('date','2026-09-10','ad_account_id','00000000-0000-0000-0000-00000000a001','level','ad_group','entity_external_id','g2',
    'campaign_id','00000000-0000-0000-0000-00000000a0d1','ad_group_id','00000000-0000-0000-0000-00000000a0e2','spend_micros',30000000,'impressions',3000,'clicks',30,'leads',3),
  -- nível anúncio
  jsonb_build_object('date','2026-09-10','ad_account_id','00000000-0000-0000-0000-00000000a001','level','ad','entity_external_id','ad1',
    'campaign_id','00000000-0000-0000-0000-00000000a0d1','ad_group_id','00000000-0000-0000-0000-00000000a0e1','ad_id','00000000-0000-0000-0000-00000000a0b1',
    'spend_micros',100000000,'impressions',10000,'clicks',200,'leads',10),
  jsonb_build_object('date','2026-09-10','ad_account_id','00000000-0000-0000-0000-00000000a001','level','ad','entity_external_id','ad2',
    'campaign_id','00000000-0000-0000-0000-00000000a0d1','ad_group_id','00000000-0000-0000-0000-00000000a0e1','ad_id','00000000-0000-0000-0000-00000000a0b2',
    'spend_micros',20000000,'impressions',2000,'clicks',40,'leads',2),
  -- nível campanha (total da campanha)
  jsonb_build_object('date','2026-09-10','ad_account_id','00000000-0000-0000-0000-00000000a001','level','campaign','entity_external_id','c1',
    'campaign_id','00000000-0000-0000-0000-00000000a0d1','spend_micros',150000000,'impressions',15000,'clicks',270,'leads',15),
  jsonb_build_object('date','2026-09-10','ad_account_id','00000000-0000-0000-0000-00000000a004','level','ad_group','entity_external_id','g4',
    'campaign_id','00000000-0000-0000-0000-00000000a0d4','ad_group_id','00000000-0000-0000-0000-00000000a0e4','spend_micros',70000000,'impressions',7000,'clicks',70)
));
insert into public.period_reach (ad_account_id, level, entity_external_id, period_start, period_end, client_id, reach) values
  ('00000000-0000-0000-0000-00000000a001', 'ad_group', 'g1', '2026-09-01', '2026-09-30', '00000000-0000-0000-0000-00000000a0f1', 6000);

-- ---------------------------------------------------------------- administrador
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000a0a1","role":"authenticated"}';
do $$
declare r record;
begin
  -- Conjuntos de uma campanha
  if (select string_agg(name, ',') from public.entity_rows('ad_group', '2026-09-01', '2026-09-30', p_parent_id => '00000000-0000-0000-0000-00000000a0d1'))
     <> 'Público Frio,Remarketing 7d' then raise exception 'FALHOU: conjuntos da campanha'; end if;
  select * into r from public.entity_rows('ad_group', '2026-09-01', '2026-09-30', p_parent_id => '00000000-0000-0000-0000-00000000a0d1') where name = 'Público Frio';
  if r.spend_micros <> 120000000 or r.ctr <> 2 or r.cpl_micros <> 10000000 or r.detail <> 'LEAD_GENERATION' or r.budget_micros <> 30000000 then
    raise exception 'FALHOU: números do conjunto (%)', row_to_json(r);
  end if;
  if r.reach <> 6000 or r.frequency <> 2 then raise exception 'FALHOU: alcance do conjunto no período exato'; end if;
  if r.parent_id <> '00000000-0000-0000-0000-00000000a0d1' or r.currency <> 'BRL' then raise exception 'FALHOU: pai/moeda do conjunto'; end if;

  -- Anúncios de um conjunto
  select * into r from public.entity_rows('ad', '2026-09-01', '2026-09-30', p_parent_id => '00000000-0000-0000-0000-00000000a0e1') where name = 'Vídeo Depoimento';
  if r.spend_micros <> 100000000 or r.cpc_micros <> 500000 or r.detail <> 'VIDEO' or r.review_status <> 'APPROVED'
     or r.thumbnail_url <> 'https://example.com/t1.jpg' or r.campaign_id <> '00000000-0000-0000-0000-00000000a0d1' then
    raise exception 'FALHOU: números do anúncio (%)', row_to_json(r);
  end if;
  if (select max(total_count) from public.entity_rows('ad', '2026-09-01', '2026-09-30', p_parent_id => '00000000-0000-0000-0000-00000000a0e1')) <> 2 then
    raise exception 'FALHOU: total de anúncios';
  end if;

  -- Resumo de itens específicos (página de detalhe), em cada nível
  select * into r from public.entity_rows('campaign', '2026-09-01', '2026-09-30', p_ids => array['00000000-0000-0000-0000-00000000a0d1']::uuid[]);
  if r.spend_micros <> 150000000 or r.detail <> 'OUTCOME_LEADS' then raise exception 'FALHOU: resumo da campanha usa o nível campanha'; end if;
  select * into r from public.entity_rows('ad', '2026-09-01', '2026-09-30', p_ids => array['00000000-0000-0000-0000-00000000a0b2']::uuid[]);
  if r.spend_micros <> 20000000 or r.status <> 'erro' or r.review_status <> 'DISAPPROVED' then raise exception 'FALHOU: resumo do anúncio'; end if;

  -- Período sem dados: nada vira zero
  select * into r from public.entity_rows('ad', '2026-08-01', '2026-08-31', p_ids => array['00000000-0000-0000-0000-00000000a0b1']::uuid[]);
  if r.has_data or r.spend_micros is not null then raise exception 'FALHOU: período sem dados virou zero'; end if;

  -- Filtro, busca e ordenação
  if (select string_agg(name, ',') from public.entity_rows('ad', '2026-09-01', '2026-09-30', p_parent_id => '00000000-0000-0000-0000-00000000a0e1',
      p_statuses => array['erro']::public.entity_status[])) <> 'Imagem Promoção' then raise exception 'FALHOU: filtro de status'; end if;
  if (select string_agg(name, ',') from public.entity_rows('ad_group', '2026-09-01', '2026-09-30', p_parent_id => '00000000-0000-0000-0000-00000000a0d1',
      p_search => 'remarket')) <> 'Remarketing 7d' then raise exception 'FALHOU: busca'; end if;
  if (select name from public.entity_rows('ad', '2026-09-01', '2026-09-30', p_parent_id => '00000000-0000-0000-0000-00000000a0e1',
      p_sort => 'name', p_desc => false) limit 1) <> 'Imagem Promoção' then raise exception 'FALHOU: ordem por nome'; end if;

  -- Entradas inválidas
  begin perform public.entity_rows('ad', '2026-09-01', '2026-09-30'); raise exception 'FALHOU: listou todos os anúncios sem filtro';
  exception when raise_exception then if sqlerrm like 'FALHOU%' then raise; end if; end;
  begin perform public.entity_rows('campaign', '2026-09-01', '2026-09-30', p_parent_id => '00000000-0000-0000-0000-00000000a0d1'); raise exception 'FALHOU: campanha com pai aceita';
  exception when raise_exception then if sqlerrm like 'FALHOU%' then raise; end if; end;
  begin perform public.entity_rows('account', '2026-09-01', '2026-09-30', p_ids => array[gen_random_uuid()]); raise exception 'FALHOU: nível conta aceito';
  exception when raise_exception then if sqlerrm like 'FALHOU%' then raise; end if; end;
  begin perform public.entity_rows('ad', '2026-09-01', '2026-09-30', p_parent_id => '00000000-0000-0000-0000-00000000a0e1', p_sort => 'x; drop'); raise exception 'FALHOU: ordenação arbitrária';
  exception when raise_exception then if sqlerrm like 'FALHOU%' then raise; end if; end;
end $$;
reset role;

-- ---------------------------------------------------------------- gestor: só o cliente liberado
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000a0c1","role":"authenticated"}';
do $$
begin
  if exists (select 1 from public.entity_rows('ad_group', '2026-09-01', '2026-09-30', p_parent_id => '00000000-0000-0000-0000-00000000a0d4')) then
    raise exception 'FALHOU: gestor viu conjuntos de cliente não liberado';
  end if;
  if exists (select 1 from public.entity_rows('campaign', '2026-09-01', '2026-09-30', p_ids => array['00000000-0000-0000-0000-00000000a0d4']::uuid[])) then
    raise exception 'FALHOU: gestor viu campanha de cliente não liberado';
  end if;
  if (select count(*) from public.entity_rows('ad_group', '2026-09-01', '2026-09-30', p_parent_id => '00000000-0000-0000-0000-00000000a0d1')) <> 2 then
    raise exception 'FALHOU: gestor deveria ver os conjuntos do cliente liberado';
  end if;
end $$;
reset role;

set local role anon;
do $$
begin
  perform public.entity_rows('ad', '2026-09-01', '2026-09-30', p_parent_id => '00000000-0000-0000-0000-00000000a0e1');
  raise exception 'FALHOU: anônimo consultou anúncios';
exception when insufficient_privilege then null;
end $$;
reset role;

rollback;

select 'TODOS OS TESTES PASSARAM' as resultado;
