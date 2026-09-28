-- =============================================================================
-- Etapa 36.7: painel operacional (indicadores reais), visões salvas, busca da
-- Central e resumo pessoal (sino + atalho no dashboard geral). Tudo calculado
-- só sobre o que a pessoa pode ver; nada é inventado.
-- Remoção: supabase/rollback/remover_central_operacoes.sql
-- =============================================================================

create table public.ops_saved_views (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  page        text not null check (page in ('tarefas', 'comercial', 'reunioes', 'painel')),
  name        text not null check (char_length(btrim(name)) between 1 and 60),
  filters     jsonb not null default '{}' check (jsonb_typeof(filters) = 'object' and pg_column_size(filters) <= 4000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, page, name)
);
comment on table public.ops_saved_views is 'Etapa 36: filtros salvos por pessoa (visões salvas). São preferências, não histórico.';
alter table public.ops_saved_views enable row level security;
revoke all on public.ops_saved_views from anon, authenticated;
grant select on public.ops_saved_views to authenticated;
create policy "Cada pessoa vê as próprias visões" on public.ops_saved_views for select to authenticated using (user_id = (select auth.uid()));

create function private.ops_saved_view_save_impl(p_page text, p_name text, p_filters jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  perform private.ops_need('ops.access');
  if p_page is null or p_page not in ('tarefas', 'comercial', 'reunioes', 'painel') then raise exception 'Tela inválida.' using errcode = '22023'; end if;
  if char_length(btrim(coalesce(p_name, ''))) not between 1 and 60 then raise exception 'Dê um nome à visão (até 60 letras).' using errcode = '22023'; end if;
  if jsonb_typeof(coalesce(p_filters, '{}')) <> 'object' then raise exception 'Filtros inválidos.' using errcode = '22023'; end if;
  if (select count(*) from public.ops_saved_views where user_id = (select auth.uid()) and page = p_page and name <> btrim(p_name)) >= 30 then
    raise exception 'No máximo 30 visões por tela.' using errcode = '22023';
  end if;
  insert into public.ops_saved_views (user_id, page, name, filters)
  values ((select auth.uid()), p_page, btrim(p_name), coalesce(p_filters, '{}'))
  on conflict (user_id, page, name) do update set filters = excluded.filters, updated_at = now()
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function private.ops_saved_view_save_impl(text, text, jsonb) from public, anon;
grant execute on function private.ops_saved_view_save_impl(text, text, jsonb) to authenticated;
create function public.ops_saved_view_save(p_page text, p_name text, p_filters jsonb)
returns uuid language sql set search_path = '' as $$ select private.ops_saved_view_save_impl(p_page, p_name, p_filters) $$;
revoke all on function public.ops_saved_view_save(text, text, jsonb) from public, anon;
grant execute on function public.ops_saved_view_save(text, text, jsonb) to authenticated;

-- Apagar uma visão salva (preferência da própria pessoa; não é histórico).
create function private.ops_saved_view_delete_impl(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.ops_need('ops.access');
  delete from public.ops_saved_views where id = p_id and user_id = (select auth.uid());
  if not found then raise exception 'Visão não encontrada.' using errcode = '22023'; end if;
end;
$$;
revoke all on function private.ops_saved_view_delete_impl(uuid) from public, anon;
grant execute on function private.ops_saved_view_delete_impl(uuid) to authenticated;
create function public.ops_saved_view_delete(p_id uuid)
returns void language sql set search_path = '' as $$ select private.ops_saved_view_delete_impl(p_id) $$;
revoke all on function public.ops_saved_view_delete(uuid) from public, anon;
grant execute on function public.ops_saved_view_delete(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Resumo pessoal (uma consulta só): sino + atalho no dashboard geral.
-- -----------------------------------------------------------------------------
create function private.ops_my_summary_impl()
returns jsonb language sql stable security definer set search_path = '' as $$
  with me as (select (select auth.uid()) as id, (now() at time zone 'America/Sao_Paulo')::date as today),
  mine as (
    select distinct t.id, t.due_date from public.ops_tasks t
      join public.ops_statuses s on s.id = t.status_id
      join public.ops_task_people p on p.task_id = t.id and p.role in ('principal', 'adicional'), me
     where p.user_id = me.id and t.archived_at is null and s.category not in ('concluido', 'cancelado')
  )
  select case when not private.ops_can('ops.access') then null else jsonb_build_object(
    'unread', (select count(*) from public.ops_notifications, me where user_id = me.id and read_at is null),
    'abertas', (select count(*) from mine),
    'atrasadas', (select count(*) from mine, me where due_date < me.today),
    'hoje', (select count(*) from mine, me where due_date = me.today),
    'reunioes_hoje', (select count(*) from public.ops_meetings m, me
                       where m.status = 'agendada' and (m.starts_at at time zone 'America/Sao_Paulo')::date = me.today
                         and (m.organizer_id = me.id or exists (select 1 from public.ops_meeting_people x where x.meeting_id = m.id and x.user_id = me.id)))) end
$$;
revoke all on function private.ops_my_summary_impl() from public, anon;
grant execute on function private.ops_my_summary_impl() to authenticated;
create function public.ops_my_summary()
returns jsonb language sql stable set search_path = '' as $$ select private.ops_my_summary_impl() $$;
revoke all on function public.ops_my_summary() from public, anon;
grant execute on function public.ops_my_summary() to authenticated;

-- -----------------------------------------------------------------------------
-- Painel operacional. f: {sector_id, client_id, person_id, from, to}
-- (from/to = período das concluídas, datas de Brasília). Só tarefas visíveis.
-- -----------------------------------------------------------------------------
create function private.ops_dashboard_impl(f jsonb)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_from date := coalesce(nullif(f ->> 'from', '')::date, v_today - 29);
  v_to date := coalesce(nullif(f ->> 'to', '')::date, v_today);
  v_out jsonb;
begin
  if not private.ops_can('ops.dashboard.view') then return null; end if;
  with d0 as materialized (
  select t.id, t.number, t.title, t.sector_id, t.status_id, s.category, t.due_date, t.created_at, t.completed_at,
         greatest(t.updated_at, coalesce((select max(a.created_at) from public.ops_activity a where a.task_id = t.id), t.updated_at)) as last_move,
         private.ops_task_blockers(t.id) as blockers,
         (select p.user_id from public.ops_task_people p where p.task_id = t.id and p.role = 'principal' limit 1) as principal
    from public.ops_tasks t join public.ops_statuses s on s.id = t.status_id
   where t.archived_at is null
     and (nullif(f ->> 'sector_id', '') is null or t.sector_id::text = f ->> 'sector_id')
     and (nullif(f ->> 'client_id', '') is null or t.client_id::text = f ->> 'client_id')
     and (nullif(f ->> 'person_id', '') is null or exists (select 1 from public.ops_task_people p where p.task_id = t.id and p.user_id::text = f ->> 'person_id'))
     and private.ops_task_visible(t.id)
  )
  select jsonb_build_object(
    'today', v_today, 'from', v_from, 'to', v_to,
    'cards', (select jsonb_build_object(
        'abertas', count(*) filter (where category not in ('concluido', 'cancelado')),
        'andamento', count(*) filter (where category = 'andamento'),
        'atrasadas', count(*) filter (where category not in ('concluido', 'cancelado') and due_date < v_today),
        'vencem_hoje', count(*) filter (where category not in ('concluido', 'cancelado') and due_date = v_today),
        'vencem_7d', count(*) filter (where category not in ('concluido', 'cancelado') and due_date > v_today and due_date <= v_today + 7),
        'bloqueadas', count(*) filter (where category not in ('concluido', 'cancelado') and (category = 'bloqueado' or blockers > 0)),
        'aguardando_cliente', count(*) filter (where category = 'aguardando_cliente'),
        'sem_responsavel', count(*) filter (where category not in ('concluido', 'cancelado') and principal is null),
        'paradas', count(*) filter (where category not in ('concluido', 'cancelado') and last_move < now() - interval '7 days'),
        'concluidas', count(*) filter (where category = 'concluido' and (completed_at at time zone 'America/Sao_Paulo')::date between v_from and v_to),
        'media_dias', round((avg(extract(epoch from completed_at - created_at) / 86400)
                       filter (where category = 'concluido' and (completed_at at time zone 'America/Sao_Paulo')::date between v_from and v_to))::numeric, 1))
      from d0),
    'by_sector', (select coalesce(jsonb_agg(x order by x ->> 'name'), '[]') from (
        select jsonb_build_object('sector_id', se.id, 'name', se.name, 'color', se.color,
          'abertas', count(*) filter (where d.category not in ('concluido', 'cancelado')),
          'atrasadas', count(*) filter (where d.category not in ('concluido', 'cancelado') and d.due_date < v_today),
          'bloqueadas', count(*) filter (where d.category not in ('concluido', 'cancelado') and (d.category = 'bloqueado' or d.blockers > 0)),
          'concluidas', count(*) filter (where d.category = 'concluido' and (d.completed_at at time zone 'America/Sao_Paulo')::date between v_from and v_to)) as x
          from d0 d join public.ops_sectors se on se.id = d.sector_id group by se.id, se.name, se.color) y),
    'by_status', (select coalesce(jsonb_agg(jsonb_build_object('status_id', st.id, 'name', st.name, 'color', st.color, 'n', c.n) order by st.position), '[]')
        from (select status_id, count(*) n from d0 where category not in ('concluido', 'cancelado') group by status_id) c
        join public.ops_statuses st on st.id = c.status_id),
    'by_person', (select coalesce(jsonb_agg(x), '[]') from (
        select jsonb_build_object('user_id', d.principal, 'name', pp.full_name,
          'abertas', count(*), 'atrasadas', count(*) filter (where d.due_date < v_today)) as x
          from d0 d join public.profiles pp on pp.id = d.principal
         where d.category not in ('concluido', 'cancelado')
         group by d.principal, pp.full_name
         order by count(*) filter (where d.due_date < v_today) desc, count(*) desc, pp.full_name limit 15) y),
    'stalled', (select coalesce(jsonb_agg(x), '[]') from (
        select jsonb_build_object('id', id, 'number', number, 'title', title, 'dias', (now()::date - last_move::date)) as x
          from d0 where category not in ('concluido', 'cancelado') and last_move < now() - interval '7 days'
         order by last_move limit 10) y),
    'blocked', (select coalesce(jsonb_agg(x), '[]') from (
        select jsonb_build_object('id', id, 'number', number, 'title', title, 'dependencias', blockers) as x
          from d0 where category not in ('concluido', 'cancelado') and (category = 'bloqueado' or blockers > 0)
         order by due_date nulls last limit 10) y),
    'clients_waiting', case when private.ops_can('ops.clients.view') or private.ops_can('ops.am') or exists (select 1 from public.ops_client_ops o where o.am_user_id = (select auth.uid())) then
        (select coalesce(jsonb_agg(x), '[]') from (
          select jsonb_build_object('client_id', o.client_id, 'name', c.name, 'stage', st.name, 'dias', (now()::date - o.stage_since::date)) as x
            from public.ops_client_ops o join public.clients c on c.id = o.client_id join public.ops_client_stages st on st.id = o.stage_id
           where private.ops_client_visible(o.client_id) and o.stage_since < now() - interval '14 days'
             and st.position < (select max(position) from public.ops_client_stages where active)
             and (nullif(f ->> 'client_id', '') is null or o.client_id::text = f ->> 'client_id')
           order by o.stage_since limit 10) y) end,
    'meeting_pending', (select count(*) from public.ops_meeting_items i join public.ops_meetings m on m.id = i.meeting_id
                         where i.removed_at is null and i.task_id is null and i.kind in ('pendencia', 'bloqueio') and m.status <> 'cancelada'
                           and private.ops_meeting_visible(m.id)),
    'meetings_today', (select count(*) from public.ops_meetings m where m.status = 'agendada'
                         and (m.starts_at at time zone 'America/Sao_Paulo')::date = v_today and private.ops_meeting_visible(m.id)),
    'leads_overdue', case when private.ops_can('ops.commercial') then
        (select count(*) from public.ops_leads l join public.ops_lead_stages s on s.id = l.stage_id
          where l.archived_at is null and s.category = 'aberto' and l.next_action_date < v_today) end
  ) into v_out;
  return v_out;
end;
$$;
revoke all on function private.ops_dashboard_impl(jsonb) from public, anon;
grant execute on function private.ops_dashboard_impl(jsonb) to authenticated;
create function public.ops_dashboard(f jsonb default '{}')
returns jsonb language sql stable set search_path = '' as $$ select private.ops_dashboard_impl(f) $$;
revoke all on function public.ops_dashboard(jsonb) from public, anon;
grant execute on function public.ops_dashboard(jsonb) to authenticated;

-- -----------------------------------------------------------------------------
-- Busca da Central: tarefas, reuniões, clientes no fluxo e leads que a pessoa vê.
-- -----------------------------------------------------------------------------
create function private.ops_search_impl(p_q text)
returns jsonb language sql stable security definer set search_path = '' as $$
  with q as (select private.search_norm(btrim(coalesce(p_q, ''))) as n, ltrim(btrim(coalesce(p_q, '')), '#') as num)
  select case when not private.ops_can('ops.access') or char_length((select n from q)) < 2 then '[]'::jsonb else (
    select coalesce(jsonb_agg(r), '[]') from (
      (select jsonb_build_object('kind', 'tarefa', 'id', t.id, 'title', '#' || t.number || ' ' || t.title,
                                 'detail', s.name || coalesce(' · ' || c.name, ''), 'link', '/operacoes/tarefas?tarefa=' || t.id) as r
         from public.ops_tasks t join public.ops_statuses s on s.id = t.status_id left join public.clients c on c.id = t.client_id, q
        where t.archived_at is null and (strpos(private.search_norm(t.title), q.n) > 0 or t.number::text = q.num)
          and private.ops_task_visible(t.id)
        order by t.number desc limit 8)
      union all
      (select jsonb_build_object('kind', 'reuniao', 'id', m.id, 'title', '#' || m.number || ' ' || m.title,
                                 'detail', to_char(m.starts_at at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI'), 'link', '/operacoes/reunioes?reuniao=' || m.id)
         from public.ops_meetings m, q
        where (strpos(private.search_norm(m.title), q.n) > 0 or m.number::text = q.num) and private.ops_meeting_visible(m.id)
        order by m.starts_at desc limit 5)
      union all
      (select jsonb_build_object('kind', 'cliente', 'id', c.id, 'title', c.name, 'detail', st.name, 'link', '/operacoes/clientes?cliente=' || c.id)
         from public.ops_client_ops o join public.clients c on c.id = o.client_id join public.ops_client_stages st on st.id = o.stage_id, q
        where strpos(private.search_norm(c.name), q.n) > 0 and private.ops_client_visible(c.id)
        order by c.name limit 5)
      union all
      (select jsonb_build_object('kind', 'lead', 'id', l.id, 'title', '#' || l.number || ' ' || l.company_name, 'detail', s.name,
                                 'link', '/operacoes/comercial?lead=' || l.id)
         from public.ops_leads l join public.ops_lead_stages s on s.id = l.stage_id, q
        where private.ops_can('ops.commercial') and l.archived_at is null
          and (strpos(private.search_norm(l.company_name), q.n) > 0 or l.number::text = q.num)
        order by l.number desc limit 5)
    ) x) end
$$;
revoke all on function private.ops_search_impl(text) from public, anon;
grant execute on function private.ops_search_impl(text) to authenticated;
create function public.ops_search(p_q text)
returns jsonb language sql stable set search_path = '' as $$ select private.ops_search_impl(p_q) $$;
revoke all on function public.ops_search(text) from public, anon;
grant execute on function public.ops_search(text) to authenticated;
