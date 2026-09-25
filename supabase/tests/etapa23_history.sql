-- =============================================================================
-- Testes da Etapa 23 — Banco histórico
-- Conta vinculada de novo (dias repetidos não somam), cobertura do histórico,
-- fila da importação do passado, tela de Sincronização, sincronização
-- interrompida e permissões da cobertura.
-- Rodar inteiro no SQL Editor. Transação desfeita no final: nada fica gravado.
-- =============================================================================
begin;

insert into auth.users (id, instance_id, aud, role, email) values
  ('00000000-0000-0000-0000-000000023a01', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'gestor@t23.local');
update public.profiles set active = true, role = 'gestor' where id = '00000000-0000-0000-0000-000000023a01';

insert into public.clients (id, name) values
  ('00000000-0000-0000-0000-000000023c01', 'Cliente T23'),
  ('00000000-0000-0000-0000-000000023c02', 'Outro T23');
insert into public.user_client_access (user_id, client_id) values
  ('00000000-0000-0000-0000-000000023a01', '00000000-0000-0000-0000-000000023c01');

insert into public.platform_connections (id, platform_id, label, status) values
  ('00000000-0000-0000-0000-000000023b01', 'meta', 'BM antiga T23', 'revogada'),
  ('00000000-0000-0000-0000-000000023b02', 'meta', 'BM nova T23', 'ativa');

-- Mesma conta do Meta vinculada 2 vezes: pela BM antiga (desvinculada) e pela nova.
insert into public.ad_accounts (id, platform_id, external_id, client_id, connection_id, name, currency, status, linked_at, unlinked_at) values
  ('00000000-0000-0000-0000-000000023001', 'meta', 't23-dup', '00000000-0000-0000-0000-000000023c01', '00000000-0000-0000-0000-000000023b01', 'Conta T23 (antiga)', 'BRL', 'ativa', now() - interval '2 days', now() - interval '1 day'),
  ('00000000-0000-0000-0000-000000023002', 'meta', 't23-dup', '00000000-0000-0000-0000-000000023c01', '00000000-0000-0000-0000-000000023b02', 'Conta T23', 'BRL', 'ativa', now() - interval '1 day', null),
  ('00000000-0000-0000-0000-000000023003', 'meta', 't23-out', '00000000-0000-0000-0000-000000023c02', '00000000-0000-0000-0000-000000023b02', 'Conta Outro T23', 'BRL', 'ativa', now(), null);

-- Antiga: dias 1, 2 e 3 (R$ 10 cada). Nova: dias 2, 3 e 4 (R$ 20 cada).
select public.ingest_metrics_daily(jsonb_agg(jsonb_build_object(
  'date', date '2026-08-01' + d, 'ad_account_id', '00000000-0000-0000-0000-000000023001', 'level', 'account',
  'entity_external_id', 't23-dup', 'spend_micros', 10000000, 'impressions', 100, 'leads', 1)))
from generate_series(0, 2) d;
select public.ingest_metrics_daily(jsonb_agg(jsonb_build_object(
  'date', date '2026-08-01' + d, 'ad_account_id', '00000000-0000-0000-0000-000000023002', 'level', 'account',
  'entity_external_id', 't23-dup', 'spend_micros', 20000000, 'impressions', 200, 'leads', 2)))
from generate_series(1, 3) d;

create temp table t23 (what text, n numeric) on commit drop;
grant all on t23 to authenticated;

insert into t23 select 'substituidas_1', count(*) from public.metrics_daily
 where ad_account_id = '00000000-0000-0000-0000-000000023001' and superseded;

-- Gestor pergunta: "quanto gastou de 1 a 4 de agosto?"
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000023a01","role":"authenticated"}';
insert into t23 select 'gasto_1', spend_micros / 1000000.0 from public.metrics_summary('2026-08-01', '2026-08-04', array['00000000-0000-0000-0000-000000023c01'::uuid]);
insert into t23 select 'leads_1', leads from public.metrics_summary('2026-08-01', '2026-08-04', array['00000000-0000-0000-0000-000000023c01'::uuid]);
insert into t23 select 'cobertura_linhas', count(*) from public.history_coverage();
insert into t23 select 'cobertura_outro', count(*) from public.history_coverage() where client_id = '00000000-0000-0000-0000-000000023c02';
reset role;

-- A importação do passado traz o dia 1 pela conta nova: o dia 1 antigo também deixa de somar.
select public.ingest_metrics_daily(jsonb_build_array(jsonb_build_object(
  'date', '2026-08-01', 'ad_account_id', '00000000-0000-0000-0000-000000023002', 'level', 'account',
  'entity_external_id', 't23-dup', 'spend_micros', 20000000, 'impressions', 200, 'leads', 2)));
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000023a01","role":"authenticated"}';
insert into t23 select 'gasto_2', spend_micros / 1000000.0 from public.metrics_summary('2026-08-01', '2026-08-04', array['00000000-0000-0000-0000-000000023c01'::uuid]);
reset role;

-- ---------------------------------------------------------------- cobertura
insert into public.sync_state (ad_account_id, status) values
  ('00000000-0000-0000-0000-000000023002', 'sucesso'),
  ('00000000-0000-0000-0000-000000023003', 'sucesso')
on conflict (ad_account_id) do nothing;

do $$
declare
  a uuid := '00000000-0000-0000-0000-000000023002';
  f date; t date;
begin
  perform public.sync_mark_coverage(a, '2026-08-26', '2026-09-25');
  select history_from, history_to into f, t from public.sync_state where ad_account_id = a;
  if (f, t) is distinct from ('2026-08-26'::date, '2026-09-25'::date) then raise exception 'FALHOU: primeira cobertura (% a %)', f, t; end if;

  perform public.sync_mark_coverage(a, '2026-09-19', '2026-09-26');           -- sincronização de hora em hora
  perform public.sync_mark_coverage(a, '2026-07-27', '2026-08-25');           -- importação do passado (encosta)
  select history_from, history_to into f, t from public.sync_state where ad_account_id = a;
  if (f, t) is distinct from ('2026-07-27'::date, '2026-09-26'::date) then raise exception 'FALHOU: cobertura deveria crescer para os dois lados (% a %)', f, t; end if;

  perform public.sync_mark_coverage(a, '2026-01-01', '2026-01-31');           -- solto no passado: ignora
  select history_from, history_to into f, t from public.sync_state where ad_account_id = a;
  if f <> '2026-07-27' then raise exception 'FALHOU: período solto não pode criar buraco na cobertura (%)', f; end if;

  perform public.sync_mark_coverage(a, '2026-10-10', '2026-10-16');           -- buraco depois: recomeça
  select history_from, history_to into f, t from public.sync_state where ad_account_id = a;
  if (f, t) is distinct from ('2026-10-10'::date, '2026-10-16'::date) then raise exception 'FALHOU: com buraco, a cobertura recomeça (% a %)', f, t; end if;

  perform public.sync_mark_coverage(a, '2026-10-20', '2026-10-01');           -- período inválido: nada
  select history_from into f from public.sync_state where ad_account_id = a;
  if f <> '2026-10-10' then raise exception 'FALHOU: período inválido não pode mudar nada'; end if;

  if public.history_target() <> (date_trunc('month', timezone('America/Sao_Paulo', now())) - interval '12 months')::date
     or extract(day from public.history_target()) <> 1 then
    raise exception 'FALHOU: meta do histórico = dia 1, 12 meses atrás';
  end if;
end;
$$;

-- ---------------------------------------------------------------- fila da importação do passado
update public.sync_state set history_from = current_date - 5, history_to = current_date, backfill_locked_until = null, backfill_next_at = null
 where ad_account_id in ('00000000-0000-0000-0000-000000023002', '00000000-0000-0000-0000-000000023003');
insert into t23 select 'fila_1', count(*) from public.sync_claim_backfill(10) c
 where c in ('00000000-0000-0000-0000-000000023002', '00000000-0000-0000-0000-000000023003');
insert into t23 select 'fila_2', count(*) from public.sync_claim_backfill(10) c
 where c in ('00000000-0000-0000-0000-000000023002', '00000000-0000-0000-0000-000000023003');
update public.sync_state set backfill_locked_until = null, history_from = public.history_target()
 where ad_account_id = '00000000-0000-0000-0000-000000023002';
update public.sync_state set backfill_locked_until = null, backfill_next_at = now() + interval '1 hour'
 where ad_account_id = '00000000-0000-0000-0000-000000023003';
insert into t23 select 'fila_3', count(*) from public.sync_claim_backfill(10) c
 where c in ('00000000-0000-0000-0000-000000023002', '00000000-0000-0000-0000-000000023003');

-- ---------------------------------------------------------------- tela de Sincronização e interrompidas
insert into public.sync_runs (ad_account_id, client_id, platform_id, trigger, status, started_at, finished_at, duration_ms) values
  ('00000000-0000-0000-0000-000000023002', '00000000-0000-0000-0000-000000023c01', 'meta', 'agendada', 'sucesso', now() - interval '10 minutes', now() - interval '9 minutes', 1000),
  ('00000000-0000-0000-0000-000000023002', '00000000-0000-0000-0000-000000023c01', 'meta', 'historico', 'erro', now() - interval '1 minute', now(), 1000);
insert into public.sync_runs (id, ad_account_id, client_id, platform_id, trigger, status, started_at)
  overriding system value values
  (-2301, '00000000-0000-0000-0000-000000023003', '00000000-0000-0000-0000-000000023c02', 'meta', 'agendada', 'executando', now() - interval '2 hours'),
  (-2302, '00000000-0000-0000-0000-000000023003', '00000000-0000-0000-0000-000000023c02', 'meta', 'agendada', 'executando', now() - interval '5 minutes');
select private.trigger_scheduled_sync();

do $$
declare
  v numeric;
  s text;
begin
  select n into v from t23 where what = 'substituidas_1';
  if v <> 2 then raise exception 'FALHOU: dias 2 e 3 da conta antiga deveriam ficar substituídos (veio %)', v; end if;
  select n into v from t23 where what = 'gasto_1';
  if v <> 70 then raise exception 'FALHOU: gasto de 1 a 4/ago = 10 (antiga, dia 1) + 3 × 20 (nova) = 70, veio % (repetido somando?)', v; end if;
  select n into v from t23 where what = 'leads_1';
  if v <> 7 then raise exception 'FALHOU: leads = 1 + 3 × 2 = 7, veio %', v; end if;
  select n into v from t23 where what = 'gasto_2';
  if v <> 80 then raise exception 'FALHOU: depois de importar o dia 1 pela conta nova, gasto = 4 × 20 = 80, veio %', v; end if;
  if (select count(*) from public.metrics_daily where ad_account_id = '00000000-0000-0000-0000-000000023001') <> 3 then
    raise exception 'FALHOU: nada pode ser apagado (a conta antiga continua com os 3 dias guardados)';
  end if;

  select n into v from t23 where what = 'cobertura_outro';
  if v <> 0 then raise exception 'FALHOU: gestor viu cobertura de cliente não liberado'; end if;
  select n into v from t23 where what = 'cobertura_linhas';
  if v <> 1 then raise exception 'FALHOU: gestor deveria ver só a conta vinculada do cliente liberado (veio %)', v; end if;

  select n into v from t23 where what = 'fila_1';
  if v <> 2 then raise exception 'FALHOU: as 2 contas com histórico curto deveriam entrar na fila (veio %)', v; end if;
  select n into v from t23 where what = 'fila_2';
  if v <> 0 then raise exception 'FALHOU: conta já travada não pode ser pega de novo (veio %)', v; end if;
  select n into v from t23 where what = 'fila_3';
  if v <> 0 then raise exception 'FALHOU: conta completa ou esperando nova tentativa não entra na fila (veio %)', v; end if;

  select run_trigger into s from public.sync_overview() where ad_account_id = '00000000-0000-0000-0000-000000023002';
  if s is distinct from 'agendada' then raise exception 'FALHOU: tela de Sincronização deveria mostrar a última do dia a dia, não a importação (veio %)', s; end if;

  select status into s from public.sync_runs where id = -2301;
  if s <> 'erro' then raise exception 'FALHOU: sincronização parada há 2 horas deveria ser fechada como interrompida'; end if;
  select status into s from public.sync_runs where id = -2302;
  if s <> 'executando' then raise exception 'FALHOU: sincronização de 5 minutos atrás ainda pode estar rodando'; end if;

  if has_function_privilege('authenticated', 'public.sync_claim_backfill(integer, integer)', 'execute')
     or has_function_privilege('authenticated', 'public.sync_mark_coverage(uuid, date, date)', 'execute') then
    raise exception 'FALHOU: fila e cobertura só podem ser mexidas pelo servidor';
  end if;
  if has_function_privilege('anon', 'public.history_coverage(uuid[], text[], uuid[])', 'execute') then
    raise exception 'FALHOU: visitante sem login não pode ver a cobertura';
  end if;

  raise notice 'TODOS OS TESTES PASSARAM';
end;
$$;

select 'TODOS OS TESTES PASSARAM' as resultado;
rollback;
