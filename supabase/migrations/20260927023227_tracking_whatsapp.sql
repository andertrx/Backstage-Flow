-- =============================================================================
-- Etapa 34.5-W — Tracking: WhatsApp (aplicativo comum)
--
-- Só ACRESCENTA. Remoção: supabase/rollback/remover_tracking.sql
--
-- Sem a API oficial não dá para ler as conversas. Então: no clique do botão do
-- WhatsApp, o script põe um código curto na mensagem ("ref. K7Q2M9"). A equipe
-- digita o código no CRM, vê a origem e marca Lead ou Venda.
--
--   tracking_whatsapp_clicks → cada clique com código: visita, origem, cookies
--                              do Meta (_fbp/_fbc) e o que a equipe marcou.
--   tracking_capi_queue.action_source → "chat" para conversões fechadas no WhatsApp.
-- =============================================================================

create table public.tracking_whatsapp_clicks (
  id              bigint generated always as identity primary key,
  container_id    uuid not null references public.tracking_containers (id),
  client_id       uuid not null references public.clients (id),
  code            text not null unique check (code ~ '^[2-9A-HJ-NP-Z]{6}$'),
  visitor_id      text not null,
  session_id      text not null,
  event_id        text not null,
  clicked_at      timestamptz not null,
  touchpoint_id   bigint references public.tracking_touchpoints (id),
  page_url        text check (char_length(page_url) <= 2000),
  fbp             text check (char_length(fbp) <= 200),
  fbc             text check (char_length(fbc) <= 500),
  test            boolean not null default false,
  status          text not null default 'clicado' check (status in ('clicado', 'lead', 'venda')),
  lead_id         bigint references public.tracking_leads (id),
  lead_marked_at  timestamptz,
  sales           integer not null default 0,
  last_marked_at  timestamptz,
  last_marked_by  uuid references auth.users (id) on delete set null,
  foreign key (container_id, visitor_id) references public.tracking_visitors (container_id, visitor_id)
);
comment on table public.tracking_whatsapp_clicks is
  'Tracking (34.5-W): clique no botão do WhatsApp com código de rastreio na mensagem. A equipe marca Lead/Venda pelo código.';
create index tracking_whatsapp_clicks_client_time_idx on public.tracking_whatsapp_clicks (client_id, clicked_at desc);
create index tracking_whatsapp_clicks_container_idx on public.tracking_whatsapp_clicks (container_id, visitor_id);
create index tracking_whatsapp_clicks_touch_idx on public.tracking_whatsapp_clicks (touchpoint_id);
create index tracking_whatsapp_clicks_lead_idx on public.tracking_whatsapp_clicks (lead_id);
create index tracking_whatsapp_clicks_marked_by_idx on public.tracking_whatsapp_clicks (last_marked_by);

alter table public.tracking_capi_queue
  add column action_source text not null default 'website' check (action_source in ('website', 'chat'));

-- -----------------------------------------------------------------------------
-- Registrar o clique (servidor, logo depois de gravar o evento Contact)
-- -----------------------------------------------------------------------------
create function public.tracking_whatsapp_register(p jsonb)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text := upper(p -> 'event' -> 'custom_data' ->> 'ref');
  v_id   bigint;
begin
  if v_code is null or v_code !~ '^[2-9A-HJ-NP-Z]{6}$' then return 'sem_codigo'; end if;
  insert into public.tracking_whatsapp_clicks (container_id, client_id, code, visitor_id, session_id, event_id, clicked_at,
                                               touchpoint_id, page_url, fbp, fbc, test)
  select (p ->> 'container_id')::uuid, (p ->> 'client_id')::uuid, v_code, p ->> 'visitor_id', p ->> 'session_id',
         p -> 'event' ->> 'event_id', (p -> 'event' ->> 'occurred_at')::timestamptz,
         v.last_touch_id, p -> 'event' ->> 'page_url', p -> 'capi' ->> 'fbp', p -> 'capi' ->> 'fbc', coalesce((p ->> 'test')::boolean, false)
    from public.tracking_visitors v
   where v.container_id = (p ->> 'container_id')::uuid and v.visitor_id = p ->> 'visitor_id'
  on conflict (code) do nothing
  returning id into v_id;
  return case when v_id is null then 'repetido' else 'ok' end;
end;
$$;

/** Depois que a equipe marca Lead/Venda (o evento já passou pela ingestão). */
create function public.tracking_whatsapp_mark(p_code text, p_kind text, p_user_id uuid, p_lead_id bigint)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.tracking_whatsapp_clicks c
     set status = case when p_kind = 'venda' or c.status = 'venda' then 'venda' else 'lead' end,
         lead_id = coalesce(p_lead_id, c.lead_id),
         lead_marked_at = coalesce(c.lead_marked_at, now()),
         sales = c.sales + case when p_kind = 'venda' then 1 else 0 end,
         last_marked_at = now(),
         last_marked_by = p_user_id
   where c.code = p_code
$$;

revoke all on function public.tracking_whatsapp_register(jsonb) from public, anon, authenticated;
revoke all on function public.tracking_whatsapp_mark(text, text, uuid, bigint) from public, anon, authenticated;
grant execute on function public.tracking_whatsapp_register(jsonb) to service_role;
grant execute on function public.tracking_whatsapp_mark(text, text, uuid, bigint) to service_role;

-- -----------------------------------------------------------------------------
-- Meta CAPI: conversão fechada no WhatsApp vai como action_source "chat"
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
  d       record;
begin
  select * into d from public.tracking_destinations
   where container_id = (p ->> 'container_id')::uuid and enabled and has_token and (v_event ->> 'name') = any (send_events);
  if not found then return; end if;

  insert into public.tracking_capi_queue (destination_id, container_id, client_id, event_id, event_name, occurred_at, visitor_id, lead_id,
                                          page_url, custom_data, user_agent, ip_address, fbp, fbc, test, status, last_error, action_source)
  values (d.id, d.container_id, d.client_id, v_event ->> 'event_id', v_event ->> 'name', (v_event ->> 'occurred_at')::timestamptz,
          p ->> 'visitor_id', p_lead_id, v_event ->> 'page_url',
          coalesce(v_event -> 'custom_data', '{}'::jsonb)
            || case when v_event ? 'value_micros' then jsonb_build_object('value', trim_scale((v_event ->> 'value_micros')::numeric / 1000000),
                                                                          'currency', v_event ->> 'currency', 'order_id', v_event ->> 'transaction_id')
                    else '{}'::jsonb end,
          left(v_capi ->> 'user_agent', 500), left(v_capi ->> 'ip', 45), left(v_capi ->> 'fbp', 200), left(v_capi ->> 'fbc', 500), v_test,
          case when v_test and d.test_event_code is null then 'descartado' else 'pendente' end,
          case when v_test and d.test_event_code is null then 'Site em modo teste e sem código de teste do Meta: não enviado.' end,
          case when v_capi ->> 'action_source' = 'chat' then 'chat' else 'website' end)
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
  em_hash text, ph_hash text, fn_hash text, ln_hash text, action_source text
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
         l.em_hash, l.ph_hash, l.fn_hash, l.ln_hash, c.action_source
    from claimed c
    join public.tracking_destinations d on d.id = c.destination_id
    left join public.tracking_leads l on l.id = c.lead_id;
end;
$$;
revoke all on function public.tracking_capi_claim(integer) from public, anon, authenticated;
grant execute on function public.tracking_capi_claim(integer) to service_role;

-- -----------------------------------------------------------------------------
-- Acesso (RLS) e busca pelo código (tela)
-- -----------------------------------------------------------------------------
alter table public.tracking_whatsapp_clicks enable row level security;
revoke all on public.tracking_whatsapp_clicks from anon, authenticated;
grant select (id, container_id, client_id, code, clicked_at, touchpoint_id, page_url, test, status, lead_id, lead_marked_at, sales, last_marked_at)
  on public.tracking_whatsapp_clicks to authenticated;
create policy "Equipe vê cliques de WhatsApp dos clientes liberados" on public.tracking_whatsapp_clicks for select to authenticated
  using (client_id in (select private.visible_client_ids()) and (select private.current_user_role()) <> 'cliente');

/** Busca um clique pelo código (com o RLS de quem pergunta), já com a origem. */
create function public.tracking_whatsapp_lookup(p_code text)
returns table (id bigint, code text, container_id uuid, client_id uuid, container_name text, clicked_at timestamptz, page_url text,
               status text, sales integer, lead_marked_at timestamptz, test boolean,
               channel text, paid boolean, evidence text, reason text, campaign text)
language sql
stable
security invoker
set search_path = ''
as $$
  -- Aceita "ref. k7q-2m9", "K7Q2M9"... (só letras/números; "REF" na frente é tirado)
  with q as (select regexp_replace(upper(coalesce(p_code, '')), '[^A-Z0-9]', '', 'g') raw),
  n as (select case when length(raw) = 9 and raw like 'REF%' then substr(raw, 4) else raw end code from q)
  select c.id, c.code, c.container_id, c.client_id, k.name, c.clicked_at, c.page_url, c.status, c.sales, c.lead_marked_at, c.test,
         t.channel, t.paid, t.evidence, t.reason, coalesce(t.utm_campaign, case when t.ad_campaign_id is not null then 'ID ' || t.ad_campaign_id end)
    from n
    join public.tracking_whatsapp_clicks c on c.code = n.code
    join public.tracking_containers k on k.id = c.container_id
    left join public.tracking_touchpoints t on t.id = c.touchpoint_id
$$;
revoke all on function public.tracking_whatsapp_lookup(text) from public, anon;
grant execute on function public.tracking_whatsapp_lookup(text) to authenticated, service_role;
