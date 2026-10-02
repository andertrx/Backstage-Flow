-- =============================================================================
-- Testes da Etapa 37.2 — Monitoramento: comparação de períodos e série diária.
-- Rodar inteiro no SQL Editor. Transação desfeita no final: nada fica gravado.
-- Períodos fixos: atual 21–27/09/2026, anterior 14–20/09/2026 (7 dias cada).
-- =============================================================================
begin;

insert into auth.users (id, instance_id, aud, role, email) values
  ('00000000-0000-0000-0000-00000372aa01', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@t372.local'),
  ('00000000-0000-0000-0000-00000372aa02', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'gestor@t372.local'),
  ('00000000-0000-0000-0000-00000372aa05', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'equipe@t372.local');
update public.profiles set active = true, role = 'admin', full_name = 'Admin T372' where id = '00000000-0000-0000-0000-00000372aa01';
update public.profiles set active = true, role = 'gestor', full_name = 'Gestor T372' where id = '00000000-0000-0000-0000-00000372aa02';
update public.profiles set active = true, role = 'equipe', full_name = 'Equipe T372' where id = '00000000-0000-0000-0000-00000372aa05';

insert into public.clients (id, name) values
  ('00000000-0000-0000-0000-00000372cc01', 'Cliente A T372'),
  ('00000000-0000-0000-0000-00000372cc02', 'Cliente B T372');
insert into public.user_client_access (user_id, client_id) values
  ('00000000-0000-0000-0000-00000372aa02', '00000000-0000-0000-0000-00000372cc01');

insert into public.ad_accounts (id, platform_id, external_id, client_id, name, currency, timezone) values
  ('00000000-0000-0000-0000-00000372ac01', 'meta', 't372a', '00000000-0000-0000-0000-00000372cc01', 'Conta A T372', 'BRL', 'America/Sao_Paulo'),
  ('00000000-0000-0000-0000-00000372ac02', 'meta', 't372b', '00000000-0000-0000-0000-00000372cc02', 'Conta B T372', 'USD', 'America/Sao_Paulo');
insert into public.sync_state (ad_account_id, status, history_from, history_to, last_success_at) values
  ('00000000-0000-0000-0000-00000372ac01', 'sucesso', '2026-01-01', '2026-09-30', now()),
  ('00000000-0000-0000-0000-00000372ac02', 'sucesso', '2026-09-18', '2026-09-30', now());

insert into public.campaigns (id, ad_account_id, client_id, platform_id, external_id, name, objective) values
  ('00000000-0000-0000-0000-00000372ca01', '00000000-0000-0000-0000-00000372ac01', '00000000-0000-0000-0000-00000372cc01', 'meta', 'c1', 'Leads T372', 'OUTCOME_LEADS'),
  ('00000000-0000-0000-0000-00000372ca02', '00000000-0000-0000-0000-00000372ac02', '00000000-0000-0000-0000-00000372cc02', 'meta', 'c2', 'Vendas T372', 'OUTCOME_SALES');
insert into public.ad_groups (id, campaign_id, ad_account_id, client_id, platform_id, external_id, name) values
  ('00000000-0000-0000-0000-00000372ab01', '00000000-0000-0000-0000-00000372ca01', '00000000-0000-0000-0000-00000372ac01', '00000000-0000-0000-0000-00000372cc01', 'meta', 'g1', 'Conjunto T372');
insert into public.ads (id, ad_group_id, campaign_id, ad_account_id, client_id, platform_id, external_id, name, creative_external_id, thumbnail_url) values
  ('00000000-0000-0000-0000-00000372ad01', '00000000-0000-0000-0000-00000372ab01', '00000000-0000-0000-0000-00000372ca01', '00000000-0000-0000-0000-00000372ac01', '00000000-0000-0000-0000-00000372cc01', 'meta', 'd1', 'Vídeo A', 'cr1', 'https://cdn.example/a.jpg'),
  ('00000000-0000-0000-0000-00000372ad02', '00000000-0000-0000-0000-00000372ab01', '00000000-0000-0000-0000-00000372ca01', '00000000-0000-0000-0000-00000372ac01', '00000000-0000-0000-0000-00000372cc01', 'meta', 'd2', 'Vídeo A (cópia)', 'cr1', 'https://cdn.example/a.jpg'),
  ('00000000-0000-0000-0000-00000372ad03', '00000000-0000-0000-0000-00000372ab01', '00000000-0000-0000-0000-00000372ca01', '00000000-0000-0000-0000-00000372ac01', '00000000-0000-0000-0000-00000372cc01', 'meta', 'd3', 'Foto B', null, null);

-- Métricas diárias (micros: R$ 1 = 1.000.000).
insert into public.metrics_daily (date, ad_account_id, level, entity_external_id, client_id, platform_id, campaign_id, ad_group_id, ad_id, currency, spend_micros, impressions, clicks, leads, conversions, hash, superseded)
select v.date::date, v.acc::uuid, v.level::public.entity_level, v.ext, v.cli::uuid, 'meta', v.camp::uuid, v.grp::uuid, v.ad::uuid, v.cur, v.spend, v.impr, v.clk, v.leads, v.conv, 'h', v.sup
from (values
  -- campanha C1 (cliente A): atual 2 dias, anterior 1 dia, 1 linha "superseded" que NÃO soma
  ('2026-09-21', '00000000-0000-0000-0000-00000372ac01', 'campaign', 'c1', '00000000-0000-0000-0000-00000372cc01', '00000000-0000-0000-0000-00000372ca01', null, null, 'BRL', 10000000::bigint, 1000::bigint, 50::bigint, 5::numeric, null::numeric, false),
  ('2026-09-22', '00000000-0000-0000-0000-00000372ac01', 'campaign', 'c1', '00000000-0000-0000-0000-00000372cc01', '00000000-0000-0000-0000-00000372ca01', null, null, 'BRL', 10000000, 1000, 50, 5, null, false),
  ('2026-09-23', '00000000-0000-0000-0000-00000372ac01', 'campaign', 'c1x', '00000000-0000-0000-0000-00000372cc01', '00000000-0000-0000-0000-00000372ca01', null, null, 'BRL', 999000000, 1, 1, 99, null, true),
  ('2026-09-14', '00000000-0000-0000-0000-00000372ac01', 'campaign', 'c1', '00000000-0000-0000-0000-00000372cc01', '00000000-0000-0000-0000-00000372ca01', null, null, 'BRL', 8000000, 900, 30, 10, null, false),
  -- fora dos dois períodos: não entra
  ('2026-09-01', '00000000-0000-0000-0000-00000372ac01', 'campaign', 'c1', '00000000-0000-0000-0000-00000372cc01', '00000000-0000-0000-0000-00000372ca01', null, null, 'BRL', 77000000, 1, 1, 1, null, false),
  -- anúncios: D1 e D2 usam o mesmo criativo cr1; D3 sem ID de criativo
  ('2026-09-21', '00000000-0000-0000-0000-00000372ac01', 'ad', 'd1', '00000000-0000-0000-0000-00000372cc01', '00000000-0000-0000-0000-00000372ca01', '00000000-0000-0000-0000-00000372ab01', '00000000-0000-0000-0000-00000372ad01', 'BRL', 3000000, 300, 10, 2, null, false),
  ('2026-09-22', '00000000-0000-0000-0000-00000372ac01', 'ad', 'd2', '00000000-0000-0000-0000-00000372cc01', '00000000-0000-0000-0000-00000372ca01', '00000000-0000-0000-0000-00000372ab01', '00000000-0000-0000-0000-00000372ad02', 'BRL', 2000000, 200, 8, 1, null, false),
  ('2026-09-15', '00000000-0000-0000-0000-00000372ac01', 'ad', 'd3', '00000000-0000-0000-0000-00000372cc01', '00000000-0000-0000-0000-00000372ca01', '00000000-0000-0000-0000-00000372ab01', '00000000-0000-0000-0000-00000372ad03', 'BRL', 1000000, 100, 5, 0, null, false),
  -- conta e campanha do cliente B (USD), histórico só desde 18/09
  ('2026-09-25', '00000000-0000-0000-0000-00000372ac02', 'account', 't372b', '00000000-0000-0000-0000-00000372cc02', null, null, null, 'USD', 4000000, 400, 20, null, 2, false),
  ('2026-09-25', '00000000-0000-0000-0000-00000372ac02', 'campaign', 'c2', '00000000-0000-0000-0000-00000372cc02', '00000000-0000-0000-0000-00000372ca02', null, null, 'USD', 4000000, 400, 20, null, 2, false),
  ('2026-09-21', '00000000-0000-0000-0000-00000372ac01', 'account', 't372a', '00000000-0000-0000-0000-00000372cc01', null, null, null, 'BRL', 20000000, 2000, 100, 10, null, false)
) as v(date, acc, level, ext, cli, camp, grp, ad, cur, spend, impr, clk, leads, conv, sup);

create temp table r372 (what text, v text) on commit drop;
grant all on r372 to authenticated, anon;
create or replace function pg_temp.try(p_sql text) returns text language plpgsql as $$
begin
  execute p_sql;
  return 'ok';
exception when others then
  return sqlstate;
end $$;
grant execute on function pg_temp.try(text) to authenticated, anon;

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000372aa01","role":"authenticated"}';

-- 1. Campanha: somas por período, dias com dados, sem a linha "superseded" e sem dias fora dos períodos.
insert into r372 select 'campanha A', concat_ws('|', name, objective, currency, cur_spend_micros, prev_spend_micros, cur_leads::int, prev_leads::int, cur_days, prev_days, coverage, client_name)
  from public.monitor_compare('campaign', '2026-09-21', '2026-09-27', '2026-09-14', '2026-09-20', '00000000-0000-0000-0000-00000372cc01');
-- 2. Cliente B: moeda própria; histórico desde 18/09 não cobre o período anterior inteiro.
insert into r372 select 'campanha B', concat_ws('|', currency, cur_spend_micros, coalesce(prev_spend_micros::text, 'nulo'), cur_conversions::int, prev_days, coverage)
  from public.monitor_compare('campaign', '2026-09-21', '2026-09-27', '2026-09-14', '2026-09-20', '00000000-0000-0000-0000-00000372cc02');
-- 3. Anúncios: um por linha, com miniatura.
insert into r372 select 'anúncios', string_agg(name || ':' || coalesce(cur_spend_micros, 0) || '/' || coalesce(prev_spend_micros, 0) || ':' || (thumbnail_url is not null), ',' order by name)
  from public.monitor_compare('ad', '2026-09-21', '2026-09-27', '2026-09-14', '2026-09-20', '00000000-0000-0000-0000-00000372cc01');
-- 4. Criativos: D1 + D2 juntos pelo MESMO ID; D3 sozinho (sem ID, nunca agrupado por nome).
insert into r372 select 'criativos', string_agg(coalesce(creative_external_id, 'sem-id') || ':' || ads_count || ':' || coalesce(cur_spend_micros, 0) || '/' || coalesce(prev_spend_micros, 0), ',' order by creative_external_id nulls last)
  from public.monitor_compare('creative', '2026-09-21', '2026-09-27', '2026-09-14', '2026-09-20', '00000000-0000-0000-0000-00000372cc01');
-- 5. Filtro por campanha e nível de conjunto.
insert into r372 select 'conjunto filtrado', count(*) || ':' || coalesce(max(ad_group_name), '')
  from public.monitor_compare('ad_group', '2026-09-21', '2026-09-27', '2026-09-14', '2026-09-20', null, null, null, '00000000-0000-0000-0000-00000372ca01');
-- 6. Validações.
insert into r372 values ('nível inválido', pg_temp.try($q$select * from public.monitor_compare('cliente', '2026-09-21', '2026-09-27', '2026-09-14', '2026-09-20')$q$));
insert into r372 values ('períodos sobrepostos', pg_temp.try($q$select * from public.monitor_compare('campaign', '2026-09-21', '2026-09-27', '2026-09-20', '2026-09-26')$q$));
insert into r372 values ('período longo', pg_temp.try($q$select * from public.monitor_compare('campaign', '2025-01-01', '2026-09-27', '2023-01-01', '2024-12-31')$q$));
insert into r372 values ('data invertida', pg_temp.try($q$select * from public.monitor_compare('campaign', '2026-09-27', '2026-09-21', '2026-09-14', '2026-09-20')$q$));

-- 7. Série diária.
insert into r372 select 'diária campanha', string_agg(to_char(date, 'DD') || ':' || spend_micros, ',' order by date)
  from public.monitor_daily('campaign', '00000000-0000-0000-0000-00000372ca01', '2026-09-14', '2026-09-27');
insert into r372 select 'diária criativo', string_agg(to_char(date, 'DD') || ':' || spend_micros, ',' order by date)
  from public.monitor_daily('creative', '00000000-0000-0000-0000-00000372ac01:cr1', '2026-09-14', '2026-09-27');
insert into r372 select 'diária criativo sem id', string_agg(to_char(date, 'DD') || ':' || spend_micros, ',' order by date)
  from public.monitor_daily('creative', '00000000-0000-0000-0000-00000372ac01:ad-00000000-0000-0000-0000-00000372ad03', '2026-09-14', '2026-09-27');
insert into r372 values ('diária chave ruim', pg_temp.try($q$select * from public.monitor_daily('campaign', 'nao-e-uuid', '2026-09-14', '2026-09-27')$q$));

-- 8. Gestor só vê o cliente A.
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000372aa02","role":"authenticated"}';
insert into r372 select 'gestor contas', string_agg(account_name, ',' order by account_name)
  from public.monitor_compare('account', '2026-09-21', '2026-09-27', '2026-09-14', '2026-09-20')
 where account_name like '%T372';
insert into r372 select 'gestor pede cliente B', count(*)::text
  from public.monitor_compare('campaign', '2026-09-21', '2026-09-27', '2026-09-14', '2026-09-20', '00000000-0000-0000-0000-00000372cc02');
insert into r372 values ('gestor diária do B', pg_temp.try($q$select * from public.monitor_daily('campaign', '00000000-0000-0000-0000-00000372ca02', '2026-09-14', '2026-09-27')$q$));

-- 9. Equipe e visitante bloqueados.
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000372aa05","role":"authenticated"}';
insert into r372 values ('equipe compara', pg_temp.try($q$select * from public.monitor_compare('campaign', '2026-09-21', '2026-09-27', '2026-09-14', '2026-09-20')$q$));
reset role;
set local role anon;
insert into r372 values ('visitante compara', pg_temp.try($q$select * from public.monitor_compare('campaign', '2026-09-21', '2026-09-27', '2026-09-14', '2026-09-20')$q$));
reset role;

do $$
declare
  expected jsonb := jsonb_build_object(
    'campanha A', 'Leads T372|OUTCOME_LEADS|BRL|20000000|8000000|10|10|2|1|completa|Cliente A T372',
    'campanha B', 'USD|4000000|nulo|2|0|parcial',
    'anúncios', 'Foto B:0/1000000:false,Vídeo A:3000000/0:true,Vídeo A (cópia):2000000/0:true',
    'criativos', 'cr1:2:5000000/0,sem-id:1:0/1000000',
    'conjunto filtrado', '0:',
    'nível inválido', '22023',
    'períodos sobrepostos', '22023',
    'período longo', '22023',
    'data invertida', '22023',
    'diária campanha', '14:8000000,21:10000000,22:10000000',
    'diária criativo', '21:3000000,22:2000000',
    'diária criativo sem id', '15:1000000',
    'diária chave ruim', '22023',
    'gestor contas', 'Conta A T372',
    'gestor pede cliente B', '0',
    'gestor diária do B', '22023',
    'equipe compara', '42501',
    'visitante compara', '42501');
  r record;
begin
  for r in select * from r372 loop
    if expected ->> r.what is distinct from r.v then raise exception 'FALHOU: % = % (esperado %)', r.what, r.v, expected ->> r.what; end if;
  end loop;
  if (select count(*) from r372) <> (select count(*) from jsonb_object_keys(expected)) then
    raise exception 'FALHOU: faltou verificação (%)', (select count(*) from r372);
  end if;
  raise notice 'Etapa 37.2: % verificações OK', (select count(*) from r372);
end $$;

rollback;
