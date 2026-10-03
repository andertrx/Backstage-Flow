-- =============================================================================
-- REMOÇÃO do Monitoramento de Desempenho (Etapa 37).
--
-- 37.1: apaga as regras e limites (monitor_rules, com o histórico delas), as
-- funções do módulo e os campos do criativo nos anúncios (creative_external_id,
-- preview_link — voltam a ser preenchidos se o módulo for reinstalado).
-- NÃO mexe em clientes, usuários, métricas, campanhas nem anúncios.
-- Só rodar com decisão explícita, no SQL Editor. Depois: reverter os commits da
-- Etapa 37 no GitHub e publicar de novo a Edge Function "sync".
-- 37.2: apaga as funções de comparação e série diária (só liam o histórico; nada a apagar de dados).
-- 37.3: desliga o agendamento "monitor-evaluate" e apaga o motor de alertas e as 5 tabelas
-- (monitor_alerts e o histórico deles, monitor_alert_events, monitor_runs, monitor_settings,
-- monitor_account_state). Depois, para o alerta antigo "Queda de resultados" voltar a
-- funcionar, rode também supabase/rollback/reativar_queda_resultados.sql.
-- 37.4: apaga as funções de tratar alertas. As tarefas criadas a partir de alertas ficam na Central de Operações.
-- 37.5: desliga os agendamentos "monitor-digest" e "monitor-emails", apaga o disparo de avisos e as
-- 3 tabelas de notificações (preferências, avisos e histórico de envios). Depois, apagar a Edge
-- Function "monitor-email" no painel do Supabase.
-- 37.6: apaga as funções de resumo e histórico (só leitura; nada a apagar de dados).
-- Filtro de objetivo (03/10): apaga o filtro salvo de cada pessoa (monitor_view_prefs) e as funções do filtro.
-- (As fases seguintes acrescentam seus trechos aqui.)
-- =============================================================================
begin;

-- Filtro de objetivo
drop function if exists public.monitor_view_prefs_get();
drop function if exists private.monitor_view_prefs_get_impl();
drop function if exists public.monitor_view_prefs_save(text[]);
drop function if exists private.monitor_view_prefs_save_impl(text[]);
drop function if exists public.monitor_compare(text, date, date, date, date, uuid, text, uuid, uuid, integer, text[]);
drop function if exists private.monitor_compare_impl(text, date, date, date, date, uuid, text, uuid, uuid, integer, text[]);
drop function if exists public.monitor_summary(uuid, text, text[]);
drop function if exists private.monitor_summary_impl(uuid, text, text[]);
drop function if exists public.monitor_history(integer, uuid, text, text[]);
drop function if exists private.monitor_history_impl(integer, uuid, text, text[]);
drop table if exists public.monitor_view_prefs;

-- 37.6
drop function if exists public.monitor_summary(uuid, text);
drop function if exists private.monitor_summary_impl(uuid, text);
drop function if exists public.monitor_history(integer, uuid, text);
drop function if exists private.monitor_history_impl(integer, uuid, text);

-- 37.5
select cron.unschedule(jobid) from cron.job where jobname in ('monitor-digest', 'monitor-emails');
drop trigger if exists monitor_alert_events_notify on public.monitor_alert_events;
drop function if exists private.monitor_event_notify_tg();
drop function if exists public.monitor_notifications_list(integer, boolean);
drop function if exists private.monitor_notifications_list_impl(integer, boolean);
drop function if exists public.monitor_notifications_read(bigint[]);
drop function if exists private.monitor_notifications_read_impl(bigint[]);
drop function if exists public.monitor_prefs_get(uuid);
drop function if exists private.monitor_prefs_get_impl(uuid);
drop function if exists public.monitor_prefs_save(uuid, jsonb);
drop function if exists private.monitor_prefs_save_impl(uuid, jsonb);
drop function if exists private.monitor_prefs_target(uuid);
drop function if exists public.monitor_notify_people();
drop function if exists private.monitor_notify_people_impl();
drop function if exists public.monitor_deliveries_list(integer);
drop function if exists private.monitor_deliveries_list_impl(integer);
drop function if exists public.monitor_email_queue(integer);
drop function if exists public.monitor_email_mark(bigint, boolean, text);
drop function if exists private.trigger_monitor_emails();
drop function if exists private.monitor_digest(timestamptz);
drop function if exists private.monitor_deliver(uuid, text, text, text, bigint, text, uuid, text);
drop function if exists private.monitor_user_sees(uuid, uuid);
drop function if exists private.monitor_severity_rank(text);
drop function if exists private.monitor_prefs_of(uuid);
drop table if exists public.monitor_deliveries;
drop table if exists public.monitor_notifications;
drop table if exists public.monitor_notify_prefs;

-- 37.4
drop function if exists public.monitor_alerts_list(boolean, integer);
drop function if exists private.monitor_alerts_list_impl(boolean, integer);
drop function if exists public.monitor_alert_detail(bigint);
drop function if exists private.monitor_alert_detail_impl(bigint);
drop function if exists public.monitor_alerts_query(boolean, integer);
drop function if exists private.monitor_alerts_query_impl(boolean, integer);
drop function if exists private.monitor_alerts_json(boolean, integer, bigint);
drop function if exists public.monitor_alert_assignees(bigint);
drop function if exists private.monitor_alert_assignees_impl(bigint);
drop function if exists public.monitor_alert_to_task(bigint, uuid, date, integer);
drop function if exists private.monitor_alert_to_task_impl(bigint, uuid, date, integer);
drop function if exists public.monitor_alert_resolve(bigint, text, integer);
drop function if exists private.monitor_alert_resolve_impl(bigint, text, integer);
drop function if exists public.monitor_alert_action(bigint, text);
drop function if exists private.monitor_alert_action_impl(bigint, text);
drop function if exists public.monitor_alert_comment(bigint, text);
drop function if exists private.monitor_alert_comment_impl(bigint, text);
drop function if exists public.monitor_alert_assign(bigint, uuid, integer);
drop function if exists private.monitor_alert_assign_impl(bigint, uuid, integer);
drop function if exists public.monitor_alert_seen(bigint);
drop function if exists private.monitor_alert_seen_impl(bigint);
drop function if exists public.monitor_alert_set_status(bigint, text, integer);
drop function if exists private.monitor_alert_set_status_impl(bigint, text, integer);
drop function if exists private.monitor_followups(date);
drop function if exists private.monitor_period_value(text, uuid, uuid, text, date, date);
drop function if exists private.monitor_status_label(text);
drop function if exists private.monitor_user_name(uuid);
drop function if exists private.monitor_alert_lock(bigint, integer, boolean);
drop function if exists private.monitor_user_can_handle(uuid, uuid);

-- 37.3
select cron.unschedule(jobid) from cron.job where jobname = 'monitor-evaluate';
drop function if exists public.monitor_alerts_list(boolean, integer);
drop function if exists private.monitor_alerts_list_impl(boolean, integer);
drop function if exists public.monitor_status();
drop function if exists private.monitor_status_impl();
drop function if exists public.monitor_settings_save(boolean, integer, integer);
drop function if exists private.monitor_settings_save_impl(boolean, integer, integer);
drop function if exists public.monitor_evaluate_now();
drop function if exists private.monitor_evaluate_now_impl();
drop function if exists private.monitor_evaluate(text, uuid, date);
drop function if exists private.monitor_normalize();
drop function if exists private.monitor_save_candidates();
drop function if exists private.monitor_cand_no_results();
drop function if exists private.monitor_cand_anomalies();
drop function if exists private.monitor_cand_limits();
drop function if exists private.monitor_prepare_accounts(text, date, integer);
drop function if exists private.monitor_entity_active(text, uuid, uuid);
drop function if exists private.monitor_probe_tmp();
drop function if exists private.monitor_metric_label(text);
drop function if exists private.monitor_fmt(text, numeric, text);
drop function if exists private.monitor_rule_for(text, uuid, uuid, uuid, uuid);
drop function if exists private.monitor_classify(numeric, numeric, text, numeric, numeric, boolean);
drop function if exists private.monitor_default_min_volume(text);
drop function if exists private.monitor_volume_base(text, text, bigint, bigint, bigint, numeric, numeric, numeric);
drop function if exists private.monitor_value(text, text, bigint, bigint, bigint, bigint, numeric, numeric, numeric, bigint);
drop function if exists private.monitor_results(text, numeric, numeric, numeric, numeric);
drop function if exists private.monitor_result_kind(text);
drop table if exists public.monitor_alert_events;
drop table if exists public.monitor_alerts;
drop table if exists public.monitor_account_state;
drop table if exists public.monitor_runs;
drop table if exists public.monitor_settings;

-- 37.2
drop function if exists public.monitor_daily(text, text, date, date);
drop function if exists private.monitor_daily_impl(text, text, date, date);
drop function if exists public.monitor_compare(text, date, date, date, date, uuid, text, uuid, uuid, integer);
drop function if exists private.monitor_compare_impl(text, date, date, date, date, uuid, text, uuid, uuid, integer);

-- 37.1
drop function if exists public.monitor_rule_archive(uuid);
drop function if exists private.monitor_rule_archive_impl(uuid);
drop function if exists public.monitor_rule_save(uuid, text, uuid, text, text, numeric, numeric, integer, boolean, text);
drop function if exists private.monitor_rule_save_impl(uuid, text, uuid, text, text, numeric, numeric, integer, boolean, text);
drop function if exists public.monitor_rules_list(boolean);
drop function if exists private.monitor_rules_list_impl(boolean);
drop function if exists private.monitor_scope_name(text, uuid);
drop function if exists private.monitor_scope_client(text, uuid);
drop table if exists public.monitor_rules;
drop function if exists private.monitor_objective_ok(uuid, text[]);
drop function if exists private.monitor_objective_group(text);
drop function if exists private.monitor_can(text);

drop index if exists public.ads_creative_idx;
alter table public.ads drop column if exists creative_external_id;
alter table public.ads drop column if exists preview_link;

-- Conferência: nada do módulo pode sobrar.
do $$ begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname in ('public', 'private') and p.proname like 'monitor%')
     or exists (select 1 from information_schema.tables where table_schema = 'public' and table_name like 'monitor%') then
    raise exception 'Sobrou algo do Monitoramento: confira antes de concluir.';
  end if;
end $$;

commit;
