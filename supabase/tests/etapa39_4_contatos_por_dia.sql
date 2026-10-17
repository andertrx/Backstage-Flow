-- =============================================================================
-- Testes da Etapa 39.4 — contatos por dia (gráfico da Inteligência de Resultados).
-- Rodar inteiro no SQL Editor. Transação desfeita no final: nada fica gravado.
-- =============================================================================
begin;
insert into auth.users (id, instance_id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000394a3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'operador@t394.local'),
  ('00000000-0000-0000-0000-0000000394a4', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cliente@t394.local');
update public.profiles set active = true, role = 'operador' where id = '00000000-0000-0000-0000-0000000394a3';
update public.profiles set active = true, role = 'cliente'  where id = '00000000-0000-0000-0000-0000000394a4';
insert into public.clients (id, name) values ('00000000-0000-0000-0000-0000000394c1', 'Cliente T394');
insert into public.user_client_access (user_id, client_id) values
  ('00000000-0000-0000-0000-0000000394a3', '00000000-0000-0000-0000-0000000394c1'),
  ('00000000-0000-0000-0000-0000000394a4', '00000000-0000-0000-0000-0000000394c1');
insert into public.ad_accounts (id, platform_id, external_id, client_id, name, currency, timezone) values
  ('00000000-0000-0000-0000-0000000394ac', 'meta', 't394a', '00000000-0000-0000-0000-0000000394c1', 'Conta T394', 'BRL', 'America/Sao_Paulo');
insert into public.campaigns (id, ad_account_id, client_id, platform_id, external_id, name) values
  ('00000000-0000-0000-0000-000000394ca1', '00000000-0000-0000-0000-0000000394ac', '00000000-0000-0000-0000-0000000394c1', 'meta', '9394001', 'Atacado');
insert into public.ri_sources (id, client_id, spreadsheet_id, sheet_name, mapping, profile_rules)
values ('00000000-0000-0000-0000-0000000394f1', '00000000-0000-0000-0000-0000000394c1', '1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789', 'Leads', '{"profile":"Tipo"}',
        '{"lojista":"lojista","sacoleira":"sacoleiro"}');
select public.ri_read_store('00000000-0000-0000-0000-0000000394f1', 'manual', $j$[
  {"n":2, "k":"id:1", "h":"h1", "d":"2026-10-10", "p":"lojista", "cid":"9394001"},
  {"n":3, "k":"id:2", "h":"h1", "d":"2026-10-10", "p":"lojista", "cid":"9394001"},
  {"n":4, "k":"id:3", "h":"h2", "d":"2026-10-10", "p":"sacoleira"},
  {"n":5, "k":"id:4", "h":"h3", "d":"2026-10-12", "p":"x", "cid":"9394001"},
  {"n":6, "k":"id:5", "h":"h4", "d":"2026-11-01", "p":"lojista"}
]$j$::jsonb, '{}');

create temp table r (what text, v text);
grant all on r to authenticated;
create function pg_temp.try(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return 'aceitou'; exception when others then return 'recusou'; end $$;
grant execute on function pg_temp.try(text) to authenticated;

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000394a3","role":"authenticated"}';
insert into r select 'dias do período', (select string_agg(concat_ws(':', day, contacts, lojista, sacoleiro, nao_identificado), ' / ' order by day)
  from public.ri_daily('00000000-0000-0000-0000-0000000394c1', '2026-10-01', '2026-10-31'));
insert into r select 'só a campanha', (select string_agg(concat_ws(':', day, contacts), ' / ' order by day)
  from public.ri_daily('00000000-0000-0000-0000-0000000394c1', '2026-10-01', '2026-10-31', '00000000-0000-0000-0000-000000394ca1'));
insert into r select 'período inválido', pg_temp.try($q$select * from public.ri_daily('00000000-0000-0000-0000-0000000394c1', '2026-10-31', '2026-10-01')$q$);
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000394a4","role":"authenticated"}';
insert into r select 'cliente não vê', pg_temp.try($q$select * from public.ri_daily('00000000-0000-0000-0000-0000000394c1', '2026-10-01', '2026-10-31')$q$);
reset role;

do $$
declare
  e jsonb := jsonb_build_object(
    'dias do período', '2026-10-10:2:1:1:0 / 2026-10-12:1:0:0:1',
    'só a campanha', '2026-10-10:1 / 2026-10-12:1',
    'período inválido', 'recusou',
    'cliente não vê', 'recusou');
  x record;
begin
  for x in select * from r loop
    if e ->> x.what is distinct from x.v then raise exception 'FALHOU: % = % (esperado %)', x.what, x.v, e ->> x.what; end if;
  end loop;
  if (select count(*) from r) <> (select count(*) from jsonb_object_keys(e)) then raise exception 'FALHOU: faltou verificação'; end if;
  raise notice 'Etapa 39.4: % verificações OK', (select count(*) from r);
end $$;

rollback;
