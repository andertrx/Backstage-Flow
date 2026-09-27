-- =============================================================================
-- REMOÇÃO COMPLETA do módulo de Tracking (Etapa 34).
--
-- ATENÇÃO: apaga TODOS os dados de tracking (containers, visitantes, sessões,
-- origens e eventos). Não mexe em nada do CRM (clientes, contas, campanhas,
-- métricas, alertas). Só rodar com decisão explícita, no SQL Editor.
-- Depois: apagar a Edge Function "track" no painel do Supabase e tirar o
-- item "Tracking" do menu (reverter o commit da Etapa 34).
-- =============================================================================
begin;

select cron.unschedule('tracking-partitions') where exists (select 1 from cron.job where jobname = 'tracking-partitions');

drop function if exists public.tracking_overview(timestamptz, timestamptz, uuid[]);
drop function if exists public.tracking_ingest(jsonb);
drop function if exists public.tracking_container_by_key(text);
drop function if exists public.track_limit_hit(text, integer, integer);
drop function if exists private.tracking_ingest(jsonb);
drop function if exists private.tracking_container_by_key(text);
drop function if exists private.track_limit_hit(text, integer, integer);
drop function if exists private.ensure_tracking_partitions_ahead(integer);
drop function if exists private.ensure_tracking_partition(date);

-- Apagar a tabela particionada apaga junto as gavetas mensais (history.tracking_events_*).
drop table if exists public.tracking_events;
drop table if exists public.tracking_sessions;
alter table if exists public.tracking_visitors drop constraint if exists tracking_visitors_first_touch_fk;
alter table if exists public.tracking_visitors drop constraint if exists tracking_visitors_last_touch_fk;
drop table if exists public.tracking_touchpoints;
drop table if exists public.tracking_visitors;
drop table if exists public.tracking_containers;
drop table if exists private.track_limits;

drop function if exists private.tracking_set_updated_by();
drop function if exists private.valid_tracking_domains(text[]);

commit;
