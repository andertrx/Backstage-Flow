-- Teste da Etapa 45.2 — aviso "cliente sem gastar". Transação desfeita: termina com "R: N verificações OK".
-- Rode quando em Brasília for depois das 2h (a janela do teste é 0h–24h; precisa de 70 min no mesmo dia).
do $$
declare
  v_admin uuid; v_sem uuid; v_conta uuid; v_cli uuid; v_ok int := 0; v_n int; v_camp uuid;
  v_tz text; v_hl int;
begin
  select id into v_admin from public.profiles where role = 'admin' and active order by created_at limit 1;
  select id into v_sem from public.profiles where active and role not in ('admin', 'cliente') order by created_at limit 1;
  select a.id, a.client_id, coalesce(a.timezone, 'America/Sao_Paulo') into v_conta, v_cli, v_tz
    from public.ad_accounts a join public.clients c on c.id = a.client_id and c.status = 'ativo' where a.status = 'ativa' order by a.created_at limit 1;
  v_hl := extract(hour from now() at time zone v_tz)::int;
  if v_hl < 2 then raise exception 'Rode este teste depois das 2h no fuso da conta (precisa de 70 minutos no mesmo dia).'; end if;
  update public.wa_gateway_settings set enabled = true, connection_state = 'conectado' where id;

  -- 1) permissões e validações
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_sem, 'role', 'authenticated')::text, true);
  begin perform public.wa_sem_gasto_config_save(8, 22, 60); raise exception 'não-admin configurou';
  exception when insufficient_privilege then null; end;
  begin perform public.wa_sem_gasto_silenciar(v_cli, true); raise exception 'não-admin silenciou';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  begin perform public.wa_sem_gasto_config_save(22, 8, 60); raise exception 'janela invertida'; exception when sqlstate '22023' then null; end;
  begin perform public.wa_sem_gasto_config_save(8, 22, 5); raise exception 'tempo curto demais'; exception when sqlstate '22023' then null; end;
  perform public.wa_avisos_config_save(true, '120363000000000088@g.us', 'Avisos', array['sem_gasto'], 22, 7, 12);
  perform public.wa_sem_gasto_config_save(0, 24, 60);
  v_ok := v_ok + 1;

  -- 2) monta o cenário: campanha ativa; leitura de 70 min atrás e a de agora com o MESMO gasto
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
  update public.account_snapshots set captured_at = captured_at - interval '3 days' where ad_account_id = v_conta and captured_at > now() - interval '13 hours';
  insert into public.campaigns (ad_account_id, client_id, platform_id, external_id, name, status, effective_status)
    select v_conta, v_cli, platform_id, 'teste452', 'Campanha teste', 'ativa', 'ACTIVE' from public.ad_accounts where id = v_conta returning id into v_camp;
  insert into public.account_snapshots (ad_account_id, client_id, platform_id, captured_at, status, amount_spent_micros)
    select v_conta, v_cli, platform_id, now() - interval '70 minutes', 'ativa', 5000000 from public.ad_accounts where id = v_conta;
  insert into public.account_snapshots (ad_account_id, client_id, platform_id, captured_at, status, amount_spent_micros)
    select v_conta, v_cli, platform_id, now() - interval '5 minutes', 'ativa', 5000000 from public.ad_accounts where id = v_conta;
  perform private.wa_sem_gasto_gerar();
  if not exists (select 1 from public.wa_avisos where chave like 'semgasto:' || v_conta || ':%' and chave not like '%#%') then raise exception 'não avisou sem gasto'; end if;
  if not exists (select 1 from public.wa_avisos where tipo = 'sem_gasto' and cliente_id = v_cli and texto like '%sem gasto desde%') then raise exception 'texto errado'; end if;
  perform private.wa_sem_gasto_gerar();
  if (select count(*) from public.wa_avisos where chave like 'semgasto:' || v_conta || ':%' and chave not like '%#%') <> 1 then raise exception 'duplicou o aviso'; end if;
  v_ok := v_ok + 1;

  -- 3) gasto subiu: não avisa; cliente silenciado: não avisa
  update public.account_snapshots set amount_spent_micros = 5500000 where ad_account_id = v_conta and captured_at > now() - interval '10 minutes';
  update public.wa_avisos set chave = chave || '#', status = 'pulado' where chave like 'semgasto:' || v_conta || ':%' and chave not like '%#%';
  perform private.wa_sem_gasto_gerar();
  if exists (select 1 from public.wa_avisos where chave like 'semgasto:' || v_conta || ':%' and chave not like '%#%') then raise exception 'avisou com gasto subindo'; end if;
  update public.account_snapshots set amount_spent_micros = 5000000 where ad_account_id = v_conta and captured_at > now() - interval '10 minutes';
  update public.wa_avisos set chave = chave || '#', status = 'pulado' where chave like 'semgasto:' || v_conta || ':%' and chave not like '%#%';
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  perform public.wa_sem_gasto_silenciar(v_cli, true);
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
  perform private.wa_sem_gasto_gerar();
  if exists (select 1 from public.wa_avisos where chave like 'semgasto:' || v_conta || ':%' and chave not like '%#%') then raise exception 'avisou cliente silenciado'; end if;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  perform public.wa_sem_gasto_silenciar(v_cli, false);
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
  v_ok := v_ok + 1;

  -- 4) sem campanha ativa ou com alerta de saldo aberto: não avisa; leitura velha demais: não avisa
  update public.wa_avisos set chave = chave || '#', status = 'pulado' where chave like 'semgasto:' || v_conta || ':%' and chave not like '%#%';
  update public.campaigns set status = 'pausada' where ad_account_id = v_conta;   -- todas as campanhas da conta (inclui as reais; desfeito no fim)
  perform private.wa_sem_gasto_gerar();
  if exists (select 1 from public.wa_avisos where chave like 'semgasto:' || v_conta || ':%' and chave not like '%#%') then raise exception 'avisou sem campanha ativa'; end if;
  update public.campaigns set status = 'ativa' where id = v_camp;
  insert into public.alerts (alert_key, type, severity, client_id, ad_account_id, description) values ('teste452:s', 'sem_saldo', 'critica', v_cli, v_conta, 'Sem saldo.');
  perform private.wa_sem_gasto_gerar();
  if exists (select 1 from public.wa_avisos where chave like 'semgasto:' || v_conta || ':%' and chave not like '%#%') then raise exception 'avisou apesar do alerta de saldo'; end if;
  update public.alerts set status = 'resolvido', resolved_at = now(), resolution = 'manual' where alert_key = 'teste452:s';
  update public.account_snapshots set captured_at = captured_at - interval '3 hours' where ad_account_id = v_conta and captured_at > now() - interval '100 minutes';   -- as duas leituras ficam velhas
  perform private.wa_sem_gasto_gerar();
  if exists (select 1 from public.wa_avisos where chave like 'semgasto:' || v_conta || ':%' and chave not like '%#%') then raise exception 'avisou com leitura velha'; end if;
  v_ok := v_ok + 1;

  raise exception 'R: % verificações OK', v_ok;
end $$;
