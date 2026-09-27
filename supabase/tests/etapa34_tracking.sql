-- =============================================================================
-- Testes da Etapa 34.1 — Tracking: fundação
-- Gravação idempotente (event_id), origem (touchpoint), sessão, primeira/última
-- origem, limite de requisições e isolamento por cliente (RLS).
-- Rodar inteiro no SQL Editor. Transação desfeita no final: nada fica gravado.
-- =============================================================================
begin;

insert into auth.users (id, instance_id, aud, role, email) values
  ('00000000-0000-0000-0000-000000034a01', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'gestor@t34.local'),
  ('00000000-0000-0000-0000-000000034a02', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'visu@t34.local'),
  ('00000000-0000-0000-0000-000000034a03', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cliente@t34.local');
update public.profiles set active = true, role = 'gestor' where id = '00000000-0000-0000-0000-000000034a01';
update public.profiles set active = true, role = 'visualizador' where id = '00000000-0000-0000-0000-000000034a02';
update public.profiles set active = true, role = 'cliente' where id = '00000000-0000-0000-0000-000000034a03';

insert into public.clients (id, name) values
  ('00000000-0000-0000-0000-000000034c01', 'Cliente T34'),
  ('00000000-0000-0000-0000-000000034c02', 'Outro T34');
insert into public.user_client_access (user_id, client_id) values
  ('00000000-0000-0000-0000-000000034a01', '00000000-0000-0000-0000-000000034c01'),
  ('00000000-0000-0000-0000-000000034a02', '00000000-0000-0000-0000-000000034c01'),
  ('00000000-0000-0000-0000-000000034a03', '00000000-0000-0000-0000-000000034c01');

insert into public.tracking_containers (id, client_id, name, allowed_domains) values
  ('00000000-0000-0000-0000-000000034b01', '00000000-0000-0000-0000-000000034c01', 'Site T34', '{cliente34.com.br}'),
  ('00000000-0000-0000-0000-000000034b02', '00000000-0000-0000-0000-000000034c02', 'Outro site', '{outro34.com.br}');

create temp table t34 (what text, v text) on commit drop;
grant all on t34 to authenticated;

-- Chegada por anúncio do Meta (com origem) e um segundo PageView na mesma sessão.
insert into t34 select 'ingest_1', public.tracking_ingest(jsonb_build_object(
  'container_id', '00000000-0000-0000-0000-000000034b01', 'client_id', '00000000-0000-0000-0000-000000034c01',
  'visitor_id', 'visitante_t34_01', 'session_id', 'sessao_t34_01', 'test', true, 'device_type', 'mobile',
  'event', jsonb_build_object('event_id', 'evt_t34_0001', 'name', 'PageView', 'occurred_at', now() - interval '10 minutes',
                              'page_url', 'https://cliente34.com.br/?utm_source=facebook&bf_c=123', 'page_path', '/'),
  'touch', jsonb_build_object('channel', 'meta', 'paid', true, 'evidence', 'confirmada', 'reason', 'IDs do anúncio do Meta na URL.',
                              'utm_source', 'facebook', 'source_normalized', 'facebook', 'ad_campaign_id', '123')
)) ->> 'status';
-- Reenvio do mesmo evento: não duplica nada.
insert into t34 select 'reenvio', public.tracking_ingest(jsonb_build_object(
  'container_id', '00000000-0000-0000-0000-000000034b01', 'client_id', '00000000-0000-0000-0000-000000034c01',
  'visitor_id', 'visitante_t34_01', 'session_id', 'sessao_t34_01',
  'event', jsonb_build_object('event_id', 'evt_t34_0001', 'name', 'PageView', 'occurred_at',
                              (select occurred_at from public.tracking_events where event_id = 'evt_t34_0001')),
  'touch', jsonb_build_object('channel', 'meta', 'paid', true, 'evidence', 'confirmada', 'reason', 'x')
)) ->> 'status';
select public.tracking_ingest(jsonb_build_object(
  'container_id', '00000000-0000-0000-0000-000000034b01', 'client_id', '00000000-0000-0000-0000-000000034c01',
  'visitor_id', 'visitante_t34_01', 'session_id', 'sessao_t34_01',
  'event', jsonb_build_object('event_id', 'evt_t34_0002', 'name', 'PageView', 'occurred_at', now() - interval '9 minutes', 'page_path', '/produto')));
-- Nova visita dias depois pelo Google: primeira origem continua Meta; última vira Google.
select public.tracking_ingest(jsonb_build_object(
  'container_id', '00000000-0000-0000-0000-000000034b01', 'client_id', '00000000-0000-0000-0000-000000034c01',
  'visitor_id', 'visitante_t34_01', 'session_id', 'sessao_t34_02',
  'event', jsonb_build_object('event_id', 'evt_t34_0003', 'name', 'PageView', 'occurred_at', now() - interval '1 minute'),
  'touch', jsonb_build_object('channel', 'google', 'paid', true, 'evidence', 'confirmada', 'reason', 'gclid', 'gclid', 'G1')));
-- Evento do outro cliente (não pode aparecer para o gestor).
select public.tracking_ingest(jsonb_build_object(
  'container_id', '00000000-0000-0000-0000-000000034b02', 'client_id', '00000000-0000-0000-0000-000000034c02',
  'visitor_id', 'visitante_t34_99', 'session_id', 'sessao_t34_99',
  'event', jsonb_build_object('event_id', 'evt_t34_0099', 'name', 'PageView', 'occurred_at', now())));
-- Horário absurdo é recusado (não cria gaveta de mês aleatório).
insert into t34 select 'fora_periodo', public.tracking_ingest(jsonb_build_object(
  'container_id', '00000000-0000-0000-0000-000000034b01', 'client_id', '00000000-0000-0000-0000-000000034c01',
  'visitor_id', 'visitante_t34_01', 'session_id', 'sessao_t34_01',
  'event', jsonb_build_object('event_id', 'evt_t34_0666', 'name', 'PageView', 'occurred_at', '1999-01-01T00:00:00Z'))) ->> 'status';

insert into t34 select 'eventos', count(*)::text from public.tracking_events where container_id = '00000000-0000-0000-0000-000000034b01';
insert into t34 select 'origens', string_agg(channel, ',' order by occurred_at) from public.tracking_touchpoints where container_id = '00000000-0000-0000-0000-000000034b01';
insert into t34 select 'sessao_1', concat_ws('|', pageviews, events, device_type, test, (select channel from public.tracking_touchpoints t where t.id = s.touchpoint_id))
  from public.tracking_sessions s where session_id = 'sessao_t34_01';
insert into t34 select 'primeira_ultima', concat_ws('|', f.channel, l.channel)
  from public.tracking_visitors v join public.tracking_touchpoints f on f.id = v.first_touch_id join public.tracking_touchpoints l on l.id = v.last_touch_id
  where v.visitor_id = 'visitante_t34_01';
insert into t34 select 'evento_com_origem', (touchpoint_id is not null)::text from public.tracking_events where event_id = 'evt_t34_0001';
insert into t34 select 'limite', concat_ws('|', public.track_limit_hit('t34', 2, 60), public.track_limit_hit('t34', 2, 60), public.track_limit_hit('t34', 2, 60));
insert into t34 select 'chave', (public_key ~ '^bf_[0-9a-f]{24}$')::text from public.tracking_containers where id = '00000000-0000-0000-0000-000000034b01';

-- Gestor: vê só o cliente liberado e cria container só para ele.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000034a01","role":"authenticated"}';
insert into t34 select 'gestor_containers', count(*)::text from public.tracking_containers where id in ('00000000-0000-0000-0000-000000034b01', '00000000-0000-0000-0000-000000034b02');
insert into t34 select 'gestor_eventos_outro', count(*)::text from public.tracking_events where client_id = '00000000-0000-0000-0000-000000034c02';
insert into t34 select 'gestor_resumo', concat_ws('|', sessions, visitors, pageviews, events, paid_sessions)
  from public.tracking_overview(now() - interval '1 day', now() + interval '1 hour', array['00000000-0000-0000-0000-000000034b01'::uuid]);
insert into public.tracking_containers (client_id, name, allowed_domains) values ('00000000-0000-0000-0000-000000034c01', 'Loja T34', '{loja34.com.br}');
insert into t34 select 'gestor_criou', (created_by = '00000000-0000-0000-0000-000000034a01')::text from public.tracking_containers where name = 'Loja T34';
update public.tracking_containers set status = 'pausado' where name = 'Loja T34';
insert into t34 select 'gestor_editou', concat_ws('|', status, updated_by = '00000000-0000-0000-0000-000000034a01') from public.tracking_containers where name = 'Loja T34';
reset role;

-- Visualizador: vê, mas não cria.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000034a02","role":"authenticated"}';
insert into t34 select 'visu_ve', count(*)::text from public.tracking_events where client_id = '00000000-0000-0000-0000-000000034c01';
reset role;

-- Papel cliente: não vê nada nesta fase.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000034a03","role":"authenticated"}';
insert into t34 select 'cliente_ve', ((select count(*) from public.tracking_events) + (select count(*) from public.tracking_containers))::text;
reset role;

do $$
declare
  r record;
begin
  for r in select * from t34 loop
    if (r.what, r.v) not in (
      ('ingest_1', 'ok'), ('reenvio', 'duplicado'), ('fora_periodo', 'fora_do_periodo'), ('eventos', '3'),
      ('origens', 'meta,google'), ('sessao_1', '2|2|mobile|t|meta'), ('primeira_ultima', 'meta|google'),
      ('evento_com_origem', 'true'), ('limite', 't|t|f'), ('chave', 'true'),
      ('gestor_containers', '1'), ('gestor_eventos_outro', '0'), ('gestor_resumo', '2|1|3|3|2'),
      ('gestor_criou', 'true'), ('gestor_editou', 'pausado|t'), ('visu_ve', '3'), ('cliente_ve', '0')
    ) then
      raise exception 'FALHOU: % = %', r.what, r.v;
    end if;
  end loop;
  if (select count(*) from t34) <> 17 then raise exception 'FALHOU: faltou verificação (%)', (select count(*) from t34); end if;
end $$;

-- Visualizador não cria container.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000034a02","role":"authenticated"}';
do $$
begin
  begin
    insert into public.tracking_containers (client_id, name) values ('00000000-0000-0000-0000-000000034c01', 'Proibido');
    raise exception 'FALHOU: visualizador criou container';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- Gestor não cria container para cliente não liberado, nem escolhe a chave.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000034a01","role":"authenticated"}';
do $$
begin
  begin
    insert into public.tracking_containers (client_id, name) values ('00000000-0000-0000-0000-000000034c02', 'Proibido');
    raise exception 'FALHOU: gestor criou container de outro cliente';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.tracking_containers (client_id, name, public_key) values ('00000000-0000-0000-0000-000000034c01', 'Chave', 'bf_000000000000000000000000');
    raise exception 'FALHOU: escolheu a chave pública';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.tracking_containers (client_id, name, allowed_domains) values ('00000000-0000-0000-0000-000000034c01', 'Dominio', '{https://x.com}');
    raise exception 'FALHOU: aceitou domínio fora do formato';
  exception when check_violation then null;
  end;
end $$;
reset role;

do $$
begin
  -- Visitante sem login e usuário logado não gravam eventos nem leem as tabelas diretamente.
  if has_table_privilege('anon', 'public.tracking_events', 'select') or has_table_privilege('anon', 'public.tracking_containers', 'select') then
    raise exception 'FALHOU: visitante sem login lê tracking';
  end if;
  if has_table_privilege('authenticated', 'public.tracking_events', 'insert') then
    raise exception 'FALHOU: usuário logado insere eventos direto';
  end if;
  if has_function_privilege('anon', 'public.tracking_ingest(jsonb)', 'execute')
     or has_function_privilege('authenticated', 'public.tracking_ingest(jsonb)', 'execute')
     or has_function_privilege('authenticated', 'public.tracking_container_by_key(text)', 'execute')
     or has_function_privilege('anon', 'public.track_limit_hit(text, integer, integer)', 'execute') then
    raise exception 'FALHOU: função do servidor exposta';
  end if;
  if not exists (select 1 from cron.job where jobname = 'tracking-partitions') then
    raise exception 'FALHOU: agendamento das gavetas não existe';
  end if;
  if to_regclass('history.tracking_events_' || to_char(now() + interval '3 months', 'YYYY_MM')) is null then
    raise exception 'FALHOU: gavetas dos próximos meses não existem';
  end if;
end $$;

select 'Etapa 34.1: TODOS OS TESTES PASSARAM' as resultado;
rollback;
