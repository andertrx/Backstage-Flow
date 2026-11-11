-- T5.29: Configurações da Central — excluir opção que ninguém usa e arrastar para reordenar
-- (tipos de atividade, motivos de perda e tipos de reunião ganham ordem).
-- Regras: só administrador; só exclui o que NÃO está em uso (histórico nunca é apagado nem perde a referência);
-- itens que as regras do sistema usam por nome (ex.: "Finalizado", "Perdido", "Onboarding Pendente") não são excluídos, só desativados.

create function private.ops_config_excluir_impl(p_tipo text, p_id text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uso integer := 0; v_prot text[] := '{}'; v_nome text;
begin
  perform private.ops_require_admin();
  if p_tipo = 'status' then
    v_prot := array['nao_iniciado','aguardando_cliente','aguardando_interno','em_andamento','finalizado','cancelado','bloqueado'];
    select name into v_nome from public.ops_statuses where id = p_id;
    select (select count(*) from public.ops_tasks where status_id = p_id) + (select count(*) from public.ops_queue_columns where status_id = p_id) into v_uso;
  elsif p_tipo = 'client_stage' then
    v_prot := array['onboarding_pendente','coleta_acessos','briefing','configuracao_inicial','concluido','contrato_pago'];
    select name into v_nome from public.ops_client_stages where id = p_id;
    select (select count(*) from public.ops_client_ops where stage_id = p_id) + (select count(*) from public.ops_tasks where client_stage_id = p_id) into v_uso;
  elsif p_tipo = 'lead_stage' then
    v_prot := array['perdido','contrato_pago','reuniao_agendada','reuniao_realizada'];
    select name into v_nome from public.ops_lead_stages where id = p_id;
    select count(*) into v_uso from public.ops_leads where stage_id = p_id;
  elsif p_tipo = 'loss_reason' then
    v_prot := array['outros'];
    select name into v_nome from public.ops_loss_reasons where id = p_id;
    select count(*) into v_uso from public.ops_leads where loss_reason_id = p_id;
  elsif p_tipo = 'meeting_category' then
    v_prot := array['daily'];
    select name into v_nome from public.ops_meeting_categories where id = p_id;
    select count(*) into v_uso from public.ops_meetings where category_id = p_id;
  elsif p_tipo = 'activity_type' then
    select name into v_nome from public.ops_activity_types where id = p_id;
    select count(*) into v_uso from public.ops_client_notes where type_id = p_id;
  elsif p_tipo = 'queue_column' then
    select name into v_nome from public.ops_queue_columns where id = p_id::uuid;
    select count(*) into v_uso from public.ops_tasks where queue_column_id = p_id::uuid;
  elsif p_tipo = 'onboarding_template' then
    select title into v_nome from public.ops_onboarding_task_templates where id = p_id::uuid;
  elsif p_tipo = 'sector' then
    select name into v_nome from public.ops_sectors where id = p_id::uuid;
    select (select count(*) from public.ops_tasks where sector_id = p_id::uuid) + (select count(*) from public.ops_client_notes where sector_id = p_id::uuid)
      + (select count(*) from public.ops_meetings where sector_id = p_id::uuid) + (select count(*) from public.ops_meeting_items where sector_id = p_id::uuid)
      + (select count(*) from public.ops_member_sectors where sector_id = p_id::uuid) + (select count(*) from public.ops_queue_columns where sector_id = p_id::uuid)
      + (select count(*) from public.ops_onboarding_task_templates where sector_id = p_id::uuid) into v_uso;
  else
    raise exception 'Tipo de opção inválido.' using errcode = '22023';
  end if;
  if v_nome is null then raise exception 'Opção não encontrada.' using errcode = 'P0002'; end if;
  if p_id = any(v_prot) then
    raise exception 'Esta opção é usada pelas regras do sistema e não pode ser excluída. Desative para esconder.' using errcode = '22023';
  end if;
  if v_uso > 0 then
    raise exception 'Não dá para excluir: "%" está em uso em % registro(s). Desative para esconder das escolhas novas.', v_nome, v_uso using errcode = '22023';
  end if;
  if p_tipo = 'status' then delete from public.ops_statuses where id = p_id;
  elsif p_tipo = 'client_stage' then delete from public.ops_client_stages where id = p_id;
  elsif p_tipo = 'lead_stage' then delete from public.ops_lead_stages where id = p_id;
  elsif p_tipo = 'loss_reason' then delete from public.ops_loss_reasons where id = p_id;
  elsif p_tipo = 'meeting_category' then delete from public.ops_meeting_categories where id = p_id;
  elsif p_tipo = 'activity_type' then delete from public.ops_activity_types where id = p_id;
  elsif p_tipo = 'queue_column' then delete from public.ops_queue_columns where id = p_id::uuid;
  elsif p_tipo = 'onboarding_template' then delete from public.ops_onboarding_task_templates where id = p_id::uuid;
  elsif p_tipo = 'sector' then delete from public.ops_sectors where id = p_id::uuid;
  end if;
  insert into public.audit_logs (actor_id, action, target_type, target_id, details)
  values ((select auth.uid()), 'ops.config.excluir', 'ops_' || p_tipo, p_id, jsonb_build_object('nome', v_nome));
end;
$$;
revoke all on function private.ops_config_excluir_impl(text, text) from public, anon;
grant execute on function private.ops_config_excluir_impl(text, text) to authenticated;
create function public.ops_config_excluir(p_tipo text, p_id text)
returns void language sql set search_path = '' as $$ select private.ops_config_excluir_impl(p_tipo, p_id) $$;
revoke all on function public.ops_config_excluir(text, text) from public, anon;
grant execute on function public.ops_config_excluir(text, text) to authenticated;

create function private.ops_config_reordenar_impl(p_tipo text, p_ids text[])
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.ops_require_admin();
  if p_tipo = 'activity_type' then
    update public.ops_activity_types t set position = o.ord from unnest(p_ids) with ordinality as o(id, ord) where t.id = o.id;
  elsif p_tipo = 'loss_reason' then
    update public.ops_loss_reasons t set position = o.ord from unnest(p_ids) with ordinality as o(id, ord) where t.id = o.id;
  elsif p_tipo = 'meeting_category' then
    update public.ops_meeting_categories t set position = o.ord from unnest(p_ids) with ordinality as o(id, ord) where t.id = o.id;
  else
    raise exception 'Tipo de opção inválido.' using errcode = '22023';
  end if;
  insert into public.audit_logs (actor_id, action, target_type, target_id, details)
  values ((select auth.uid()), 'ops.config.reordenar', 'ops_' || p_tipo, null, jsonb_build_object('ordem', to_jsonb(p_ids)));
end;
$$;
revoke all on function private.ops_config_reordenar_impl(text, text[]) from public, anon;
grant execute on function private.ops_config_reordenar_impl(text, text[]) to authenticated;
create function public.ops_config_reordenar(p_tipo text, p_ids text[])
returns void language sql set search_path = '' as $$ select private.ops_config_reordenar_impl(p_tipo, p_ids) $$;
revoke all on function public.ops_config_reordenar(text, text[]) from public, anon;
grant execute on function public.ops_config_reordenar(text, text[]) to authenticated;
