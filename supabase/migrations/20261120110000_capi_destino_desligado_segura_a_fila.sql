-- Envio ao Meta: destino DESLIGADO segura a fila.
-- Antes: eventos que já estavam na fila continuavam saindo para o Meta depois que a pessoa desligava o envio.
-- Agora: o envio só pega eventos de destino ligado. Os eventos ficam guardados (nada é apagado) e saem se o destino for religado
-- dentro do limite de 7 dias (a regra de descartar eventos com mais de 7 dias continua).
create or replace function public.tracking_capi_claim(p_limit integer default 500)
returns table(id bigint, destination_id uuid, client_id uuid, pixel_id text, test_event_code text, event_id text, event_name text,
              occurred_at timestamp with time zone, visitor_id text, page_url text, custom_data jsonb, user_agent text, ip_address text,
              fbp text, fbc text, test boolean, attempts integer, em_hash text, ph_hash text, fn_hash text, ln_hash text,
              action_source text, ctwa_clid text, waba_id text)
language plpgsql
security definer
set search_path = ''
as $function$
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
       and exists (select 1 from public.tracking_destinations dd where dd.id = q.destination_id and dd.enabled)
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
$function$;
revoke all on function public.tracking_capi_claim(integer) from public, anon, authenticated;
grant execute on function public.tracking_capi_claim(integer) to service_role;
