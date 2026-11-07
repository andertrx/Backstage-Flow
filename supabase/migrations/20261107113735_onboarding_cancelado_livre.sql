-- Etapa 49.3 — Onboarding Cancelado é livre: o cliente pode ser movido direto para lá, sem reunião e sem tarefas obrigatórias (pedido do Ander).
create or replace function private.ops_onboarding_gate_msg(p_client uuid, p_from integer, p_to integer, p_to_stage text)
returns text language plpgsql stable security definer set search_path = '' as $$
declare
  v_pend integer; v_real integer; v_status text;
begin
  if p_to <= p_from or p_to_stage = 'configuracao_inicial' then return null; end if;
  select position into v_pend from public.ops_client_stages where id = 'onboarding_pendente';
  select position into v_real from public.ops_client_stages where id = 'briefing';
  select m.status into v_status
    from public.ops_client_ops o left join public.ops_meetings m on m.id = o.onboarding_meeting_id where o.client_id = p_client;
  if v_pend is not null and p_from <= v_pend and p_to > v_pend and coalesce(v_status, 'sem') not in ('agendada', 'realizada') then
    return 'Vincule uma reunião de onboarding agendada a este cliente antes de avançar para Onboarding Agendado.';
  end if;
  if v_real is not null and p_from < v_real and p_to >= v_real and coalesce(v_status, 'sem') <> 'realizada' then
    return 'Marque a reunião de onboarding como "Realizada" antes de avançar para Onboarding Realizado.';
  end if;
  return null;
end;
$$;

create or replace function private.ops_client_stage_move_impl(p_client uuid, p_version integer, p_stage text)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_o record;
  v_from integer;
  v_to integer;
  v_pending integer;
  v_msg text;
begin
  select o.*, s.position as pos into v_o from public.ops_client_ops o join public.ops_client_stages s on s.id = o.stage_id where o.client_id = p_client;
  if v_o.client_id is null or not private.ops_client_visible(p_client) then
    raise exception 'Este cliente não está no fluxo operacional.' using errcode = '22023';
  end if;
  if not private.ops_can_move_client(p_client) then
    raise exception 'Você não tem permissão para mudar a etapa deste cliente.' using errcode = '42501';
  end if;
  if v_o.version <> coalesce(p_version, -1) then
    raise exception 'Alguém alterou este cliente antes de você. Recarregue para ver a versão atual.' using errcode = '40001';
  end if;
  select position into v_to from public.ops_client_stages where id = p_stage and active;
  if v_to is null then raise exception 'Escolha uma etapa ativa.' using errcode = '22023'; end if;
  if p_stage = v_o.stage_id then return v_o.version; end if;
  v_from := v_o.pos;
  if v_to > v_from and p_stage <> 'configuracao_inicial' then
    v_msg := private.ops_onboarding_gate_msg(p_client, v_from, v_to, p_stage);
    if v_msg is not null then raise exception '%', v_msg using errcode = '22023'; end if;
    v_pending := private.ops_client_pending(p_client, v_from, v_to);
    if v_pending > 0 then
      raise exception 'Há % tarefa(s) obrigatória(s) aberta(s) nesta etapa. Conclua antes de avançar o cliente.', v_pending using errcode = '22023';
    end if;
  end if;
  update public.ops_client_ops set stage_id = p_stage, stage_since = now(), version = version + 1, updated_by = (select auth.uid())
   where client_id = p_client;
  perform private.ops_log(null, p_client, 'cliente.etapa', jsonb_build_object('etapa', v_o.stage_id),
    jsonb_build_object('etapa', p_stage, 'regra', case when p_stage = 'configuracao_inicial' then 'Onboarding cancelado (movido direto, sem exigência de reunião)'
                                                       when v_to > v_from then 'Avanço manual: reunião de onboarding em dia e nenhuma tarefa obrigatória aberta'
                                                       else 'Retorno manual de etapa' end));
  return v_o.version + 1;
end;
$$;
