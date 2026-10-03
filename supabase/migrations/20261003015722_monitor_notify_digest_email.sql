-- Etapa 37.5 — Notificações (parte 3): assunto e texto no envio (e-mail sai mesmo sem o aviso interno), resumo diário,
-- fila de e-mail (só o servidor lê) e agendamentos.
alter table public.monitor_deliveries
  add column title text check (char_length(title) <= 300),
  add column body text check (char_length(body) <= 600);
comment on column public.monitor_deliveries.title is 'Etapa 37.5: assunto do envio (e-mail/WhatsApp).';

create or replace function private.monitor_deliver(p_user uuid, p_kind text, p_title text, p_body text, p_alert bigint,
                                                   p_dedupe text, p_client uuid, p_severity text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  pr public.monitor_notify_prefs;
  v_hour integer;
  v_quiet boolean;
  v_nid bigint;
begin
  pr := private.monitor_prefs_of(p_user);
  if not pr.enabled then return; end if;
  if p_client is not null and pr.client_ids is not null and not (p_client = any (pr.client_ids)) then return; end if;
  if p_kind in ('alerta.novo', 'alerta.piorou') then
    if private.monitor_severity_rank(p_severity) < private.monitor_severity_rank(pr.min_severity) then return; end if;
    -- "Só resumo": alerta novo não avisa na hora (entra no resumo diário).
    if pr.mode = 'resumo' then return; end if;
    -- Anti-excesso: até 10 avisos de alerta por hora; o resto fica para o resumo diário.
    if (select count(*) from public.monitor_deliveries d
         where d.user_id = p_user and d.channel = 'interno' and d.kind in ('alerta.novo', 'alerta.piorou')
           and d.status = 'enviado' and d.created_at > now() - interval '1 hour') >= 10 then
      insert into public.monitor_deliveries (user_id, channel, kind, alert_id, dedupe_key, status, reason)
      values (p_user, 'interno', p_kind, p_alert, p_dedupe, 'pulado', 'Limite de 10 avisos por hora: vai no resumo diário.')
      on conflict (user_id, channel, dedupe_key) do nothing;
      return;
    end if;
  end if;
  v_hour := extract(hour from now() at time zone 'America/Sao_Paulo')::int;
  v_quiet := pr.quiet_start is not null and case when pr.quiet_start <= pr.quiet_end
                                                 then v_hour >= pr.quiet_start and v_hour < pr.quiet_end
                                                 else v_hour >= pr.quiet_start or v_hour < pr.quiet_end end;
  if pr.internal then
    insert into public.monitor_notifications (user_id, kind, title, body, link, alert_id, dedupe_key)
    values (p_user, p_kind, left(p_title, 300), left(p_body, 600),
            '/monitoramento?aba=alertas' || coalesce('&alerta=' || p_alert, ''), p_alert, p_dedupe)
    on conflict (user_id, dedupe_key) do nothing
    returning id into v_nid;
    if v_nid is null then return; end if; -- já avisado antes (sem duplicar)
    insert into public.monitor_deliveries (user_id, channel, kind, alert_id, notification_id, dedupe_key, status, sent_at)
    values (p_user, 'interno', p_kind, p_alert, v_nid, p_dedupe, 'enviado', now())
    on conflict (user_id, channel, dedupe_key) do nothing;
  end if;
  if pr.email then
    insert into public.monitor_deliveries (user_id, channel, kind, alert_id, notification_id, dedupe_key, status, reason, title, body)
    values (p_user, 'email', p_kind, p_alert, v_nid, p_dedupe, case when v_quiet then 'pulado' else 'pendente' end,
            case when v_quiet then 'Horário de silêncio da pessoa.' end, left(p_title, 300), left(p_body, 600))
    on conflict (user_id, channel, dedupe_key) do nothing;
  end if;
  if pr.whatsapp then
    insert into public.monitor_deliveries (user_id, channel, kind, alert_id, notification_id, dedupe_key, status, reason, title, body)
    values (p_user, 'whatsapp', p_kind, p_alert, v_nid, p_dedupe, 'preparado', 'O envio por WhatsApp ainda não está ligado (preparado).',
            left(p_title, 300), left(p_body, 600))
    on conflict (user_id, channel, dedupe_key) do nothing;
  end if;
end;
$$;
revoke all on function private.monitor_deliver(uuid, text, text, text, bigint, text, uuid, text) from public, anon, authenticated;


-- Resumo diário: na hora escolhida (fuso de São Paulo), para quem pediu "resumo" ou "ambos". Não manda resumo vazio.
create or replace function private.monitor_digest(p_now timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  u uuid;
  pr public.monitor_notify_prefs;
  v_hour integer := extract(hour from p_now at time zone 'America/Sao_Paulo')::int;
  v_day date := (p_now at time zone 'America/Sao_Paulo')::date;
  v_crit integer; v_att integer; v_info integer; v_new integer;
  v_n integer := 0;
begin
  for u in select p.id from public.profiles p where p.active and p.role::text in ('admin', 'gestor', 'operador', 'visualizador') loop
    pr := private.monitor_prefs_of(u);
    continue when not pr.enabled or pr.mode not in ('resumo', 'ambos') or pr.digest_hour <> v_hour;
    select count(*) filter (where a.severity = 'critico'), count(*) filter (where a.severity = 'atencao'),
           count(*) filter (where a.severity = 'informativo'), count(*) filter (where a.first_detected_at > p_now - interval '24 hours')
      into v_crit, v_att, v_info, v_new
      from public.monitor_alerts a
     where a.resolved_at is null and a.status <> 'ignorado' and private.monitor_user_sees(u, a.client_id)
       and (pr.client_ids is null or a.client_id = any (pr.client_ids))
       and private.monitor_severity_rank(a.severity) >= private.monitor_severity_rank(pr.min_severity);
    continue when v_crit + v_att + v_info = 0;
    perform private.monitor_deliver(u, 'resumo.diario',
      'Resumo do monitoramento: ' || (v_crit + v_att + v_info) || ' alerta(s) aberto(s)',
      v_crit || ' crítico(s), ' || v_att || ' de atenção e ' || v_info || ' informativo(s). Novos nas últimas 24 horas: ' || v_new || '.',
      null, 'resumo:' || v_day, null, null);
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;
revoke all on function private.monitor_digest(timestamptz) from public, anon, authenticated;

-- Fila de e-mails para o servidor (Edge Function monitor-email). Só o servidor (service_role) chama.
create or replace function public.monitor_email_queue(p_limit integer default 50)
returns table (id bigint, to_email text, to_name text, subject text, body text, link text)
language sql
stable
security definer
set search_path = ''
as $$
  select d.id, p.email, p.full_name, d.title, d.body,
         '/monitoramento?aba=alertas' || coalesce('&alerta=' || d.alert_id, '')
    from public.monitor_deliveries d
    join public.profiles p on p.id = d.user_id
   where d.channel = 'email' and d.status = 'pendente' and d.attempts < 3 and p.active and p.email is not null
   order by d.created_at
   limit least(greatest(coalesce(p_limit, 50), 1), 100)
$$;
revoke all on function public.monitor_email_queue(integer) from public, anon, authenticated;
grant execute on function public.monitor_email_queue(integer) to service_role;

-- Resultado de cada e-mail: enviado; ou falhou (tenta até 3 vezes, depois fica "falhou" com o motivo).
create or replace function public.monitor_email_mark(p_id bigint, p_ok boolean, p_reason text default null)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.monitor_deliveries
     set attempts = attempts + 1,
         status = case when p_ok then 'enviado' when attempts + 1 >= 3 then 'falhou' else 'pendente' end,
         sent_at = case when p_ok then now() else sent_at end,
         reason = case when p_ok then null else left(p_reason, 500) end
   where id = p_id and channel = 'email' and status = 'pendente'
$$;
revoke all on function public.monitor_email_mark(bigint, boolean, text) from public, anon, authenticated;
grant execute on function public.monitor_email_mark(bigint, boolean, text) to service_role;

-- Agendamentos: resumo diário (de hora em hora, minuto 3) e e-mails pendentes (a cada 5 min, só chama o servidor se houver).
create or replace function private.trigger_monitor_emails()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text := (select value from private.app_settings where key = 'functions_url');
  v_secret text := (select decrypted_secret from vault.decrypted_secrets where name = 'sync_cron_secret');
begin
  if v_url is null or v_secret is null then return; end if;
  if not exists (select 1 from public.monitor_deliveries where channel = 'email' and status = 'pendente' and attempts < 3) then return; end if;
  perform net.http_post(
    url := v_url || '/monitor-email',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret),
    body := jsonb_build_object('action', 'scheduled'),
    timeout_milliseconds := 60000
  );
end;
$$;
revoke all on function private.trigger_monitor_emails() from public, anon, authenticated;
select cron.schedule('monitor-digest', '3 * * * *', $cron$select private.monitor_digest()$cron$);
select cron.schedule('monitor-emails', '*/5 * * * *', $cron$select private.trigger_monitor_emails()$cron$);
