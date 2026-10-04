-- =============================================================================
-- Testes da Etapa 37.3 — Monitoramento: motor de alertas de desempenho.
-- Rodar inteiro no SQL Editor. Transação desfeita no final: nada fica gravado.
-- Data fixa da avaliação: 28/09/2026 (atual 21–27/09, anterior 14–20/09).
-- As contas reais também são avaliadas dentro da transação; as verificações olham só as contas de teste.
-- =============================================================================
begin;

-- Este teste confere o motor completo (todas as gravidades). Desde 04/10/2026 o padrão é "só críticos":
-- ver etapa37_alertas_so_criticos.sql.
update public.monitor_settings set min_severity = 'informativo' where id = 1;

insert into auth.users (id, instance_id, aud, role, email) values
  ('00000000-0000-0000-0000-00000373aa01', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@t373.local'),
  ('00000000-0000-0000-0000-00000373aa02', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'gestor@t373.local'),
  ('00000000-0000-0000-0000-00000373aa04', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'visual@t373.local'),
  ('00000000-0000-0000-0000-00000373aa05', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'equipe@t373.local');
update public.profiles set active = true, role = 'admin', full_name = 'Admin T373' where id = '00000000-0000-0000-0000-00000373aa01';
update public.profiles set active = true, role = 'gestor', full_name = 'Gestor T373' where id = '00000000-0000-0000-0000-00000373aa02';
update public.profiles set active = true, role = 'visualizador', full_name = 'Visual T373' where id = '00000000-0000-0000-0000-00000373aa04';
update public.profiles set active = true, role = 'equipe', full_name = 'Equipe T373' where id = '00000000-0000-0000-0000-00000373aa05';

insert into public.clients (id, name) values
  ('00000000-0000-0000-0000-00000373cc01', 'Cliente A T373'),
  ('00000000-0000-0000-0000-00000373cc02', 'Cliente B T373');
insert into public.user_client_access (user_id, client_id) values
  ('00000000-0000-0000-0000-00000373aa02', '00000000-0000-0000-0000-00000373cc01'),
  ('00000000-0000-0000-0000-00000373aa04', '00000000-0000-0000-0000-00000373cc01');

-- Conta A: tudo em dia. Conta B: erro na sincronização. Conta C: coleta atrasada (5 h). Conta D: em dia, cliente B.
insert into public.ad_accounts (id, platform_id, external_id, client_id, name, currency, timezone) values
  ('00000000-0000-0000-0000-00000373ac01', 'meta', 't373a', '00000000-0000-0000-0000-00000373cc01', 'Conta A T373', 'BRL', 'America/Sao_Paulo'),
  ('00000000-0000-0000-0000-00000373ac02', 'meta', 't373b', '00000000-0000-0000-0000-00000373cc01', 'Conta B T373', 'BRL', 'America/Sao_Paulo'),
  ('00000000-0000-0000-0000-00000373ac03', 'meta', 't373c', '00000000-0000-0000-0000-00000373cc01', 'Conta C T373', 'BRL', 'America/Sao_Paulo'),
  ('00000000-0000-0000-0000-00000373ac04', 'meta', 't373d', '00000000-0000-0000-0000-00000373cc02', 'Conta D T373', 'BRL', 'America/Sao_Paulo');
insert into public.sync_state (ad_account_id, status, history_from, history_to, last_success_at) values
  ('00000000-0000-0000-0000-00000373ac01', 'sucesso', '2026-01-01', '2026-09-30', now()),
  ('00000000-0000-0000-0000-00000373ac02', 'erro', '2026-01-01', '2026-09-30', now()),
  ('00000000-0000-0000-0000-00000373ac03', 'sucesso', '2026-01-01', '2026-09-30', now() - interval '5 hours'),
  ('00000000-0000-0000-0000-00000373ac04', 'sucesso', '2026-01-01', '2026-09-30', now());

-- C1 leads (piora), C2 sem gasto na semana, C3 nova (começou 20/09), C4 anomalia, C5 resolvida à mão, C6 conta com erro, C7 cliente B,
-- C8 PAUSADA na plataforma (números ruins, mas desativada: descartada).
insert into public.campaigns (id, ad_account_id, client_id, platform_id, external_id, name, objective, start_date, status)
select ('00000000-0000-0000-0000-00000373ca0' || n)::uuid, acc::uuid, cli::uuid, 'meta', 'c' || n, 'C' || n || ' T373', 'OUTCOME_LEADS', sd::date,
       (case when n = 8 then 'pausada' else 'ativa' end)::public.entity_status
from (values
  (1, '00000000-0000-0000-0000-00000373ac01', '00000000-0000-0000-0000-00000373cc01', '2026-06-01'),
  (2, '00000000-0000-0000-0000-00000373ac01', '00000000-0000-0000-0000-00000373cc01', '2026-06-01'),
  (3, '00000000-0000-0000-0000-00000373ac01', '00000000-0000-0000-0000-00000373cc01', '2026-09-20'),
  (4, '00000000-0000-0000-0000-00000373ac01', '00000000-0000-0000-0000-00000373cc01', '2026-06-01'),
  (5, '00000000-0000-0000-0000-00000373ac01', '00000000-0000-0000-0000-00000373cc01', '2026-06-01'),
  (6, '00000000-0000-0000-0000-00000373ac02', '00000000-0000-0000-0000-00000373cc01', '2026-06-01'),
  (7, '00000000-0000-0000-0000-00000373ac04', '00000000-0000-0000-0000-00000373cc02', '2026-06-01'),
  (8, '00000000-0000-0000-0000-00000373ac01', '00000000-0000-0000-0000-00000373cc01', '2026-06-01')
) as v(n, acc, cli, sd);
insert into public.ad_groups (id, campaign_id, ad_account_id, client_id, platform_id, external_id, name, status) values
  ('00000000-0000-0000-0000-00000373ab01', '00000000-0000-0000-0000-00000373ca01', '00000000-0000-0000-0000-00000373ac01', '00000000-0000-0000-0000-00000373cc01', 'meta', 'g1', 'Conjunto T373', 'ativa');
insert into public.ads (id, ad_group_id, campaign_id, ad_account_id, client_id, platform_id, external_id, name, status) values
  ('00000000-0000-0000-0000-00000373ad09', '00000000-0000-0000-0000-00000373ab01', '00000000-0000-0000-0000-00000373ca01', '00000000-0000-0000-0000-00000373ac01', '00000000-0000-0000-0000-00000373cc01', 'meta', 'd9', 'Anúncio sem leads T373', 'ativa');

-- Linhas diárias (R$ 10/dia, 1.000 impressões, 50 cliques). Anterior: 5 leads/dia (R$ 2,00 por lead). Atual: 2 leads/dia (R$ 5,00).
create or replace function pg_temp.day_rows(p_camp text, p_acc text, p_cli text, p_ext text, p_from date, p_to date,
                                            p_spend bigint, p_impr bigint, p_clk bigint, p_leads numeric)
returns void language sql as $$
  insert into public.metrics_daily (date, ad_account_id, level, entity_external_id, client_id, platform_id, campaign_id, currency,
                                    spend_micros, impressions, clicks, leads, hash)
  select g::date, p_acc::uuid, 'campaign', p_ext, p_cli::uuid, 'meta', p_camp::uuid, 'BRL', p_spend, p_impr, p_clk, p_leads, 'h'
    from generate_series(p_from, p_to, interval '1 day') g
$$;
select pg_temp.day_rows('00000000-0000-0000-0000-00000373ca0' || n, '00000000-0000-0000-0000-00000373ac0' || a, '00000000-0000-0000-0000-00000373cc0' || c,
                        'c' || n, '2026-09-14', '2026-09-20', 10000000, 1000, 50, 5)
  from (values (1, 1, 1), (2, 1, 1), (3, 1, 1), (5, 1, 1), (6, 2, 1), (7, 4, 2), (8, 1, 1)) v(n, a, c);
select pg_temp.day_rows('00000000-0000-0000-0000-00000373ca0' || n, '00000000-0000-0000-0000-00000373ac0' || a, '00000000-0000-0000-0000-00000373cc0' || c,
                        'c' || n, '2026-09-21', '2026-09-27', 10000000, 1000, 50, case when n = 3 then 1 else 2 end)
  from (values (1, 1, 1), (3, 1, 1), (5, 1, 1), (6, 2, 1), (7, 4, 2), (8, 1, 1)) v(n, a, c);
-- Conta C: só para ter dados recentes.
select pg_temp.day_rows(null, '00000000-0000-0000-0000-00000373ac03', '00000000-0000-0000-0000-00000373cc01',
                        'cc', '2026-09-14', '2026-09-27', 1000000, 100, 5, 1);
-- C4: 28 dias estáveis (9 e 11 leads alternados) e ontem só 1 lead → fora do padrão.
insert into public.metrics_daily (date, ad_account_id, level, entity_external_id, client_id, platform_id, campaign_id, currency, spend_micros, impressions, clicks, leads, hash)
select g::date, '00000000-0000-0000-0000-00000373ac01', 'campaign', 'c4', '00000000-0000-0000-0000-00000373cc01', 'meta', '00000000-0000-0000-0000-00000373ca04', 'BRL',
       10000000, 1000, 50, case when g::date = '2026-09-27' then 1 when extract(day from g)::int % 2 = 0 then 9 else 11 end, 'h'
  from generate_series('2026-08-30'::date, '2026-09-27'::date, interval '1 day') g;
-- Anúncio D9 (campanha C1): veicula desde 14/09; nos últimos 7 dias gastou R$ 14 sem nenhum lead (a campanha pagava R$ 2,00 por lead).
insert into public.metrics_daily (date, ad_account_id, level, entity_external_id, client_id, platform_id, campaign_id, ad_group_id, ad_id, currency, spend_micros, impressions, clicks, leads, hash)
select g::date, '00000000-0000-0000-0000-00000373ac01', 'ad', 'd9', '00000000-0000-0000-0000-00000373cc01', 'meta', '00000000-0000-0000-0000-00000373ca01',
       '00000000-0000-0000-0000-00000373ab01', '00000000-0000-0000-0000-00000373ad09', 'BRL', case when g::date = '2026-09-14' then 1000000 else 2000000 end, 100, 2, 0, 'h'
  from generate_series('2026-09-14'::date, '2026-09-27'::date, interval '1 day') g
 where g::date = '2026-09-14' or g::date >= '2026-09-21';

create temp table r373 (what text, v text) on commit drop;
grant all on r373 to authenticated, anon;
create or replace function pg_temp.try(p_sql text) returns text language plpgsql as $$
begin
  execute p_sql;
  return 'ok';
exception when others then
  return sqlstate;
end $$;
grant execute on function pg_temp.try(text) to authenticated, anon;
-- Alertas das contas de teste (abertos), em ordem estável.
create or replace function pg_temp.open_alerts() returns text language sql as $$
  select coalesce(string_agg(c.name || ':' || a.kind || ':' || a.level || ':' || a.metric || ':' || a.severity, ',' order by c.name, a.kind, a.level, a.metric), '')
    from public.monitor_alerts a join public.campaigns c on c.id = a.campaign_id
   where a.client_id in ('00000000-0000-0000-0000-00000373cc01', '00000000-0000-0000-0000-00000373cc02') and a.resolved_at is null
$$;
create or replace function pg_temp.k(p_camp int, p_metric text) returns text language sql as $$
  select 'limite:campaign:00000000-0000-0000-0000-00000373ca0' || p_camp || ':' || p_metric
$$;

-- 1. Primeira avaliação.
insert into r373 select 'avaliação 1', coalesce(private.monitor_evaluate('manual', null, '2026-09-28') ->> 'error', 'sem erro');
insert into r373 select 'contas', string_agg(right(id::text, 4) || ':' || coalesce(reason, 'avaliada'), ',' order by id)
  from pg_temp._mon_acc where id::text like '%373ac0%';
insert into r373 select 'alertas 1', pg_temp.open_alerts();
insert into r373 select 'explicação C1', explanation from public.monitor_alerts where dedupe_key = pg_temp.k(1, 'cost_per_result');
insert into r373 select 'explicação D9', explanation from public.monitor_alerts where dedupe_key = 'sem_resultados:ad:00000000-0000-0000-0000-00000373ad09:results';
insert into r373 select 'explicação C4', explanation from public.monitor_alerts where dedupe_key = 'anomalia:campaign:00000000-0000-0000-0000-00000373ca04:results';
insert into r373 select 'eventos criados', count(*)::text
  from public.monitor_alert_events e join public.monitor_alerts a on a.id = e.alert_id
 where e.kind = 'criado' and a.client_id in ('00000000-0000-0000-0000-00000373cc01', '00000000-0000-0000-0000-00000373cc02');
insert into r373 select 'estado da conta A', (last_data_at is not null)::text
  from public.monitor_account_state where ad_account_id = '00000000-0000-0000-0000-00000373ac01';

-- 2. Alguém resolve o alerta de C5 à mão: a avaliação seguinte não reabre nas próximas 24 h.
update public.monitor_alerts set resolved_at = now(), resolution = 'manual', status = 'resolvido' where dedupe_key = pg_temp.k(5, 'cost_per_result');
insert into r373 select 'avaliação 2', coalesce(private.monitor_evaluate('manual', null, '2026-09-28') ->> 'error', 'sem erro');
insert into r373 select 'sem duplicar', count(*)::text from public.monitor_alerts where dedupe_key = pg_temp.k(1, 'cost_per_result');
insert into r373 select 'detecções C1', detections::text from public.monitor_alerts where dedupe_key = pg_temp.k(1, 'cost_per_result');
insert into r373 select 'C5 resolvido à mão', count(*) filter (where resolved_at is null) || '/' || count(*)
  from public.monitor_alerts where dedupe_key = pg_temp.k(5, 'cost_per_result');

-- 3. C1 melhora (mais leads): de crítico para atenção.
select pg_temp.day_rows('00000000-0000-0000-0000-00000373ca01', '00000000-0000-0000-0000-00000373ac01', '00000000-0000-0000-0000-00000373cc01',
                        'c1b', '2026-09-21', '2026-09-27', 0, 0, 0, 2);
insert into r373 select 'avaliação 3', coalesce(private.monitor_evaluate('manual', null, '2026-09-28') ->> 'error', 'sem erro');
insert into r373 select 'C1 melhorou', a.severity || ':' || string_agg(e.kind, ',' order by e.id)
  from public.monitor_alerts a join public.monitor_alert_events e on e.alert_id = a.id
 where a.dedupe_key = pg_temp.k(1, 'cost_per_result') group by a.severity;

-- 4. C1 piora (mais gasto): volta a crítico.
select pg_temp.day_rows('00000000-0000-0000-0000-00000373ca01', '00000000-0000-0000-0000-00000373ac01', '00000000-0000-0000-0000-00000373cc01',
                        'c1c', '2026-09-21', '2026-09-27', 5000000, 0, 0, 0);
insert into r373 select 'avaliação 4', coalesce(private.monitor_evaluate('manual', null, '2026-09-28') ->> 'error', 'sem erro');
insert into r373 select 'C1 piorou', a.severity || ':' || (select e.kind from public.monitor_alert_events e where e.alert_id = a.id order by e.id desc limit 1)
  from public.monitor_alerts a where a.dedupe_key = pg_temp.k(1, 'cost_per_result');

-- 5. C1 volta ao normal (R$ 2,00 por lead): normaliza sozinho, sem apagar nada.
select pg_temp.day_rows('00000000-0000-0000-0000-00000373ca01', '00000000-0000-0000-0000-00000373ac01', '00000000-0000-0000-0000-00000373cc01',
                        'c1d', '2026-09-21', '2026-09-27', 0, 0, 0, 3.5);
insert into r373 select 'avaliação 5', coalesce(private.monitor_evaluate('manual', null, '2026-09-28') ->> 'error', 'sem erro');
insert into r373 select 'C1 normalizou', a.status || ':' || a.resolution || ':' || (a.resolved_at is not null) || ':'
         || (select e.kind from public.monitor_alert_events e where e.alert_id = a.id order by e.id desc limit 1)
  from public.monitor_alerts a where a.dedupe_key = pg_temp.k(1, 'cost_per_result');

-- 6. C1 piora de novo: alerta NOVO, ligado ao anterior (reincidência).
select pg_temp.day_rows('00000000-0000-0000-0000-00000373ca01', '00000000-0000-0000-0000-00000373ac01', '00000000-0000-0000-0000-00000373cc01',
                        'c1e', '2026-09-21', '2026-09-27', 15000000, 0, 0, 0);
insert into r373 select 'avaliação 6', coalesce(private.monitor_evaluate('manual', null, '2026-09-28') ->> 'error', 'sem erro');
insert into r373 select 'reincidência', count(*) || ':' || max(recurrence_count) || ':'
         || (max(recurrence_of) = min(id))::text
  from public.monitor_alerts where dedupe_key = pg_temp.k(1, 'cost_per_result');
insert into r373 select 'histórico guardado', count(*)::text
  from public.monitor_alert_events e join public.monitor_alerts a on a.id = e.alert_id
 where a.dedupe_key = pg_temp.k(1, 'cost_per_result');

-- 7. Agendada: respeita o intervalo e o liga/desliga.
insert into r373 select 'agendada no intervalo', private.monitor_evaluate('agendada') ->> 'skipped';

-- 8. Permissões e funções da tela.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000373aa02","role":"authenticated"}';
insert into r373 values ('gestor avalia agora (acabou de rodar)', pg_temp.try($q$select public.monitor_evaluate_now()$q$));
insert into r373 values ('gestor muda frequência', pg_temp.try($q$select public.monitor_settings_save(true, 30, 3)$q$));
insert into r373 select 'gestor vê', count(*) filter (where client_name = 'Cliente A T373') || '/' || count(*) filter (where client_name = 'Cliente B T373')
  from public.monitor_alerts_list(true, 1000);
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000373aa04","role":"authenticated"}';
insert into r373 values ('visualizador avalia agora', pg_temp.try($q$select public.monitor_evaluate_now()$q$));
insert into r373 values ('visualizador lista', pg_temp.try($q$select * from public.monitor_alerts_list()$q$));
insert into r373 values ('visualizador situação', pg_temp.try($q$select public.monitor_status()$q$));
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000373aa05","role":"authenticated"}';
insert into r373 values ('equipe lista', pg_temp.try($q$select * from public.monitor_alerts_list()$q$));
insert into r373 values ('equipe situação', pg_temp.try($q$select public.monitor_status()$q$));
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000373aa01","role":"authenticated"}';
insert into r373 values ('admin frequência inválida', pg_temp.try($q$select public.monitor_settings_save(true, 45, 3)$q$));
insert into r373 values ('admin atraso inválido', pg_temp.try($q$select public.monitor_settings_save(true, 60, 0)$q$));
insert into r373 values ('admin lista grande demais', pg_temp.try($q$select * from public.monitor_alerts_list(true, 5000)$q$));
insert into r373 values ('admin desliga', pg_temp.try($q$select public.monitor_settings_save(false, 30, 4)$q$));
insert into r373 select 'situação', concat_ws('|', s ->> 'enabled', s ->> 'eval_interval_minutes', s ->> 'stale_hours', (s -> 'last_run' ->> 'error') is null,
                                              (s ->> 'next_run_at') is null)
  from (select public.monitor_status() s) x;
insert into r373 select 'admin vê', count(*) filter (where client_name = 'Cliente A T373') || '/' || count(*) filter (where client_name = 'Cliente B T373')
  from public.monitor_alerts_list(true, 1000);
insert into r373 values ('tabela direta (escrever)', pg_temp.try($q$update public.monitor_alerts set status = 'ignorado'$q$));
reset role;
set local role anon;
insert into r373 values ('visitante lista', pg_temp.try($q$select * from public.monitor_alerts_list()$q$));
reset role;
insert into r373 select 'C8 pausada descartada', count(*)::text from public.monitor_alerts where campaign_id = '00000000-0000-0000-0000-00000373ca08';

-- 9. Desativou na plataforma: a campanha C7 e o conjunto do anúncio D9 foram pausados → alertas encerrados (histórico mantido).
update public.campaigns set status = 'pausada' where id = '00000000-0000-0000-0000-00000373ca07';
update public.ad_groups set status = 'pausada' where id = '00000000-0000-0000-0000-00000373ab01';
insert into r373 select 'avaliação 7', coalesce(private.monitor_evaluate('manual', null, '2026-09-28') ->> 'error', 'sem erro');
insert into r373 select 'C7 desativada', string_agg(a.status || ':' || coalesce(a.details ->> 'closed_reason', '-') || ':'
         || (select e.to_value from public.monitor_alert_events e where e.alert_id = a.id order by e.id desc limit 1), ',' order by a.metric)
  from public.monitor_alerts a where a.campaign_id = '00000000-0000-0000-0000-00000373ca07';
insert into r373 select 'D9 conjunto desativado', a.status || ':' || coalesce(a.details ->> 'closed_reason', '-')
  from public.monitor_alerts a where a.dedupe_key = 'sem_resultados:ad:00000000-0000-0000-0000-00000373ad09:results';
insert into r373 select 'C1 ativa continua', count(*)::text from public.monitor_alerts
 where campaign_id = '00000000-0000-0000-0000-00000373ca01' and level = 'campaign' and resolved_at is null;

insert into r373 select 'agendada desligada', private.monitor_evaluate('agendada') ->> 'skipped';
insert into r373 values ('tipo inválido', pg_temp.try($q$select private.monitor_evaluate('outra')$q$));

do $$
declare
  expected jsonb := jsonb_build_object(
    'avaliação 1', 'sem erro',
    'contas', 'ac01:avaliada,ac02:erro_sincronizacao,ac03:coleta_atrasada,ac04:avaliada',
    'alertas 1', 'C1 T373:limite:campaign:cost_per_result:critico,C1 T373:limite:campaign:results:critico,'
                 || 'C1 T373:sem_resultados:ad:results:atencao,C4 T373:anomalia:campaign:results:atencao,'
                 || 'C5 T373:limite:campaign:cost_per_result:critico,C5 T373:limite:campaign:results:critico,'
                 || 'C7 T373:limite:campaign:cost_per_result:critico,C7 T373:limite:campaign:results:critico',
    'explicação C1', 'Custo por resultado: alta de 150,0% (de R$ 2,00 para R$ 5,00) nos últimos 7 dias em relação aos 7 dias anteriores. Limite crítico: 40%.',
    'explicação D9', 'Anúncio investiu R$ 14,00 nos últimos 7 dias sem nenhum resultado. No período anterior, a campanha gastava R$ 2,00 por resultado.',
    'explicação C4', 'Fora do padrão: em 27/09 resultados = 1, contra média de 10 nos 28 dias anteriores (8,8 desvios-padrão abaixo).',
    'eventos criados', '8',
    'estado da conta A', 'true',
    'avaliação 2', 'sem erro',
    'sem duplicar', '1',
    'detecções C1', '2',
    'C5 resolvido à mão', '0/1',
    'avaliação 3', 'sem erro',
    'C1 melhorou', 'atencao:criado,melhorou',
    'avaliação 4', 'sem erro',
    'C1 piorou', 'critico:piorou',
    'avaliação 5', 'sem erro',
    'C1 normalizou', 'resolvido:automatica:true:normalizado',
    'avaliação 6', 'sem erro',
    'reincidência', '2:1:true',
    'histórico guardado', '5',
    'agendada no intervalo', 'intervalo',
    'gestor avalia agora (acabou de rodar)', '22023',
    'gestor muda frequência', '42501',
    'gestor vê', '6/0',
    'visualizador avalia agora', '42501',
    'visualizador lista', 'ok',
    'visualizador situação', 'ok',
    'equipe lista', '42501',
    'equipe situação', '42501',
    'admin frequência inválida', '22023',
    'admin atraso inválido', '22023',
    'admin lista grande demais', '22023',
    'admin desliga', 'ok',
    'situação', 'false|30|4|t|t',
    'admin vê', '6/2',
    'tabela direta (escrever)', '42501',
    'visitante lista', '42501',
    'C8 pausada descartada', '0',
    'avaliação 7', 'sem erro',
    'C7 desativada', 'resolvido:inativo:inativo,resolvido:inativo:inativo',
    'D9 conjunto desativado', 'resolvido:inativo',
    'C1 ativa continua', '3',
    'agendada desligada', 'desligado',
    'tipo inválido', '22023');
  r record;
begin
  for r in select * from r373 loop
    if expected ->> r.what is distinct from r.v then raise exception 'FALHOU: % = % (esperado %)', r.what, r.v, expected ->> r.what; end if;
  end loop;
  if (select count(*) from r373) <> (select count(*) from jsonb_object_keys(expected)) then
    raise exception 'FALHOU: faltou verificação (%)', (select count(*) from r373);
  end if;
  raise notice 'Etapa 37.3: % verificações OK', (select count(*) from r373);
end $$;

rollback;
