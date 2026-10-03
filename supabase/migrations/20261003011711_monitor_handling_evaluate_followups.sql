-- Etapa 37.4 — a avaliação passa a fazer também a avaliação posterior das providências.
create or replace function private.monitor_evaluate(p_trigger text, p_actor uuid default null, p_today date default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.monitor_settings;
  v_run bigint;
  v_created integer := 0;
  v_updated integer := 0;
  v_resolved integer := 0;
  v_eval integer := 0;
  v_skipped integer := 0;
  v_skip jsonb := '[]';
  v_err text;
  v_followups integer := 0;
begin
  if p_trigger not in ('agendada', 'manual') then
    raise exception 'Tipo de avaliação inválido' using errcode = '22023';
  end if;
  select * into s from public.monitor_settings where id = 1;
  if p_trigger = 'agendada' then
    if not s.enabled then return jsonb_build_object('skipped', 'desligado'); end if;
    if exists (select 1 from public.monitor_runs r
                where r.started_at > now() - make_interval(mins => s.eval_interval_minutes) + interval '1 minute') then
      return jsonb_build_object('skipped', 'intervalo');
    end if;
  end if;

  insert into public.monitor_runs (trigger, requested_by) values (p_trigger, p_actor) returning id into v_run;

  begin
    perform private.monitor_prepare_accounts(p_trigger, p_today, s.stale_hours);
    select count(*) filter (where reason is null), count(*) filter (where reason is not null),
           coalesce(jsonb_agg(jsonb_build_object('ad_account_id', id, 'reason', reason))
                    filter (where reason is not null and reason <> 'sem_dados_novos'), '[]')
      into v_eval, v_skipped, v_skip
      from pg_temp._mon_acc;
    perform private.monitor_cand_limits();
    perform private.monitor_cand_anomalies();
    perform private.monitor_cand_no_results();
    select o_created, o_updated into v_created, v_updated from private.monitor_save_candidates();
    v_resolved := private.monitor_normalize();
    -- 37.4: avaliação posterior das providências (3 e 7 dias depois).
    v_followups := private.monitor_followups(p_today);
  exception when others then
    get stacked diagnostics v_err = message_text;
  end;

  update public.monitor_runs set finished_at = now(), accounts_evaluated = case when v_err is null then v_eval else 0 end,
         accounts_skipped = v_skipped, skipped = v_skip,
         alerts_created = case when v_err is null then v_created else 0 end,
         alerts_updated = case when v_err is null then v_updated else 0 end,
         alerts_resolved = case when v_err is null then v_resolved else 0 end,
         error = left(v_err, 500)
   where id = v_run;
  return jsonb_build_object('run_id', v_run, 'evaluated', v_eval, 'skipped', v_skipped, 'created', v_created,
                            'updated', v_updated, 'resolved', v_resolved, 'followups', v_followups, 'error', v_err);
end;
$$;
revoke all on function private.monitor_evaluate(text, uuid, date) from public, anon, authenticated;
