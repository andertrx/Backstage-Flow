-- =============================================================================
-- Testes da Etapa 39.3 — perfis e origem (classificação, ligação com campanhas,
-- conjuntos e anúncios, contatos únicos, ranking, investimento, registros, permissões).
-- Rodar inteiro no SQL Editor. Transação desfeita no final: nada fica gravado.
-- =============================================================================
begin;
insert into auth.users (id, instance_id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000393a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@t393.local'),
  ('00000000-0000-0000-0000-0000000393a3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'operador@t393.local'),
  ('00000000-0000-0000-0000-0000000393a5', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'outro@t393.local'),
  ('00000000-0000-0000-0000-0000000393a4', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cliente@t393.local');
update public.profiles set active = true, role = 'admin'    where id = '00000000-0000-0000-0000-0000000393a1';
update public.profiles set active = true, role = 'operador' where id in ('00000000-0000-0000-0000-0000000393a3', '00000000-0000-0000-0000-0000000393a5');
update public.profiles set active = true, role = 'cliente'  where id = '00000000-0000-0000-0000-0000000393a4';
insert into public.clients (id, name) values
  ('00000000-0000-0000-0000-0000000393c1', 'Cliente T393'), ('00000000-0000-0000-0000-0000000393c2', 'Outro T393');
insert into public.user_client_access (user_id, client_id) values
  ('00000000-0000-0000-0000-0000000393a3', '00000000-0000-0000-0000-0000000393c1'),
  ('00000000-0000-0000-0000-0000000393a5', '00000000-0000-0000-0000-0000000393c2'),
  ('00000000-0000-0000-0000-0000000393a4', '00000000-0000-0000-0000-0000000393c1');
insert into public.ad_accounts (id, platform_id, external_id, client_id, name, currency, timezone) values
  ('00000000-0000-0000-0000-0000000393ac', 'meta', 't393a', '00000000-0000-0000-0000-0000000393c1', 'Conta T393', 'BRL', 'America/Sao_Paulo'),
  ('00000000-0000-0000-0000-0000000393ad', 'meta', 't393b', '00000000-0000-0000-0000-0000000393c2', 'Outra T393', 'BRL', 'America/Sao_Paulo');
insert into public.campaigns (id, ad_account_id, client_id, platform_id, external_id, name) values
  ('00000000-0000-0000-0000-000000393ca1', '00000000-0000-0000-0000-0000000393ac', '00000000-0000-0000-0000-0000000393c1', 'meta', '9393001', 'Atacado SP'),
  ('00000000-0000-0000-0000-000000393ca2', '00000000-0000-0000-0000-0000000393ac', '00000000-0000-0000-0000-0000000393c1', 'meta', '9393002', 'Varejo'),
  ('00000000-0000-0000-0000-000000393ca3', '00000000-0000-0000-0000-0000000393ac', '00000000-0000-0000-0000-0000000393c1', 'meta', '9393003', 'Duplicada'),
  ('00000000-0000-0000-0000-000000393ca4', '00000000-0000-0000-0000-0000000393ac', '00000000-0000-0000-0000-0000000393c1', 'meta', '9393004', 'Duplicada'),
  -- outro cliente com o mesmo nome: não pode atrapalhar
  ('00000000-0000-0000-0000-000000393cb1', '00000000-0000-0000-0000-0000000393ad', '00000000-0000-0000-0000-0000000393c2', 'meta', '9393101', 'Varejo');
insert into public.ad_groups (id, campaign_id, ad_account_id, client_id, platform_id, external_id, name) values
  ('00000000-0000-0000-0000-000000393ab1', '00000000-0000-0000-0000-000000393ca1', '00000000-0000-0000-0000-0000000393ac', '00000000-0000-0000-0000-0000000393c1', 'meta', '9393011', 'Lojistas 25-45'),
  ('00000000-0000-0000-0000-000000393ab2', '00000000-0000-0000-0000-000000393ca2', '00000000-0000-0000-0000-0000000393ac', '00000000-0000-0000-0000-0000000393c1', 'meta', '9393012', 'Aberto'),
  ('00000000-0000-0000-0000-000000393ab3', '00000000-0000-0000-0000-000000393ca1', '00000000-0000-0000-0000-0000000393ac', '00000000-0000-0000-0000-0000000393c1', 'meta', '9393013', 'Aberto');
insert into public.ads (id, ad_group_id, campaign_id, ad_account_id, client_id, platform_id, external_id, name) values
  ('00000000-0000-0000-0000-000000393ad1', '00000000-0000-0000-0000-000000393ab1', '00000000-0000-0000-0000-000000393ca1', '00000000-0000-0000-0000-0000000393ac', '00000000-0000-0000-0000-0000000393c1', 'meta', '9393021', 'Video Vitrine'),
  ('00000000-0000-0000-0000-000000393ad2', '00000000-0000-0000-0000-000000393ab2', '00000000-0000-0000-0000-000000393ca2', '00000000-0000-0000-0000-0000000393ac', '00000000-0000-0000-0000-0000000393c1', 'meta', '9393022', 'Video Look'),
  ('00000000-0000-0000-0000-000000393ad3', '00000000-0000-0000-0000-000000393ab3', '00000000-0000-0000-0000-000000393ca1', '00000000-0000-0000-0000-0000000393ac', '00000000-0000-0000-0000-0000000393c1', 'meta', '9393023', 'Video Look');
insert into public.metrics_daily (date, ad_account_id, level, entity_external_id, client_id, platform_id, campaign_id, ad_group_id, ad_id, currency, spend_micros, hash, superseded) values
  ('2026-10-05', '00000000-0000-0000-0000-0000000393ac', 'campaign', '9393001', '00000000-0000-0000-0000-0000000393c1', 'meta', '00000000-0000-0000-0000-000000393ca1', null, null, 'BRL', 30000000, 'h', false),
  ('2026-10-06', '00000000-0000-0000-0000-0000000393ac', 'campaign', '9393001', '00000000-0000-0000-0000-0000000393c1', 'meta', '00000000-0000-0000-0000-000000393ca1', null, null, 'BRL', 20000000, 'h', false),
  ('2026-09-20', '00000000-0000-0000-0000-0000000393ac', 'campaign', '9393001', '00000000-0000-0000-0000-0000000393c1', 'meta', '00000000-0000-0000-0000-000000393ca1', null, null, 'BRL', 99000000, 'h', false);
insert into public.ri_sources (id, client_id, spreadsheet_id, sheet_name, mapping, profile_rules)
values ('00000000-0000-0000-0000-0000000393f1', '00000000-0000-0000-0000-0000000393c1', '1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789', 'Leads', '{"profile":"Tipo"}',
        '{"lojista":"lojista","sacoleira":"sacoleiro","consumidor final":"consumidor_final"}');
select public.ri_read_store('00000000-0000-0000-0000-0000000393f1', 'manual', $j$[
  {"n":2, "k":"id:A1", "h":"h1", "d":"2026-10-10", "p":"lojista", "aid":"9393021"},
  {"n":3, "k":"id:A2", "h":"h2", "d":"2026-10-10", "p":"sacoleira", "cn":"Atacado SP", "sn":"Lojistas  25-45", "an":"video vitrine"},
  {"n":4, "k":"id:A3", "h":"h3", "d":"2026-10-11", "p":"consumidor final", "cn":"Varejo", "an":"Video Look"},
  {"n":5, "k":"id:A4", "h":"h4", "d":"2026-10-11", "p":"lojista", "an":"Video Look"},
  {"n":6, "k":"id:A5", "h":"h5", "d":"2026-10-12", "p":"lojista", "cn":"Duplicada"},
  {"n":7, "k":"L7",    "h":null, "d":"2026-10-12", "p":"", "cn":"Inexistente"},
  {"n":8, "k":"id:A7", "h":"h1", "d":"2026-10-13", "p":"lojista"},
  {"n":9, "k":"id:A8", "h":"h8", "d":null, "p":"lojista", "aid":"9393021"},
  {"n":10,"k":"id:A9", "h":"h9", "d":"2026-09-01", "p":"lojista", "cid":"9393002"},
  {"n":11,"k":"id:B1", "h":"h10","d":"2026-10-14", "p":"sacoleira", "sid":"9393013"}
]$j$::jsonb, '{}');

create temp table r (what text, v text);
grant all on r to authenticated;
create temp table res (j jsonb);
grant all on res to authenticated;
create function pg_temp.try(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return 'aceitou'; exception when others then return 'recusou'; end $$;
grant execute on function pg_temp.try(text) to authenticated;

-- Classificação e origem linha a linha (função interna)
insert into r select 'linha ' || row_number, concat_ws('|', profile, match_level, match_method, match_issue)
from private.ri_rows('00000000-0000-0000-0000-0000000393c1');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000393a3","role":"authenticated"}';
insert into res select public.ri_results('00000000-0000-0000-0000-0000000393c1', '2026-10-01', '2026-10-31') j;
insert into r select 'totais', concat_ws('|', j #>> '{totals,rows}', j #>> '{totals,contacts}', j #>> '{totals,lojista}', j #>> '{totals,sacoleiro}',
  j #>> '{totals,consumidor_final}', j #>> '{totals,nao_identificado}') from res;
insert into r select 'qualidade da origem', concat_ws('|', j #>> '{totals,with_origin}', j #>> '{totals,origin_ad}', j #>> '{totals,origin_ad_group}',
  j #>> '{totals,origin_by_name}', j #>> '{totals,no_origin}', j #>> '{totals,not_found}', j #>> '{totals,ambiguous}') from res;
insert into r select 'fora do período', concat_ws('|', j #>> '{outside,no_date}', j #>> '{outside,all_rows}') from res;
insert into r select 'ranking de campanhas', (select string_agg(concat_ws(':', i ->> 'name', i ->> 'contacts', i ->> 'lojista', i ->> 'sacoleiro', i ->> 'consumidor_final'), ' / ' order by ord)
  from res, jsonb_array_elements(j -> 'items') with ordinality x(i, ord));
insert into r select 'investimento só do período, por moeda', (select i -> 'spend' ->> 0 from res, jsonb_array_elements(j -> 'items') x(i) where i ->> 'name' = 'Atacado SP');
insert into r select 'abrir campanha: conjuntos', (select string_agg(concat_ws(':', i ->> 'name', i ->> 'contacts', i ->> 'campaign_name'), ' / ' order by i ->> 'name')
  from jsonb_array_elements(public.ri_results('00000000-0000-0000-0000-0000000393c1', '2026-10-01', '2026-10-31', 'ad_group', '00000000-0000-0000-0000-000000393ca1') -> 'items') i);
insert into r select 'anúncios e contatos sem anúncio', (select concat_ws('|', (select string_agg(concat_ws(':', i ->> 'name', i ->> 'contacts', i ->> 'ad_group_name'), ' / ' order by i ->> 'contacts' desc) from jsonb_array_elements(x -> 'items') i), x ->> 'scope_without_level')
  from public.ri_results('00000000-0000-0000-0000-0000000393c1', '2026-10-01', '2026-10-31', 'ad') x);
insert into r select 'registros ambíguos', (select count(*)::text from public.ri_records('00000000-0000-0000-0000-0000000393c1', '2026-10-01', '2026-10-31', p_issue => 'nome_ambiguo'));
insert into r select 'registros sem data', (select string_agg(row_number::text, ',') from public.ri_records('00000000-0000-0000-0000-0000000393c1', null, null, p_issue => 'sem_data'));
insert into r select 'registros de sacoleiros', (select string_agg(row_number || ':' || coalesce(ad_name, ad_group_name), ',' order by row_number) from public.ri_records('00000000-0000-0000-0000-0000000393c1', '2026-10-01', '2026-10-31', 'sacoleiro'));
insert into r select 'registros sem impressão digital do contato', (select (count(*) filter (where to_jsonb(x)::text like '%"h1"%'))::text from public.ri_records('00000000-0000-0000-0000-0000000393c1', '2026-10-01', '2026-10-31') x);
insert into r select 'período inválido recusado', pg_temp.try($q$select public.ri_results('00000000-0000-0000-0000-0000000393c1', '2026-10-31', '2026-10-01')$q$);
insert into r select 'nível inválido recusado', pg_temp.try($q$select public.ri_results('00000000-0000-0000-0000-0000000393c1', '2026-10-01', '2026-10-31', 'conta')$q$);
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000393a5","role":"authenticated"}';
insert into r select 'operador de outro cliente não vê', pg_temp.try($q$select public.ri_results('00000000-0000-0000-0000-0000000393c1', '2026-10-01', '2026-10-31')$q$);
insert into r select 'registros de outro cliente não', pg_temp.try($q$select * from public.ri_records('00000000-0000-0000-0000-0000000393c1', '2026-10-01', '2026-10-31')$q$);
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000393a4","role":"authenticated"}';
insert into r select 'cliente não vê', pg_temp.try($q$select public.ri_results('00000000-0000-0000-0000-0000000393c1', '2026-10-01', '2026-10-31')$q$);
reset role;
insert into r select 'função interna fechada', (select has_function_privilege('authenticated', 'private.ri_rows(uuid)', 'execute')::text);

-- Regra de perfil mudou: vale na hora, sem ler a planilha de novo
update public.ri_sources set profile_rules = '{"lojista":"lojista","sacoleira":"lojista","consumidor final":"consumidor_final"}' where id = '00000000-0000-0000-0000-0000000393f1';
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000393a1","role":"authenticated"}';
insert into r select 'regra nova vale na hora', (select concat_ws('|', j #>> '{totals,lojista}', j #>> '{totals,sacoleiro}') from (select public.ri_results('00000000-0000-0000-0000-0000000393c1', '2026-10-01', '2026-10-31') j) t);
reset role;

do $$
declare
  e jsonb := jsonb_build_object(
    'linha 2',  'lojista|anuncio|id',
    'linha 3',  'sacoleiro|anuncio|nome',
    'linha 4',  'consumidor_final|anuncio|nome',
    'linha 5',  'lojista|nome_ambiguo',
    'linha 6',  'lojista|nome_ambiguo',
    'linha 7',  'nao_identificado|nao_encontrada',
    'linha 8',  'lojista|sem_origem',
    'linha 9',  'lojista|anuncio|id',
    'linha 10', 'lojista|campanha|id',
    'linha 11', 'sacoleiro|conjunto|id',
    'totais', '8|7|3|2|1|1',
    'qualidade da origem', '4|3|1|2|1|1|2',
    'fora do período', '1|10',
    'ranking de campanhas', 'Atacado SP:3:1:2:0 / Varejo:1:0:0:1',
    'investimento só do período, por moeda', '{"currency": "BRL", "spend_micros": 50000000}',
    'abrir campanha: conjuntos', 'Aberto:1:Atacado SP / Lojistas 25-45:2:Atacado SP',
    'anúncios e contatos sem anúncio', 'Video Vitrine:2:Lojistas 25-45 / Video Look:1:Aberto|4',
    'registros ambíguos', '2',
    'registros sem data', '9',
    'registros de sacoleiros', '3:Video Vitrine,11:Aberto',
    'registros sem impressão digital do contato', '0',
    'período inválido recusado', 'recusou',
    'nível inválido recusado', 'recusou',
    'operador de outro cliente não vê', 'recusou',
    'registros de outro cliente não', 'recusou',
    'cliente não vê', 'recusou',
    'função interna fechada', 'false',
    'regra nova vale na hora', '5|0');
  x record;
begin
  for x in select * from r loop
    if e ->> x.what is distinct from x.v then raise exception 'FALHOU: % = % (esperado %)', x.what, x.v, e ->> x.what; end if;
  end loop;
  if (select count(*) from r) <> (select count(*) from jsonb_object_keys(e)) then raise exception 'FALHOU: faltou verificação'; end if;
  raise notice 'Etapa 39.3: % verificações OK', (select count(*) from r);
end $$;

rollback;
