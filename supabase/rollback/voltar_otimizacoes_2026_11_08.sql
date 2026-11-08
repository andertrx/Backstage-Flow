-- Desfaz a limpeza diária de logs técnicos (Auditoria de desempenho, 08/11/2026). O que já foi apagado não volta.
select cron.unschedule('maintenance-cleanup');
drop function if exists private.maintenance_cleanup();
-- A função public.ingest_breakdowns volta à versão anterior recriando-a com o corpo da migração
-- 20260925*_breakdowns (sem a cláusula "where ... is distinct from" no "on conflict do update").
