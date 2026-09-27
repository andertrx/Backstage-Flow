-- =============================================================================
-- Etapa 34.5-W2 — Tracking: WhatsApp pela API oficial (WhatsApp Business Platform)
--
-- Só ACRESCENTA. Remoção: supabase/rollback/remover_tracking.sql
--
-- O Meta avisa o CRM (webhook) a cada mensagem recebida no número da empresa.
--   • Anúncio de clique para o WhatsApp: a mensagem traz o ctwa_clid e o ID do
--     anúncio → origem CONFIRMADA, sem ninguém digitar nada.
--   • Mensagem com "(ref. XXXXXX)" do botão do site → ligada à visita do site.
-- NÃO guardamos o texto das conversas. Do número do cliente, só o hash SHA-256.
--
--   tracking_whatsapp_connections   → número da empresa ligado a um site; segredo
--                                     do app e token de verificação SÓ no Vault.
--   tracking_whatsapp_conversations → 1 linha por cliente por número: origem,
--                                     quantas mensagens, Lead/Venda marcados.
-- =============================================================================

create table public.tracking_whatsapp_connections (
  id                    uuid primary key default gen_random_uuid(),
  container_id          uuid not null unique references public.tracking_containers (id),
  client_id             uuid not null references public.clients (id),
  phone_number_id       text not null unique check (phone_number_id ~ '^\d{5,30}$'),
  waba_id               text not null check (waba_id ~ '^\d{5,30}$'),
  app_secret_vault_id   uuid,
  verify_token_vault_id uuid,
  has_app_secret        boolean generated always as (app_secret_vault_id is not null) stored,
  enabled               boolean not null default false,
  last_webhook_at       timestamptz,
  last_error_at         timestamptz,
  last_error_message    text check (char_length(last_error_message) <= 500),
  created_at            timestamptz not null default now(),
  created_by            uuid references auth.users (id) on delete set null,
  updated_at            timestamptz not null default now(),
  updated_by            uuid references auth.users (id) on delete set null
);
comment on table public.tracking_whatsapp_connections is
  'Tracking (34.5-W2): número de WhatsApp (API oficial) ligado a um site. Segredo do app e token de verificação só no Vault.';
create index tracking_whatsapp_connections_client_idx on public.tracking_whatsapp_connections (client_id);
create index tracking_whatsapp_connections_created_by_idx on public.tracking_whatsapp_connections (created_by);
create index tracking_whatsapp_connections_updated_by_idx on public.tracking_whatsapp_connections (updated_by);
create trigger tracking_whatsapp_connections_touch_updated_at
  before update on public.tracking_whatsapp_connections
  for each row execute function private.touch_updated_at();

create table public.tracking_whatsapp_conversations (
  id               bigint generated always as identity primary key,
  connection_id    uuid not null references public.tracking_whatsapp_connections (id),
  container_id     uuid not null references public.tracking_containers (id),
  client_id        uuid not null references public.clients (id),
  wa_hash          text not null check (wa_hash ~ '^[0-9a-f]{64}$'),
  visitor_id       text not null,
  session_id       text not null,
  origin           text not null check (origin in ('anuncio_whatsapp', 'site', 'desconhecida')),
  ctwa_clid        text check (char_length(ctwa_clid) <= 500),
  ad_id            text check (ad_id ~ '^\d{1,32}$'),
  click_code       text references public.tracking_whatsapp_clicks (code),
  touchpoint_id    bigint references public.tracking_touchpoints (id),
  first_message_at timestamptz not null,
  last_message_at  timestamptz not null,
  messages         integer not null default 1,
  last_message_key text check (char_length(last_message_key) <= 80),
  status           text not null default 'conversa' check (status in ('conversa', 'lead', 'venda')),
  lead_id          bigint references public.tracking_leads (id),
  sales            integer not null default 0,
  test             boolean not null default false,
  last_marked_at   timestamptz,
  last_marked_by   uuid references auth.users (id) on delete set null,
  unique (connection_id, wa_hash),
  foreign key (container_id, visitor_id) references public.tracking_visitors (container_id, visitor_id)
);
comment on table public.tracking_whatsapp_conversations is
  'Tracking (34.5-W2): conversa recebida pela API oficial. Sem texto das mensagens; número do cliente só em hash.';
create index tracking_whatsapp_conversations_client_time_idx on public.tracking_whatsapp_conversations (client_id, last_message_at desc);
create index tracking_whatsapp_conversations_container_idx on public.tracking_whatsapp_conversations (container_id, visitor_id);
create index tracking_whatsapp_conversations_click_idx on public.tracking_whatsapp_conversations (click_code);
create index tracking_whatsapp_conversations_touch_idx on public.tracking_whatsapp_conversations (touchpoint_id);
create index tracking_whatsapp_conversations_lead_idx on public.tracking_whatsapp_conversations (lead_id);
create index tracking_whatsapp_conversations_marked_by_idx on public.tracking_whatsapp_conversations (last_marked_by);

-- Fila do Meta: conversões de anúncio de WhatsApp vão como "business_messaging"
alter table public.tracking_capi_queue drop constraint tracking_capi_queue_action_source_check;
alter table public.tracking_capi_queue add constraint tracking_capi_queue_action_source_check
  check (action_source in ('website', 'chat', 'business_messaging'));
alter table public.tracking_capi_queue
  add column ctwa_clid text check (char_length(ctwa_clid) <= 500),
  add column waba_id   text check (waba_id ~ '^\d{5,30}$');

-- -----------------------------------------------------------------------------
-- Segredos no Vault (só o servidor)
-- -----------------------------------------------------------------------------
create function public.tracking_whatsapp_secret_set(p_connection_id uuid, p_kind text, p_secret text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing uuid;
begin
  if p_kind not in ('app_secret', 'verify_token') then raise exception 'tipo inválido'; end if;
  select case when p_kind = 'app_secret' then app_secret_vault_id else verify_token_vault_id end into existing
    from public.tracking_whatsapp_connections where id = p_connection_id;
  if not found then raise exception 'conexão não encontrada'; end if;
  if existing is not null then
    perform vault.update_secret(existing, p_secret);
  elsif p_kind = 'app_secret' then
    update public.tracking_whatsapp_connections
       set app_secret_vault_id = vault.create_secret(p_secret, 'wa_app:' || p_connection_id::text, 'Segredo do app do Meta (webhook do WhatsApp)')
     where id = p_connection_id;
  else
    update public.tracking_whatsapp_connections
       set verify_token_vault_id = vault.create_secret(p_secret, 'wa_verify:' || p_connection_id::text, 'Token de verificação do webhook do WhatsApp')
     where id = p_connection_id;
  end if;
end;
$$;

create function public.tracking_whatsapp_secret_get(p_connection_id uuid, p_kind text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select s.decrypted_secret from public.tracking_whatsapp_connections c
  join vault.decrypted_secrets s on s.id = case when p_kind = 'app_secret' then c.app_secret_vault_id else c.verify_token_vault_id end
  where c.id = p_connection_id
$$;

create function public.tracking_whatsapp_secret_delete(p_connection_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  a uuid;
  v uuid;
begin
  select app_secret_vault_id, verify_token_vault_id into a, v from public.tracking_whatsapp_connections where id = p_connection_id;
  update public.tracking_whatsapp_connections set app_secret_vault_id = null, verify_token_vault_id = null, enabled = false where id = p_connection_id;
  delete from vault.secrets where id in (a, v);
end;
$$;

-- -----------------------------------------------------------------------------
-- Mensagem recebida (chamada pelo webhook, já com a assinatura do Meta conferida)
-- p: {connection_id, wa_hash, message_key, at, ref_code?, referral?: {ctwa_clid, source_id, source_type, source_url}}
-- -----------------------------------------------------------------------------
create function public.tracking_whatsapp_inbound(p jsonb)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  c        record;
  k        record;
  conv     record;
  click    record;
  v_hash   text := p ->> 'wa_hash';
  v_at     timestamptz := coalesce((p ->> 'at')::timestamptz, now());
  v_ref    jsonb := p -> 'referral';
  v_clid   text := nullif(p -> 'referral' ->> 'ctwa_clid', '');
  v_ad     text := case when p -> 'referral' ->> 'source_id' ~ '^\d{1,32}$' then p -> 'referral' ->> 'source_id' end;
  v_code   text := upper(p ->> 'ref_code');
  v_vis    text;
  v_ses    text;
  v_origin text;
  v_touch  jsonb;
  v_res    jsonb;
begin
  select * into c from public.tracking_whatsapp_connections where id = (p ->> 'connection_id')::uuid;
  if not found or not c.enabled then return 'desligado'; end if;
  if v_hash is null or v_hash !~ '^[0-9a-f]{64}$' then return 'invalido'; end if;
  select * into k from public.tracking_containers where id = c.container_id;
  update public.tracking_whatsapp_connections set last_webhook_at = now() where id = c.id;

  if v_at < now() - interval '3 days' or v_at > now() + interval '1 hour' then v_at := now(); end if;

  select * into conv from public.tracking_whatsapp_conversations where connection_id = c.id and wa_hash = v_hash;

  -- Mesmo aviso reenviado pelo Meta (ele repete quando demoramos a responder)
  if conv.id is not null and conv.last_message_key = p ->> 'message_key' then return 'repetido'; end if;

  -- Código do botão do site na mensagem → usa a visita do site
  select * into click from public.tracking_whatsapp_clicks
   where v_code ~ '^[2-9A-HJ-NP-Z]{6}$' and code = v_code and container_id = c.container_id;

  if conv.id is not null and v_ref is null and click.id is null then
    update public.tracking_whatsapp_conversations
       set messages = messages + 1, last_message_at = greatest(last_message_at, v_at), last_message_key = p ->> 'message_key'
     where id = conv.id;
    return 'mensagem';
  end if;

  v_origin := case when v_clid is not null then 'anuncio_whatsapp' when click.id is not null then 'site'
                   else coalesce(conv.origin, 'desconhecida') end;
  v_vis := coalesce(click.visitor_id, conv.visitor_id, 'wa' || left(v_hash, 30));
  v_ses := coalesce(click.session_id, conv.session_id, 'wa' || left(v_hash, 30));

  -- Contato (e origem, quando veio de anúncio) passa pela ingestão normal
  if v_clid is not null or (conv.id is null and click.id is null) then
    v_touch := case when v_clid is not null then jsonb_build_object(
        'channel', 'meta', 'paid', true, 'evidence', 'confirmada',
        'reason', 'Anúncio de clique para o WhatsApp (ctwa_clid recebido pela API oficial).',
        'utm_source', 'whatsapp_ad', 'source_normalized', 'whatsapp_ad', 'ad_ad_id', v_ad)
      else jsonb_build_object('channel', 'whatsapp', 'paid', null, 'evidence', 'desconhecida',
        'reason', 'Conversa iniciada direto no WhatsApp, sem anúncio nem código do site.') end;
    v_res := private.tracking_ingest(jsonb_build_object(
      'container_id', c.container_id, 'client_id', c.client_id, 'visitor_id', v_vis, 'session_id', v_ses,
      'test', k.test_mode, 'device_type', 'mobile', 'consent_status', 'nao_exigido',
      'capi', jsonb_build_object('action_source', case when v_clid is not null then 'business_messaging' else 'chat' end,
                                 'ctwa_clid', v_clid, 'waba_id', c.waba_id),
      'event', jsonb_build_object('event_id', 'wam.' || left(p ->> 'message_key', 40), 'name', 'Contact', 'occurred_at', v_at,
                                  'page_url', nullif(p -> 'referral' ->> 'source_url', ''), 'page_path', null, 'referrer_host', null,
                                  'custom_data', jsonb_build_object('canal', 'whatsapp_api')),
      'touch', v_touch));
  end if;

  insert into public.tracking_whatsapp_conversations as w (connection_id, container_id, client_id, wa_hash, visitor_id, session_id, origin,
      ctwa_clid, ad_id, click_code, touchpoint_id, first_message_at, last_message_at, test, last_message_key)
  values (c.id, c.container_id, c.client_id, v_hash, v_vis, v_ses, v_origin, v_clid, v_ad, click.code,
          coalesce((v_res ->> 'touchpoint_id')::bigint, click.touchpoint_id), v_at, v_at, k.test_mode, p ->> 'message_key')
  on conflict (connection_id, wa_hash) do update
    set messages = w.messages + 1,
        last_message_key = excluded.last_message_key,
        last_message_at = greatest(w.last_message_at, excluded.last_message_at),
        -- Anúncio novo: a atribuição do Meta usa o ctwa_clid mais recente.
        origin = case when excluded.ctwa_clid is not null then 'anuncio_whatsapp'
                      when w.origin = 'desconhecida' and excluded.click_code is not null then 'site' else w.origin end,
        ctwa_clid = coalesce(excluded.ctwa_clid, w.ctwa_clid),
        ad_id = coalesce(excluded.ad_id, w.ad_id),
        click_code = coalesce(w.click_code, excluded.click_code),
        touchpoint_id = coalesce(excluded.touchpoint_id, w.touchpoint_id);
  return case when v_clid is not null then 'anuncio' when click.id is not null then 'site' when conv.id is null then 'nova' else 'mensagem' end;
end;
$$;

/** Marcação Lead/Venda numa conversa (depois de o evento passar pela ingestão). */
create function public.tracking_whatsapp_conversation_mark(p_id bigint, p_kind text, p_user_id uuid, p_lead_id bigint)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.tracking_whatsapp_conversations w
     set status = case when p_kind = 'venda' or w.status = 'venda' then 'venda' else 'lead' end,
         lead_id = coalesce(p_lead_id, w.lead_id),
         sales = w.sales + case when p_kind = 'venda' then 1 else 0 end,
         last_marked_at = now(),
         last_marked_by = p_user_id
   where w.id = p_id
$$;

revoke all on function public.tracking_whatsapp_secret_set(uuid, text, text) from public, anon, authenticated;
revoke all on function public.tracking_whatsapp_secret_get(uuid, text) from public, anon, authenticated;
revoke all on function public.tracking_whatsapp_secret_delete(uuid) from public, anon, authenticated;
revoke all on function public.tracking_whatsapp_inbound(jsonb) from public, anon, authenticated;
revoke all on function public.tracking_whatsapp_conversation_mark(bigint, text, uuid, bigint) from public, anon, authenticated;
grant execute on function public.tracking_whatsapp_secret_set(uuid, text, text) to service_role;
grant execute on function public.tracking_whatsapp_secret_get(uuid, text) to service_role;
grant execute on function public.tracking_whatsapp_secret_delete(uuid) to service_role;
grant execute on function public.tracking_whatsapp_inbound(jsonb) to service_role;
grant execute on function public.tracking_whatsapp_conversation_mark(bigint, text, uuid, bigint) to service_role;

-- -----------------------------------------------------------------------------
-- Meta CAPI: guarda ctwa_clid e WABA na fila e devolve no envio
-- -----------------------------------------------------------------------------
create or replace function private.tracking_capi_enqueue(p jsonb, p_lead_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event jsonb := p -> 'event';
  v_capi  jsonb := coalesce(p -> 'capi', '{}'::jsonb);
  v_test  boolean := coalesce((p ->> 'test')::boolean, false);
  v_src   text := case when v_capi ->> 'action_source' in ('chat', 'business_messaging') then v_capi ->> 'action_source' else 'website' end;
  d       record;
begin
  select * into d from public.tracking_destinations
   where container_id = (p ->> 'container_id')::uuid and enabled and has_token and (v_event ->> 'name') = any (send_events);
  if not found then return; end if;
  -- business_messaging exige o ctwa_clid; sem ele, vira conversa comum ("chat").
  if v_src = 'business_messaging' and (v_capi ->> 'ctwa_clid') is null then v_src := 'chat'; end if;

  insert into public.tracking_capi_queue (destination_id, container_id, client_id, event_id, event_name, occurred_at, visitor_id, lead_id,
                                          page_url, custom_data, user_agent, ip_address, fbp, fbc, test, status, last_error, action_source,
                                          ctwa_clid, waba_id)
  values (d.id, d.container_id, d.client_id, v_event ->> 'event_id', v_event ->> 'name', (v_event ->> 'occurred_at')::timestamptz,
          p ->> 'visitor_id', p_lead_id, v_event ->> 'page_url',
          coalesce(v_event -> 'custom_data', '{}'::jsonb)
            || case when v_event ? 'value_micros' then jsonb_build_object('value', trim_scale((v_event ->> 'value_micros')::numeric / 1000000),
                                                                          'currency', v_event ->> 'currency', 'order_id', v_event ->> 'transaction_id')
                    else '{}'::jsonb end,
          left(v_capi ->> 'user_agent', 500), left(v_capi ->> 'ip', 45), left(v_capi ->> 'fbp', 200), left(v_capi ->> 'fbc', 500), v_test,
          case when v_test and d.test_event_code is null then 'descartado' else 'pendente' end,
          case when v_test and d.test_event_code is null then 'Site em modo teste e sem código de teste do Meta: não enviado.' end,
          v_src, left(v_capi ->> 'ctwa_clid', 500), case when v_capi ->> 'waba_id' ~ '^\d{5,30}$' then v_capi ->> 'waba_id' end)
  on conflict (destination_id, event_id) do nothing;
end;
$$;
revoke all on function private.tracking_capi_enqueue(jsonb, bigint) from public, anon, authenticated;

drop function public.tracking_capi_claim(integer);
create function public.tracking_capi_claim(p_limit integer default 500)
returns table (
  id bigint, destination_id uuid, client_id uuid, pixel_id text, test_event_code text,
  event_id text, event_name text, occurred_at timestamptz, visitor_id text, page_url text, custom_data jsonb,
  user_agent text, ip_address text, fbp text, fbc text, test boolean, attempts integer,
  em_hash text, ph_hash text, fn_hash text, ln_hash text, action_source text, ctwa_clid text, waba_id text
)
language plpgsql
security definer
set search_path = ''
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

-- -----------------------------------------------------------------------------
-- Acesso (RLS): a equipe vê; ninguém grava pela tela. Segredos e hash escondidos.
-- -----------------------------------------------------------------------------
alter table public.tracking_whatsapp_connections enable row level security;
alter table public.tracking_whatsapp_conversations enable row level security;
revoke all on public.tracking_whatsapp_connections, public.tracking_whatsapp_conversations from anon, authenticated;
grant select (id, container_id, client_id, phone_number_id, waba_id, has_app_secret, enabled, last_webhook_at, last_error_at,
              last_error_message, created_at, updated_at)
  on public.tracking_whatsapp_connections to authenticated;
grant select (id, connection_id, container_id, client_id, origin, ad_id, click_code, touchpoint_id, first_message_at, last_message_at,
              messages, status, lead_id, sales, test, last_marked_at)
  on public.tracking_whatsapp_conversations to authenticated;
create policy "Equipe vê conexões de WhatsApp dos clientes liberados" on public.tracking_whatsapp_connections for select to authenticated
  using (client_id in (select private.visible_client_ids()) and (select private.current_user_role()) <> 'cliente');
create policy "Equipe vê conversas de WhatsApp dos clientes liberados" on public.tracking_whatsapp_conversations for select to authenticated
  using (client_id in (select private.visible_client_ids()) and (select private.current_user_role()) <> 'cliente');
