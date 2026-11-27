-- Limpeza automática da fila e do registro técnico do envio ao Meta (rodando na rotina diária que já existe, maintenance-cleanup).
-- Só apaga o que é TÉCNICO e velho:
--   * fila: eventos "descartado" e "enviado" com mais de 90 dias, EXCETO compras (Purchase), que ficam sempre (a conferência de nº de pedido repetido usa essa fila);
--   * registro das chamadas ao Meta (tracking_capi_log) com mais de 90 dias.
-- NUNCA mexe em vendas, contatos, histórico dos contatos, conversas, leads nem nos eventos do site (tracking_events).
create or replace function private.maintenance_cleanup()
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare n_cron integer; n_runs integer; n_leituras integer; n_fila integer; n_log integer;
begin
  delete from cron.job_run_details where start_time < now() - interval '7 days';
  get diagnostics n_cron = row_count;
  delete from public.sync_runs where started_at < now() - interval '90 days' and status <> 'executando';
  get diagnostics n_runs = row_count;
  delete from public.account_delivery_readings where captured_at < now() - interval '90 days';
  get diagnostics n_leituras = row_count;
  delete from public.tracking_capi_queue where status in ('enviado', 'descartado') and created_at < now() - interval '90 days' and event_name <> 'Purchase';
  get diagnostics n_fila = row_count;
  delete from public.tracking_capi_log where requested_at < now() - interval '90 days';
  get diagnostics n_log = row_count;
  if n_cron + n_runs + n_leituras + n_fila + n_log > 0 then
    insert into public.audit_logs (actor_id, action, target_type, target_id, details)
    values (null, 'maintenance.cleanup', 'sistema', 'logs-tecnicos',
            jsonb_build_object('log_do_agendador', n_cron, 'execucoes_de_sync', n_runs, 'leituras_de_entrega', n_leituras,
                               'fila_do_meta', n_fila, 'registro_do_meta', n_log));
  end if;
end $function$;
