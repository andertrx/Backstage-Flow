-- Etapa 48.1 — Comercial: histórico do lead sempre do mais recente para o mais antigo (o horário informado em "Quando" vem
-- sem segundos e ficava abaixo dos eventos do sistema do mesmo minuto) e cartão com o ÚLTIMO CONTATO registrado.
create or replace function private.ops_lead_board_impl(f jsonb)
returns jsonb language sql stable security definer set search_path = '' as $$
  with today as (select (now() at time zone 'America/Sao_Paulo')::date as d)
  select case when not private.ops_can('ops.commercial') then null else jsonb_build_object(
    'leads', (select coalesce(jsonb_agg(jsonb_build_object(
                'id', l.id, 'number', l.number, 'company_name', l.company_name, 'contact_name', l.contact_name, 'segment', l.segment,
                'owner_id', l.owner_id, 'owner_name', po.full_name, 'entered_at', l.entered_at, 'last_interaction_at', l.last_interaction_at,
                'next_action', l.next_action, 'next_action_date', l.next_action_date, 'priority', l.priority, 'potential_value', l.potential_value,
                'currency', l.currency, 'origin', l.origin, 'stage_id', l.stage_id, 'version', l.version, 'client_id', l.client_id,
                'archived_at', l.archived_at, 'loss_reason', lr.name,
                'last_contact', (select jsonb_build_object('kind', e.kind, 'body', left(e.body, 140), 'at', coalesce(e.happened_at, e.created_at))
                                   from public.ops_lead_events e where e.lead_id = l.id and e.action = 'lead.interacao'
                                  order by date_trunc('minute', coalesce(e.happened_at, e.created_at)) desc, e.created_at desc, e.id desc limit 1),
                'overdue', s.category = 'aberto' and l.next_action_date < (select d from today)) order by l.next_action_date nulls last, l.number desc), '[]')
                from public.ops_leads l
                join public.ops_lead_stages s on s.id = l.stage_id
                left join public.profiles po on po.id = l.owner_id
                left join public.ops_loss_reasons lr on lr.id = l.loss_reason_id
               where (case when coalesce((f ->> 'archived')::boolean, false) then l.archived_at is not null else l.archived_at is null end)
                 and (nullif(f ->> 'q', '') is null or private.search_norm(l.company_name) like '%' || private.search_norm(f ->> 'q') || '%'
                      or private.search_norm(l.contact_name) like '%' || private.search_norm(f ->> 'q') || '%'
                      or private.search_norm(l.segment) like '%' || private.search_norm(f ->> 'q') || '%'
                      or l.number::text = ltrim(f ->> 'q', '#'))
                 and (nullif(f ->> 'owner_id', '') is null or (f ->> 'owner_id' = 'nenhum' and l.owner_id is null) or l.owner_id::text = f ->> 'owner_id')
                 and (nullif(f ->> 'origin', '') is null or l.origin = f ->> 'origin')
                 and (nullif(f ->> 'priority', '') is null or l.priority = f ->> 'priority')
                 and (not coalesce((f ->> 'overdue')::boolean, false) or (s.category = 'aberto' and l.next_action_date < (select d from today)))),
    'origins', (select coalesce(jsonb_agg(distinct l.origin), '[]') from public.ops_leads l where l.origin is not null),
    'can', jsonb_build_object('create_client', private.current_user_role() in ('admin', 'gestor'), 'onboarding', private.ops_can_manage_clients()))
  end
$$;

create or replace function private.ops_lead_get_impl(p_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select case when not private.ops_can('ops.commercial') then null else (
    select jsonb_build_object(
      'lead', to_jsonb(l) || jsonb_build_object('owner_name', po.full_name, 'stage_name', s.name, 'stage_color', s.color, 'category', s.category,
                                                'loss_reason', lr.name, 'client_name', c.name, 'converted_by_name', pc.full_name,
                                                'created_by_name', pcr.full_name,
                                                'overdue', s.category = 'aberto' and l.next_action_date < (now() at time zone 'America/Sao_Paulo')::date),
      'events', (select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'action', e.action, 'kind', e.kind, 'body', e.body, 'happened_at', e.happened_at,
                   'actor', pe.full_name, 'origin', e.origin, 'before', e.before, 'after', e.after, 'created_at', e.created_at)
                   order by date_trunc('minute', coalesce(e.happened_at, e.created_at)) desc, e.created_at desc, e.id desc), '[]')
                   from public.ops_lead_events e left join public.profiles pe on pe.id = e.actor_id where e.lead_id = l.id),
      'can', jsonb_build_object('create_client', private.current_user_role() in ('admin', 'gestor'), 'onboarding', private.ops_can_manage_clients(),
                                'client_ops', l.client_id is not null and private.ops_client_visible(l.client_id)))
      from public.ops_leads l
      join public.ops_lead_stages s on s.id = l.stage_id
      left join public.profiles po on po.id = l.owner_id
      left join public.ops_loss_reasons lr on lr.id = l.loss_reason_id
      left join public.clients c on c.id = l.client_id
      left join public.profiles pc on pc.id = l.converted_by
      left join public.profiles pcr on pcr.id = l.created_by
     where l.id = p_id) end
$$;
