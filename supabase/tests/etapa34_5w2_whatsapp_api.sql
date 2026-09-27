-- =============================================================================
-- Testes da Etapa 34.5-W2 — WhatsApp pela API oficial: conexão, segredos no
-- Vault, mensagem de anúncio (ctwa_clid), código do site, aviso repetido,
-- conexão desligada, marcação, Meta CAPI "business_messaging" e RLS.
-- Rodar inteiro no SQL Editor. Transação desfeita no final: nada fica gravado.
-- =============================================================================
begin;

insert into auth.users (id, instance_id, aud, role, email) values
  ('00000000-0000-0000-0000-00000035aa01', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'operador@t35w2.local');
update public.profiles set active = true, role = 'operador' where id = '00000000-0000-0000-0000-00000035aa01';
insert into public.clients (id, name) values
  ('00000000-0000-0000-0000-00000035ac01', 'Cliente W2'),
  ('00000000-0000-0000-0000-00000035ac02', 'Outro W2');
insert into public.user_client_access (user_id, client_id) values ('00000000-0000-0000-0000-00000035aa01', '00000000-0000-0000-0000-00000035ac01');
insert into public.tracking_containers (id, client_id, name, allowed_domains, test_mode) values
  ('00000000-0000-0000-0000-00000035ab01', '00000000-0000-0000-0000-00000035ac01', 'Loja', '{lojaw2.com.br}', false),
  ('00000000-0000-0000-0000-00000035ab02', '00000000-0000-0000-0000-00000035ac02', 'Outro', '{outrow2.com.br}', false);
insert into public.tracking_destinations (id, container_id, client_id, pixel_id, enabled) values
  ('00000000-0000-0000-0000-00000035ad01', '00000000-0000-0000-0000-00000035ab01', '00000000-0000-0000-0000-00000035ac01', '111111111', false);
select public.tracking_destination_secret_set('00000000-0000-0000-0000-00000035ad01', 'EAA_token_de_teste_w2');
update public.tracking_destinations set enabled = true where id = '00000000-0000-0000-0000-00000035ad01';

insert into public.tracking_whatsapp_connections (id, container_id, client_id, phone_number_id, waba_id) values
  ('00000000-0000-0000-0000-00000035ae01', '00000000-0000-0000-0000-00000035ab01', '00000000-0000-0000-0000-00000035ac01', '106540352242922', '102290129340398'),
  ('00000000-0000-0000-0000-00000035ae02', '00000000-0000-0000-0000-00000035ab02', '00000000-0000-0000-0000-00000035ac02', '106540352242999', '102290129340999');

create temp table tw2 (what text, v text) on commit drop;
grant all on tw2 to authenticated;
create temp table hw2 on commit drop as select
  encode(extensions.digest('5545999998888', 'sha256'), 'hex') ana,
  encode(extensions.digest('5545911112222', 'sha256'), 'hex') bia,
  encode(extensions.digest('5545933334444', 'sha256'), 'hex') caio;

-- Segredos: só no Vault; apagar desliga a conexão
select public.tracking_whatsapp_secret_set('00000000-0000-0000-0000-00000035ae01', 'app_secret', 'segredo_do_app_w2');
select public.tracking_whatsapp_secret_set('00000000-0000-0000-0000-00000035ae01', 'verify_token', 'token_verificacao_w2');
select public.tracking_whatsapp_secret_set('00000000-0000-0000-0000-00000035ae01', 'app_secret', 'segredo_novo_w2');
insert into tw2 select 'segredos', concat_ws('|', public.tracking_whatsapp_secret_get('00000000-0000-0000-0000-00000035ae01', 'app_secret'),
  public.tracking_whatsapp_secret_get('00000000-0000-0000-0000-00000035ae01', 'verify_token'),
  (select has_app_secret from public.tracking_whatsapp_connections where id = '00000000-0000-0000-0000-00000035ae01'),
  (select count(*) from vault.secrets where name like 'wa_%:00000000-0000-0000-0000-00000035ae01'));

-- Desligada: não registra nada
insert into tw2 select 'desligada', public.tracking_whatsapp_inbound(jsonb_build_object('connection_id', '00000000-0000-0000-0000-00000035ae01',
  'wa_hash', (select ana from hw2), 'message_key', 'aaaa0000bbbb1111cccc2222dddd3333eeee4440', 'at', now()));
update public.tracking_whatsapp_connections set enabled = true where id = '00000000-0000-0000-0000-00000035ae01';
insert into tw2 select 'hash_invalido', public.tracking_whatsapp_inbound(jsonb_build_object('connection_id', '00000000-0000-0000-0000-00000035ae01',
  'wa_hash', '5545999998888', 'message_key', 'aaaa0000bbbb1111cccc2222dddd3333eeee444x', 'at', now()));

-- Ana: veio de anúncio de clique para o WhatsApp
insert into tw2 select 'anuncio', public.tracking_whatsapp_inbound(jsonb_build_object('connection_id', '00000000-0000-0000-0000-00000035ae01',
  'wa_hash', (select ana from hw2), 'message_key', 'aaaa0000bbbb1111cccc2222dddd3333eeee4441', 'at', now() - interval '5 minutes',
  'referral', jsonb_build_object('ctwa_clid', 'ARAkLkA8teste', 'source_id', '120210000000001', 'source_type', 'ad', 'source_url', 'https://fb.me/abc')));
insert into tw2 select 'repetido', public.tracking_whatsapp_inbound(jsonb_build_object('connection_id', '00000000-0000-0000-0000-00000035ae01',
  'wa_hash', (select ana from hw2), 'message_key', 'aaaa0000bbbb1111cccc2222dddd3333eeee4441', 'at', now() - interval '5 minutes',
  'referral', jsonb_build_object('ctwa_clid', 'ARAkLkA8teste', 'source_id', '120210000000001')));
insert into tw2 select 'segunda_msg', public.tracking_whatsapp_inbound(jsonb_build_object('connection_id', '00000000-0000-0000-0000-00000035ae01',
  'wa_hash', (select ana from hw2), 'message_key', 'aaaa0000bbbb1111cccc2222dddd3333eeee4442', 'at', now()));
insert into tw2 select 'conversa_ana', concat_ws('|', w.origin, w.messages, w.ad_id, w.ctwa_clid, t.channel, t.evidence, t.ad_ad_id)
  from public.tracking_whatsapp_conversations w join public.tracking_touchpoints t on t.id = w.touchpoint_id where w.wa_hash = (select ana from hw2);

-- Bia: clicou no botão do site (código K7Q2M9) e mandou a mensagem com o código
select public.tracking_ingest(jsonb_build_object('container_id', '00000000-0000-0000-0000-00000035ab01', 'client_id', '00000000-0000-0000-0000-00000035ac01',
  'visitor_id', 'visitante_w2', 'session_id', 'sessao_w2_1', 'test', false,
  'capi', jsonb_build_object('fbc', 'fb.1.1790000000000.IwW2'),
  'event', jsonb_build_object('event_id', 'evt_w2_wa', 'name', 'Contact', 'occurred_at', now() - interval '3 minutes',
                              'page_url', 'https://lojaw2.com.br/planos', 'custom_data', jsonb_build_object('canal', 'whatsapp', 'ref', 'K7Q2M9')),
  'touch', jsonb_build_object('channel', 'google', 'paid', true, 'evidence', 'confirmada', 'reason', 'gclid')));
select public.tracking_whatsapp_register(jsonb_build_object('container_id', '00000000-0000-0000-0000-00000035ab01', 'client_id', '00000000-0000-0000-0000-00000035ac01',
  'visitor_id', 'visitante_w2', 'session_id', 'sessao_w2_1', 'capi', jsonb_build_object('fbc', 'fb.1.1790000000000.IwW2'),
  'event', jsonb_build_object('event_id', 'evt_w2_wa', 'name', 'Contact', 'occurred_at', now() - interval '3 minutes',
                              'page_url', 'https://lojaw2.com.br/planos', 'custom_data', jsonb_build_object('canal', 'whatsapp', 'ref', 'K7Q2M9'))));
insert into tw2 select 'site', public.tracking_whatsapp_inbound(jsonb_build_object('connection_id', '00000000-0000-0000-0000-00000035ae01',
  'wa_hash', (select bia from hw2), 'message_key', 'aaaa0000bbbb1111cccc2222dddd3333eeee4443', 'at', now(), 'ref_code', 'k7q2m9'));
insert into tw2 select 'conversa_bia', concat_ws('|', w.origin, w.visitor_id, w.click_code, t.channel)
  from public.tracking_whatsapp_conversations w join public.tracking_touchpoints t on t.id = w.touchpoint_id where w.wa_hash = (select bia from hw2);

-- Caio: chamou direto, sem anúncio nem código
insert into tw2 select 'nova', public.tracking_whatsapp_inbound(jsonb_build_object('connection_id', '00000000-0000-0000-0000-00000035ae01',
  'wa_hash', (select caio from hw2), 'message_key', 'aaaa0000bbbb1111cccc2222dddd3333eeee4444', 'at', now()));
insert into tw2 select 'conversa_caio', concat_ws('|', w.origin, t.channel, t.evidence)
  from public.tracking_whatsapp_conversations w join public.tracking_touchpoints t on t.id = w.touchpoint_id where w.wa_hash = (select caio from hw2);

-- A equipe marca Lead na conversa da Ana (o que a Edge Function faz)
select public.tracking_whatsapp_conversation_mark((select id from public.tracking_whatsapp_conversations where wa_hash = (select ana from hw2)),
  'lead', '00000000-0000-0000-0000-00000035aa01', null);
insert into tw2 select 'marcada', concat_ws('|', status, sales, last_marked_by = '00000000-0000-0000-0000-00000035aa01')
  from public.tracking_whatsapp_conversations where wa_hash = (select ana from hw2);

-- Fila do Meta: anúncio vai como business_messaging com ctwa_clid e WABA; direto vai como chat
insert into tw2 select 'claim', string_agg(action_source || ':' || coalesce(ctwa_clid, '-') || ':' || coalesce(waba_id, '-'), ',' order by action_source)
  from public.tracking_capi_claim(100) where event_id like 'wam.%';

-- Operador do cliente: vê as conversas dele (sem hash nem ctwa_clid); outro cliente, não
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000035aa01","role":"authenticated"}';
insert into tw2 select 'rls_conversas', string_agg(origin, ',' order by origin) from public.tracking_whatsapp_conversations;
insert into tw2 select 'rls_conexoes', string_agg(phone_number_id || ':' || has_app_secret, ',') from public.tracking_whatsapp_connections;
reset role;

-- Remover a conexão apaga os segredos do cofre e desliga
select public.tracking_whatsapp_secret_delete('00000000-0000-0000-0000-00000035ae01');
insert into tw2 select 'removida', concat_ws('|', enabled, has_app_secret, (select count(*) from vault.secrets where name like 'wa_%:00000000-0000-0000-0000-00000035ae01'))
  from public.tracking_whatsapp_connections where id = '00000000-0000-0000-0000-00000035ae01';

do $$
declare
  r record;
begin
  for r in select * from tw2 loop
    if (r.what, r.v) not in (
      ('segredos', 'segredo_novo_w2|token_verificacao_w2|t|2'),
      ('desligada', 'desligado'), ('hash_invalido', 'invalido'),
      ('anuncio', 'anuncio'), ('repetido', 'repetido'), ('segunda_msg', 'mensagem'),
      ('conversa_ana', 'anuncio_whatsapp|2|120210000000001|ARAkLkA8teste|meta|confirmada|120210000000001'),
      ('site', 'site'), ('conversa_bia', 'site|visitante_w2|K7Q2M9|google'),
      ('nova', 'nova'), ('conversa_caio', 'desconhecida|whatsapp|desconhecida'),
      ('marcada', 'lead|0|t'),
      ('claim', 'business_messaging:ARAkLkA8teste:102290129340398,chat:-:102290129340398'),
      ('rls_conversas', 'anuncio_whatsapp,desconhecida,site'),
      ('rls_conexoes', '106540352242922:true'),
      ('removida', 'f|f|0')
    ) then
      raise exception 'FALHOU: % = %', r.what, r.v;
    end if;
  end loop;
  if (select count(*) from tw2) <> 16 then raise exception 'FALHOU: faltou verificação (%)', (select count(*) from tw2); end if;
  if has_column_privilege('authenticated', 'public.tracking_whatsapp_conversations', 'wa_hash', 'select')
     or has_column_privilege('authenticated', 'public.tracking_whatsapp_conversations', 'ctwa_clid', 'select')
     or has_column_privilege('authenticated', 'public.tracking_whatsapp_connections', 'app_secret_vault_id', 'select')
     or has_column_privilege('authenticated', 'public.tracking_whatsapp_connections', 'verify_token_vault_id', 'select')
     or has_table_privilege('authenticated', 'public.tracking_whatsapp_conversations', 'update')
     or has_table_privilege('authenticated', 'public.tracking_whatsapp_connections', 'insert')
     or has_function_privilege('authenticated', 'public.tracking_whatsapp_secret_get(uuid, text)', 'execute')
     or has_function_privilege('anon', 'public.tracking_whatsapp_inbound(jsonb)', 'execute')
     or has_function_privilege('authenticated', 'public.tracking_whatsapp_conversation_mark(bigint, text, uuid, bigint)', 'execute') then
    raise exception 'FALHOU: segredo, hash ou gravação liberados para a tela';
  end if;
end $$;

select 'Etapa 34.5-W2: TODOS OS TESTES PASSARAM' as resultado;
rollback;
