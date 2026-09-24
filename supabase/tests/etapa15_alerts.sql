-- =============================================================================
-- Testes da Etapa 15 — Central de alertas (refresh_alerts / set_alert_status)
-- Rodar inteiro no SQL Editor. Transação desfeita no final: nada fica gravado.
-- =============================================================================
begin;

insert into auth.users (id, instance_id, aud, role, email) values
  ('00000000-0000-0000-0000-00000000e0a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@t15.local'),
  ('00000000-0000-0000-0000-00000000e0c1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'gestor@t15.local'),
  ('00000000-0000-0000-0000-00000000e0d1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'visual@t15.local');
update public.profiles set active = true, role = 'admin' where id = '00000000-0000-0000-0000-00000000e0a1';
update public.profiles set active = true, role = 'gestor' where id = '00000000-0000-0000-0000-00000000e0c1';
update public.profiles set active = true, role = 'visualizador' where id = '00000000-0000-0000-0000-00000000e0d1';

insert into public.clients (id, name) values
  ('00000000-0000-0000-0000-00000000e0f1', 'Excalibur Fitness'),
  ('00000000-0000-0000-0000-00000000e0f2', 'Loja Internacional');
delete from public.user_client_access where user_id in ('00000000-0000-0000-0000-00000000e0c1', '00000000-0000-0000-0000-00000000e0d1');
insert into public.user_client_access (user_id, client_id) values
  ('00000000-0000-0000-0000-00000000e0c1', '00000000-0000-0000-0000-00000000e0f1'),
  ('00000000-0000-0000-0000-00000000e0d1', '00000000-0000-0000-0000-00000000e0f1');

insert into public.ad_accounts (id, platform_id, external_id, client_id, name, currency, status, status_reason, unlinked_at) values
  ('00000000-0000-0000-0000-00000000e001', 'meta',   'e01',        '00000000-0000-0000-0000-00000000e0f1', 'Sem saldo',     'BRL', 'ativa', null, null),
  ('00000000-0000-0000-0000-00000000e002', 'meta',   'e02',        '00000000-0000-0000-0000-00000000e0f1', 'Saldo baixo',   'BRL', 'ativa', null, null),
  ('00000000-0000-0000-0000-00000000e003', 'google', '8223334411', '00000000-0000-0000-0000-00000000e0f1', 'Pagamento',     'BRL', 'pagamento_pendente', null, null),
  ('00000000-0000-0000-0000-00000000e004', 'meta',   'e04',        '00000000-0000-0000-0000-00000000e0f2', 'Restrita',      'USD', 'restrita', 'Política de anúncios', null),
  ('00000000-0000-0000-0000-00000000e005', 'meta',   'e05',        '00000000-0000-0000-0000-00000000e0f1', 'Atrasada',      'BRL', 'ativa', null, null),
  ('00000000-0000-0000-0000-00000000e006', 'meta',   'e06',        '00000000-0000-0000-0000-00000000e0f1', 'Desvinculada',  'BRL', 'ativa', null, now());

insert into public.account_snapshots (ad_account_id, client_id, platform_id, status, currency, available_micros, issues, captured_at) values
  ('00000000-0000-0000-0000-00000000e001', '00000000-0000-0000-0000-00000000e0f1', 'meta',   'ativa', 'BRL', 0, '{}', now()),
  ('00000000-0000-0000-0000-00000000e002', '00000000-0000-0000-0000-00000000e0f1', 'meta',   'ativa', 'BRL', 100000000, '{}', now()),
  ('00000000-0000-0000-0000-00000000e003', '00000000-0000-0000-0000-00000000e0f1', 'google', 'pagamento_pendente', 'BRL', null, '{cobranca_problema,pagamento_pendente}', now()),
  ('00000000-0000-0000-0000-00000000e006', '00000000-0000-0000-0000-00000000e0f1', 'meta',   'ativa', 'BRL', 0, '{}', now());

insert into public.sync_state (ad_account_id, status, last_success_at, last_error_message) values
  ('00000000-0000-0000-0000-00000000e004', 'erro', now() - interval '3 hours', 'Token expirado'),
  ('00000000-0000-0000-0000-00000000e005', 'sucesso', now() - interval '72 hours', null);

-- Campanhas da conta "Atrasada": C1 sem entrega, C2 entregando
insert into public.campaigns (id, ad_account_id, client_id, platform_id, external_id, name, status, first_seen_at) values
  ('00000000-0000-0000-0000-00000000ec01', '00000000-0000-0000-0000-00000000e005', '00000000-0000-0000-0000-00000000e0f1', 'meta', 'ec1', 'Parada',     'ativa', now() - interval '10 days'),
  ('00000000-0000-0000-0000-00000000ec02', '00000000-0000-0000-0000-00000000e005', '00000000-0000-0000-0000-00000000e0f1', 'meta', 'ec2', 'Entregando', 'ativa', now() - interval '10 days'),
  ('00000000-0000-0000-0000-00000000ec03', '00000000-0000-0000-0000-00000000e005', '00000000-0000-0000-0000-00000000e0f1', 'meta', 'ec3', 'Nova',       'ativa', now());

-- Métricas: "Saldo baixo" gasta R$ 60/dia (2 dias) → R$ 100 dura ~1 dia.
-- "Atrasada": leads caem de 21 (3/dia) para 7 (1/dia); C2 com impressões ontem e anteontem.
do $$
declare
  d date := (now() at time zone 'America/Sao_Paulo')::date;
  rows jsonb := '[]'::jsonb;
  i int;
begin
  rows := rows || jsonb_build_array(
    jsonb_build_object('date', d - 1, 'ad_account_id', '00000000-0000-0000-0000-00000000e002', 'level', 'account', 'entity_external_id', 'e02', 'spend_micros', 60000000),
    jsonb_build_object('date', d - 2, 'ad_account_id', '00000000-0000-0000-0000-00000000e002', 'level', 'account', 'entity_external_id', 'e02', 'spend_micros', 60000000),
    jsonb_build_object('date', d - 1, 'ad_account_id', '00000000-0000-0000-0000-00000000e005', 'level', 'campaign', 'entity_external_id', 'ec2', 'campaign_id', '00000000-0000-0000-0000-00000000ec02', 'impressions', 500),
    jsonb_build_object('date', d - 2, 'ad_account_id', '00000000-0000-0000-0000-00000000e005', 'level', 'campaign', 'entity_external_id', 'ec2', 'campaign_id', '00000000-0000-0000-0000-00000000ec02', 'impressions', 400));
  for i in 1..7 loop
    rows := rows || jsonb_build_array(
      jsonb_build_object('date', d - i,     'ad_account_id', '00000000-0000-0000-0000-00000000e005', 'level', 'account', 'entity_external_id', 'e05', 'spend_micros', 10000000, 'impressions', 1000, 'leads', 1),
      jsonb_build_object('date', d - 7 - i, 'ad_account_id', '00000000-0000-0000-0000-00000000e005', 'level', 'account', 'entity_external_id', 'e05', 'spend_micros', 10000000, 'impressions', 1000, 'leads', 3));
  end loop;
  perform public.ingest_metrics_daily(rows);
end $$;

-- ---------------------------------------------------------------- verificação (agendador, sem login)
do $$
declare
  r jsonb;
  a record;
  n int;
begin
  r := public.refresh_alerts();
  if (r ->> 'created')::int < 8 then raise exception 'FALHOU: poucos alertas criados (%)', r; end if;

  -- 🔴 Sem saldo
  select * into a from public.alerts where alert_key = 'sem_saldo:00000000-0000-0000-0000-00000000e001' and status = 'aberto';
  if not found or a.severity <> 'critica' or a.recommended_action is null then raise exception 'FALHOU: sem saldo'; end if;
  -- 🟠 Saldo baixo, com valor e previsão
  select * into a from public.alerts where alert_key = 'saldo_baixo:00000000-0000-0000-0000-00000000e002';
  if not found or a.severity <> 'alta' or a.description <> 'Saldo baixo: R$ 100,00 disponíveis, cerca de 1 dia(s) no ritmo atual de gasto.' then
    raise exception 'FALHOU: saldo baixo (%)', a.description;
  end if;
  -- 🔴 Pagamento pendente (status + informado = um alerta só) e problema de cobrança
  select count(*) into n from public.alerts where ad_account_id = '00000000-0000-0000-0000-00000000e003' and type = 'pagamento_pendente';
  if n <> 1 then raise exception 'FALHOU: pagamento pendente duplicado (%)', n; end if;
  if not exists (select 1 from public.alerts where alert_key = 'cobranca_problema:00000000-0000-0000-0000-00000000e003') then
    raise exception 'FALHOU: problema de cobrança';
  end if;
  -- 🔴 Conta restrita (com motivo) e erro na API
  select * into a from public.alerts where alert_key = 'conta_limitada:00000000-0000-0000-0000-00000000e004';
  if not found or a.type <> 'conta_restrita' or a.description not like '%Política de anúncios%' then raise exception 'FALHOU: conta restrita'; end if;
  select * into a from public.alerts where alert_key = 'erro_api:00000000-0000-0000-0000-00000000e004';
  if not found or a.description not like '%Token expirado%' or a.platform_id <> 'meta' or a.client_id <> '00000000-0000-0000-0000-00000000e0f2' then
    raise exception 'FALHOU: erro na API';
  end if;
  -- 🟠 Sincronização atrasada
  select * into a from public.alerts where alert_key = 'sincronizacao_atrasada:00000000-0000-0000-0000-00000000e005';
  if not found or a.description not like '%72 horas%' then raise exception 'FALHOU: sincronização atrasada'; end if;
  -- 🟡 Campanha sem entrega (só a parada; a nova e a que entrega ficam de fora)
  if not exists (select 1 from public.alerts where alert_key = 'campanha_sem_entrega:00000000-0000-0000-0000-00000000ec01' and campaign_id = '00000000-0000-0000-0000-00000000ec01') then
    raise exception 'FALHOU: campanha sem entrega';
  end if;
  if exists (select 1 from public.alerts where campaign_id in ('00000000-0000-0000-0000-00000000ec02', '00000000-0000-0000-0000-00000000ec03')) then
    raise exception 'FALHOU: campanha entregando ou nova virou alerta';
  end if;
  -- 🟡 Queda de resultados
  select * into a from public.alerts where alert_key = 'queda_resultados:00000000-0000-0000-0000-00000000e005';
  if not found or a.description <> 'Leads caíram 67% nos últimos 7 dias (de 21 para 7) em relação aos 7 dias anteriores.' or a.recommended_action is not null then
    raise exception 'FALHOU: queda de resultados (%)', a.description;
  end if;
  -- Conta desvinculada não gera alerta
  if exists (select 1 from public.alerts where ad_account_id = '00000000-0000-0000-0000-00000000e006') then
    raise exception 'FALHOU: conta desvinculada gerou alerta';
  end if;

  -- Rodar de novo não duplica
  r := public.refresh_alerts();
  select count(*) into n from public.alerts where client_id in ('00000000-0000-0000-0000-00000000e0f1', '00000000-0000-0000-0000-00000000e0f2');
  if n <> 9 then raise exception 'FALHOU: verificação repetida duplicou alertas (%)', n; end if;

  -- Problema resolvido na plataforma → alerta resolvido automaticamente (histórico fica)
  insert into public.account_snapshots (ad_account_id, client_id, platform_id, status, currency, available_micros, issues, captured_at)
  values ('00000000-0000-0000-0000-00000000e001', '00000000-0000-0000-0000-00000000e0f1', 'meta', 'ativa', 'BRL', 900000000, '{}', now() + interval '1 second');
  perform public.refresh_alerts();
  select * into a from public.alerts where alert_key = 'sem_saldo:00000000-0000-0000-0000-00000000e001';
  if a.status <> 'resolvido' or a.resolution <> 'automatica' or a.resolved_at is null then raise exception 'FALHOU: resolução automática'; end if;
end $$;

-- ---------------------------------------------------------------- administrador
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000e0a1","role":"authenticated"}';
do $$
declare
  a public.alerts;
  v_id bigint;
begin
  perform public.refresh_alerts();  -- pode verificar pelo botão
  select id into v_id from public.alerts where alert_key = 'saldo_baixo:00000000-0000-0000-0000-00000000e002';
  a := public.set_alert_status(v_id, 'visto');
  if a.status <> 'visto' or a.seen_by <> '00000000-0000-0000-0000-00000000e0a1' then raise exception 'FALHOU: marcar como visto'; end if;
  a := public.set_alert_status(v_id, 'aberto');
  if a.status <> 'aberto' or a.seen_at is not null then raise exception 'FALHOU: reabrir'; end if;
  a := public.set_alert_status(v_id, 'resolvido');
  if a.status <> 'resolvido' or a.resolution <> 'manual' or a.resolved_by <> '00000000-0000-0000-0000-00000000e0a1' then raise exception 'FALHOU: resolver'; end if;
  begin
    perform public.set_alert_status(v_id, 'aberto');
    raise exception 'FALHOU: alerta resolvido foi alterado';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.set_alert_status(v_id, 'qualquer');
    raise exception 'FALHOU: status inválido aceito';
  exception when invalid_parameter_value then null;
  end;
  -- Escrita direta na tabela é bloqueada
  begin
    update public.alerts set status = 'aberto' where id = v_id;
    raise exception 'FALHOU: update direto permitido';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- ---------------------------------------------------------------- gestor (só Excalibur)
select set_config('t15.erro_api_id', id::text, true) from public.alerts where alert_key = 'erro_api:00000000-0000-0000-0000-00000000e004';
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000e0c1","role":"authenticated"}';
do $$
declare v_id bigint;
begin
  if exists (select 1 from public.alerts where client_id = '00000000-0000-0000-0000-00000000e0f2') then
    raise exception 'FALHOU: gestor viu alerta de cliente não liberado';
  end if;
  if not exists (select 1 from public.alerts where alert_key = 'sincronizacao_atrasada:00000000-0000-0000-0000-00000000e005') then
    raise exception 'FALHOU: gestor não vê alerta do próprio cliente';
  end if;
  v_id := current_setting('t15.erro_api_id')::bigint;
  begin
    perform public.set_alert_status(v_id, 'visto');
    raise exception 'FALHOU: gestor alterou alerta de cliente não liberado';
  exception when no_data_found then null;
  end;
end $$;
reset role;

-- ---------------------------------------------------------------- visualizador: vê, mas não altera nem verifica
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000e0d1","role":"authenticated"}';
do $$
declare v_id bigint;
begin
  select id into v_id from public.alerts where alert_key = 'sincronizacao_atrasada:00000000-0000-0000-0000-00000000e005';
  if v_id is null then raise exception 'FALHOU: visualizador não vê alertas'; end if;
  begin
    perform public.set_alert_status(v_id, 'visto');
    raise exception 'FALHOU: visualizador alterou alerta';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.refresh_alerts();
    raise exception 'FALHOU: visualizador rodou a verificação';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- ---------------------------------------------------------------- visitante sem login
set local role anon;
do $$
begin
  perform public.refresh_alerts();
  raise exception 'FALHOU: anônimo rodou a verificação';
exception when insufficient_privilege then null;
end $$;
reset role;

-- Agendamento automático existe
do $$
begin
  if not exists (select 1 from cron.job where jobname = 'refresh-alerts' and schedule = '*/15 * * * *') then
    raise exception 'FALHOU: verificação automática não agendada';
  end if;
end $$;

rollback;

select 'TODOS OS TESTES PASSARAM' as resultado;
