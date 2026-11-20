-- Limpeza automática das tabelas do tracking/CAPI (auditoria de 20/11/2026).
-- Antes, essas tabelas cresciam para sempre: nada apagava nada.
--
-- O que some e o que fica:
--   * tracking_capi_queue — só o que já terminou: enviado (30 dias) e descartado (90 dias).
--     Fila pendente, em envio ou com erro NÃO é tocada (ainda pode virar envio).
--   * tracking_capi_log — 90 dias (é o histórico de chamadas ao Meta).
--   * tracking_events — respeita o prazo que a pessoa já escolheu por site
--     (tracking_containers.retention_days: 90, 180, 365 ou 730). Nunca apaga
--     evento com menos de 30 dias, e vai em lotes para não travar a tabela.
--   * tracking_touchpoints NÃO é apagado: é a origem que liga a venda ao anúncio
--     (o lead e a ficha de rastreio dependem dela).
--
-- Tudo dentro da mesma rotina diária que já limpa os logs técnicos.

-- 1) Colunas que a limpeza precisa (o勾 de descarte já foi criado na 20261119000001).
alter table public.tracking_capi_queue
  add column if not exists last_error_at timestamptz,
  add column if not exists discarded_at timestamptz;

-- 2) Limpeza do que já passou do prazo.
create or replace function private.maintenance_cleanup_tracking()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  n_queue integer := 0;
  n_log integer := 0;
  n_events integer := 0;
  n_lote integer;
  i integer;
begin
  -- 2.1) Fila do CAPI: o que já terminou sai depois do prazo.
  delete from public.tracking_capi_queue q
   where q.status = 'enviado' and q.sent_at is not null and q.sent_at < now() - interval '30 days';
  get diagnostics n_queue = row_count;

  delete from public.tracking_capi_queue q
   where q.status = 'descartado'
     and coalesce(q.discarded_at, q.created_at) < now() - interval '90 days';
  get diagnostics n_queue = n_queue + row_count;

  -- 2.2) Log das chamadas ao Meta: 90 dias.
  delete from public.tracking_capi_log l
   where l.requested_at < now() - interval '90 days';
  get diagnostics n_log = row_count;

  -- 2.3) Eventos: o prazo é o que a pessoa escolheu por site. Vai em lotes
  --       (cada lote até 50 mil linhas) para não segurar trava demais.
  for i in 1..10 loop
    with expirados as (
      select e.container_id, e.event_id, e.occurred_at
        from public.tracking_events e
        join public.tracking_containers c on c.id = e.container_id
       where e.occurred_at < now() - make_interval(days => greatest(c.retention_days, 30))
       limit 50000
    )
    delete from public.tracking_events e
     using expirados x
     where e.container_id = x.container_id and e.event_id = x.event_id and e.occurred_at = x.occurred_at;
    get diagnostics n_lote = row_count;
    n_events := n_events + n_lote;
    exit when n_lote = 0;
  end loop;

  if n_queue + n_log + n_events > 0 then
    insert into public.audit_logs (actor_id, action, target_type, target_id, details)
    values (null, 'maintenance.cleanup', 'sistema', 'tracking',
            jsonb_build_object('fila_capi', n_queue, 'log_capi', n_log, 'eventos', n_events));
  end if;
end $$;
revoke all on function private.maintenance_cleanup_tracking() from public, anon, authenticated;

-- 3) Chama a limpeza nova na rotina diária que já existe (03:20 em Brasília).
create or replace function private.maintenance_cleanup()
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
  perform private.maintenance_cleanup_tracking();
end $$;
revoke all on function private.maintenance_cleanup() from public, anon, authenticated;
