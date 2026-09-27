-- =============================================================================
-- Etapa 34.3 — Tracking: envio das conversões ao Meta (API de Conversões, CAPI)
--
-- Só ACRESCENTA. Remoção: supabase/rollback/remover_tracking.sql
--
--   tracking_destinations → Pixel do Meta de cada site (token SÓ no Vault)
--   tracking_capi_queue   → fila de envio: 1 linha por evento a enviar, com
--                           tentativas e espera crescente. IP e navegador ficam
--                           aqui só até o envio (depois são apagados).
--   tracking_capi_log     → registro de cada chamada à API do Meta (sem token)
--
-- Quem envia: Edge Function "capi-sender", chamada pelo agendador a cada minuto
-- só quando há algo na fila.
-- =============================================================================

create table public.tracking_destinations (
  id                 uuid primary key default gen_random_uuid(),
  container_id       uuid not null unique references public.tracking_containers (id),
  client_id          uuid not null references public.clients (id),
  platform           text not null default 'meta' check (platform in ('meta')),
  pixel_id           text not null check (pixel_id ~ '^\d{5,20}$'),
  vault_secret_id    uuid,
  has_token          boolean generated always as (vault_secret_id is not null) stored,
  enabled            boolean not null default false,
  test_event_code    text check (test_event_code ~ '^[A-Za-z0-9]{3,40}$'),
  send_events        text[] not null default '{Lead,CompleteRegistration,SubmitApplication,Schedule,Purchase,Contact}'
                     check (send_events <@ array['PageView','ViewContent','Contact','Lead','CompleteRegistration','SubmitApplication',
                                                 'Schedule','AddToCart','InitiateCheckout','Purchase']::text[]),
  last_success_at    timestamptz,
  last_error_at      timestamptz,
  last_error_message text check (char_length(last_error_message) <= 500),
  created_at         timestamptz not null default now(),
  created_by         uuid references auth.users (id) on delete set null,
  updated_at         timestamptz not null default now(),
  updated_by         uuid references auth.users (id) on delete set null
);
comment on table public.tracking_destinations is
  'Tracking (34.3): Pixel do Meta de cada site. O token de acesso fica SÓ no Vault (vault_secret_id); a tela vê apenas has_token.';
create index tracking_destinations_client_idx on public.tracking_destinations (client_id);
create index tracking_destinations_created_by_idx on public.tracking_destinations (created_by);
create index tracking_destinations_updated_by_idx on public.tracking_destinations (updated_by);
create trigger tracking_destinations_touch_updated_at
  before update on public.tracking_destinations
  for each row execute function private.touch_updated_at();

create table public.tracking_capi_queue (
  id              bigint generated always as identity primary key,
  destination_id  uuid not null references public.tracking_destinations (id),
  container_id    uuid not null references public.tracking_containers (id),
  client_id       uuid not null references public.clients (id),
  event_id        text not null,
  event_name      text not null,
  occurred_at     timestamptz not null,
  visitor_id      text not null,
  lead_id         bigint references public.tracking_leads (id),
  page_url        text,
  custom_data     jsonb not null default '{}'::jsonb,
  user_agent      text check (char_length(user_agent) <= 500),
  ip_address      text check (char_length(ip_address) <= 45),
  fbp             text check (char_length(fbp) <= 200),
  fbc             text check (char_length(fbc) <= 500),
  test            boolean not null default false,
  status          text not null default 'pendente' check (status in ('pendente', 'enviando', 'enviado', 'erro', 'descartado')),
  attempts        integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  locked_until    timestamptz,
  last_error      text check (char_length(last_error) <= 500),
  sent_at         timestamptz,
  created_at      timestamptz not null default now(),
  unique (destination_id, event_id)
);
comment on table public.tracking_capi_queue is
  'Tracking (34.3): fila de envio ao Meta CAPI. IP e navegador (exigidos pelo Meta) ficam só até o envio e depois são apagados.';
create index tracking_capi_queue_due_idx on public.tracking_capi_queue (next_attempt_at) where status in ('pendente', 'erro');
create index tracking_capi_queue_dest_time_idx on public.tracking_capi_queue (destination_id, created_at desc);
create index tracking_capi_queue_client_idx on public.tracking_capi_queue (client_id);
create index tracking_capi_queue_lead_idx on public.tracking_capi_queue (lead_id);

create table public.tracking_capi_log (
  id              bigint generated always as identity primary key,
  destination_id  uuid not null references public.tracking_destinations (id),
  client_id       uuid not null references public.clients (id),
  requested_at    timestamptz not null default now(),
  kind            text not null default 'envio' check (kind in ('envio', 'teste')),
  events_count    integer not null,
  test            boolean not null default false,
  http_status     integer,
  events_received integer,
  fbtrace_id      text check (char_length(fbtrace_id) <= 100),
  error_code      text check (char_length(error_code) <= 40),
  error_message   text check (char_length(error_message) <= 500),
  duration_ms     integer
);
comment on table public.tracking_capi_log is 'Tracking (34.3): cada chamada à API de Conversões do Meta (sem token e sem dados pessoais).';
create index tracking_capi_log_dest_time_idx on public.tracking_capi_log (destination_id, requested_at desc);
create index tracking_capi_log_client_idx on public.tracking_capi_log (client_id);

-- -----------------------------------------------------------------------------
-- Token no Vault (só o servidor)
-- -----------------------------------------------------------------------------
create function public.tracking_destination_secret_set(p_destination_id uuid, p_secret text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing uuid;
begin
  select vault_secret_id into existing from public.tracking_destinations where id = p_destination_id;
  if not found then raise exception 'destino não encontrado'; end if;
  if existing is not null then
    perform vault.update_secret(existing, p_secret);
  else
    update public.tracking_destinations
       set vault_secret_id = vault.create_secret(p_secret, 'capi:' || p_destination_id::text, 'Token da API de Conversões do Meta')
     where id = p_destination_id;
  end if;
end;
$$;

create function public.tracking_destination_secret_get(p_destination_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select s.decrypted_secret from public.tracking_destinations d
  join vault.decrypted_secrets s on s.id = d.vault_secret_id
  where d.id = p_destination_id
$$;

create function public.tracking_destination_secret_delete(p_destination_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing uuid;
begin
  select vault_secret_id into existing from public.tracking_destinations where id = p_destination_id;
  update public.tracking_destinations set vault_secret_id = null, enabled = false where id = p_destination_id;
  if existing is not null then delete from vault.secrets where id = existing; end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Fila: pegar os eventos da vez (com trava) e registrar o resultado
-- -----------------------------------------------------------------------------
create function public.tracking_capi_claim(p_limit integer default 500)
returns table (
  id bigint, destination_id uuid, client_id uuid, pixel_id text, test_event_code text,
  event_id text, event_name text, occurred_at timestamptz, visitor_id text, page_url text, custom_data jsonb,
  user_agent text, ip_address text, fbp text, fbc text, test boolean, attempts integer,
  em_hash text, ph_hash text, fn_hash text, ln_hash text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Mais de 7 dias: o Meta não aceita mais. Descarta (e apaga IP/navegador).
  update public.tracking_capi_queue q
     set status = 'descartado', last_error = 'Evento com mais de 7 dias: o Meta não aceita mais.', ip_address = null, user_agent = null
   where q.status in ('pendente', 'erro') and q.occurred_at < now() - interval '7 days';

  return query
  with due as (
    select q.id from public.tracking_capi_queue q
     where ((q.status in ('pendente', 'erro') and q.next_attempt_at <= now()) or q.status = 'enviando')  -- "enviando" travado = envio que caiu no meio
       and (q.locked_until is null or q.locked_until < now())
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
         l.em_hash, l.ph_hash, l.fn_hash, l.ln_hash
    from claimed c
    join public.tracking_destinations d on d.id = c.destination_id
    left join public.tracking_leads l on l.id = c.lead_id;
end;
$$;

/**
 * Resultado do envio: [{id, ok, error}]. Deu certo → "enviado" e apaga IP/navegador.
 * Falhou → tenta de novo em 1 min, 5 min, 30 min, 2 h e 6 h; na 6ª falha, "descartado".
 */
create function public.tracking_capi_finish(p_results jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.tracking_capi_queue q
     set status = case when (r ->> 'ok')::boolean then 'enviado' when q.attempts >= 6 then 'descartado' else 'erro' end,
         sent_at = case when (r ->> 'ok')::boolean then now() else q.sent_at end,
         last_error = case when (r ->> 'ok')::boolean then null else left(r ->> 'error', 500) end,
         next_attempt_at = now() + case q.attempts when 1 then interval '1 minute' when 2 then interval '5 minutes'
                                   when 3 then interval '30 minutes' when 4 then interval '2 hours' else interval '6 hours' end,
         locked_until = null,
         ip_address = case when (r ->> 'ok')::boolean or q.attempts >= 6 then null else q.ip_address end,
         user_agent = case when (r ->> 'ok')::boolean or q.attempts >= 6 then null else q.user_agent end
    from jsonb_array_elements(p_results) r
   where q.id = (r ->> 'id')::bigint and q.status = 'enviando'
$$;

/** Registra a chamada à API e atualiza o "último envio / último erro" do destino. */
create function public.tracking_capi_log_add(p jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_dest uuid := (p ->> 'destination_id')::uuid;
  v_ok   boolean := coalesce((p ->> 'ok')::boolean, false);
begin
  insert into public.tracking_capi_log (destination_id, client_id, kind, events_count, test, http_status, events_received, fbtrace_id,
                                        error_code, error_message, duration_ms)
  select d.id, d.client_id, coalesce(p ->> 'kind', 'envio'), (p ->> 'events_count')::integer, coalesce((p ->> 'test')::boolean, false),
         (p ->> 'http_status')::integer, (p ->> 'events_received')::integer, left(p ->> 'fbtrace_id', 100),
         left(p ->> 'error_code', 40), left(p ->> 'error_message', 500), (p ->> 'duration_ms')::integer
    from public.tracking_destinations d where d.id = v_dest;
  update public.tracking_destinations
     set last_success_at = case when v_ok then now() else last_success_at end,
         last_error_at = case when v_ok then last_error_at else now() end,
         last_error_message = case when v_ok then last_error_message else left(p ->> 'error_message', 500) end
   where id = v_dest;
end;
$$;

revoke all on function public.tracking_destination_secret_set(uuid, text) from public, anon, authenticated;
revoke all on function public.tracking_destination_secret_get(uuid) from public, anon, authenticated;
revoke all on function public.tracking_destination_secret_delete(uuid) from public, anon, authenticated;
revoke all on function public.tracking_capi_claim(integer) from public, anon, authenticated;
revoke all on function public.tracking_capi_finish(jsonb) from public, anon, authenticated;
revoke all on function public.tracking_capi_log_add(jsonb) from public, anon, authenticated;
grant execute on function public.tracking_destination_secret_set(uuid, text) to service_role;
grant execute on function public.tracking_destination_secret_get(uuid) to service_role;
grant execute on function public.tracking_destination_secret_delete(uuid) to service_role;
grant execute on function public.tracking_capi_claim(integer) to service_role;
grant execute on function public.tracking_capi_finish(jsonb) to service_role;
grant execute on function public.tracking_capi_log_add(jsonb) to service_role;

-- -----------------------------------------------------------------------------
-- Enfileirar: chamada pela ingestão logo depois de gravar o evento
-- -----------------------------------------------------------------------------
create function private.tracking_capi_enqueue(p jsonb, p_lead_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event jsonb := p -> 'event';
  v_capi  jsonb := coalesce(p -> 'capi', '{}'::jsonb);
  v_test  boolean := coalesce((p ->> 'test')::boolean, false);
  d       record;
begin
  select * into d from public.tracking_destinations
   where container_id = (p ->> 'container_id')::uuid and enabled and has_token and (v_event ->> 'name') = any (send_events);
  if not found then return; end if;

  insert into public.tracking_capi_queue (destination_id, container_id, client_id, event_id, event_name, occurred_at, visitor_id, lead_id,
                                          page_url, custom_data, user_agent, ip_address, fbp, fbc, test, status, last_error)
  values (d.id, d.container_id, d.client_id, v_event ->> 'event_id', v_event ->> 'name', (v_event ->> 'occurred_at')::timestamptz,
          p ->> 'visitor_id', p_lead_id, v_event ->> 'page_url',
          coalesce(v_event -> 'custom_data', '{}'::jsonb)
            || case when v_event ? 'value_micros' then jsonb_build_object('value', trim_scale((v_event ->> 'value_micros')::numeric / 1000000),
                                                                          'currency', v_event ->> 'currency', 'order_id', v_event ->> 'transaction_id')
                    else '{}'::jsonb end,
          left(v_capi ->> 'user_agent', 500), left(v_capi ->> 'ip', 45), left(v_capi ->> 'fbp', 200), left(v_capi ->> 'fbc', 500), v_test,
          -- Modo teste sem código de teste: não vai ao Meta (não pode parecer conversão real).
          case when v_test and d.test_event_code is null then 'descartado' else 'pendente' end,
          case when v_test and d.test_event_code is null then 'Site em modo teste e sem código de teste do Meta: não enviado.' end)
  on conflict (destination_id, event_id) do nothing;
end;
$$;
revoke all on function private.tracking_capi_enqueue(jsonb, bigint) from public, anon, authenticated;

-- A ingestão passa a chamar o enfileiramento no final (resto igual à 34.2).
create or replace function private.tracking_ingest(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_container uuid := (p ->> 'container_id')::uuid;
  v_client    uuid := (p ->> 'client_id')::uuid;
  v_visitor   text := p ->> 'visitor_id';
  v_session   text := p ->> 'session_id';
  v_event     jsonb := p -> 'event';
  v_touch     jsonb := p -> 'touch';
  v_user      jsonb := coalesce(p -> 'user', '{}'::jsonb);
  v_name      text := v_event ->> 'name';
  v_event_id  text := v_event ->> 'event_id';
  v_at        timestamptz := (v_event ->> 'occurred_at')::timestamptz;
  v_test      boolean := coalesce((p ->> 'test')::boolean, false);
  v_is_page   boolean := (v_event ->> 'name') = 'PageView';
  v_is_conv   boolean := (v_event ->> 'name') in ('Lead', 'CompleteRegistration', 'SubmitApplication', 'Schedule', 'Purchase');
  v_em        text := nullif(v_user ->> 'em', '');
  v_ph        text := nullif(v_user ->> 'ph', '');
  v_fn        text := nullif(v_user ->> 'fn', '');
  v_ln        text := nullif(v_user ->> 'ln', '');
  v_touch_id  bigint;
  v_purchase  bigint;
  v_lead      bigint;
  v_ft        bigint;
  v_lt        bigint;
  v_inserted  integer;
begin
  if v_at is null or v_at < now() - interval '3 days' or v_at > now() + interval '1 hour' then
    return jsonb_build_object('status', 'fora_do_periodo');
  end if;
  perform private.ensure_tracking_partition(v_at::date);

  insert into public.tracking_visitors as v (container_id, visitor_id, client_id, first_seen_at, last_seen_at, consent_status, consent_version, consent_at)
  values (v_container, v_visitor, v_client, v_at, v_at, coalesce(p ->> 'consent_status', 'nao_exigido'),
          p ->> 'consent_version', case when p ->> 'consent_status' = 'concedido' then v_at end)
  on conflict (container_id, visitor_id) do update
    set last_seen_at = greatest(v.last_seen_at, excluded.last_seen_at),
        first_seen_at = least(v.first_seen_at, excluded.first_seen_at),
        consent_status = case when excluded.consent_status = 'concedido' then 'concedido' else v.consent_status end,
        consent_version = coalesce(excluded.consent_version, v.consent_version),
        consent_at = coalesce(v.consent_at, excluded.consent_at);

  insert into public.tracking_events (container_id, event_id, occurred_at, client_id, visitor_id, session_id, event_name,
                                      page_url, page_path, referrer_host, custom_data, test)
  values (v_container, v_event_id, v_at, v_client, v_visitor, v_session, v_name,
          v_event ->> 'page_url', v_event ->> 'page_path', v_event ->> 'referrer_host',
          coalesce(v_event -> 'custom_data', '{}'::jsonb), v_test)
  on conflict do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    return jsonb_build_object('status', 'duplicado');
  end if;

  if v_name = 'Purchase' then
    insert into public.tracking_purchases (container_id, client_id, event_id, transaction_id, visitor_id, session_id, occurred_at, value_micros, currency, test)
    values (v_container, v_client, v_event_id, nullif(v_event ->> 'transaction_id', ''), v_visitor, v_session, v_at,
            (v_event ->> 'value_micros')::bigint, v_event ->> 'currency', v_test)
    on conflict do nothing
    returning id into v_purchase;
    if v_purchase is null then
      delete from public.tracking_events where container_id = v_container and event_id = v_event_id and occurred_at = v_at;
      return jsonb_build_object('status', 'compra_duplicada');
    end if;
  end if;

  if v_touch is not null and jsonb_typeof(v_touch) = 'object' then
    insert into public.tracking_touchpoints (container_id, client_id, visitor_id, session_id, origin_event_id, occurred_at,
      channel, paid, evidence, reason, utm_source, utm_medium, utm_campaign, utm_content, utm_term, source_normalized,
      fbclid, gclid, wbraid, gbraid, other_click_ids, ad_campaign_id, ad_adset_id, ad_ad_id, landing_url, referrer_host)
    values (v_container, v_client, v_visitor, v_session, v_event_id, v_at,
      v_touch ->> 'channel', (v_touch ->> 'paid')::boolean, v_touch ->> 'evidence', v_touch ->> 'reason',
      v_touch ->> 'utm_source', v_touch ->> 'utm_medium', v_touch ->> 'utm_campaign', v_touch ->> 'utm_content', v_touch ->> 'utm_term',
      v_touch ->> 'source_normalized', v_touch ->> 'fbclid', v_touch ->> 'gclid', v_touch ->> 'wbraid', v_touch ->> 'gbraid',
      coalesce(v_touch -> 'other_click_ids', '{}'::jsonb), v_touch ->> 'ad_campaign_id', v_touch ->> 'ad_adset_id', v_touch ->> 'ad_ad_id',
      v_event ->> 'page_url', v_event ->> 'referrer_host')
    on conflict (container_id, origin_event_id) do nothing
    returning id into v_touch_id;

    if v_touch_id is not null then
      update public.tracking_events set touchpoint_id = v_touch_id
       where container_id = v_container and event_id = v_event_id and occurred_at = v_at;
      update public.tracking_visitors v
         set first_touch_id = coalesce(v.first_touch_id, v_touch_id),
             last_touch_id = case when v.last_touch_id is null
                                    or v_at >= (select t.occurred_at from public.tracking_touchpoints t where t.id = v.last_touch_id)
                                  then v_touch_id else v.last_touch_id end
       where v.container_id = v_container and v.visitor_id = v_visitor;
    end if;
  end if;

  insert into public.tracking_sessions as s (container_id, session_id, client_id, visitor_id, started_at, last_event_at,
                                            landing_url, referrer_host, device_type, touchpoint_id, pageviews, events, test)
  values (v_container, v_session, v_client, v_visitor, v_at, v_at, v_event ->> 'page_url', v_event ->> 'referrer_host',
          coalesce(p ->> 'device_type', 'desconhecido'), v_touch_id, case when v_is_page then 1 else 0 end, 1, v_test)
  on conflict (container_id, session_id) do update
    set last_event_at = greatest(s.last_event_at, excluded.last_event_at),
        started_at = least(s.started_at, excluded.started_at),
        touchpoint_id = coalesce(s.touchpoint_id, excluded.touchpoint_id),
        pageviews = s.pageviews + excluded.pageviews,
        events = s.events + 1;

  if v_is_conv or v_em is not null or v_ph is not null then
    select v.first_touch_id, v.last_touch_id, v.lead_id into v_ft, v_lt, v_lead
      from public.tracking_visitors v where v.container_id = v_container and v.visitor_id = v_visitor;
    if v_em is not null or v_ph is not null then
      select l.id into v_lead from public.tracking_leads l
       where l.container_id = v_container and ((v_em is not null and l.em_hash = v_em) or (v_ph is not null and l.ph_hash = v_ph))
       order by (v_em is not null and l.em_hash = v_em) desc, l.id
       limit 1;
      if v_lead is null then
        select v.lead_id into v_lead from public.tracking_visitors v where v.container_id = v_container and v.visitor_id = v_visitor;
      end if;
    end if;

    if v_lead is null then
      insert into public.tracking_leads (container_id, client_id, em_hash, ph_hash, fn_hash, ln_hash, first_visitor_id, first_touch_id, last_touch_id,
                                         first_event_name, first_converted_at, last_converted_at, conversions, purchases, test)
      values (v_container, v_client, v_em, v_ph, v_fn, v_ln, v_visitor, v_ft, v_lt, v_name, v_at, v_at,
              case when v_is_conv then 1 else 0 end, case when v_purchase is not null then 1 else 0 end, v_test)
      returning id into v_lead;
    else
      update public.tracking_leads l
         set em_hash = coalesce(l.em_hash, v_em),
             ph_hash = coalesce(l.ph_hash, v_ph),
             fn_hash = coalesce(l.fn_hash, v_fn),
             ln_hash = coalesce(l.ln_hash, v_ln),
             first_touch_id = coalesce(l.first_touch_id, v_ft),
             last_touch_id = case when v_is_conv and v_at >= l.last_converted_at then coalesce(v_lt, l.last_touch_id) else l.last_touch_id end,
             last_converted_at = case when v_is_conv then greatest(l.last_converted_at, v_at) else l.last_converted_at end,
             conversions = l.conversions + case when v_is_conv then 1 else 0 end,
             purchases = l.purchases + case when v_purchase is not null then 1 else 0 end
       where l.id = v_lead;
    end if;
    update public.tracking_visitors set lead_id = v_lead where container_id = v_container and visitor_id = v_visitor;
  else
    select v.lead_id into v_lead from public.tracking_visitors v where v.container_id = v_container and v.visitor_id = v_visitor;
  end if;

  if v_purchase is not null then
    update public.tracking_purchases
       set lead_id = v_lead,
           first_touch_id = coalesce((select l.first_touch_id from public.tracking_leads l where l.id = v_lead), v_ft),
           last_touch_id = v_lt
     where id = v_purchase;
  end if;

  -- Meta CAPI: se o site tem Pixel configurado e este evento está na lista, entra na fila.
  perform private.tracking_capi_enqueue(p, v_lead);

  return jsonb_build_object('status', 'ok', 'touchpoint_id', v_touch_id, 'lead_id', v_lead, 'purchase_id', v_purchase);
end;
$$;
revoke all on function private.tracking_ingest(jsonb) from public, anon, authenticated;
grant execute on function private.tracking_ingest(jsonb) to service_role;

-- -----------------------------------------------------------------------------
-- Agendador: a cada minuto, chama o "capi-sender" só se houver fila vencida
-- -----------------------------------------------------------------------------
create function private.trigger_capi_sender()
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
  if not exists (
    select 1 from public.tracking_capi_queue q
     where ((q.status in ('pendente', 'erro') and q.next_attempt_at <= now()) or q.status = 'enviando')
       and (q.locked_until is null or q.locked_until < now())
  ) then
    return;
  end if;
  perform net.http_post(
    url := v_url || '/capi-sender',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret),
    body := jsonb_build_object('action', 'scheduled'),
    timeout_milliseconds := 60000
  );
end;
$$;
revoke all on function private.trigger_capi_sender() from public, anon, authenticated;
select cron.schedule('tracking-capi', '* * * * *', $$select private.trigger_capi_sender()$$);

-- -----------------------------------------------------------------------------
-- Acesso (RLS): a equipe vê; ninguém grava pela tela (só pelo servidor).
-- O vault_secret_id, o IP e o navegador NÃO são liberados para leitura.
-- -----------------------------------------------------------------------------
alter table public.tracking_destinations enable row level security;
alter table public.tracking_capi_queue enable row level security;
alter table public.tracking_capi_log enable row level security;
revoke all on public.tracking_destinations, public.tracking_capi_queue, public.tracking_capi_log from anon, authenticated;
grant select (id, container_id, client_id, platform, pixel_id, has_token, enabled, test_event_code, send_events,
              last_success_at, last_error_at, last_error_message, created_at, updated_at)
  on public.tracking_destinations to authenticated;
grant select (id, destination_id, container_id, client_id, event_id, event_name, occurred_at, lead_id, test, status, attempts,
              next_attempt_at, last_error, sent_at, created_at)
  on public.tracking_capi_queue to authenticated;
grant select on public.tracking_capi_log to authenticated;

create policy "Equipe vê destinos dos clientes liberados" on public.tracking_destinations for select to authenticated
  using (client_id in (select private.visible_client_ids()) and (select private.current_user_role()) <> 'cliente');
create policy "Equipe vê a fila dos clientes liberados" on public.tracking_capi_queue for select to authenticated
  using (client_id in (select private.visible_client_ids()) and (select private.current_user_role()) <> 'cliente');
create policy "Equipe vê o registro dos clientes liberados" on public.tracking_capi_log for select to authenticated
  using (client_id in (select private.visible_client_ids()) and (select private.current_user_role()) <> 'cliente');

/** Situação do envio por destino nas últimas 24 h (tela). */
create function public.tracking_capi_overview()
returns table (destination_id uuid, pending bigint, sent_24h bigint, errors_24h bigint, discarded_24h bigint, last_sent_at timestamptz)
language sql
stable
security invoker
set search_path = ''
as $$
  select d.id,
         (select count(*) from public.tracking_capi_queue q where q.destination_id = d.id and q.status in ('pendente', 'enviando', 'erro')),
         (select count(*) from public.tracking_capi_queue q where q.destination_id = d.id and q.status = 'enviado' and q.sent_at > now() - interval '24 hours'),
         (select count(*) from public.tracking_capi_queue q where q.destination_id = d.id and q.status = 'erro'),
         (select count(*) from public.tracking_capi_queue q where q.destination_id = d.id and q.status = 'descartado' and q.created_at > now() - interval '24 hours'),
         (select max(q.sent_at) from public.tracking_capi_queue q where q.destination_id = d.id)
  from public.tracking_destinations d
$$;
revoke all on function public.tracking_capi_overview() from public, anon;
grant execute on function public.tracking_capi_overview() to authenticated, service_role;
