-- Volta a T5.2b: remove os endereços de lead e as colunas novas. Os avisos de lead já registrados saem junto (não têm dado pessoal).
delete from public.tracking_sales_webhook_log where webhook_id in (select id from public.tracking_sales_webhooks where purpose = 'lead');
delete from public.tracking_sales_webhooks where purpose = 'lead';
drop function if exists public.lead_webhook_log(jsonb);
drop function if exists private.lead_webhook_log(jsonb);
drop function if exists public.lead_webhook_create(uuid, text, uuid);
drop function if exists private.lead_webhook_create_impl(uuid, text, uuid);
create or replace function private.sales_webhook_auth(p_id uuid, p_key text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', w.id, 'client_id', w.client_id, 'enabled', w.enabled, 'test_mode', w.test_mode, 'mapping', w.mapping,
                            'client_active', private.client_is_active(w.client_id))
    from public.tracking_sales_webhooks w
   where w.id = p_id and w.archived_at is null and w.key_hash = encode(extensions.digest(coalesce(p_key, ''), 'sha256'), 'hex')
$$;
alter table public.tracking_sales_webhooks drop constraint if exists tracking_sales_webhooks_lead_site;
alter table public.tracking_sales_webhooks drop column if exists container_id, drop column if exists purpose;
