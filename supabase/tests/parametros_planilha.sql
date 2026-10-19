-- =============================================================================
-- Testes — parâmetros da planilha refeitos (19/10/2026): campos novos, parâmetros
-- personalizados e parâmetros extras nos registros. Transação desfeita no final.
-- =============================================================================
begin;
insert into auth.users (id, instance_id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000396a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@t396.local'),
  ('00000000-0000-0000-0000-0000000396a4', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cliente@t396.local');
update public.profiles set active = true, role = 'admin'   where id = '00000000-0000-0000-0000-0000000396a1';
update public.profiles set active = true, role = 'cliente' where id = '00000000-0000-0000-0000-0000000396a4';
insert into public.clients (id, name) values ('00000000-0000-0000-0000-0000000396c1', 'Cliente T396');
insert into public.user_client_access (user_id, client_id) values ('00000000-0000-0000-0000-0000000396a4', '00000000-0000-0000-0000-0000000396c1');

create temp table r (what text, v text);
grant all on r to authenticated;
create function pg_temp.try(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return 'aceitou'; exception when others then return 'recusou'; end $$;
grant execute on function pg_temp.try(text) to authenticated;

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000396a1","role":"authenticated"}';
insert into r select 'salva com os parâmetros novos e personalizado', pg_temp.try($q$select public.ri_source_save(null, '00000000-0000-0000-0000-0000000396c1',
  '1PaRaMeTrOsAaAaAaAaAaAaAaAaAaAaAaAaAa', 'Leads', 'Leads', 1,
  '{"contact_name":"Nome","contact_key":"Número","profile":"SQL","contact_date":"Data","utm_source":"utm_source","utm_medium":"utm_medium","gclid":"gclid","fbclid":"fbclid","x:Cidade":"Cidade"}',
  '{"lojista":"lojista"}')$q$);
insert into r select 'campo desconhecido recusado', pg_temp.try($q$select public.ri_source_save(null, '00000000-0000-0000-0000-0000000396c1',
  '1PaRaMeTrOsBbBbBbBbBbBbBbBbBbBbBbBbBb', 'Leads', 'Leads', 1, '{"profile":"SQL","cpf":"CPF"}', '{}')$q$);
insert into r select 'personalizado sem nome recusado', pg_temp.try($q$select public.ri_source_save(null, '00000000-0000-0000-0000-0000000396c1',
  '1PaRaMeTrOsCcCcCcCcCcCcCcCcCcCcCcCcCc', 'Leads', 'Leads', 1, '{"profile":"SQL","x: ":"A"}', '{}')$q$);
insert into r select 'mais de 20 personalizados recusado', pg_temp.try(format($q$select public.ri_source_save(null, '00000000-0000-0000-0000-0000000396c1',
  '1PaRaMeTrOsDdDdDdDdDdDdDdDdDdDdDdDdDd', 'Leads', 'Leads', 1, %L, '{}')$q$,
  (select jsonb_object_agg('x:P' || i, 'C' || i) || '{"profile":"SQL"}' from generate_series(1, 21) i)));
insert into r select 'sem SQL recusado com mensagem nova', (select case when pg_temp.try($q$select public.ri_source_save(null, '00000000-0000-0000-0000-0000000396c1',
  '1PaRaMeTrOsEeEeEeEeEeEeEeEeEeEeEeEeEe', 'Leads', 'Leads', 1, '{"contact_name":"Nome"}', '{}')$q$) = 'recusou' then 'recusou' end);
reset role;
select public.ri_read_store((select id from public.ri_sources where client_id = '00000000-0000-0000-0000-0000000396c1'), 'manual',
  '[{"n":2,"k":"L2","h":"x1","d":"2026-10-10","p":"lojista","us":"facebook","um":"paid_social","fb":true,"x":{"Cidade":"Campinas"}},
    {"n":3,"k":"L3","h":"x2","d":"2026-10-10","p":"lojista","us":"google","gc":true}]', '{}');
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000396a1","role":"authenticated"}';
insert into r select 'parâmetros extras dos registros', (select string_agg(concat_ws('|', row_number, utm_source, utm_medium, click, custom ->> 'Cidade'), ' / ' order by row_number)
  from public.ri_records_extra('00000000-0000-0000-0000-0000000396c1', array[2, 3]));
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000396a4","role":"authenticated"}';
insert into r select 'cliente não vê os parâmetros', pg_temp.try($q$select * from public.ri_records_extra('00000000-0000-0000-0000-0000000396c1', array[2])$q$);
reset role;

do $$
declare
  e jsonb := jsonb_build_object(
    'salva com os parâmetros novos e personalizado', 'aceitou',
    'campo desconhecido recusado', 'recusou',
    'personalizado sem nome recusado', 'recusou',
    'mais de 20 personalizados recusado', 'recusou',
    'sem SQL recusado com mensagem nova', 'recusou',
    'parâmetros extras dos registros', '2|facebook|paid_social|meta|Campinas / 3|google|google',
    'cliente não vê os parâmetros', 'recusou');
  x record;
begin
  for x in select * from r loop
    if e ->> x.what is distinct from x.v then raise exception 'FALHOU: % = % (esperado %)', x.what, x.v, e ->> x.what; end if;
  end loop;
  if (select count(*) from r) <> (select count(*) from jsonb_object_keys(e)) then raise exception 'FALHOU: faltou verificação'; end if;
  raise notice 'Parâmetros da planilha: % verificações OK', (select count(*) from r);
end $$;

rollback;
