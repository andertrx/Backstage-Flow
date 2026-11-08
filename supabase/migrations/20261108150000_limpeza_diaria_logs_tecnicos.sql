-- Auditoria de desempenho (08/11/2026): limpeza diária só de LOGS TÉCNICOS (não toca em métricas, campanhas, saldos nem históricos de análise).
--   * log do agendador (cron.job_run_details): mantém 7 dias
--   * execuções da sincronização (sync_runs): mantém 90 dias (as que estão rodando nunca saem)
-- Aplicada no banco como "limpeza_diaria_logs_tecnicos".
create function private.maintenance_cleanup()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare n_cron integer; n_runs integer;
begin
  delete from cron.job_run_details where start_time < now() - interval '7 days';
  get diagnostics n_cron = row_count;
  delete from public.sync_runs where started_at < now() - interval '90 days' and status <> 'executando';
  get diagnostics n_runs = row_count;
  if n_cron + n_runs > 0 then
    insert into public.audit_logs (actor_id, action, target_type, target_id, details)
    values (null, 'maintenance.cleanup', 'sistema', 'logs-tecnicos', jsonb_build_object('log_do_agendador', n_cron, 'execucoes_de_sync', n_runs));
  end if;
end $$;
revoke all on function private.maintenance_cleanup() from public, anon, authenticated;
-- 06:20 UTC = 03:20 em Brasília
select cron.schedule('maintenance-cleanup', '20 6 * * *', $cron$select private.maintenance_cleanup()$cron$);
