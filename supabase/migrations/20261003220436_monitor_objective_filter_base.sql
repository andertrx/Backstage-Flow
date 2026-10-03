-- Filtro de objetivo do Monitoramento (parte 1): grupos de objetivo, filtro salvo por pessoa e objetivo na lista de alertas.
-- Os nomes antigos do Meta entram no grupo equivalente; eventos personalizados (ex.: EndForm) seguem o objetivo da campanha.
-- A mesma regra existe em packages/shared/src/monitoring/objectives.ts (mantenha as duas iguais).

create or replace function private.monitor_objective_group(p_objective text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case upper(btrim(coalesce(p_objective, '')))
    when 'OUTCOME_SALES' then 'vendas' when 'CONVERSIONS' then 'vendas' when 'PRODUCT_CATALOG_SALES' then 'vendas'
    when 'OUTCOME_LEADS' then 'leads' when 'LEAD_GENERATION' then 'leads'
    when 'OUTCOME_ENGAGEMENT' then 'engajamento' when 'MESSAGES' then 'engajamento' when 'POST_ENGAGEMENT' then 'engajamento'
    when 'PAGE_LIKES' then 'engajamento' when 'EVENT_RESPONSES' then 'engajamento' when 'VIDEO_VIEWS' then 'engajamento'
    when 'OUTCOME_TRAFFIC' then 'trafego' when 'LINK_CLICKS' then 'trafego'
    when 'OUTCOME_AWARENESS' then 'reconhecimento' when 'BRAND_AWARENESS' then 'reconhecimento' when 'REACH' then 'reconhecimento'
    when 'OUTCOME_APP_PROMOTION' then 'app' when 'APP_INSTALLS' then 'app'
    else 'outros' end
$$;
revoke all on function private.monitor_objective_group(text) from public, anon;
grant execute on function private.monitor_objective_group(text) to authenticated;

-- A campanha está nos objetivos escolhidos? (lista vazia = todos; alerta sem campanha só entra sem filtro)
create or replace function private.monitor_objective_ok(p_campaign uuid, p_objectives text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(cardinality(p_objectives), 0) = 0
      or exists (select 1 from public.campaigns c where c.id = p_campaign and private.monitor_objective_group(c.objective) = any (p_objectives))
$$;
revoke all on function private.monitor_objective_ok(uuid, text[]) from public, anon;
grant execute on function private.monitor_objective_ok(uuid, text[]) to authenticated;

-- Filtro salvo de cada pessoa (volta sozinho até ela mudar).
create table public.monitor_view_prefs (
  user_id uuid primary key references auth.users (id),
  objectives text[] not null default '{}' check (objectives <@ array['vendas', 'leads', 'engajamento', 'trafego', 'reconhecimento', 'app', 'outros']),
  updated_at timestamptz not null default now()
);
comment on table public.monitor_view_prefs is 'Filtro do Monitoramento salvo por pessoa (objetivos). Vazio = todos.';
alter table public.monitor_view_prefs enable row level security;
create policy monitor_view_prefs_select on public.monitor_view_prefs for select to authenticated using (user_id = (select auth.uid()));
revoke insert, update, delete on public.monitor_view_prefs from anon, authenticated;
grant select on public.monitor_view_prefs to authenticated;

create or replace function private.monitor_view_prefs_get_impl()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.monitor_can('view') then
    raise exception 'Sem permissão para ver o monitoramento' using errcode = '42501';
  end if;
  return jsonb_build_object('objectives', coalesce((select to_jsonb(p.objectives) from public.monitor_view_prefs p where p.user_id = (select auth.uid())), '[]'::jsonb));
end;
$$;

create or replace function private.monitor_view_prefs_save_impl(p_objectives text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v text[] := coalesce((select array_agg(distinct x order by x) from unnest(coalesce(p_objectives, '{}')) x), '{}');
begin
  if not private.monitor_can('view') then
    raise exception 'Sem permissão para ver o monitoramento' using errcode = '42501';
  end if;
  if not v <@ array['vendas', 'leads', 'engajamento', 'trafego', 'reconhecimento', 'app', 'outros'] then
    raise exception 'Objetivo inválido.' using errcode = '22023';
  end if;
  insert into public.monitor_view_prefs as t (user_id, objectives, updated_at) values ((select auth.uid()), v, now())
  on conflict (user_id) do update set objectives = excluded.objectives, updated_at = excluded.updated_at;
end;
$$;

revoke all on function private.monitor_view_prefs_get_impl() from public, anon;
grant execute on function private.monitor_view_prefs_get_impl() to authenticated;
revoke all on function private.monitor_view_prefs_save_impl(text[]) from public, anon;
grant execute on function private.monitor_view_prefs_save_impl(text[]) to authenticated;

create or replace function public.monitor_view_prefs_get() returns jsonb
language sql stable set search_path = '' as $$ select private.monitor_view_prefs_get_impl() $$;
create or replace function public.monitor_view_prefs_save(p_objectives text[]) returns void
language sql set search_path = '' as $$ select private.monitor_view_prefs_save_impl(p_objectives) $$;
revoke all on function public.monitor_view_prefs_get() from public, anon;
grant execute on function public.monitor_view_prefs_get() to authenticated;
revoke all on function public.monitor_view_prefs_save(text[]) from public, anon;
grant execute on function public.monitor_view_prefs_save(text[]) to authenticated;

-- Lista de alertas: passa a trazer o objetivo da campanha (o site filtra pelos objetivos escolhidos).
create or replace function private.monitor_alerts_json(p_open boolean, p_limit integer, p_id bigint)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(x.j order by x.open_first desc, x.rank, x.last_detected_at desc), '[]')
    from (
      select (a.resolved_at is null) as open_first, array_position(array['critico', 'atencao', 'informativo'], a.severity) as rank,
             a.last_detected_at,
             (to_jsonb(a) - 'dedupe_key') || jsonb_build_object(
               'client_name', cl.name, 'account_name', acc.name, 'campaign_name', cp.name, 'campaign_objective', cp.objective, 'ad_name', ad.name,
               'thumbnail_url', ad.thumbnail_url, 'assignee_name', pa.full_name, 'task_number', t.number, 'task_title', t.title) as j
        from public.monitor_alerts a
        join public.clients cl on cl.id = a.client_id
        join public.ad_accounts acc on acc.id = a.ad_account_id
        left join public.campaigns cp on cp.id = a.campaign_id
        left join public.ads ad on ad.id = a.ad_id
        left join public.profiles pa on pa.id = a.assigned_to
        left join public.ops_tasks t on t.id = a.task_id
       where private.can_view_client(a.client_id)
         and (p_id is null or a.id = p_id)
         and (p_id is not null or not coalesce(p_open, true) or a.resolved_at is null)
       order by (a.resolved_at is null) desc, array_position(array['critico', 'atencao', 'informativo'], a.severity), a.last_detected_at desc
       limit p_limit
    ) x
$$;
