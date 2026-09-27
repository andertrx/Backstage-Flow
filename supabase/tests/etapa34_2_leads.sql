-- =============================================================================
-- Testes da Etapa 34.2 — Leads, compras e jornada
-- Lead cruzando aparelhos pelo hash do e-mail, primeira/última origem, compra
-- sem duplicar pelo nº do pedido, moedas separadas, jornada e isolamento (RLS).
-- Rodar inteiro no SQL Editor. Transação desfeita no final: nada fica gravado.
-- =============================================================================
begin;

insert into auth.users (id, instance_id, aud, role, email) values
  ('00000000-0000-0000-0000-000000342a01', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'gestor@t342.local'),
  ('00000000-0000-0000-0000-000000342a03', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cliente@t342.local');
update public.profiles set active = true, role = 'gestor' where id = '00000000-0000-0000-0000-000000342a01';
update public.profiles set active = true, role = 'cliente' where id = '00000000-0000-0000-0000-000000342a03';
insert into public.clients (id, name) values
  ('00000000-0000-0000-0000-000000342c01', 'Cliente T342'),
  ('00000000-0000-0000-0000-000000342c02', 'Outro T342');
insert into public.user_client_access (user_id, client_id) values
  ('00000000-0000-0000-0000-000000342a01', '00000000-0000-0000-0000-000000342c01'),
  ('00000000-0000-0000-0000-000000342a03', '00000000-0000-0000-0000-000000342c01');
insert into public.tracking_containers (id, client_id, name, allowed_domains) values
  ('00000000-0000-0000-0000-000000342b01', '00000000-0000-0000-0000-000000342c01', 'Site T342', '{loja342.com.br}'),
  ('00000000-0000-0000-0000-000000342b02', '00000000-0000-0000-0000-000000342c02', 'Outro', '{outro342.com.br}');

create temp table t342 (what text, v text) on commit drop;
grant all on t342 to authenticated;

create function pg_temp.ev(p_visitor text, p_session text, p_id text, p_name text, p_min integer, p_touch jsonb default null,
                           p_user jsonb default null, p_extra jsonb default '{}'::jsonb, p_container text default '00000000-0000-0000-0000-000000342b01',
                           p_client text default '00000000-0000-0000-0000-000000342c01')
returns text language sql as $$
  select public.tracking_ingest(jsonb_build_object(
    'container_id', p_container, 'client_id', p_client, 'visitor_id', p_visitor, 'session_id', p_session, 'test', true,
    'event', jsonb_build_object('event_id', p_id, 'name', p_name, 'occurred_at', now() - make_interval(mins => p_min), 'page_path', '/') || p_extra,
    'touch', p_touch, 'user', p_user)) ->> 'status'
$$;

-- Celular: chega pelo Meta e vira lead com o e-mail (em hash).
select pg_temp.ev('celular_342', 'sessao_cel_1', 'evt_342_001', 'PageView', 60,
  '{"channel":"meta","paid":true,"evidence":"confirmada","reason":"IDs do anúncio","utm_campaign":"Black Friday","ad_campaign_id":"120"}');
insert into t342 select 'lead_1', pg_temp.ev('celular_342', 'sessao_cel_1', 'evt_342_002', 'Lead', 58, null,
  jsonb_build_object('em', encode(extensions.digest('ana@x.com', 'sha256'), 'hex')));
-- Computador: chega pelo Google dias depois, informa o mesmo e-mail + telefone → mesma pessoa.
select pg_temp.ev('computador_342', 'sessao_pc_1', 'evt_342_003', 'PageView', 30,
  '{"channel":"google","paid":true,"evidence":"confirmada","reason":"gclid","gclid":"G1"}');
select pg_temp.ev('computador_342', 'sessao_pc_1', 'evt_342_004', 'Lead', 29, null,
  jsonb_build_object('em', encode(extensions.digest('ana@x.com', 'sha256'), 'hex'), 'ph', encode(extensions.digest('5545999998888', 'sha256'), 'hex')));
-- Compra no computador (pedido P-1), depois a mesma compra de novo com outro event_id, e o mesmo evento reenviado.
insert into t342 select 'compra', pg_temp.ev('computador_342', 'sessao_pc_1', 'evt_342_005', 'Purchase', 20, null, null,
  '{"value_micros":199900000,"currency":"BRL","transaction_id":"P-1"}');
insert into t342 select 'compra_mesmo_pedido', pg_temp.ev('computador_342', 'sessao_pc_1', 'evt_342_006', 'Purchase', 19, null, null,
  '{"value_micros":199900000,"currency":"BRL","transaction_id":"P-1"}');
insert into t342 select 'compra_reenvio', pg_temp.ev('computador_342', 'sessao_pc_1', 'evt_342_005', 'Purchase', 20, null, null,
  '{"value_micros":199900000,"currency":"BRL","transaction_id":"P-1"}');
select pg_temp.ev('computador_342', 'sessao_pc_1', 'evt_342_007', 'Purchase', 10, null, null,
  '{"value_micros":50000000,"currency":"USD","transaction_id":"P-2"}');
-- Clique no WhatsApp sem dados de contato: evento, mas não vira lead.
select pg_temp.ev('visitante_wa_342', 'sessao_wa_1', 'evt_342_008', 'Contact', 5);
-- Lead do outro cliente.
select pg_temp.ev('outro_342', 'sessao_outro_1', 'evt_342_099', 'Lead', 5, null, null, '{}',
  '00000000-0000-0000-0000-000000342b02', '00000000-0000-0000-0000-000000342c02');

insert into t342 select 'leads', count(*)::text from public.tracking_leads where container_id = '00000000-0000-0000-0000-000000342b01';
insert into t342 select 'lead', concat_ws('|', l.conversions, l.purchases, l.first_event_name, f.channel, la.channel, l.ph_hash is not null, l.test)
  from public.tracking_leads l join public.tracking_touchpoints f on f.id = l.first_touch_id join public.tracking_touchpoints la on la.id = l.last_touch_id
 where l.container_id = '00000000-0000-0000-0000-000000342b01';
insert into t342 select 'aparelhos', count(*)::text from public.tracking_visitors where container_id = '00000000-0000-0000-0000-000000342b01' and lead_id is not null;
insert into t342 select 'compras', string_agg(concat_ws(':', p.transaction_id, p.value_micros, p.currency, f.channel, la.channel), ',' order by p.transaction_id)
  from public.tracking_purchases p join public.tracking_touchpoints f on f.id = p.first_touch_id join public.tracking_touchpoints la on la.id = p.last_touch_id
 where p.container_id = '00000000-0000-0000-0000-000000342b01';
insert into t342 select 'eventos_compra', count(*)::text from public.tracking_events where container_id = '00000000-0000-0000-0000-000000342b01' and event_name = 'Purchase';
insert into t342 select 'jornada', string_agg(coalesce(channel, name), '>' order by occurred_at, kind desc)
  from public.tracking_lead_journey((select id from public.tracking_leads where container_id = '00000000-0000-0000-0000-000000342b01'));
insert into t342 select 'resumo', string_agg(concat_ws(':', coalesce(currency, '-'), leads, conversions, purchases, revenue_micros), ',' order by currency nulls first)
  from public.tracking_conversions_summary(now() - interval '1 day', now() + interval '1 hour')
 where container_id = '00000000-0000-0000-0000-000000342b01';

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000342a01","role":"authenticated"}';
insert into t342 select 'gestor_leads', count(*)::text from public.tracking_leads where client_id in ('00000000-0000-0000-0000-000000342c01', '00000000-0000-0000-0000-000000342c02');
insert into t342 select 'gestor_jornada_outro', count(*)::text
  from public.tracking_lead_journey((select id from public.tracking_leads where container_id = '00000000-0000-0000-0000-000000342b02'));
insert into t342 select 'gestor_compras', count(*)::text from public.tracking_purchases;
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000342a03","role":"authenticated"}';
insert into t342 select 'cliente_ve', ((select count(*) from public.tracking_leads) + (select count(*) from public.tracking_purchases))::text;
reset role;

do $$
declare
  r record;
begin
  for r in select * from t342 loop
    if (r.what, r.v) not in (
      ('lead_1', 'ok'), ('compra', 'ok'), ('compra_mesmo_pedido', 'compra_duplicada'), ('compra_reenvio', 'duplicado'),
      ('leads', '1'), ('lead', '4|2|Lead|meta|google|t|t'), ('aparelhos', '2'),
      ('compras', 'P-1:199900000:BRL:meta:google,P-2:50000000:USD:meta:google'), ('eventos_compra', '2'),
      ('jornada', 'meta>PageView>Lead>google>PageView>Lead>Purchase>Purchase'),
      ('resumo', '-:2:4:0:0,BRL:0:0:1:199900000,USD:0:0:1:50000000'),
      ('gestor_leads', '1'), ('gestor_jornada_outro', '0'), ('gestor_compras', '2'), ('cliente_ve', '0')
    ) then
      raise exception 'FALHOU: % = %', r.what, r.v;
    end if;
  end loop;
  if (select count(*) from t342) <> 15 then raise exception 'FALHOU: faltou verificação (%)', (select count(*) from t342); end if;
  if has_table_privilege('anon', 'public.tracking_leads', 'select') or has_table_privilege('authenticated', 'public.tracking_leads', 'insert')
     or has_table_privilege('authenticated', 'public.tracking_purchases', 'update') then
    raise exception 'FALHOU: leads/compras graváveis ou visíveis sem login';
  end if;
  if exists (select 1 from information_schema.columns where table_name = 'tracking_leads' and column_name in ('email', 'phone', 'name')) then
    raise exception 'FALHOU: coluna com dado pessoal legível';
  end if;
end $$;

select 'Etapa 34.2: TODOS OS TESTES PASSARAM' as resultado;
rollback;
