-- Desativar cliente (pedido do Ander, 23/10/2026).
-- "Desativado" = situação 'encerrado' (já existia). Com o cliente desativado, o CRM para de trabalhar para ele:
--   sincronização automática (e a recuperação do histórico), monitoramento, leitura da planilha, e-mail semanal,
--   acesso do cliente (login e link secreto), tracking do site/WhatsApp e envio de eventos ao Meta (CAPI).
-- Nada é apagado; os números antigos continuam no Dashboard. Ao reativar, tudo volta a funcionar.
-- Só o administrador desativa ou reativa (conferido no banco, por gatilho).
-- Ponto de volta: as versões anteriores ficam guardadas em private.*_antes_2026_10_23
-- (supabase/rollback/voltar_clientes_desativar_2026_10_23.sql).

-- ---------------------------------------------------------------- Regra única: o cliente está ativo?
create function private.client_is_active(p_client uuid)
returns boolean
language sql
stable security definer
set search_path to ''
as $$
  select p_client is null or not exists (select 1 from public.clients c where c.id = p_client and c.status = 'encerrado')
$$;
revoke all on function private.client_is_active(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------- Guardar as versões atuais (ponto de volta)
alter function public.sync_claim_due(integer, integer) set schema private;
alter function private.sync_claim_due(integer, integer) rename to sync_claim_due_antes_2026_10_23;
alter function public.sync_claim_backfill(integer, integer) set schema private;
alter function private.sync_claim_backfill(integer, integer) rename to sync_claim_backfill_antes_2026_10_23;
alter function public.client_report_email_due(integer) set schema private;
alter function private.client_report_email_due(integer) rename to client_report_email_due_antes_2026_10_23;
alter function public.client_report_public(text, text, date, date) set schema private;
alter function private.client_report_public(text, text, date, date) rename to client_report_public_antes_2026_10_23;
alter function public.ri_read_claim(uuid) set schema private;
alter function private.ri_read_claim(uuid) rename to ri_read_claim_antes_2026_10_23;
alter function public.tracking_capi_claim(integer) set schema private;
alter function private.tracking_capi_claim(integer) rename to tracking_capi_claim_antes_2026_10_23;
alter function public.tracking_whatsapp_inbound(jsonb) set schema private;
alter function private.tracking_whatsapp_inbound(jsonb) rename to tracking_whatsapp_inbound_antes_2026_10_23;
alter function public.tracking_whatsapp_register(jsonb) set schema private;
alter function private.tracking_whatsapp_register(jsonb) rename to tracking_whatsapp_register_antes_2026_10_23;
alter function private.monitor_prepare_accounts(text, date, integer) rename to monitor_prepare_accounts_antes_2026_10_23;
alter function private.can_view_client(uuid) rename to can_view_client_antes_2026_10_23;
alter function private.tracking_ingest(jsonb) rename to tracking_ingest_antes_2026_10_23;

-- ---------------------------------------------------------------- Sincronização
create function public.sync_claim_due(p_limit integer default 3, p_lock_minutes integer default 15)
returns setof uuid
language plpgsql
security definer
set search_path to ''
as $$
begin
  insert into public.sync_state (ad_account_id, status)
  select a.id, 'pendente' from public.ad_accounts a
  where a.unlinked_at is null and not exists (select 1 from public.sync_state s where s.ad_account_id = a.id);

  return query
  with due as (
    select s.ad_account_id
    from public.sync_state s
    join public.ad_accounts a on a.id = s.ad_account_id
    join public.platform_connections c on c.id = a.connection_id
    where a.unlinked_at is null
      and c.status <> 'revogada'
      and coalesce(a.is_test_account, false) = false
      and private.client_is_active(a.client_id)
      and (s.next_run_at is null or s.next_run_at <= now())
      and (s.locked_until is null or s.locked_until < now())
    order by s.next_run_at nulls first
    limit greatest(1, least(p_limit, 20))
    for update of s skip locked
  )
  update public.sync_state s
     set locked_until = now() + make_interval(mins => p_lock_minutes), status = 'executando', last_attempt_at = now()
    from due
   where s.ad_account_id = due.ad_account_id
  returning s.ad_account_id;
end;
$$;
revoke all on function public.sync_claim_due(integer, integer) from public, anon, authenticated;
grant execute on function public.sync_claim_due(integer, integer) to service_role;

create function public.sync_claim_backfill(p_limit integer default 2, p_lock_minutes integer default 15)
returns setof uuid
language plpgsql
security definer
set search_path to ''
as $$
begin
  return query
  with due as (
    select s.ad_account_id
    from public.sync_state s
    join public.ad_accounts a on a.id = s.ad_account_id
    join public.platform_connections c on c.id = a.connection_id
    where a.unlinked_at is null
      and c.status <> 'revogada'
      and coalesce(a.is_test_account, false) = false
      and private.client_is_active(a.client_id)
      and s.history_from is not null
      and s.history_from > public.history_target()
      and (s.backfill_locked_until is null or s.backfill_locked_until < now())
      and (s.backfill_next_at is null or s.backfill_next_at <= now())
    order by s.history_from desc
    limit greatest(1, least(p_limit, 10))
    for update of s skip locked
  )
  update public.sync_state s
     set backfill_locked_until = now() + make_interval(mins => p_lock_minutes)
    from due
   where s.ad_account_id = due.ad_account_id
  returning s.ad_account_id;
end;
$$;
revoke all on function public.sync_claim_backfill(integer, integer) from public, anon, authenticated;
grant execute on function public.sync_claim_backfill(integer, integer) to service_role;

-- ---------------------------------------------------------------- Monitoramento: contas de cliente desativado ficam de fora
create function private.monitor_prepare_accounts(p_trigger text, p_today date, p_stale_hours integer)
returns void
language plpgsql
security definer
set search_path to ''
as $$
begin
  perform private.monitor_prepare_accounts_antes_2026_10_23(p_trigger, p_today, p_stale_hours);
  -- Conta de cliente desativado não é avaliada (fica como "pulada", sem criar nem encerrar alertas).
  update pg_temp._mon_acc set reason = 'cliente_desativado' where not private.client_is_active(client_id);
end;
$$;
revoke all on function private.monitor_prepare_accounts(text, date, integer) from public, anon, authenticated;

-- ---------------------------------------------------------------- E-mail semanal
create function public.client_report_email_due(p_limit integer default 20)
returns setof uuid
language sql
stable security definer
set search_path to ''
as $$
  select e.client_id
    from public.client_report_email e
    join public.clients c on c.id = e.client_id
   where e.enabled and cardinality(e.recipients) > 0
     and c.status <> 'encerrado'
     and (select has_key from public.email_settings where id)
     and extract(isodow from now() at time zone c.timezone) = e.weekday
     and extract(hour from now() at time zone c.timezone) = e.send_hour
     and (e.last_sent_at is null or e.last_sent_at < now() - interval '6 days')
   order by e.last_sent_at nulls first
   limit greatest(1, least(p_limit, 50))
$$;
revoke all on function public.client_report_email_due(integer) from public, anon, authenticated;
grant execute on function public.client_report_email_due(integer) to service_role;

-- ---------------------------------------------------------------- Acesso do cliente: link secreto e login
create function public.client_report_public(p_token text, p_period text default null, p_from date default null, p_to date default null)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
begin
  if p_token is not null and p_token ~ '^[A-Za-z0-9_-]{43}$' and exists (
       select 1 from public.client_portal p join public.clients c on c.id = p.client_id
        where p.link_token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex') and c.status = 'encerrado') then
    raise exception 'Link inválido ou desativado.' using errcode = 'P0002';
  end if;
  return private.client_report_public_antes_2026_10_23(p_token, p_period, p_from, p_to);
end;
$$;
revoke all on function public.client_report_public(text, text, date, date) from public, anon, authenticated;
grant execute on function public.client_report_public(text, text, date, date) to service_role;

create function private.can_view_client(target uuid)
returns boolean
language sql
stable security definer
set search_path to ''
as $$
  select private.can_view_client_antes_2026_10_23(target)
     and (private.current_user_role() is distinct from 'cliente' or private.client_is_active(target))
$$;
revoke all on function private.can_view_client(uuid) from public, anon;
grant execute on function private.can_view_client(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------- Leitura da planilha (Inteligência de Resultados)
create function public.ri_read_claim(p_source_id uuid)
returns boolean
language sql
security definer
set search_path to ''
as $$
  with c as (
    update public.ri_sources
       set read_status = 'lendo', last_attempt_at = now(), lease_until = now() + interval '5 minutes'
     where id = p_source_id and (lease_until is null or lease_until < now())
       and private.client_is_active(client_id)
    returning id
  )
  select exists (select 1 from c)
$$;
revoke all on function public.ri_read_claim(uuid) from public, anon, authenticated;
grant execute on function public.ri_read_claim(uuid) to service_role;

-- ---------------------------------------------------------------- Tracking e API de Conversões
create function private.tracking_ingest(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
begin
  if not private.client_is_active((p ->> 'client_id')::uuid) then
    return jsonb_build_object('status', 'cliente_desativado');
  end if;
  return private.tracking_ingest_antes_2026_10_23(p);
end;
$$;
revoke all on function private.tracking_ingest(jsonb) from public, anon, authenticated;
grant execute on function private.tracking_ingest(jsonb) to service_role;

create function public.tracking_whatsapp_register(p jsonb)
returns text
language plpgsql
security definer
set search_path to ''
as $$
begin
  if not private.client_is_active((p ->> 'client_id')::uuid) then return 'cliente_desativado'; end if;
  return private.tracking_whatsapp_register_antes_2026_10_23(p);
end;
$$;
revoke all on function public.tracking_whatsapp_register(jsonb) from public, anon, authenticated;
grant execute on function public.tracking_whatsapp_register(jsonb) to service_role;

create function public.tracking_whatsapp_inbound(p jsonb)
returns text
language plpgsql
security definer
set search_path to ''
as $$
begin
  if exists (select 1 from public.tracking_whatsapp_connections w join public.tracking_containers k on k.id = w.container_id
              where w.id = (p ->> 'connection_id')::uuid and not private.client_is_active(k.client_id)) then
    return 'desligado';
  end if;
  return private.tracking_whatsapp_inbound_antes_2026_10_23(p);
end;
$$;
revoke all on function public.tracking_whatsapp_inbound(jsonb) from public, anon, authenticated;
grant execute on function public.tracking_whatsapp_inbound(jsonb) to service_role;

-- Fila da CAPI: eventos de cliente desativado não saem (ficam na fila; com mais de 7 dias o Meta não aceita e são descartados).
create function public.tracking_capi_claim(p_limit integer default 500)
returns table(id bigint, destination_id uuid, client_id uuid, pixel_id text, test_event_code text, event_id text, event_name text,
              occurred_at timestamp with time zone, visitor_id text, page_url text, custom_data jsonb, user_agent text, ip_address text,
              fbp text, fbc text, test boolean, attempts integer, em_hash text, ph_hash text, fn_hash text, ln_hash text,
              action_source text, ctwa_clid text, waba_id text)
language plpgsql
security definer
set search_path to ''
as $$
begin
  update public.tracking_capi_queue q
     set status = 'descartado', last_error = 'Evento com mais de 7 dias: o Meta não aceita mais.', ip_address = null, user_agent = null
   where q.status in ('pendente', 'erro') and q.occurred_at < now() - interval '7 days';

  return query
  with due as (
    select q.id from public.tracking_capi_queue q
     where ((q.status in ('pendente', 'erro') and q.next_attempt_at <= now()) or q.status = 'enviando')
       and (q.locked_until is null or q.locked_until < now())
       and private.client_is_active(q.client_id)
     order by q.next_attempt_at
     limit greatest(1, least(p_limit, 1000))
     for update skip locked
  ), claimed as (
    update public.tracking_capi_queue q
       set status = 'enviando', attempts = q.attempts + 1, locked_until = now() + interval '2 minutes'
      from due where q.id = due.id
    returning q.*
  )
  select c.id, c.destination_id, c.client_id, d.pixel_id, d.test_event_code,
         c.event_id, c.event_name, c.occurred_at, c.visitor_id, c.page_url, c.custom_data,
         c.user_agent, c.ip_address, c.fbp, c.fbc, c.test, c.attempts,
         l.em_hash, l.ph_hash, l.fn_hash, l.ln_hash, c.action_source, c.ctwa_clid, c.waba_id
    from claimed c
    join public.tracking_destinations d on d.id = c.destination_id
    left join public.tracking_leads l on l.id = c.lead_id;
end;
$$;
revoke all on function public.tracking_capi_claim(integer) from public, anon, authenticated;
grant execute on function public.tracking_capi_claim(integer) to service_role;

-- As cópias antigas (ponto de volta) não ficam chamáveis pelo site.
revoke all on function private.sync_claim_due_antes_2026_10_23(integer, integer) from public, anon, authenticated;
revoke all on function private.sync_claim_backfill_antes_2026_10_23(integer, integer) from public, anon, authenticated;
revoke all on function private.client_report_email_due_antes_2026_10_23(integer) from public, anon, authenticated;
revoke all on function private.client_report_public_antes_2026_10_23(text, text, date, date) from public, anon, authenticated;
revoke all on function private.ri_read_claim_antes_2026_10_23(uuid) from public, anon, authenticated;
revoke all on function private.tracking_capi_claim_antes_2026_10_23(integer) from public, anon, authenticated;
revoke all on function private.tracking_whatsapp_inbound_antes_2026_10_23(jsonb) from public, anon, authenticated;
revoke all on function private.tracking_whatsapp_register_antes_2026_10_23(jsonb) from public, anon, authenticated;
revoke all on function private.monitor_prepare_accounts_antes_2026_10_23(text, date, integer) from public, anon, authenticated;
revoke all on function private.tracking_ingest_antes_2026_10_23(jsonb) from public, anon, authenticated;
-- can_view_client_antes_2026_10_23 continua chamável por authenticated: a função nova depende dela.

-- ---------------------------------------------------------------- Quem pode e o que acontece ao desativar/reativar
create function private.clients_status_guard()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  if new.status is distinct from old.status and 'encerrado' in (new.status::text, old.status::text)
     and (select auth.uid()) is not null and private.current_user_role() is distinct from 'admin' then
    raise exception 'Só o administrador pode desativar ou reativar um cliente.' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function private.clients_status_guard() from public, anon, authenticated;
create trigger clients_status_guard before update of status on public.clients
  for each row execute function private.clients_status_guard();

create function private.clients_status_effects()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_alerts integer := 0;
  v_recs integer := 0;
begin
  if new.status = 'encerrado' and old.status <> 'encerrado' then
    -- Alertas abertos do cliente: encerrados com o motivo (não são apagados).
    with closed as (
      update public.monitor_alerts a
         set resolved_at = now(), resolution = 'automatica',
             status = case when a.status = 'ignorado' then 'ignorado' else 'resolvido' end,
             details = a.details || jsonb_build_object('closed_reason', 'cliente_desativado')
       where a.client_id = new.id and a.resolved_at is null
      returning a.id, a.severity
    ), ev as (
      insert into public.monitor_alert_events (alert_id, kind, from_value, to_value, note)
      select id, 'normalizado', severity, 'cliente_desativado', 'Encerrado: o cliente foi desativado.' from closed
      returning 1
    )
    select count(*) into v_alerts from ev;
    -- Repetições da Central (tarefas/reuniões) do cliente param de gerar itens novos.
    update public.ops_recurrences r
       set active = false, stopped_at = now(), stop_reason = 'Parada automaticamente: o cliente foi desativado.'
     where r.active
       and (exists (select 1 from public.ops_tasks t where t.id = r.task_id and t.client_id = new.id)
            or exists (select 1 from public.ops_meetings m where m.id = r.meeting_id and m.client_id = new.id));
    get diagnostics v_recs = row_count;
    insert into public.audit_logs (actor_id, action, target_type, target_id, details)
    values ((select auth.uid()), 'client.deactivate', 'client', new.id::text,
            jsonb_build_object('cliente', new.name, 'alertas_encerrados', v_alerts, 'repeticoes_paradas', v_recs));
  elsif old.status = 'encerrado' and new.status <> 'encerrado' then
    -- Volta a sincronizar logo (a recuperação de lacunas busca os dias que faltaram).
    update public.sync_state s set next_run_at = now()
      from public.ad_accounts a where a.id = s.ad_account_id and a.client_id = new.id and a.unlinked_at is null;
    insert into public.audit_logs (actor_id, action, target_type, target_id, details)
    values ((select auth.uid()), 'client.reactivate', 'client', new.id::text, jsonb_build_object('cliente', new.name, 'situacao', new.status));
  end if;
  return new;
end;
$$;
revoke all on function private.clients_status_effects() from public, anon, authenticated;
create trigger clients_status_effects after update of status on public.clients
  for each row execute function private.clients_status_effects();
