-- =============================================================================
-- REMOÇÃO COMPLETA do módulo de Tracking (Etapa 34).
--
-- ATENÇÃO: apaga TODOS os dados de tracking (containers, visitantes, sessões,
-- origens, eventos, leads, compras, cliques no WhatsApp, fila do Meta e tokens do Meta). Não mexe em nada do CRM (clientes, contas, campanhas,
-- métricas, alertas). Só rodar com decisão explícita, no SQL Editor.
-- Depois: apagar as Edge Functions "track", "capi-sender", "tracking-destinations" e "tracking-whatsapp" no painel do Supabase e tirar o
-- item "Tracking" do menu (reverter o commit da Etapa 34).
-- =============================================================================
begin;

select cron.unschedule('tracking-partitions') where exists (select 1 from cron.job where jobname = 'tracking-partitions');
select cron.unschedule('tracking-capi') where exists (select 1 from cron.job where jobname = 'tracking-capi');

-- Tokens do Meta guardados no cofre (Vault)
delete from vault.secrets where name like 'capi:%';

drop function if exists public.tracking_whatsapp_lookup(text);
drop function if exists public.tracking_whatsapp_mark(text, text, uuid, bigint);
drop function if exists public.tracking_whatsapp_register(jsonb);
drop table if exists public.tracking_whatsapp_clicks;

drop function if exists public.tracking_capi_overview();
drop function if exists public.tracking_capi_log_add(jsonb);
drop function if exists public.tracking_capi_finish(jsonb);
drop function if exists public.tracking_capi_claim(integer);
drop function if exists public.tracking_destination_secret_set(uuid, text);
drop function if exists public.tracking_destination_secret_get(uuid);
drop function if exists public.tracking_destination_secret_delete(uuid);
drop function if exists private.trigger_capi_sender();
drop function if exists private.tracking_capi_enqueue(jsonb, bigint);
drop table if exists public.tracking_capi_log;
drop table if exists public.tracking_capi_queue;
drop table if exists public.tracking_destinations;

drop function if exists public.tracking_lead_journey(bigint);
drop function if exists public.tracking_conversions_summary(timestamptz, timestamptz);
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
drop table if exists public.tracking_purchases;
alter table if exists public.tracking_visitors drop column if exists lead_id;
drop table if exists public.tracking_leads;
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
