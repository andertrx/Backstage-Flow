-- =============================================================================
-- Testes da correção de 04/10/2026 — Monitoramento: só alertas CRÍTICOS (gravidade mínima configurável,
-- padrão "só críticos") e só de itens ativos. Usa os mesmos dados do teste do motor (etapa37_3).
-- Rodar inteiro no SQL Editor. Transação desfeita no final: nada fica gravado.
-- =============================================================================
begin;

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

create temp table r37c (what text, v text) on commit drop;
grant all on r37c to authenticated, anon;
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

update public.monitor_settings set min_severity = 'critico' where id = 1;

-- 1. Padrão (só críticos): os de atenção do teste do motor não são criados.
insert into r37c select 'avaliação 1', coalesce(private.monitor_evaluate('manual', null, '2026-09-28') ->> 'error', 'sem erro');
insert into r37c select 'só críticos', pg_temp.open_alerts();

-- 2. Admin libera "todos": na próxima avaliação, os de atenção aparecem.
update public.monitor_settings set min_severity = 'informativo' where id = 1;
insert into r37c select 'avaliação 2', coalesce(private.monitor_evaluate('manual', null, '2026-09-28') ->> 'error', 'sem erro');
insert into r37c select 'todos', pg_temp.open_alerts();

-- 3. Volta para só críticos: os de atenção abertos são encerrados com o motivo (histórico mantido).
update public.monitor_settings set min_severity = 'critico' where id = 1;
insert into r37c select 'avaliação 3', coalesce(private.monitor_evaluate('manual', null, '2026-09-28') ->> 'error', 'sem erro');
insert into r37c select 'de novo só críticos', pg_temp.open_alerts();
insert into r37c select 'encerrados abaixo do mínimo', count(*) || ':' || min(e.note)
  from public.monitor_alerts a join public.monitor_alert_events e on e.alert_id = a.id and e.to_value = 'abaixo_do_minimo'
 where a.client_id in ('00000000-0000-0000-0000-00000373cc01', '00000000-0000-0000-0000-00000373cc02') and a.details ->> 'closed_reason' = 'abaixo_do_minimo';
insert into r37c select 'nada apagado', count(*)::text from public.monitor_alerts
 where client_id in ('00000000-0000-0000-0000-00000373cc01', '00000000-0000-0000-0000-00000373cc02');

-- 4. Quem muda: só o administrador.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000373aa02","role":"authenticated"}';
insert into r37c values ('gestor muda', pg_temp.try($q$select public.monitor_min_severity_save('atencao')$q$));
insert into r37c select 'gestor vê a regra', public.monitor_status() ->> 'min_severity';
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000373aa01","role":"authenticated"}';
insert into r37c values ('valor inválido', pg_temp.try($q$select public.monitor_min_severity_save('baixo')$q$));
insert into r37c values ('admin muda', pg_temp.try($q$select public.monitor_min_severity_save('atencao')$q$));
insert into r37c select 'gravado', public.monitor_status() ->> 'min_severity';
set local role anon;
insert into r37c values ('visitante', pg_temp.try($q$select public.monitor_min_severity_save('critico')$q$));
reset role;

do $$
declare
  crit text := 'C1 T373:limite:campaign:cost_per_result:critico,C1 T373:limite:campaign:results:critico,'
            || 'C5 T373:limite:campaign:cost_per_result:critico,C5 T373:limite:campaign:results:critico,'
            || 'C7 T373:limite:campaign:cost_per_result:critico,C7 T373:limite:campaign:results:critico';
  expected jsonb := jsonb_build_object(
    'avaliação 1', 'sem erro',
    'só críticos', crit,
    'avaliação 2', 'sem erro',
    'todos', 'C1 T373:limite:campaign:cost_per_result:critico,C1 T373:limite:campaign:results:critico,'
             || 'C1 T373:sem_resultados:ad:results:atencao,C4 T373:anomalia:campaign:results:atencao,'
             || 'C5 T373:limite:campaign:cost_per_result:critico,C5 T373:limite:campaign:results:critico,'
             || 'C7 T373:limite:campaign:cost_per_result:critico,C7 T373:limite:campaign:results:critico',
    'avaliação 3', 'sem erro',
    'de novo só críticos', crit,
    'encerrados abaixo do mínimo', '2:Encerrado: deixou de ser crítico (o monitoramento só mantém alertas críticos).',
    'nada apagado', '8',
    'gestor muda', '42501',
    'gestor vê a regra', 'critico',
    'valor inválido', '22023',
    'admin muda', 'ok',
    'gravado', 'atencao',
    'visitante', '42501');
  r record;
begin
  for r in select * from r37c loop
    if expected ->> r.what is distinct from r.v then raise exception 'FALHOU: % = % (esperado %)', r.what, r.v, expected ->> r.what; end if;
  end loop;
  if (select count(*) from r37c) <> (select count(*) from jsonb_object_keys(expected)) then
    raise exception 'FALHOU: faltou verificação (%)', (select count(*) from r37c);
  end if;
  raise notice 'Só críticos: % verificações OK', (select count(*) from r37c);
end $$;

rollback;
