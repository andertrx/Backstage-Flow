-- Teste da Etapa "Desativar cliente" (23/10/2026). Roda num bloco que termina com erro de propósito: nada fica gravado.
do $$
declare
  v_client uuid; v_acc uuid; v_ok int := 0; v_src uuid; v_alert bigint;
begin
  select a.client_id, a.id into v_client, v_acc from public.ad_accounts a join public.platform_connections c on c.id = a.connection_id
   where a.unlinked_at is null and c.status <> 'revogada' and a.client_id is not null and not coalesce(a.is_test_account, false) limit 1;
  if v_client is null then raise exception 'sem conta para testar'; end if;

  update public.sync_state set next_run_at = now() - interval '1 minute', locked_until = null where ad_account_id = v_acc;
  insert into public.monitor_alerts (dedupe_key, kind, level, metric, severity, status, client_id, platform_id, ad_account_id,
                                     currency, current_value, previous_value, variation_pct, period_from, period_to, prev_from, prev_to,
                                     explanation, context, details)
  select 'teste-desativar', a2.kind, a2.level, a2.metric, a2.severity, 'novo', v_client, a2.platform_id, v_acc,
         a2.currency, a2.current_value, a2.previous_value, a2.variation_pct, a2.period_from, a2.period_to, a2.prev_from, a2.prev_to,
         'teste', '{}', '{}'
    from public.monitor_alerts a2 limit 1
  returning id into v_alert;

  -- 1) quem não é admin não desativa
  perform set_config('request.jwt.claims', json_build_object('sub', (select id from public.profiles where role <> 'admin' and active limit 1)::text, 'role', 'authenticated')::text, true);
  begin
    update public.clients set status = 'encerrado' where id = v_client;
    raise exception 'FALHOU: não-admin conseguiu desativar';
  exception when insufficient_privilege then v_ok := v_ok + 1; end;
  perform set_config('request.jwt.claims', '', true);

  -- 2) desativar
  update public.clients set status = 'encerrado' where id = v_client;
  if private.client_is_active(v_client) then raise exception 'FALHOU: ainda ativo'; end if; v_ok := v_ok + 1;
  if exists (select 1 from public.sync_claim_due(20, 1) x where x = v_acc) then raise exception 'FALHOU: sync ainda pega a conta'; end if; v_ok := v_ok + 1;
  if v_alert is not null then
    if not exists (select 1 from public.monitor_alerts where id = v_alert and resolved_at is not null and details ->> 'closed_reason' = 'cliente_desativado') then
      raise exception 'FALHOU: alerta não encerrado com o motivo'; end if;
    v_ok := v_ok + 1;
  end if;
  if (private.tracking_ingest(jsonb_build_object('client_id', v_client)) ->> 'status') <> 'cliente_desativado' then raise exception 'FALHOU: tracking'; end if; v_ok := v_ok + 1;
  if public.tracking_whatsapp_register(jsonb_build_object('client_id', v_client)) <> 'cliente_desativado' then raise exception 'FALHOU: whatsapp'; end if; v_ok := v_ok + 1;
  select id into v_src from public.ri_sources where client_id = v_client limit 1;
  if v_src is not null then
    update public.ri_sources set lease_until = null where id = v_src;
    if public.ri_read_claim(v_src) then raise exception 'FALHOU: planilha ainda lida'; end if; v_ok := v_ok + 1;
  end if;
  if not exists (select 1 from public.client_report_email_due(50) x where x = v_client) then v_ok := v_ok + 1; else raise exception 'FALHOU: e-mail'; end if;
  if exists (select 1 from public.audit_logs where action = 'client.deactivate' and target_id = v_client::text) then v_ok := v_ok + 1; else raise exception 'FALHOU: auditoria'; end if;

  -- 3) reativar
  update public.clients set status = 'ativo' where id = v_client;
  update public.sync_state set locked_until = null where ad_account_id = v_acc;
  if not exists (select 1 from public.sync_claim_due(20, 1) x where x = v_acc) then raise exception 'FALHOU: reativado não sincroniza'; end if; v_ok := v_ok + 1;
  if (private.tracking_ingest(jsonb_build_object('client_id', v_client, 'event', jsonb_build_object('occurred_at', '2000-01-01'))) ->> 'status') <> 'fora_do_periodo' then
    raise exception 'FALHOU: tracking reativado'; end if; v_ok := v_ok + 1;
  if exists (select 1 from public.audit_logs where action = 'client.reactivate' and target_id = v_client::text) then v_ok := v_ok + 1; else raise exception 'FALHOU: auditoria reativar'; end if;

  raise exception 'R: % verificações OK', v_ok;
end $$;
