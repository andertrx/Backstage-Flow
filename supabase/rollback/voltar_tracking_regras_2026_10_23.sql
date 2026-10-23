-- Volta da fase "Tracking T2 — regras sem Tag Manager" (23/10/2026).
-- Devolve a fila do Meta como era e desliga as regras. As tabelas de regras e versões
-- ficam guardadas (nada é apagado); só deixam de ser usadas pelo script do site.

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

-- O script do site para de receber regras (o servidor devolve "sem regras").
update public.tracking_containers set rules_version = null where rules_version is not null;
revoke execute on function public.tracking_rules_publish(uuid) from authenticated;
revoke execute on function public.tracking_rules_restore(uuid, integer) from authenticated;
revoke insert, update on public.tracking_rules from authenticated;
