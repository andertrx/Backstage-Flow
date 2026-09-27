-- =============================================================================
-- Testes da Etapa 34.4 — Atribuição por campanha e qualidade do tracking.
-- Rodar inteiro no SQL Editor. Transação desfeita no final: nada fica gravado.
-- =============================================================================
begin;

insert into auth.users (id, instance_id, aud, role, email) values
  ('00000000-0000-0000-0000-00000344aa01', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'operador@t344.local');
update public.profiles set active = true, role = 'operador' where id = '00000000-0000-0000-0000-00000344aa01';
insert into public.clients (id, name, timezone) values
  ('00000000-0000-0000-0000-00000344ac01', 'Cliente T344', 'America/Sao_Paulo'),
  ('00000000-0000-0000-0000-00000344ac02', 'Outro T344', 'America/Sao_Paulo');
insert into public.user_client_access (user_id, client_id) values ('00000000-0000-0000-0000-00000344aa01', '00000000-0000-0000-0000-00000344ac01');
insert into public.tracking_containers (id, client_id, name, allowed_domains, test_mode) values
  ('00000000-0000-0000-0000-00000344ab01', '00000000-0000-0000-0000-00000344ac01', 'Loja', '{loja344.com.br}', false),
  ('00000000-0000-0000-0000-00000344ab02', '00000000-0000-0000-0000-00000344ac02', 'Outro', '{outro344.com.br}', false);
insert into public.ad_accounts (id, platform_id, external_id, client_id, name, currency, status) values
  ('00000000-0000-0000-0000-00000344ad01', 'meta', '344001', '00000000-0000-0000-0000-00000344ac01', 'Loja Meta', 'BRL', 'ativa'),
  ('00000000-0000-0000-0000-00000344ad02', 'meta', '344002', '00000000-0000-0000-0000-00000344ac02', 'Outro Meta', 'BRL', 'ativa');
insert into public.campaigns (id, ad_account_id, client_id, platform_id, external_id, name, status) values
  ('00000000-0000-0000-0000-00000344ae01', '00000000-0000-0000-0000-00000344ad01', '00000000-0000-0000-0000-00000344ac01', 'meta', '111', 'Black Friday', 'ativa'),
  ('00000000-0000-0000-0000-00000344ae02', '00000000-0000-0000-0000-00000344ad01', '00000000-0000-0000-0000-00000344ac01', 'meta', '222', 'Remarketing', 'ativa'),
  ('00000000-0000-0000-0000-00000344ae03', '00000000-0000-0000-0000-00000344ad01', '00000000-0000-0000-0000-00000344ac01', 'meta', '333', 'Dup', 'ativa'),
  ('00000000-0000-0000-0000-00000344ae04', '00000000-0000-0000-0000-00000344ad01', '00000000-0000-0000-0000-00000344ac01', 'meta', '444', 'Dup', 'ativa'),
  ('00000000-0000-0000-0000-00000344ae05', '00000000-0000-0000-0000-00000344ad01', '00000000-0000-0000-0000-00000344ac01', 'meta', '555', 'Sem conversao', 'ativa'),
  ('00000000-0000-0000-0000-00000344ae06', '00000000-0000-0000-0000-00000344ad02', '00000000-0000-0000-0000-00000344ac02', 'meta', '666', 'Outro cliente', 'ativa');

-- Investimento: hoje (no fuso do cliente) e um dia fora do período
create temp table d344 on commit drop as select (now() at time zone 'America/Sao_Paulo')::date as hoje;
select public.ingest_metrics_daily(jsonb_build_array(
  jsonb_build_object('date', (select hoje from d344), 'ad_account_id', '00000000-0000-0000-0000-00000344ad01', 'level', 'campaign', 'entity_external_id', '111',
    'campaign_id', '00000000-0000-0000-0000-00000344ae01', 'spend_micros', 100000000, 'leads', 5, 'conversions', 2, 'conversion_value_micros', 300000000),
  jsonb_build_object('date', (select hoje from d344) - 10, 'ad_account_id', '00000000-0000-0000-0000-00000344ad01', 'level', 'campaign', 'entity_external_id', '111',
    'campaign_id', '00000000-0000-0000-0000-00000344ae01', 'spend_micros', 999000000, 'leads', 99),
  jsonb_build_object('date', (select hoje from d344), 'ad_account_id', '00000000-0000-0000-0000-00000344ad01', 'level', 'campaign', 'entity_external_id', '555',
    'campaign_id', '00000000-0000-0000-0000-00000344ae05', 'spend_micros', 50000000, 'leads', 0),
  jsonb_build_object('date', (select hoje from d344), 'ad_account_id', '00000000-0000-0000-0000-00000344ad02', 'level', 'campaign', 'entity_external_id', '666',
    'campaign_id', '00000000-0000-0000-0000-00000344ae06', 'spend_micros', 70000000, 'leads', 1)));

-- Visitas e conversões no site
create function pg_temp.ev(vis text, ses text, eid text, name text, mins int, extra jsonb default '{}', touch jsonb default null)
returns jsonb language sql as $$
  select public.tracking_ingest(jsonb_build_object(
    'container_id', '00000000-0000-0000-0000-00000344ab01', 'client_id', '00000000-0000-0000-0000-00000344ac01',
    'visitor_id', vis, 'session_id', ses, 'test', false,
    'event', jsonb_build_object('event_id', eid, 'name', name, 'occurred_at', now() - make_interval(mins => mins), 'page_url', 'https://loja344.com.br/') || extra,
    'touch', touch))
$$;
create temp table r344 (what text, v text) on commit drop;
grant all on r344 to authenticated;

-- V1: anúncio Meta com ID da campanha 111 → Lead (com e-mail) → compra R$ 200 com nº do pedido
select pg_temp.ev('visitante_v1', 'sessao_v1_1', 'e344_v1_pv', 'PageView', 50, '{}',
  '{"channel":"meta","paid":true,"evidence":"confirmada","reason":"IDs do anúncio","utm_campaign":"bf","ad_campaign_id":"111"}');
select public.tracking_ingest(jsonb_build_object('container_id', '00000000-0000-0000-0000-00000344ab01', 'client_id', '00000000-0000-0000-0000-00000344ac01',
  'visitor_id', 'visitante_v1', 'session_id', 'sessao_v1_1', 'user', jsonb_build_object('em', encode(extensions.digest('ana@t344.com', 'sha256'), 'hex')),
  'event', jsonb_build_object('event_id', 'e344_v1_lead', 'name', 'Lead', 'occurred_at', now() - interval '49 minutes')));
select pg_temp.ev('visitante_v1', 'sessao_v1_1', 'e344_v1_buy', 'Purchase', 48, '{"value_micros":200000000,"currency":"BRL","transaction_id":"P344-1"}');
-- V2: Meta só com utm_campaign = nome da campanha (Remarketing) → Lead
select pg_temp.ev('visitante_v2', 'sessao_v2_1', 'e344_v2_pv', 'PageView', 45, '{}',
  '{"channel":"meta","paid":true,"evidence":"provavel","reason":"utm","utm_campaign":"remarketing"}');
select pg_temp.ev('visitante_v2', 'sessao_v2_1', 'e344_v2_lead', 'Lead', 44);
-- V3: utm_campaign "Dup" (duas campanhas com esse nome) → Lead sem campanha
select pg_temp.ev('visitante_v3', 'sessao_v3_1', 'e344_v3_pv', 'PageView', 40, '{}',
  '{"channel":"meta","paid":true,"evidence":"provavel","reason":"utm","utm_campaign":"Dup"}');
select pg_temp.ev('visitante_v3', 'sessao_v3_1', 'e344_v3_lead', 'Lead', 39);
-- V4: sem origem nenhuma → Lead
select pg_temp.ev('visitante_v4', 'sessao_v4_1', 'e344_v4_lead', 'Lead', 35);
-- V5: primeiro Google (sem campanha), depois Meta 111 → Lead → compra US$ 50 sem nº do pedido
select pg_temp.ev('visitante_v5', 'sessao_v5_1', 'e344_v5_pv1', 'PageView', 30, '{}',
  '{"channel":"google","paid":true,"evidence":"confirmada","reason":"gclid","gclid":"abc"}');
select pg_temp.ev('visitante_v5', 'sessao_v5_2', 'e344_v5_pv2', 'PageView', 20, '{}',
  '{"channel":"meta","paid":true,"evidence":"confirmada","reason":"IDs do anúncio","ad_campaign_id":"111"}');
select pg_temp.ev('visitante_v5', 'sessao_v5_2', 'e344_v5_lead', 'Lead', 19);
select pg_temp.ev('visitante_v5', 'sessao_v5_2', 'e344_v5_buy', 'Purchase', 18, '{"value_micros":50000000,"currency":"USD"}');

create temp table per344 on commit drop as select now() - interval '2 hours' as de, now() + interval '1 minute' as ate;
grant all on per344 to authenticated;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000344aa01","role":"authenticated"}';
insert into r344 select 'last:' || coalesce(a.campaign_label, '-'),
  concat_ws('|', coalesce(a.channel, '-'), coalesce(a.match, '-'), a.leads, a.purchases, a.confirmed, a.revenue::text,
            coalesce(a.spend_micros::text, '-'), coalesce(a.platform_leads::text, '-'))
  from public.tracking_attribution((select de from per344), (select ate from per344), 'last') a;
insert into r344 select 'first:' || coalesce(a.campaign_label, '-'), concat_ws('|', coalesce(a.channel, '-'), a.leads, a.purchases, a.revenue::text)
  from public.tracking_attribution((select de from per344), (select ate from per344), 'first') a;
insert into r344 select 'qualidade', concat_ws('|', q.sessions, q.sessions_unknown, q.paid_sessions, q.paid_without_campaign_id, q.leads,
  q.leads_without_origin, q.leads_with_contact, q.purchases, q.purchases_without_order, q.purchases_without_lead)
  from public.tracking_quality((select de from per344), (select ate from per344)) q;
reset role;

do $$
declare
  r record;
begin
  for r in select * from r344 loop
    if (r.what, r.v) not in (
      -- Último contato: V1 e V5 vêm da campanha 111 (pelo ID); BRL e USD separados; investimento só de hoje
      ('last:Black Friday', 'meta|id|2|2|4|{"BRL": 200000000, "USD": 50000000}|100000000|5.0000'),
      ('last:Remarketing', 'meta|nome|1|0|0|{}|-|-'),          -- ligada pelo nome (único)
      ('last:Dup', 'meta|-|1|0|0|{}|-|-'),                     -- nome repetido: não chuta
      ('last:-', '-|-|1|0|0|{}|-|-'),                          -- sem origem
      ('last:Sem conversao', 'meta|sem_conversao|0|0|0|{}|50000000|0.0000'),
      -- Primeiro contato: V5 passa para o Google (sem campanha identificada)
      ('first:Black Friday', 'meta|1|1|{"BRL": 200000000}'),
      ('first:-', 'google|1|1|{"USD": 50000000}'),
      ('first:-', '-|1|0|{}'),
      ('first:Remarketing', 'meta|1|0|{}'), ('first:Dup', 'meta|1|0|{}'), ('first:Sem conversao', 'meta|0|0|{}'),
      -- Qualidade: 6 sessões, 1 sem origem, 5 pagas, 3 pagas sem ID da campanha; 5 leads, 1 sem origem, 1 com contato;
      -- 2 compras, 1 sem nº do pedido, 0 sem lead. Só o site do cliente liberado aparece.
      ('qualidade', '6|1|5|3|5|1|1|2|1|0')
    ) then
      raise exception 'FALHOU: % = %', r.what, r.v;
    end if;
  end loop;
  if (select count(*) from r344) <> 12 then raise exception 'FALHOU: faltou verificação (%)', (select count(*) from r344); end if;
  if exists (select 1 from r344 where v like '%70000000%' or what like '%Outro cliente%') then
    raise exception 'FALHOU: investimento de cliente não liberado apareceu';
  end if;
  if has_function_privilege('anon', 'public.tracking_attribution(timestamptz, timestamptz, text)', 'execute')
     or has_function_privilege('anon', 'public.tracking_quality(timestamptz, timestamptz)', 'execute') then
    raise exception 'FALHOU: visitante sem login consegue consultar';
  end if;
end $$;

select 'Etapa 34.4: TODOS OS TESTES PASSARAM' as resultado;
rollback;
