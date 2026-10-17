-- =============================================================================
-- Testes da Etapa 39.2 — leitura da planilha (última leitura, trava, falha, ligar/desligar).
-- Rodar inteiro no SQL Editor. Transação desfeita no final: nada fica gravado.
-- =============================================================================
begin;
insert into auth.users (id, instance_id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000392a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@t392.local'),
  ('00000000-0000-0000-0000-0000000392a3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'operador@t392.local'),
  ('00000000-0000-0000-0000-0000000392a4', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cliente@t392.local');
update public.profiles set active = true, role = 'admin'    where id = '00000000-0000-0000-0000-0000000392a1';
update public.profiles set active = true, role = 'operador' where id = '00000000-0000-0000-0000-0000000392a3';
update public.profiles set active = true, role = 'cliente'  where id = '00000000-0000-0000-0000-0000000392a4';
insert into public.clients (id, name) values ('00000000-0000-0000-0000-0000000392c1', 'Cliente T392');
insert into public.user_client_access (user_id, client_id) values
  ('00000000-0000-0000-0000-0000000392a3', '00000000-0000-0000-0000-0000000392c1'),
  ('00000000-0000-0000-0000-0000000392a4', '00000000-0000-0000-0000-0000000392c1');
insert into public.ri_sources (id, client_id, spreadsheet_id, sheet_name, mapping)
values ('00000000-0000-0000-0000-0000000392f1', '00000000-0000-0000-0000-0000000392c1', '1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789', 'Leads', '{"profile":"Tipo"}');

create temp table r (what text, v text);
grant all on r to authenticated;
create function pg_temp.try(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return 'aceitou'; exception when others then return 'recusou'; end $$;
grant execute on function pg_temp.try(text) to authenticated;
create function pg_temp.src() returns text language sql as $$
  select read_status || '|' || consecutive_failures || '|' || (lease_until is not null) from public.ri_sources where id = '00000000-0000-0000-0000-0000000392f1' $$;

-- Servidor (service_role): reservar, guardar, falhar
insert into r select 'reserva', public.ri_read_claim('00000000-0000-0000-0000-0000000392f1')::text;
insert into r select 'não lê duas vezes ao mesmo tempo', public.ri_read_claim('00000000-0000-0000-0000-0000000392f1')::text;
insert into r select 'situação lendo', pg_temp.src();
select public.ri_read_store('00000000-0000-0000-0000-0000000392f1', 'manual',
  '[{"n":2,"k":"id:A1","h":"x","d":"2026-10-10","p":"lojista"},{"n":3,"k":"id:A2","h":null,"d":null,"p":"sacoleira"}]', '{"total":2}');
insert into r select 'leitura guardada', (select row_count || '|' || trigger || '|' || (stats ->> 'total') from public.ri_snapshots where source_id = '00000000-0000-0000-0000-0000000392f1');
insert into r select 'situação ok e trava liberada', pg_temp.src();
select public.ri_read_claim('00000000-0000-0000-0000-0000000392f1');
select public.ri_read_fail('00000000-0000-0000-0000-0000000392f1', 'A planilha não está compartilhada com o CRM.');
insert into r select 'falha registrada', pg_temp.src() || '|' || (select last_error from public.ri_sources where id = '00000000-0000-0000-0000-0000000392f1');
insert into r select 'falha não apaga a última leitura', (select row_count::text from public.ri_snapshots where source_id = '00000000-0000-0000-0000-0000000392f1');
select public.ri_read_claim('00000000-0000-0000-0000-0000000392f1');
select public.ri_read_store('00000000-0000-0000-0000-0000000392f1', 'agendada', '[{"n":2,"k":"id:A1","p":"lojista"}]', '{"total":1}');
insert into r select 'nova leitura troca a anterior', (select count(*) || '|' || max(row_count) || '|' || max(trigger) from public.ri_snapshots where source_id = '00000000-0000-0000-0000-0000000392f1');
insert into r select 'falhas zeradas', pg_temp.src();

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000392a3","role":"authenticated"}';
insert into r select 'operador vê a leitura', (select count(*)::text from public.ri_snapshots);
insert into r select 'operador não grava leitura', pg_temp.try($q$select public.ri_read_store('00000000-0000-0000-0000-0000000392f1', 'manual', '[]', '{}')$q$);
insert into r select 'operador não reserva', pg_temp.try($q$select public.ri_read_claim('00000000-0000-0000-0000-0000000392f1')$q$);
insert into r select 'operador não desliga', pg_temp.try($q$select public.ri_source_set_enabled('00000000-0000-0000-0000-0000000392f1', false)$q$);
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000392a4","role":"authenticated"}';
insert into r select 'cliente não vê a leitura', (select count(*)::text from public.ri_snapshots);
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000392a1","role":"authenticated"}';
select public.ri_source_set_enabled('00000000-0000-0000-0000-0000000392f1', false);
insert into r select 'admin desliga a leitura automática', (select enabled::text from public.ri_sources where id = '00000000-0000-0000-0000-0000000392f1');
reset role;
insert into r select 'botão lê mesmo desligada', public.ri_read_claim('00000000-0000-0000-0000-0000000392f1')::text;
insert into r select 'agendamento 8h, 12h e 16h', (select schedule from cron.job where jobname = 'sheets-read');

do $$
declare
  e jsonb := jsonb_build_object(
    'reserva', 'true',
    'não lê duas vezes ao mesmo tempo', 'false',
    'situação lendo', 'lendo|0|true',
    'leitura guardada', '2|manual|2',
    'situação ok e trava liberada', 'ok|0|false',
    'falha registrada', 'erro|1|false|A planilha não está compartilhada com o CRM.',
    'falha não apaga a última leitura', '2',
    'nova leitura troca a anterior', '1|1|agendada',
    'falhas zeradas', 'ok|0|false',
    'operador vê a leitura', '1',
    'operador não grava leitura', 'recusou',
    'operador não reserva', 'recusou',
    'operador não desliga', 'recusou',
    'cliente não vê a leitura', '0',
    'admin desliga a leitura automática', 'false',
    'botão lê mesmo desligada', 'true',
    'agendamento 8h, 12h e 16h', '0 11,15,19 * * *');
  x record;
begin
  for x in select * from r loop
    if e ->> x.what is distinct from x.v then raise exception 'FALHOU: % = % (esperado %)', x.what, x.v, e ->> x.what; end if;
  end loop;
  if (select count(*) from r) <> (select count(*) from jsonb_object_keys(e)) then raise exception 'FALHOU: faltou verificação'; end if;
  raise notice 'Etapa 39.2: % verificações OK', (select count(*) from r);
end $$;

rollback;
