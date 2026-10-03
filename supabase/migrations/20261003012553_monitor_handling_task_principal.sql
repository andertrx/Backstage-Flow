-- Etapa 37.4 — virar tarefa: o responsável da tarefa precisa estar ativo na Central (regra da Central).
create or replace function private.monitor_alert_to_task_impl(p_id bigint, p_sector_id uuid, p_due_date date, p_version integer)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.monitor_alerts;
  v_client text; v_account text; v_campaign text; v_ad text;
  v_title text; v_desc text; v_task uuid; v_principal uuid;
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
  -- Responsável da tarefa: o do alerta, se estiver ativo na Central; senão, quem clicou; senão, sem responsável.
  v_principal := case when v.assigned_to is not null and private.ops_member_ok(v.assigned_to) then v.assigned_to
                      when private.ops_member_ok((select auth.uid())) then (select auth.uid()) end;
  v_task := private.ops_task_save_impl(null, null, jsonb_build_object(
    'title', v_title, 'description', v_desc, 'client_id', v.client_id, 'sector_id', p_sector_id,
    'priority', case v.severity when 'critico' then 'alta' else 'media' end, 'due_date', p_due_date,
    'people', case when v_principal is null then '{}'::jsonb else jsonb_build_object('principal', v_principal) end));
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

