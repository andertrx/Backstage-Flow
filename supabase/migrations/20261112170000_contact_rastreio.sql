-- T5.35 (etapa 3): ficha de rastreio do contato.
--
-- O tracker.ads mostra, para cada contato, de onde ele veio: canal de captura, plataforma do anúncio, método,
-- confiança, URL de origem, IDs do anúncio/campanha/conjunto e o clique do WhatsApp (ctwa_clid/waba_id).
-- O CRM já GRAVA tudo isso (tracking_touchpoints, tracking_whatsapp_conversations, tracking_capi_log) — o que
-- faltava era uma função de leitura que juntasse. Esta é ela: uma consulta só, sem dado pessoal.
--
-- Nada é gravado e nada novo é coletado do cliente: só leitura do que já existe.

create function private.contact_rastreio_impl(p_contact bigint)
returns table (
  origem         text,
  metodo         text,
  ref_code       text,
  criado_em      timestamptz,
  site           text,
  canal          text,
  evidence       text,
  motivo         text,
  pago           boolean,
  url_origem     text,
  referrer       text,
  utm_source     text,
  utm_medium     text,
  utm_campaign   text,
  utm_content    text,
  fbclid         text,
  gclid          text,
  ad_campaign_id text,
  ad_adset_id    text,
  ad_ad_id       text,
  campanha       text,
  conjunto       text,
  plataforma     text,
  ctwa_clid      text,
  waba_id        text,
  numero         text,
  meta_enviado   text[],
  capi_eventos   integer,
  capi_quando    timestamptz,
  capi_erro      text
)
language sql
stable
security definer
set search_path = ''
as $$
  with k as (
    select c.* from public.tracking_contacts c where c.id = p_contact
  ), tp as (
    select t.* from public.tracking_touchpoints t, k where t.id = k.touchpoint_id
  ), conv as (
    select w.* from public.tracking_whatsapp_conversations w, k
     where w.lead_id = k.lead_id
     order by w.last_message_at desc
     limit 1
  ), conn as (
    select c.* from public.tracking_whatsapp_connections c, conv where c.id = conv.connection_id
  ), capi as (
    select l.* from public.tracking_capi_log l
      join public.tracking_destinations d on d.id = l.destination_id
      join k on k.container_id = d.container_id
     order by l.requested_at desc
     limit 1
  )
  select
    k.origin,
    case
      when k.origin = 'site' then 'Clique no site'
      when k.origin = 'whatsapp' then
        case when conn.mode = 'nao_oficial' then 'WhatsApp (servidor próprio)' else 'WhatsApp (API oficial)' end
      when k.origin = 'manual' then 'Cadastro manual'
      else 'Sistema de vendas'
    end,
    k.ref_code,
    k.created_at,
    ct.name,
    tp.channel,
    tp.evidence,
    tp.reason,
    tp.paid,
    tp.landing_url,
    tp.referrer_host,
    tp.utm_source,
    tp.utm_medium,
    tp.utm_campaign,
    tp.utm_content,
    tp.fbclid,
    tp.gclid,
    tp.ad_campaign_id,
    tp.ad_adset_id,
    tp.ad_ad_id,
    cp.name,
    ag.name,
    pl.name,
    conv.ctwa_clid,
    conn.waba_id,
    coalesce(conn.display_phone, conn.phone_number_id),
    k.meta_sent,
    capi.events_count,
    capi.requested_at,
    capi.error_message
  from k
  left join tp on true
  left join public.tracking_containers ct on ct.id = k.container_id
  left join public.campaigns cp on cp.client_id = k.client_id and cp.external_id = tp.ad_campaign_id
  left join public.ad_groups ag on ag.client_id = k.client_id and ag.external_id = tp.ad_adset_id
  left join public.platforms pl on pl.id = cp.platform_id
  left join conv on true
  left join conn on true
  left join capi on true
  where k.client_id in (select private.contacts_client_ids())
$$;
revoke all on function private.contact_rastreio_impl(bigint) from public, anon, authenticated;
grant execute on function private.contact_rastreio_impl(bigint) to authenticated;

create function public.contact_rastreio(p_contact bigint)
returns table (
  origem         text,
  metodo         text,
  ref_code       text,
  criado_em      timestamptz,
  site           text,
  canal          text,
  evidence       text,
  motivo         text,
  pago           boolean,
  url_origem     text,
  referrer       text,
  utm_source     text,
  utm_medium     text,
  utm_campaign   text,
  utm_content    text,
  fbclid         text,
  gclid          text,
  ad_campaign_id text,
  ad_adset_id    text,
  ad_ad_id       text,
  campanha       text,
  conjunto       text,
  plataforma     text,
  ctwa_clid      text,
  waba_id        text,
  numero         text,
  meta_enviado   text[],
  capi_eventos   integer,
  capi_quando    timestamptz,
  capi_erro      text
)
language sql stable set search_path = '' as $$ select * from private.contact_rastreio_impl(p_contact) $$;
revoke all on function public.contact_rastreio(bigint) from public, anon;
grant execute on function public.contact_rastreio(bigint) to authenticated;

comment on function public.contact_rastreio(bigint) is
  'T5.35: ficha de rastreio de um contato (de onde veio: canal, método, confiança, anúncio, WhatsApp e CAPI). Só leitura.';
