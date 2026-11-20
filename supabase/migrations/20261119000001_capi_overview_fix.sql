-- Fix: tracking_capi_overview contadores de erro e descarte (24h)
-- 1. Adiciona colunas de timestamp para erro e descarte
alter table public.tracking_capi_queue
  add column if not exists last_error_at timestamptz,
  add column if not exists discarded_at timestamptz;

comment on column public.tracking_capi_queue.last_error_at is 'Última vez que o evento entrou em status erro.';
comment on column public.tracking_capi_queue.discarded_at is 'Momento em que o evento foi descartado.';

-- 2. Atualiza tracking_capi_finish para preencher os timestamps
create or replace function public.tracking_capi_finish(p_results jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.tracking_capi_queue q
     set status = case
           when (r ->> 'ok')::boolean then 'enviado'
           when (r.value ->> 'authProblem')::boolean then 'descartado'
           when q.attempts >= 6 then 'descartado'
           else 'erro'
         end,
         sent_at = case when (r ->> 'ok')::boolean then now() else q.sent_at end,
         last_error = case when (r ->> 'ok')::boolean then null else left(r ->> 'error', 500) end,
         last_error_at = case when (r ->> 'ok')::boolean then null when (r.value ->> 'authProblem')::boolean then null else now() end,
         discarded_at = case when (r ->> 'ok')::boolean then null when (r.value ->> 'authProblem')::boolean then now() when q.attempts >= 6 then now() else q.discarded_at end,
         next_attempt_at = now() + case q.attempts when 1 then interval '1 minute' when 2 then interval '5 minutes'
                                   when 3 then interval '30 minutes' when 4 then interval '2 hours' else interval '6 hours' end,
         locked_until = null,
         ip_address = case when (r ->> 'ok')::boolean or q.attempts >= 6 then null else q.ip_address end,
         user_agent = case when (r ->> 'ok')::boolean or q.attempts >= 6 then null else q.user_agent end
    from jsonb_array_elements(p_results) r
   where q.id = (r ->> 'id')::bigint and q.status = 'enviando'
$$;

-- 3. Também marca discarded_at no claim quando o evento tem mais de 7 dias
-- (a função tracking_capi_claim já descarta, mas não marcava discarded_at)
create or replace function public.tracking_capi_claim(p_limit integer)
returns setof public.tracking_capi_queue
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Mais de 7 dias: descarta e marca discarded_at
  update public.tracking_capi_queue q
     set status = 'descartado',
         last_error = 'Evento com mais de 7 dias: o Meta não aceita mais.',
         discarded_at = now(),
         ip_address = null, user_agent = null
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
         l.em_hash, l.ph_hash, l.fn_hash, l.ln_hash
    from claimed c
    join public.tracking_destinations d on d.id = c.destination_id
    left join public.tracking_leads l on l.id = c.lead_id;
end;
$$;

-- 4. Corrige overview: errors_24h filtra por last_error_at, discarded_24h por discarded_at
create or replace function public.tracking_capi_overview()
returns table (destination_id uuid, pending bigint, sent_24h bigint, errors_24h bigint, discarded_24h bigint, last_sent_at timestamptz)
language sql
stable
security invoker
set search_path = ''
as $$
  select d.id,
         (select count(*) from public.tracking_capi_queue q where q.destination_id = d.id and q.status in ('pendente', 'enviando', 'erro')),
         (select count(*) from public.tracking_capi_queue q where q.destination_id = d.id and q.status = 'enviado' and q.sent_at > now() - interval '24 hours'),
         (select count(*) from public.tracking_capi_queue q where q.destination_id = d.id and q.status = 'erro' and q.last_error_at > now() - interval '24 hours'),
         (select count(*) from public.tracking_capi_queue q where q.destination_id = d.id and q.status = 'descartado' and q.discarded_at > now() - interval '24 hours'),
         (select max(q.sent_at) from public.tracking_capi_queue q where q.destination_id = d.id)
  from public.tracking_destinations d
$$;
