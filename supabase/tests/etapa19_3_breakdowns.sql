-- =============================================================================
-- Testes da Etapa 19.3 — Divisões (idade, gênero, horário, aparelho,
-- plataforma, localização). Rodar inteiro no SQL Editor. Transação desfeita
-- no final: nada fica gravado.
-- =============================================================================
begin;

insert into auth.users (id, instance_id, aud, role, email) values
  ('00000000-0000-0000-0000-00000193aa01', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'operador@t193.local');
update public.profiles set active = true, role = 'operador' where id = '00000000-0000-0000-0000-00000193aa01';
insert into public.clients (id, name, timezone) values
  ('00000000-0000-0000-0000-00000193ac01', 'Cliente T193', 'America/Sao_Paulo'),
  ('00000000-0000-0000-0000-00000193ac02', 'Outro T193', 'America/Sao_Paulo');
insert into public.user_client_access (user_id, client_id) values ('00000000-0000-0000-0000-00000193aa01', '00000000-0000-0000-0000-00000193ac01');
insert into public.ad_accounts (id, platform_id, external_id, client_id, name, currency, status) values
  ('00000000-0000-0000-0000-00000193ad01', 'meta', '193001', '00000000-0000-0000-0000-00000193ac01', 'T193 Meta', 'BRL', 'ativa'),
  ('00000000-0000-0000-0000-00000193ad02', 'meta', '193002', '00000000-0000-0000-0000-00000193ac02', 'Outro Meta', 'BRL', 'ativa');

create temp table r193 (what text, v text) on commit drop;
grant all on r193 to authenticated, service_role;

-- Servidor grava 2 dias de idade e horário
set local role service_role;
insert into r193 select 'gravou', public.ingest_breakdowns('00000000-0000-0000-0000-00000193ad01', '2026-01-01', '2026-01-02', array['age', 'hour'], '[
  {"date":"2026-01-01","dimension":"age","value":"25-34","spend_micros":10000000,"impressions":100,"clicks":5,"leads":2,"actions":{"lead":2}},
  {"date":"2026-01-01","dimension":"age","value":"35-44","spend_micros":5000000,"impressions":50,"clicks":2,"leads":1,"actions":{"lead":1}},
  {"date":"2026-01-02","dimension":"age","value":"25-34","spend_micros":20000000,"impressions":200,"clicks":8,"leads":3,"actions":{"lead":3,"omni_purchase":1}},
  {"date":"2026-01-01","dimension":"hour","value":"09","spend_micros":15000000,"impressions":150,"clicks":7,"leads":3},
  {"date":"2026-01-01","dimension":"region","value":"Não pedida","spend_micros":1,"impressions":1,"clicks":0}
]'::jsonb)::text;
select public.ingest_breakdowns('00000000-0000-0000-0000-00000193ad02', '2026-01-01', '2026-01-01', array['age'],
  '[{"date":"2026-01-01","dimension":"age","value":"25-34","spend_micros":77000000,"impressions":1,"clicks":0}]'::jsonb);
-- Nova busca do dia 1: 35-44 sumiu (fica substituída, não apagada); horário não veio (não mexe)
select public.ingest_breakdowns('00000000-0000-0000-0000-00000193ad01', '2026-01-01', '2026-01-01', array['age'],
  '[{"date":"2026-01-01","dimension":"age","value":"25-34","spend_micros":12000000,"impressions":120,"clicks":6,"leads":2,"actions":{"lead":2}}]'::jsonb);
-- Depois de um buraco, a cobertura recomeça no período novo
select public.ingest_breakdowns('00000000-0000-0000-0000-00000193ad01', '2026-01-10', '2026-01-11', array['age'], '[]'::jsonb);
reset role;
insert into r193 select 'substituída guardada', count(*)::text from public.metrics_breakdown_daily
 where ad_account_id = '00000000-0000-0000-0000-00000193ad01' and value = '35-44' and superseded;
insert into r193 select 'dimensão não pedida', count(*)::text from public.metrics_breakdown_daily where value = 'Não pedida';
insert into r193 select 'cobertura', date_from || '|' || date_to from public.breakdown_coverage where ad_account_id = '00000000-0000-0000-0000-00000193ad01';

-- Operador liberado lê as somas do período (sem as substituídas)
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000193aa01","role":"authenticated"}';
insert into r193 select 'soma ' || dimension || ' ' || value, spend_micros || '|' || leads || '|' || coalesce(actions::text, '-')
  from public.client_report_breakdowns('00000000-0000-0000-0000-00000193ac01', '2026-01-01', '2026-01-02');
insert into r193 select 'outro cliente', count(*)::text from public.client_report_breakdowns('00000000-0000-0000-0000-00000193ac02', '2026-01-01', '2026-01-02');
insert into r193 select 'lê cobertura', count(*)::text from public.client_report_breakdown_coverage('00000000-0000-0000-0000-00000193ac01');
do $$ begin
  perform public.ingest_breakdowns('00000000-0000-0000-0000-00000193ad01', '2026-01-01', '2026-01-01', array['age'], '[]'::jsonb);
  insert into r193 values ('usuário grava', 'sim');
exception when insufficient_privilege then insert into r193 values ('usuário grava', 'não');
end $$;
reset role;

do $$
declare
  expected jsonb := jsonb_build_object(
    'gravou', '4',
    'substituída guardada', '1',
    'dimensão não pedida', '0',
    'cobertura', '2026-01-10|2026-01-11',
    'soma age 25-34', '32000000|5|{"lead": 5, "omni_purchase": 1}',
    'soma hour 09', '15000000|3|-',
    'outro cliente', '0',
    'lê cobertura', '1',
    'usuário grava', 'não');
  r record;
begin
  for r in select * from r193 loop
    if expected ->> r.what is distinct from r.v then raise exception 'FALHOU: % = % (esperado %)', r.what, r.v, expected ->> r.what; end if;
  end loop;
  if (select count(*) from r193) <> (select count(*) from jsonb_object_keys(expected)) then
    raise exception 'FALHOU: faltou verificação (%)', (select string_agg(what, ', ') from r193);
  end if;
  raise notice 'Etapa 19.3: % verificações OK', (select count(*) from r193);
end $$;

rollback;
