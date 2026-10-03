-- Etapa 37.4 — Central de alertas (parte 3): virar tarefa, quem pode ser responsável, lista e detalhe com a linha do tempo.

-- Virar tarefa (só quando alguém clica): cria a tarefa na Central de Operações pelas regras dela
-- (permissão de criar tarefa, setor ativo; responsável diferente de mim exige permissão de atribuir).
create or replace function private.monitor_alert_to_task_impl(p_id bigint, p_sector_id uuid, p_due_date date, p_version integer)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.monitor_alerts;
  v_client text; v_account text; v_campaign text; v_ad text;
  v_title text; v_desc text; v_task uuid;
begin
  v := private.monitor_alert_lock(p_id, p_version);
  if v.task_id is not null then
    raise exception 'Este alerta já virou tarefa.' using errcode = '22023';
  end if;
  select cl.name, acc.name, cp.name, ad.name into v_client, v_account, v_campaign, v_ad
    from public.clients cl
    join public.ad_accounts acc on acc.id = v.ad_account_id
    left join public.campaigns cp on cp.id = v.campaign_id
    left join public.ads ad on ad.id = v.ad_id
   where cl.id = v.client_id;
  v_title := left('Alerta: ' || private.monitor_metric_label(v.metric) || ' — '
                  || coalesce(case when v.level = 'ad' then v_ad else v_campaign end, 'item'), 200);
  v_desc := v.explanation || E'\n\nCliente: ' || v_client || E'\nConta: ' || v_account
            || coalesce(E'\nCampanha: ' || v_campaign, '') || coalesce(E'\nAnúncio: ' || v_ad, '')
            || E'\nPeríodo: ' || to_char(v.period_from, 'DD/MM/YYYY') || ' a ' || to_char(v.period_to, 'DD/MM/YYYY')
            || E'\n\nCriada a partir do alerta de desempenho nº ' || v.id || ' (Monitoramento).';
  v_task := private.ops_task_save_impl(null, null, jsonb_build_object(
    'title', v_title, 'description', v_desc, 'client_id', v.client_id, 'sector_id', p_sector_id,
    'priority', case v.severity when 'critico' then 'alta' else 'media' end, 'due_date', p_due_date,
    'people', jsonb_build_object('principal', coalesce(v.assigned_to, (select auth.uid())))));
  update public.monitor_alerts
     set task_id = v_task, version = version + 1,
         status = case when status in ('novo', 'visualizado') then 'em_analise' else status end,
         status_changed_at = case when status in ('novo', 'visualizado') then now() else status_changed_at end
   where id = p_id;
  insert into public.monitor_alert_events (alert_id, kind, note, actor, data)
  values (p_id, 'tarefa', v_title, (select auth.uid()),
          jsonb_build_object('task_id', v_task, 'task_number', (select t.number from public.ops_tasks t where t.id = v_task)));
  return v_task;
end;
$$;

-- Quem pode ser responsável por este alerta (admin, gestor e operador ativos com acesso ao cliente).
create or replace function private.monitor_alert_assignees_impl(p_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_client uuid;
begin
  if not private.monitor_can('handle') then
    raise exception 'Sem permissão para tratar alertas de desempenho' using errcode = '42501';
  end if;
  select client_id into v_client from public.monitor_alerts where id = p_id;
  if v_client is null or not private.can_view_client(v_client) then
    raise exception 'Alerta não encontrado.' using errcode = '22023';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', coalesce(nullif(btrim(p.full_name), ''), 'Usuário'), 'role', p.role)
                                    order by p.full_name)
                     from public.profiles p where private.monitor_user_can_handle(p.id, v_client)), '[]');
end;
$$;

-- Alertas em JSON (lista e detalhe usam a mesma montagem). Só clientes visíveis.
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
               'client_name', cl.name, 'account_name', acc.name, 'campaign_name', cp.name, 'ad_name', ad.name,
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

create or replace function private.monitor_alerts_query_impl(p_open boolean, p_limit integer)
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
  if p_limit is null or p_limit < 1 or p_limit > 1000 then
    raise exception 'Quantidade inválida (1 a 1000).' using errcode = '22023';
  end if;
  return private.monitor_alerts_json(p_open, p_limit, null);
end;
$$;

-- Detalhe: o alerta e a linha do tempo completa (criado, piorou, estado, responsável, comentários, providências, tarefa, avaliações).
create or replace function private.monitor_alert_detail_impl(p_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_alert jsonb;
begin
  if not private.monitor_can('view') then
    raise exception 'Sem permissão para ver o monitoramento' using errcode = '42501';
  end if;
  v_alert := private.monitor_alerts_json(null, 1, p_id) -> 0;
  if v_alert is null then raise exception 'Alerta não encontrado.' using errcode = '22023'; end if;
  return jsonb_build_object(
    'alert', v_alert,
    'can_handle', private.monitor_can('handle'),
    'events', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'kind', e.kind, 'from_value', e.from_value, 'to_value', e.to_value,
                                                            'note', e.note, 'data', e.data, 'created_at', e.created_at,
                                                            'actor_name', p.full_name) order by e.created_at, e.id)
                          from public.monitor_alert_events e left join public.profiles p on p.id = e.actor
                         where e.alert_id = p_id), '[]'));
end;
$$;

do $$
declare f text;
begin
  foreach f in array array['monitor_alert_to_task_impl(bigint, uuid, date, integer)', 'monitor_alert_assignees_impl(bigint)',
                           'monitor_alerts_query_impl(boolean, integer)', 'monitor_alert_detail_impl(bigint)'] loop
    execute format('revoke all on function private.%s from public, anon', f);
    execute format('grant execute on function private.%s to authenticated', f);
  end loop;
  revoke all on function private.monitor_alerts_json(boolean, integer, bigint) from public, anon, authenticated;
end $$;

create or replace function public.monitor_alert_to_task(p_id bigint, p_sector_id uuid, p_due_date date, p_version integer) returns uuid
language sql set search_path = '' as $$ select private.monitor_alert_to_task_impl(p_id, p_sector_id, p_due_date, p_version) $$;
create or replace function public.monitor_alert_assignees(p_id bigint) returns jsonb
language sql stable set search_path = '' as $$ select private.monitor_alert_assignees_impl(p_id) $$;
create or replace function public.monitor_alerts_query(p_open boolean default true, p_limit integer default 500) returns jsonb
language sql stable set search_path = '' as $$ select private.monitor_alerts_query_impl(p_open, p_limit) $$;
create or replace function public.monitor_alert_detail(p_id bigint) returns jsonb
language sql stable set search_path = '' as $$ select private.monitor_alert_detail_impl(p_id) $$;

do $$
declare f text;
begin
  foreach f in array array['monitor_alert_to_task(bigint, uuid, date, integer)', 'monitor_alert_assignees(bigint)',
                           'monitor_alerts_query(boolean, integer)', 'monitor_alert_detail(bigint)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
