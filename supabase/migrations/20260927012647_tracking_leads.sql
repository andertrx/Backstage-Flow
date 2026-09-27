-- =============================================================================
-- Etapa 34.2 — Tracking: eventos de conversão, leads, compras e jornada
--
-- Só ACRESCENTA. Remoção: supabase/rollback/remover_tracking.sql
--
--   tracking_leads     → quem converteu (Lead, Cadastro, Compra...), com a
--                        primeira e a última origem. Dados pessoais SÓ em hash
--                        SHA-256 (o site cifra antes de enviar; o valor legível
--                        nunca chega aqui).
--   tracking_purchases → compras, sem duplicar pelo número do pedido
--                        (transaction_id) nem pelo event_id. Valor em micros +
--                        moeda (moedas nunca são somadas entre si).
--   tracking_visitors.lead_id → liga cada aparelho/navegador ao lead.
-- =============================================================================

create table public.tracking_leads (
  id                 bigint generated always as identity primary key,
  container_id       uuid not null references public.tracking_containers (id),
  client_id          uuid not null references public.clients (id),
  em_hash            text check (em_hash ~ '^[0-9a-f]{64}$'),
  ph_hash            text check (ph_hash ~ '^[0-9a-f]{64}$'),
  fn_hash            text check (fn_hash ~ '^[0-9a-f]{64}$'),
  ln_hash            text check (ln_hash ~ '^[0-9a-f]{64}$'),
  first_visitor_id   text not null,
  first_touch_id     bigint references public.tracking_touchpoints (id),
  last_touch_id      bigint references public.tracking_touchpoints (id),
  first_event_name   text not null,
  first_converted_at timestamptz not null,
  last_converted_at  timestamptz not null,
  conversions        integer not null default 0,
  purchases          integer not null default 0,
  test               boolean not null default false,
  created_at         timestamptz not null default now()
);
comment on table public.tracking_leads is
  'Tracking (34.2): pessoa que converteu. E-mail, telefone e nome só em hash SHA-256 (padrão do Meta), cifrados no navegador. Primeira origem nunca muda; última acompanha a conversão mais recente.';
create index tracking_leads_client_time_idx on public.tracking_leads (client_id, last_converted_at desc);
create index tracking_leads_em_idx on public.tracking_leads (container_id, em_hash) where em_hash is not null;
create index tracking_leads_ph_idx on public.tracking_leads (container_id, ph_hash) where ph_hash is not null;
create index tracking_leads_first_touch_idx on public.tracking_leads (first_touch_id);
create index tracking_leads_last_touch_idx on public.tracking_leads (last_touch_id);

alter table public.tracking_visitors add column lead_id bigint references public.tracking_leads (id);
create index tracking_visitors_lead_idx on public.tracking_visitors (lead_id) where lead_id is not null;

create table public.tracking_purchases (
  id              bigint generated always as identity primary key,
  container_id    uuid not null references public.tracking_containers (id),
  client_id       uuid not null references public.clients (id),
  event_id        text not null,
  transaction_id  text check (transaction_id ~ '^[A-Za-z0-9_.:/#-]{1,100}$'),
  lead_id         bigint references public.tracking_leads (id),
  visitor_id      text not null,
  session_id      text not null,
  occurred_at     timestamptz not null,
  value_micros    bigint not null check (value_micros >= 0),
  currency        text not null check (currency ~ '^[A-Z]{3}$'),
  first_touch_id  bigint references public.tracking_touchpoints (id),
  last_touch_id   bigint references public.tracking_touchpoints (id),
  test            boolean not null default false,
  created_at      timestamptz not null default now(),
  unique (container_id, event_id)
);
comment on table public.tracking_purchases is
  'Tracking (34.2): compras vindas do site. transaction_id (nº do pedido) não se repete por site. Guarda a primeira e a última origem do momento da compra.';
create unique index tracking_purchases_transaction_key on public.tracking_purchases (container_id, transaction_id) where transaction_id is not null;
create index tracking_purchases_client_time_idx on public.tracking_purchases (client_id, occurred_at desc);
create index tracking_purchases_lead_idx on public.tracking_purchases (lead_id);
create index tracking_purchases_first_touch_idx on public.tracking_purchases (first_touch_id);
create index tracking_purchases_last_touch_idx on public.tracking_purchases (last_touch_id);

-- Jornada: eventos de um visitante em ordem.
create index tracking_events_visitor_idx on public.tracking_events (container_id, visitor_id, occurred_at);

-- -----------------------------------------------------------------------------
-- Ingestão (substitui a da 34.1; mesmo contrato, com user/compra a mais)
-- -----------------------------------------------------------------------------
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

  -- 1) Visitante
  insert into public.tracking_visitors as v (container_id, visitor_id, client_id, first_seen_at, last_seen_at, consent_status, consent_version, consent_at)
  values (v_container, v_visitor, v_client, v_at, v_at, coalesce(p ->> 'consent_status', 'nao_exigido'),
          p ->> 'consent_version', case when p ->> 'consent_status' = 'concedido' then v_at end)
  on conflict (container_id, visitor_id) do update
    set last_seen_at = greatest(v.last_seen_at, excluded.last_seen_at),
        first_seen_at = least(v.first_seen_at, excluded.first_seen_at),
        consent_status = case when excluded.consent_status = 'concedido' then 'concedido' else v.consent_status end,
        consent_version = coalesce(excluded.consent_version, v.consent_version),
        consent_at = coalesce(v.consent_at, excluded.consent_at);

  -- 2) Evento (idempotente pelo event_id)
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

  -- 3) Compra: o mesmo nº de pedido não entra duas vezes (o evento repetido é desfeito)
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

  -- 4) Origem (touchpoint)
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

  -- 5) Sessão
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

  -- 6) Lead: conversão ou dado de contato (em hash) → acha ou cria o lead
  if v_is_conv or v_em is not null or v_ph is not null then
    select v.first_touch_id, v.last_touch_id, v.lead_id into v_ft, v_lt, v_lead
      from public.tracking_visitors v where v.container_id = v_container and v.visitor_id = v_visitor;
    -- O mesmo e-mail/telefone em outro aparelho é a mesma pessoa.
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
  end if;

  if v_purchase is not null then
    -- Primeira origem da PESSOA (pode ter vindo por outro aparelho); última = a deste aparelho.
    update public.tracking_purchases
       set lead_id = v_lead,
           first_touch_id = coalesce((select l.first_touch_id from public.tracking_leads l where l.id = v_lead), v_ft),
           last_touch_id = v_lt
     where id = v_purchase;
  end if;

  return jsonb_build_object('status', 'ok', 'touchpoint_id', v_touch_id, 'lead_id', v_lead, 'purchase_id', v_purchase);
end;
$$;
revoke all on function private.tracking_ingest(jsonb) from public, anon, authenticated;
grant execute on function private.tracking_ingest(jsonb) to service_role;

-- -----------------------------------------------------------------------------
-- Acesso (RLS): mesma regra da 34.1. Ninguém grava pela tela.
-- -----------------------------------------------------------------------------
alter table public.tracking_leads enable row level security;
alter table public.tracking_purchases enable row level security;
revoke all on public.tracking_leads, public.tracking_purchases from anon, authenticated;
grant select on public.tracking_leads, public.tracking_purchases to authenticated;
create policy "Equipe vê leads dos clientes liberados" on public.tracking_leads for select to authenticated
  using (client_id in (select private.visible_client_ids()) and (select private.current_user_role()) <> 'cliente');
create policy "Equipe vê compras dos clientes liberados" on public.tracking_purchases for select to authenticated
  using (client_id in (select private.visible_client_ids()) and (select private.current_user_role()) <> 'cliente');

-- -----------------------------------------------------------------------------
-- Telas
-- -----------------------------------------------------------------------------

/**
 * Conversões do período por site. Linhas com currency nula trazem as contagens
 * de conversões; linhas com moeda trazem compras e receita daquela moeda
 * (moedas nunca somadas entre si).
 */
create function public.tracking_conversions_summary(p_from timestamptz, p_to timestamptz)
returns table (container_id uuid, currency text, leads bigint, conversions bigint, purchases bigint, revenue_micros numeric)
language sql
stable
security invoker
set search_path = ''
as $$
  select e.container_id, null::text,
         count(*) filter (where e.event_name = 'Lead'), count(*), 0::bigint, 0::numeric
    from public.tracking_events e
   where e.occurred_at >= p_from and e.occurred_at < p_to
     and e.event_name in ('Lead', 'CompleteRegistration', 'SubmitApplication', 'Schedule', 'Purchase')
   group by e.container_id
  union all
  select pu.container_id, pu.currency, 0::bigint, 0::bigint, count(*), sum(pu.value_micros)::numeric
    from public.tracking_purchases pu
   where pu.occurred_at >= p_from and pu.occurred_at < p_to
   group by pu.container_id, pu.currency
$$;
revoke all on function public.tracking_conversions_summary(timestamptz, timestamptz) from public, anon;
grant execute on function public.tracking_conversions_summary(timestamptz, timestamptz) to authenticated, service_role;

/** Jornada de um lead: todas as origens, eventos e compras de todos os aparelhos dele, em ordem. */
create function public.tracking_lead_journey(p_lead_id bigint)
returns table (kind text, occurred_at timestamptz, name text, channel text, paid boolean, evidence text, reason text,
               campaign text, page_path text, value_micros bigint, currency text, transaction_id text, visitor_id text, test boolean)
language sql
stable
security invoker
set search_path = ''
as $$
  with lead as (select l.id, l.container_id from public.tracking_leads l where l.id = p_lead_id),
  vis as (select v.container_id, v.visitor_id from public.tracking_visitors v join lead on v.lead_id = lead.id and v.container_id = lead.container_id)
  select * from (
    select 'origem'::text, t.occurred_at, null::text, t.channel, t.paid, t.evidence, t.reason,
           coalesce(t.utm_campaign, case when t.ad_campaign_id is not null then 'ID ' || t.ad_campaign_id end), null::text,
           null::bigint, null::text, null::text, t.visitor_id, false
      from public.tracking_touchpoints t join vis on vis.container_id = t.container_id and vis.visitor_id = t.visitor_id
    union all
    select 'evento', e.occurred_at, e.event_name, null, null, null, null, null, e.page_path, null, null, null, e.visitor_id, e.test
      from public.tracking_events e join vis on vis.container_id = e.container_id and vis.visitor_id = e.visitor_id
     where e.event_name <> 'Purchase'
    union all
    select 'compra', pu.occurred_at, 'Purchase', null, null, null, null, null, null, pu.value_micros, pu.currency, pu.transaction_id, pu.visitor_id, pu.test
      from public.tracking_purchases pu join lead on pu.lead_id = lead.id
  ) j
  order by 2, 1 desc
  limit 500
$$;
revoke all on function public.tracking_lead_journey(bigint) from public, anon;
grant execute on function public.tracking_lead_journey(bigint) to authenticated, service_role;
