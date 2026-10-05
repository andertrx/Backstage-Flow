-- Etapa 38.2 (aprovada em 05/10/2026): a Operação começa em "Onboarding Pendente".
-- "Contrato Pago" fica só no funil do Comercial; a etapa da operação é DESATIVADA (não apagada; o admin pode reativar
-- em Configurações). Os clientes que estavam nela vão para "Onboarding Pendente", com registro no Histórico Operacional.
do $mig$
declare
  v_count integer;
begin
  if not exists (select 1 from public.ops_client_stages where id = 'contrato_pago' and active) then
    return;  -- já desativada (ou não existe): nada a fazer
  end if;
  if not exists (select 1 from public.ops_client_stages where id = 'onboarding_pendente' and active) then
    raise exception 'Etapa "Onboarding Pendente" não está ativa: desativação cancelada.';
  end if;
  select count(*) into v_count from public.ops_client_ops where stage_id = 'contrato_pago';
  insert into public.ops_activity (task_id, client_id, action, actor_id, origin, before, after)
  select null, o.client_id, 'cliente.etapa', null, 'sistema', jsonb_build_object('etapa', 'contrato_pago'),
         jsonb_build_object('etapa', 'onboarding_pendente', 'regra', 'A Operação passou a começar em Onboarding Pendente (Etapa 38.2)')
    from public.ops_client_ops o where o.stage_id = 'contrato_pago';
  update public.ops_client_ops set stage_id = 'onboarding_pendente', stage_since = now(), version = version + 1
   where stage_id = 'contrato_pago';
  update public.ops_client_stages set active = false, updated_at = now() where id = 'contrato_pago';
  insert into public.audit_logs (actor_id, action, target_type, target_id, details)
  values (null, 'ops.client_stage.active', 'ops_client_stage', 'contrato_pago',
          jsonb_build_object('ativo', false, 'clientes_movidos', v_count, 'destino', 'onboarding_pendente', 'motivo', 'Etapa 38.2'));
end;
$mig$;
