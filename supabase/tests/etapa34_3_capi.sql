-- =============================================================================
-- Testes da Etapa 34.3 — Meta CAPI: configuração, fila, tentativas e segurança
-- Rodar inteiro no SQL Editor. Transação desfeita no final: nada fica gravado.
-- =============================================================================
begin;

insert into auth.users (id, instance_id, aud, role, email) values
  ('00000000-0000-0000-0000-000000343a01', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'gestor@t343.local');
update public.profiles set active = true, role = 'gestor' where id = '00000000-0000-0000-0000-000000343a01';
insert into public.clients (id, name) values
  ('00000000-0000-0000-0000-000000343c01', 'Cliente T343'),
  ('00000000-0000-0000-0000-000000343c02', 'Outro T343');
insert into public.user_client_access (user_id, client_id) values ('00000000-0000-0000-0000-000000343a01', '00000000-0000-0000-0000-000000343c01');
insert into public.tracking_containers (id, client_id, name, allowed_domains, test_mode) values
  ('00000000-0000-0000-0000-000000343b01', '00000000-0000-0000-0000-000000343c01', 'Site real', '{real343.com.br}', false),
  ('00000000-0000-0000-0000-000000343b02', '00000000-0000-0000-0000-000000343c01', 'Site teste', '{teste343.com.br}', true),
  ('00000000-0000-0000-0000-000000343b03', '00000000-0000-0000-0000-000000343c02', 'Outro', '{outro343.com.br}', false);
insert into public.tracking_destinations (id, container_id, client_id, pixel_id, enabled, test_event_code) values
  ('00000000-0000-0000-0000-000000343d01', '00000000-0000-0000-0000-000000343b01', '00000000-0000-0000-0000-000000343c01', '111111111', false, null),
  ('00000000-0000-0000-0000-000000343d02', '00000000-0000-0000-0000-000000343b02', '00000000-0000-0000-0000-000000343c01', '222222222', false, null),
  ('00000000-0000-0000-0000-000000343d03', '00000000-0000-0000-0000-000000343b03', '00000000-0000-0000-0000-000000343c02', '333333333', false, null);
select public.tracking_destination_secret_set(id, 'EAA_token_de_teste_' || id::text) from public.tracking_destinations where id::text like '00000000-0000-0000-0000-000000343d%';
update public.tracking_destinations set enabled = true where id::text like '00000000-0000-0000-0000-000000343d%';

create temp table t343 (what text, v text) on commit drop;
grant all on t343 to authenticated;

create function pg_temp.ev(p_container text, p_client text, p_id text, p_name text, p_test boolean default false, p_extra jsonb default '{}'::jsonb)
returns text language sql as $$
  select public.tracking_ingest(jsonb_build_object(
    'container_id', p_container, 'client_id', p_client, 'visitor_id', 'visitante_343', 'session_id', 'sessao_343_1', 'test', p_test,
    'event', jsonb_build_object('event_id', p_id, 'name', p_name, 'occurred_at', now() - interval '1 minute', 'page_url', 'https://real343.com.br/') || p_extra,
    'user', case when p_name = 'Lead' then jsonb_build_object('em', encode(extensions.digest('ana@x.com', 'sha256'), 'hex')) end,
    'capi', jsonb_build_object('user_agent', 'Mozilla/5.0', 'ip', '200.1.2.3', 'fbp', 'fb.1.1790000000000.123', 'fbc', null))) ->> 'status'
$$;

select pg_temp.ev('00000000-0000-0000-0000-000000343b01', '00000000-0000-0000-0000-000000343c01', 'evt_343_pv', 'PageView');
select pg_temp.ev('00000000-0000-0000-0000-000000343b01', '00000000-0000-0000-0000-000000343c01', 'evt_343_lead', 'Lead');
select pg_temp.ev('00000000-0000-0000-0000-000000343b01', '00000000-0000-0000-0000-000000343c01', 'evt_343_lead', 'Lead');
select pg_temp.ev('00000000-0000-0000-0000-000000343b01', '00000000-0000-0000-0000-000000343c01', 'evt_343_buy', 'Purchase', false,
  '{"value_micros":199900000,"currency":"BRL","transaction_id":"P-343"}');
select pg_temp.ev('00000000-0000-0000-0000-000000343b02', '00000000-0000-0000-0000-000000343c01', 'evt_343_teste', 'Lead', true);
select pg_temp.ev('00000000-0000-0000-0000-000000343b03', '00000000-0000-0000-0000-000000343c02', 'evt_343_outro', 'Lead');

insert into t343 select 'fila_real', string_agg(event_name || ':' || status, ',' order by event_name)
  from public.tracking_capi_queue where destination_id = '00000000-0000-0000-0000-000000343d01';
insert into t343 select 'compra_custom', concat_ws('|', custom_data ->> 'value', custom_data ->> 'currency', custom_data ->> 'order_id')
  from public.tracking_capi_queue where event_id = 'evt_343_buy';
insert into t343 select 'modo_teste_sem_codigo', status from public.tracking_capi_queue where event_id = 'evt_343_teste';

-- Pega a fila (só o site real e o outro cliente estão pendentes)
create temp table claimed on commit drop as select * from public.tracking_capi_claim(100);
insert into t343 select 'pegos', count(*)::text from claimed;
insert into t343 select 'lead_com_hash', (em_hash = encode(extensions.digest('ana@x.com', 'sha256'), 'hex') and user_agent = 'Mozilla/5.0' and ip_address = '200.1.2.3')::text
  from claimed where event_id = 'evt_343_lead';
insert into t343 select 'pegar_de_novo', count(*)::text from public.tracking_capi_claim(100);

-- Lead enviado; compra falhou
select public.tracking_capi_finish(jsonb_build_array(
  jsonb_build_object('id', (select id from claimed where event_id = 'evt_343_lead'), 'ok', true),
  jsonb_build_object('id', (select id from claimed where event_id = 'evt_343_buy'), 'ok', false, 'error', 'Meta instável')));
insert into t343 select 'enviado_sem_ip', concat_ws('|', status, ip_address is null, user_agent is null, sent_at is not null)
  from public.tracking_capi_queue where event_id = 'evt_343_lead';
insert into t343 select 'erro_espera', concat_ws('|', status, ip_address is not null, next_attempt_at > now() + interval '50 seconds', last_error)
  from public.tracking_capi_queue where event_id = 'evt_343_buy';
-- 6ª falha: descarta e apaga IP/navegador
update public.tracking_capi_queue set attempts = 6, status = 'enviando' where event_id = 'evt_343_buy';
select public.tracking_capi_finish(jsonb_build_array(jsonb_build_object('id', (select id from claimed where event_id = 'evt_343_buy'), 'ok', false, 'error', 'x')));
insert into t343 select 'desiste', concat_ws('|', status, ip_address is null) from public.tracking_capi_queue where event_id = 'evt_343_buy';

select public.tracking_capi_log_add(jsonb_build_object('destination_id', '00000000-0000-0000-0000-000000343d01', 'ok', true, 'events_count', 1, 'events_received', 1, 'http_status', 200));
insert into t343 select 'ultimo_envio', (last_success_at is not null)::text from public.tracking_destinations where id = '00000000-0000-0000-0000-000000343d01';
insert into t343 select 'token', (public.tracking_destination_secret_get('00000000-0000-0000-0000-000000343d01') like 'EAA_token_de_teste_%')::text;

-- Gestor: vê o seu cliente; não vê token, IP nem navegador.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000343a01","role":"authenticated"}';
insert into t343 select 'gestor_destinos', count(*)::text from public.tracking_destinations;
insert into t343 select 'gestor_fila', count(*)::text from public.tracking_capi_queue;
insert into t343 select 'gestor_resumo', concat_ws('|', pending, sent_24h, errors_24h, discarded_24h)
  from public.tracking_capi_overview() where destination_id = '00000000-0000-0000-0000-000000343d01';
reset role;

-- Apagar o token desliga o envio
select public.tracking_destination_secret_delete('00000000-0000-0000-0000-000000343d01');
insert into t343 select 'sem_token', concat_ws('|', has_token, enabled) from public.tracking_destinations where id = '00000000-0000-0000-0000-000000343d01';
select pg_temp.ev('00000000-0000-0000-0000-000000343b01', '00000000-0000-0000-0000-000000343c01', 'evt_343_depois', 'Lead');
insert into t343 select 'desligado_nao_enfileira', count(*)::text from public.tracking_capi_queue where event_id = 'evt_343_depois';

do $$
declare
  r record;
begin
  for r in select * from t343 loop
    if (r.what, r.v) not in (
      ('fila_real', 'Lead:pendente,Purchase:pendente'), ('compra_custom', '199.9|BRL|P-343'),
      ('modo_teste_sem_codigo', 'descartado'), ('pegos', '3'), ('lead_com_hash', 'true'), ('pegar_de_novo', '0'),
      ('enviado_sem_ip', 'enviado|t|t|t'), ('erro_espera', 'erro|t|t|Meta instável'), ('desiste', 'descartado|t'),
      ('ultimo_envio', 'true'), ('token', 'true'),
      ('gestor_destinos', '2'), ('gestor_fila', '3'), ('gestor_resumo', '0|1|0|1'),
      ('sem_token', 'f|f'), ('desligado_nao_enfileira', '0')
    ) then
      raise exception 'FALHOU: % = %', r.what, r.v;
    end if;
  end loop;
  if (select count(*) from t343) <> 16 then raise exception 'FALHOU: faltou verificação (%)', (select count(*) from t343); end if;

  if has_column_privilege('authenticated', 'public.tracking_destinations', 'vault_secret_id', 'select')
     or has_column_privilege('authenticated', 'public.tracking_capi_queue', 'ip_address', 'select')
     or has_column_privilege('authenticated', 'public.tracking_capi_queue', 'user_agent', 'select')
     or has_table_privilege('authenticated', 'public.tracking_destinations', 'update')
     or has_table_privilege('anon', 'public.tracking_capi_log', 'select') then
    raise exception 'FALHOU: token/IP/navegador visíveis ou destino editável pela tela';
  end if;
  if has_function_privilege('authenticated', 'public.tracking_destination_secret_get(uuid)', 'execute')
     or has_function_privilege('anon', 'public.tracking_capi_claim(integer)', 'execute') then
    raise exception 'FALHOU: função do servidor exposta';
  end if;
  if not exists (select 1 from cron.job where jobname = 'tracking-capi') then raise exception 'FALHOU: agendamento do envio não existe'; end if;
end $$;

select 'Etapa 34.3: TODOS OS TESTES PASSARAM' as resultado;
rollback;
