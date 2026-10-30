-- Teste: cliente desativado não gera alerta (30/10/2026). Termina com erro de propósito: nada fica gravado.
do $$
declare
  v_client uuid; v_acc uuid; v_ok int := 0; v_key text := 'teste-desativado-30-10';
begin
  select a.client_id, a.id into v_client, v_acc from public.ad_accounts a
   where a.unlinked_at is null and a.client_id is not null and not coalesce(a.is_test_account, false) limit 1;
  if v_client is null then raise exception 'sem conta para testar'; end if;

  insert into public.alerts (alert_key, type, severity, client_id, ad_account_id, description)
  values (v_key, 'sincronizacao_atrasada', 'media', v_client, v_acc, 'teste');

  -- 1) cliente ativo: nada muda
  if (select status from public.alerts where alert_key = v_key) <> 'aberto' then raise exception 'FALHOU: alerta mexido sem desativar'; end if; v_ok := v_ok + 1;

  -- 2) desativar encerra o alerta aberto, com o motivo, sem apagar
  update public.clients set status = 'encerrado' where id = v_client;
  if not exists (select 1 from public.alerts where alert_key = v_key and status = 'resolvido' and resolution = 'automatica'
                 and details ->> 'closed_reason' = 'cliente_desativado') then raise exception 'FALHOU: alerta não encerrado'; end if; v_ok := v_ok + 1;

  -- 3) a verificação não devolve candidatos do cliente desativado
  if exists (select 1 from private.alert_candidates() c where c.client_id = v_client) then raise exception 'FALHOU: candidato de cliente desativado'; end if; v_ok := v_ok + 1;

  -- 4) rodar a verificação não cria alerta novo para ele
  perform private.refresh_alerts_impl();
  if exists (select 1 from public.alerts where client_id = v_client and status <> 'resolvido') then raise exception 'FALHOU: alerta novo para desativado'; end if; v_ok := v_ok + 1;

  -- 5) nenhum cliente desativado tem alerta aberto
  if exists (select 1 from public.alerts a join public.clients c on c.id = a.client_id where c.status = 'encerrado' and a.status <> 'resolvido')
    then raise exception 'FALHOU: desativado com alerta aberto'; end if; v_ok := v_ok + 1;

  raise exception 'R: % verificações OK', v_ok;
end $$;
