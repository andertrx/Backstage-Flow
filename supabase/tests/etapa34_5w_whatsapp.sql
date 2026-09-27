-- =============================================================================
-- Testes da Etapa 34.5-W — WhatsApp (app comum): código de rastreio, busca,
-- marcação de Lead/Venda, Meta CAPI como "chat" e isolamento (RLS).
-- Rodar inteiro no SQL Editor. Transação desfeita no final: nada fica gravado.
-- =============================================================================
begin;

insert into auth.users (id, instance_id, aud, role, email) values
  ('00000000-0000-0000-0000-00000034aa01', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'operador@t345.local');
update public.profiles set active = true, role = 'operador' where id = '00000000-0000-0000-0000-00000034aa01';
insert into public.clients (id, name) values
  ('00000000-0000-0000-0000-00000034ac01', 'Cliente T345'),
  ('00000000-0000-0000-0000-00000034ac02', 'Outro T345');
insert into public.user_client_access (user_id, client_id) values ('00000000-0000-0000-0000-00000034aa01', '00000000-0000-0000-0000-00000034ac01');
insert into public.tracking_containers (id, client_id, name, allowed_domains, test_mode) values
  ('00000000-0000-0000-0000-00000034ab01', '00000000-0000-0000-0000-00000034ac01', 'Loja', '{loja345.com.br}', false),
  ('00000000-0000-0000-0000-00000034ab02', '00000000-0000-0000-0000-00000034ac02', 'Outro', '{outro345.com.br}', false);
insert into public.tracking_destinations (id, container_id, client_id, pixel_id, enabled) values
  ('00000000-0000-0000-0000-00000034ad01', '00000000-0000-0000-0000-00000034ab01', '00000000-0000-0000-0000-00000034ac01', '111111111', false);
select public.tracking_destination_secret_set('00000000-0000-0000-0000-00000034ad01', 'EAA_token_de_teste_345');
update public.tracking_destinations set enabled = true where id = '00000000-0000-0000-0000-00000034ad01';

create temp table t345 (what text, v text) on commit drop;
grant all on t345 to authenticated;

-- Chega pelo Meta e clica no botão do WhatsApp (código K7Q2M9)
create temp table p345 on commit drop as select jsonb_build_object(
  'container_id', '00000000-0000-0000-0000-00000034ab01', 'client_id', '00000000-0000-0000-0000-00000034ac01',
  'visitor_id', 'visitante_345', 'session_id', 'sessao_345_1', 'test', false,
  'capi', jsonb_build_object('fbp', 'fb.1.1790000000000.123', 'fbc', 'fb.1.1790000000000.IwWA', 'user_agent', 'Mozilla/5.0', 'ip', '200.1.2.3')) base;
select public.tracking_ingest((select base from p345) || jsonb_build_object(
  'event', jsonb_build_object('event_id', 'evt_345_pv', 'name', 'PageView', 'occurred_at', now() - interval '10 minutes', 'page_url', 'https://loja345.com.br/'),
  'touch', jsonb_build_object('channel', 'meta', 'paid', true, 'evidence', 'confirmada', 'reason', 'IDs do anúncio', 'utm_campaign', 'Planos')));
create temp table click345 on commit drop as select (select base from p345) || jsonb_build_object(
  'event', jsonb_build_object('event_id', 'evt_345_wa', 'name', 'Contact', 'occurred_at', now() - interval '9 minutes',
                              'page_url', 'https://loja345.com.br/planos', 'custom_data', jsonb_build_object('canal', 'whatsapp', 'ref', 'K7Q2M9'))) p;
select public.tracking_ingest((select p from click345));
insert into t345 select 'registrar', public.tracking_whatsapp_register((select p from click345));
insert into t345 select 'registrar_de_novo', public.tracking_whatsapp_register((select p from click345));
insert into t345 select 'sem_codigo', public.tracking_whatsapp_register((select base from p345) || '{"event":{"custom_data":{"canal":"whatsapp"}}}'::jsonb);
insert into t345 select 'clique', concat_ws('|', status, fbc, (select channel from public.tracking_touchpoints t where t.id = c.touchpoint_id))
  from public.tracking_whatsapp_clicks c where code = 'K7Q2M9';

-- A equipe marca Lead e depois Venda (o que a Edge Function faz)
select public.tracking_ingest((select base from p345) || jsonb_build_object(
  'capi', jsonb_build_object('fbp', 'fb.1.1790000000000.123', 'fbc', 'fb.1.1790000000000.IwWA', 'action_source', 'chat'),
  'user', jsonb_build_object('ph', encode(extensions.digest('5545999998888', 'sha256'), 'hex')),
  'event', jsonb_build_object('event_id', 'wa.K7Q2M9.lead', 'name', 'Lead', 'occurred_at', now(), 'custom_data', jsonb_build_object('canal', 'whatsapp', 'ref', 'K7Q2M9'))));
select public.tracking_whatsapp_mark('K7Q2M9', 'lead', '00000000-0000-0000-0000-00000034aa01',
  (select lead_id from public.tracking_visitors where visitor_id = 'visitante_345'));
select public.tracking_ingest((select base from p345) || jsonb_build_object(
  'capi', jsonb_build_object('fbp', 'fb.1.1790000000000.123', 'fbc', 'fb.1.1790000000000.IwWA', 'action_source', 'chat'),
  'event', jsonb_build_object('event_id', 'wa.K7Q2M9.venda.PED-1', 'name', 'Purchase', 'occurred_at', now(), 'value_micros', 350500000,
                              'currency', 'BRL', 'transaction_id', 'PED-1', 'custom_data', jsonb_build_object('canal', 'whatsapp', 'ref', 'K7Q2M9'))));
select public.tracking_whatsapp_mark('K7Q2M9', 'venda', '00000000-0000-0000-0000-00000034aa01',
  (select lead_id from public.tracking_visitors where visitor_id = 'visitante_345'));

insert into t345 select 'marcado', concat_ws('|', status, sales, lead_id is not null, last_marked_by = '00000000-0000-0000-0000-00000034aa01')
  from public.tracking_whatsapp_clicks where code = 'K7Q2M9';
insert into t345 select 'lead', concat_ws('|', l.conversions, l.purchases, l.ph_hash is not null, f.channel)
  from public.tracking_leads l join public.tracking_touchpoints f on f.id = l.first_touch_id where l.container_id = '00000000-0000-0000-0000-00000034ab01';
insert into t345 select 'fila_meta', string_agg(event_name || ':' || action_source, ',' order by event_name)
  from public.tracking_capi_queue where destination_id = '00000000-0000-0000-0000-00000034ad01';
insert into t345 select 'claim_chat', string_agg(event_name || ':' || action_source || ':' || coalesce(fbc, '-'), ',' order by event_name)
  from public.tracking_capi_claim(100) where event_name in ('Lead', 'Purchase');

-- Operador do cliente: acha o código digitando de qualquer jeito; outro cliente, não.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000034aa01","role":"authenticated"}';
insert into t345 select 'busca', concat_ws('|', code, container_name, status, channel, campaign) from public.tracking_whatsapp_lookup('ref. k7q-2m9');
reset role;
insert into public.tracking_whatsapp_clicks (container_id, client_id, code, visitor_id, session_id, event_id, clicked_at)
select '00000000-0000-0000-0000-00000034ab02', '00000000-0000-0000-0000-00000034ac02', 'ZZZ999', 'visitante_345b', 's', 'e', now()
  from (select public.tracking_ingest(jsonb_build_object('container_id', '00000000-0000-0000-0000-00000034ab02', 'client_id', '00000000-0000-0000-0000-00000034ac02',
        'visitor_id', 'visitante_345b', 'session_id', 'sessao_345_b', 'event', jsonb_build_object('event_id', 'evt_345_b', 'name', 'PageView', 'occurred_at', now())))) x;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000034aa01","role":"authenticated"}';
insert into t345 select 'busca_outro_cliente', count(*)::text from public.tracking_whatsapp_lookup('ZZZ999');
reset role;

do $$
declare
  r record;
begin
  for r in select * from t345 loop
    if (r.what, r.v) not in (
      ('registrar', 'ok'), ('registrar_de_novo', 'repetido'), ('sem_codigo', 'sem_codigo'),
      ('clique', 'clicado|fb.1.1790000000000.IwWA|meta'),
      ('marcado', 'venda|1|t|t'), ('lead', '2|1|t|meta'),
      ('fila_meta', 'Contact:website,Lead:chat,Purchase:chat'),
      ('claim_chat', 'Lead:chat:fb.1.1790000000000.IwWA,Purchase:chat:fb.1.1790000000000.IwWA'),
      ('busca', 'K7Q2M9|Loja|venda|meta|Planos'), ('busca_outro_cliente', '0')
    ) then
      raise exception 'FALHOU: % = %', r.what, r.v;
    end if;
  end loop;
  if (select count(*) from t345) <> 10 then raise exception 'FALHOU: faltou verificação (%)', (select count(*) from t345); end if;
  if has_column_privilege('authenticated', 'public.tracking_whatsapp_clicks', 'fbc', 'select')
     or has_column_privilege('authenticated', 'public.tracking_whatsapp_clicks', 'visitor_id', 'select')
     or has_table_privilege('authenticated', 'public.tracking_whatsapp_clicks', 'update')
     or has_function_privilege('authenticated', 'public.tracking_whatsapp_mark(text, text, uuid, bigint)', 'execute')
     or has_function_privilege('anon', 'public.tracking_whatsapp_register(jsonb)', 'execute') then
    raise exception 'FALHOU: clique editável ou dados internos visíveis pela tela';
  end if;
end $$;

select 'Etapa 34.5-W: TODOS OS TESTES PASSARAM' as resultado;
rollback;
