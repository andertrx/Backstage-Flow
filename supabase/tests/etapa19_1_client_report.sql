-- =============================================================================
-- Testes da Etapa 19.1 — Dashboard do cliente (modelo por cliente e números).
-- Rodar inteiro no SQL Editor. Transação desfeita no final: nada fica gravado.
-- =============================================================================
begin;

insert into auth.users (id, instance_id, aud, role, email) values
  ('00000000-0000-0000-0000-00000191aa01', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'operador@t191.local'),
  ('00000000-0000-0000-0000-00000191aa02', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'gestor@t191.local'),
  ('00000000-0000-0000-0000-00000191aa03', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cliente@t191.local');
update public.profiles set active = true, role = 'operador' where id = '00000000-0000-0000-0000-00000191aa01';
update public.profiles set active = true, role = 'gestor' where id = '00000000-0000-0000-0000-00000191aa02';
update public.profiles set active = true, role = 'cliente' where id = '00000000-0000-0000-0000-00000191aa03';
insert into public.clients (id, name, timezone) values
  ('00000000-0000-0000-0000-00000191ac01', 'Cliente T191', 'America/Sao_Paulo'),
  ('00000000-0000-0000-0000-00000191ac02', 'Outro T191', 'America/Sao_Paulo');
insert into public.user_client_access (user_id, client_id) values
  ('00000000-0000-0000-0000-00000191aa01', '00000000-0000-0000-0000-00000191ac01'),
  ('00000000-0000-0000-0000-00000191aa02', '00000000-0000-0000-0000-00000191ac01'),
  ('00000000-0000-0000-0000-00000191aa03', '00000000-0000-0000-0000-00000191ac01');
insert into public.ad_accounts (id, platform_id, external_id, client_id, name, currency, status) values
  ('00000000-0000-0000-0000-00000191ad01', 'meta', '191001', '00000000-0000-0000-0000-00000191ac01', 'T191 Meta', 'BRL', 'ativa'),
  ('00000000-0000-0000-0000-00000191ad02', 'google', '1910020000', '00000000-0000-0000-0000-00000191ac01', 'T191 Google', 'USD', 'ativa'),
  ('00000000-0000-0000-0000-00000191ad03', 'meta', '191003', '00000000-0000-0000-0000-00000191ac02', 'Outro Meta', 'BRL', 'ativa');
insert into public.campaigns (id, ad_account_id, client_id, platform_id, external_id, name, status) values
  ('00000000-0000-0000-0000-00000191ae01', '00000000-0000-0000-0000-00000191ad01', '00000000-0000-0000-0000-00000191ac01', 'meta', 'c1', 'Leads', 'ativa'),
  ('00000000-0000-0000-0000-00000191ae02', '00000000-0000-0000-0000-00000191ad01', '00000000-0000-0000-0000-00000191ac01', 'meta', 'c2', 'Sem entrega', 'ativa');

-- Período testado: 01 a 07/01/2026. Anterior (mesmo tamanho): 25 a 31/12/2025.
create function pg_temp.m(d date, acc uuid, lvl text, ext text, camp uuid, spend bigint, leads numeric, acts jsonb)
returns void language sql as $$
  insert into public.metrics_daily (date, ad_account_id, level, entity_external_id, client_id, platform_id, campaign_id, currency,
    spend_micros, impressions, clicks, link_clicks, leads, messages, conversions, raw_actions, hash)
  select d, a.id, lvl::public.entity_level, ext, a.client_id, a.platform_id, camp, a.currency, spend, 1000, 50,
         case when a.platform_id = 'meta' then 40 end, leads, case when a.platform_id = 'meta' then 1 end,
         case when a.platform_id = 'google' then 3 end, acts, md5(random()::text)
    from public.ad_accounts a where a.id = acc
$$;
select pg_temp.m('2026-01-02', '00000000-0000-0000-0000-00000191ad01', 'account', '191001', null, 100000000, 10,
  '{"actions":[{"action_type":"lead","value":"10"},{"action_type":"omni_purchase","value":"2"}]}');
select pg_temp.m('2026-01-03', '00000000-0000-0000-0000-00000191ad01', 'account', '191001', null, 50000000, 5,
  '{"actions":[{"action_type":"lead","value":"5"},{"action_type":"omni_purchase","value":"1"}]}');
select pg_temp.m('2025-12-30', '00000000-0000-0000-0000-00000191ad01', 'account', '191001', null, 30000000, 3,
  '{"actions":[{"action_type":"lead","value":"3"}]}');
select pg_temp.m('2026-01-08', '00000000-0000-0000-0000-00000191ad01', 'account', '191001', null, 999000000, 99, null); -- fora do período
select pg_temp.m('2026-01-02', '00000000-0000-0000-0000-00000191ad01', 'campaign', 'c1', '00000000-0000-0000-0000-00000191ae01', 150000000, 15,
  '{"actions":[{"action_type":"lead","value":"15"}]}');
select pg_temp.m('2026-01-02', '00000000-0000-0000-0000-00000191ad01', 'campaign', 'c2', '00000000-0000-0000-0000-00000191ae02', 0, 0, null);
select pg_temp.m('2026-01-02', '00000000-0000-0000-0000-00000191ad02', 'account', '1910020000', null, 20000000, null, null);
select pg_temp.m('2026-01-02', '00000000-0000-0000-0000-00000191ad03', 'account', '191003', null, 77000000, 7, null);
insert into public.period_reach (ad_account_id, level, entity_external_id, period_start, period_end, client_id, reach, impressions, frequency) values
  ('00000000-0000-0000-0000-00000191ad01', 'account', '191001', '2026-01-01', '2026-01-07', '00000000-0000-0000-0000-00000191ac01', 800, 2000, 2.5),
  ('00000000-0000-0000-0000-00000191ad01', 'account', '191001', '2026-01-02', '2026-01-07', '00000000-0000-0000-0000-00000191ac01', 111, 2000, 9);

create temp table r191 (what text, v text) on commit drop;
grant all on r191 to authenticated;

-- Operador liberado para o cliente
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000191aa01","role":"authenticated"}';
insert into r191 select 'contas:' || a.name,
  concat_ws('|', a.currency, a.cur ->> 'spend_micros', coalesce(a.cur ->> 'leads', '-'), coalesce(a.cur ->> 'reach', '-'), coalesce(a.cur ->> 'frequency', '-'),
    coalesce(a.cur -> 'actions' ->> 'omni_purchase', '-'), coalesce(a.prev ->> 'spend_micros', '-'), coalesce(a.prev ->> 'leads', '-'), a.prev_from, a.prev_to)
  from public.client_report_accounts('00000000-0000-0000-0000-00000191ac01', '2026-01-01', '2026-01-07') a;
insert into r191 select 'dias', count(*)::text from public.client_report_daily('00000000-0000-0000-0000-00000191ac01', '2026-01-01', '2026-01-07');
insert into r191 select 'campanhas', string_agg(c.name || ':' || c.spend_micros || ':' || (c.actions ->> 'lead'), ',')
  from public.client_report_campaigns('00000000-0000-0000-0000-00000191ac01', '2026-01-01', '2026-01-07') c;
insert into r191 select 'outro cliente', count(*)::text from public.client_report_accounts('00000000-0000-0000-0000-00000191ac02', '2026-01-01', '2026-01-07');
do $$ begin
  insert into public.client_report_settings (client_id, title) values ('00000000-0000-0000-0000-00000191ac01', 'Operador tentou');
  insert into r191 values ('operador grava modelo', 'sim');
exception when insufficient_privilege then insert into r191 values ('operador grava modelo', 'não');
end $$;
do $$ begin
  perform * from public.client_report_accounts('00000000-0000-0000-0000-00000191ac01', '2024-01-01', '2026-01-07');
  insert into r191 values ('período longo', 'aceito');
exception when others then insert into r191 values ('período longo', 'recusado');
end $$;

-- Gestor liberado: cria e edita o modelo; métrica desconhecida é recusada
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000191aa02","role":"authenticated"}';
insert into public.client_report_settings (client_id, title, main_result, kpis)
  values ('00000000-0000-0000-0000-00000191ac01', 'Relatório T191', '{"source":"action","action_type":"omni_purchase","label":"Vendas"}', '{spend,main_result}');
update public.client_report_settings set agency_notes = 'Boa semana' where client_id = '00000000-0000-0000-0000-00000191ac01';
insert into r191 select 'gestor grava modelo', title || '|' || agency_notes from public.client_report_settings where client_id = '00000000-0000-0000-0000-00000191ac01';
do $$ begin
  update public.client_report_settings set kpis = '{spend,inventada}' where client_id = '00000000-0000-0000-0000-00000191ac01';
  insert into r191 values ('métrica inventada', 'aceita');
exception when check_violation then insert into r191 values ('métrica inventada', 'recusada');
end $$;
do $$ begin
  insert into public.client_report_settings (client_id, title) values ('00000000-0000-0000-0000-00000191ac02', 'Não liberado');
  insert into r191 values ('gestor em cliente não liberado', 'sim');
exception when insufficient_privilege then insert into r191 values ('gestor em cliente não liberado', 'não');
end $$;

-- Papel cliente: lê o próprio modelo, não altera
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000191aa03","role":"authenticated"}';
insert into r191 select 'cliente lê modelo', count(*)::text from public.client_report_settings;
update public.client_report_settings set title = 'Hackeado' where client_id = '00000000-0000-0000-0000-00000191ac01';
reset role;
insert into r191 select 'cliente altera modelo', case when title = 'Hackeado' then 'sim' else 'não' end
  from public.client_report_settings where client_id = '00000000-0000-0000-0000-00000191ac01';

do $$
declare
  expected jsonb := jsonb_build_object(
    'contas:T191 Meta', 'BRL|150000000|15.0000|800|2.5000|3|30000000|3.0000|2025-12-25|2025-12-31',
    'contas:T191 Google', 'USD|20000000|-|-|-|-|-|-|2025-12-25|2025-12-31',
    'dias', '3',
    'campanhas', 'Leads:150000000:15',
    'outro cliente', '0',
    'operador grava modelo', 'não',
    'período longo', 'recusado',
    'gestor grava modelo', 'Relatório T191|Boa semana',
    'métrica inventada', 'recusada',
    'gestor em cliente não liberado', 'não',
    'cliente lê modelo', '1',
    'cliente altera modelo', 'não');
  r record;
begin
  for r in select * from r191 loop
    if expected ->> r.what is distinct from r.v then raise exception 'FALHOU: % = % (esperado %)', r.what, r.v, expected ->> r.what; end if;
  end loop;
  if (select count(*) from r191) <> (select count(*) from jsonb_object_keys(expected)) then
    raise exception 'FALHOU: faltou verificação (%)', (select count(*) from r191);
  end if;
  if has_function_privilege('anon', 'public.client_report_accounts(uuid, date, date)', 'execute') then
    raise exception 'FALHOU: visitante sem login consegue consultar';
  end if;
  raise notice 'Etapa 19.1: % verificações OK', (select count(*) from r191) + 1;
end $$;

rollback;
