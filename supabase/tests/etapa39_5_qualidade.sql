-- =============================================================================
-- Testes da Etapa 39.5 — qualidade dos dados da planilha (Inteligência de Resultados).
-- Rodar inteiro no SQL Editor. Transação desfeita no final: nada fica gravado.
-- =============================================================================
begin;
insert into auth.users (id, instance_id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000395a3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'operador@t395.local'),
  ('00000000-0000-0000-0000-0000000395a4', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cliente@t395.local');
update public.profiles set active = true, role = 'operador' where id = '00000000-0000-0000-0000-0000000395a3';
update public.profiles set active = true, role = 'cliente'  where id = '00000000-0000-0000-0000-0000000395a4';
insert into public.clients (id, name) values ('00000000-0000-0000-0000-0000000395c1', 'Cliente T395');
insert into public.user_client_access (user_id, client_id) values
  ('00000000-0000-0000-0000-0000000395a3', '00000000-0000-0000-0000-0000000395c1'),
  ('00000000-0000-0000-0000-0000000395a4', '00000000-0000-0000-0000-0000000395c1');
insert into public.ad_accounts (id, platform_id, external_id, client_id, name, currency, timezone) values
  ('00000000-0000-0000-0000-0000000395ac', 'meta', 't395a', '00000000-0000-0000-0000-0000000395c1', 'Conta T395', 'BRL', 'America/Sao_Paulo');
insert into public.campaigns (id, ad_account_id, client_id, platform_id, external_id, name) values
  ('00000000-0000-0000-0000-000000395ca1', '00000000-0000-0000-0000-0000000395ac', '00000000-0000-0000-0000-0000000395c1', 'meta', '9395001', 'Atacado'),
  ('00000000-0000-0000-0000-000000395ca2', '00000000-0000-0000-0000-0000000395ac', '00000000-0000-0000-0000-0000000395c1', 'meta', '9395002', 'Dup'),
  ('00000000-0000-0000-0000-000000395ca3', '00000000-0000-0000-0000-0000000395ac', '00000000-0000-0000-0000-0000000395c1', 'meta', '9395003', 'Dup');
insert into public.ri_sources (id, client_id, spreadsheet_id, sheet_name, mapping, profile_rules)
values ('00000000-0000-0000-0000-0000000395f1', '00000000-0000-0000-0000-0000000395c1', '1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789', 'Leads', '{"profile":"Tipo"}',
        '{"lojista":"lojista","curioso":"nao_identificado"}');
select public.ri_read_store('00000000-0000-0000-0000-0000000395f1', 'manual', $j$[
  {"n":2, "k":"id:1", "h":"h1", "d":"2026-10-10", "p":"lojista", "cid":"9395001"},
  {"n":3, "k":"id:2", "h":"h2", "d":"2026-10-10", "p":"sacoleira", "cn":"Atacado"},
  {"n":4, "k":"id:3", "h":"h3", "d":null, "p":"sacoleira", "cn":"Dup"},
  {"n":5, "k":"id:4", "h":"h4", "d":"2026-10-12", "p":"curioso", "cn":"Inexistente"},
  {"n":6, "k":"id:5", "h":"h5", "d":"2026-10-12", "p":"", "cn":"Inexistente"},
  {"n":7, "k":"id:6", "h":"h6", "d":"2026-10-12", "p":"loja fisica"}
]$j$::jsonb, '{"total":6,"duplicates":1}');

create temp table r (what text, v text);
grant all on r to authenticated;
create function pg_temp.try(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return 'aceitou'; exception when others then return 'recusou'; end $$;
grant execute on function pg_temp.try(text) to authenticated;
create temp table q (j jsonb);
grant all on q to authenticated;

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000395a3","role":"authenticated"}';
insert into q select public.ri_quality('00000000-0000-0000-0000-0000000395c1');
insert into r select 'contagens', concat_ws('|', j ->> 'rows', j ->> 'origin_campaign', j ->> 'origin_by_name', j ->> 'no_origin', j ->> 'not_found', j ->> 'ambiguous', j ->> 'no_date', j ->> 'empty_profile') from q;
insert into r select 'valores sem regra (o marcado como não identificado não entra)', (select string_agg(x ->> 'value' || ':' || (x ->> 'rows'), ',') from q, jsonb_array_elements(j -> 'unknown_profiles') x);
insert into r select 'nomes que não ligaram', (select string_agg(concat_ws(':', x ->> 'campaign', x ->> 'issue', x ->> 'rows'), ',' order by x ->> 'campaign') from q, jsonb_array_elements(j -> 'unmatched_names') x);
insert into r select 'números da leitura', (select x #>> '{stats,duplicates}' from q, jsonb_array_elements(j -> 'sources') x);
insert into r select 'sem dados pessoais', (select (j::text like '%"h1"%')::text from q);
insert into r select 'registros de todas as datas', (select string_agg(row_number::text, ',' order by row_number) from public.ri_records('00000000-0000-0000-0000-0000000395c1', null, null, 'nao_identificado'));
insert into r select 'sem data continua funcionando', (select string_agg(row_number::text, ',') from public.ri_records('00000000-0000-0000-0000-0000000395c1', null, null, p_issue => 'sem_data'));
insert into r select 'período só com início recusado', pg_temp.try($q$select * from public.ri_records('00000000-0000-0000-0000-0000000395c1', '2026-10-01', null)$q$);
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000395a4","role":"authenticated"}';
insert into r select 'cliente não vê', pg_temp.try($q$select public.ri_quality('00000000-0000-0000-0000-0000000395c1')$q$);
reset role;

do $$
declare
  e jsonb := jsonb_build_object(
    'contagens', '6|2|1|1|2|1|1|1',
    'valores sem regra (o marcado como não identificado não entra)', 'sacoleira:2,loja fisica:1',
    'nomes que não ligaram', 'Dup:nome_ambiguo:1,Inexistente:nao_encontrada:2',
    'números da leitura', '1',
    'sem dados pessoais', 'false',
    'registros de todas as datas', '3,4,5,6,7',
    'período só com início recusado', 'recusou',
    'sem data continua funcionando', '4',
    'cliente não vê', 'recusou');
  x record;
begin
  for x in select * from r loop
    if e ->> x.what is distinct from x.v then raise exception 'FALHOU: % = % (esperado %)', x.what, x.v, e ->> x.what; end if;
  end loop;
  if (select count(*) from r) <> (select count(*) from jsonb_object_keys(e)) then raise exception 'FALHOU: faltou verificação'; end if;
  raise notice 'Etapa 39.5: % verificações OK', (select count(*) from r);
end $$;

rollback;
