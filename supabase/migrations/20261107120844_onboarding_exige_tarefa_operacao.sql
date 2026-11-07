-- Etapa 49.4 — Onboarding Agendado → Realizado exige, além da reunião Realizada, pelo menos 1 tarefa para o time de operação
-- (pedido do Ander, 07/11/2026): tarefa ligada ao cliente, de qualquer setor menos "Comercial", que não esteja cancelada nem arquivada.
-- Tarefa finalizada conta (o objetivo é ter registrado os próximos passos para a operação).

-- ---------------------------------------------------------------- A tarefa para o time de operação
create function private.ops_onboarding_tem_tarefa_operacao(p_client uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.ops_tasks t
      join public.ops_sectors s on s.id = t.sector_id
      join public.ops_statuses st on st.id = t.status_id
     where t.client_id = p_client and t.archived_at is null
       and st.category <> 'cancelado'
       and lower(btrim(s.name)) <> 'comercial')
$$;
comment on function private.ops_onboarding_tem_tarefa_operacao(uuid) is
  'Etapa 49.4: o cliente tem ao menos 1 tarefa para o time de operação (setor diferente de "Comercial", não cancelada, não arquivada).';
revoke all on function private.ops_onboarding_tem_tarefa_operacao(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------- Regra de passagem
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
  if v_real is not null and p_from < v_real and p_to >= v_real then
    if coalesce(v_status, 'sem') <> 'realizada' then
      return 'Marque a reunião de onboarding como "Realizada" antes de avançar para Onboarding Realizado.';
    end if;
    if not private.ops_onboarding_tem_tarefa_operacao(p_client) then
      return 'Crie pelo menos uma tarefa para o time de operação (qualquer setor, menos Comercial) com os próximos passos do cliente antes de avançar para Onboarding Realizado.';
    end if;
  end if;
  return null;
end;
$$;

-- ---------------------------------------------------------------- Quadro: o cartão sabe se já tem a tarefa
create or replace function private.ops_client_board_impl(f jsonb)
returns jsonb language sql stable security definer set search_path = '' as $$
  select case when not private.ops_can('ops.access') then null else jsonb_build_object(
    'clients', (select coalesce(jsonb_agg(jsonb_build_object(
                  'client_id', c.id, 'name', c.name, 'client_status', c.status, 'stage_id', o.stage_id, 'stage_since', o.stage_since,
                  'version', o.version, 'am_user_id', o.am_user_id, 'am_name', pa.full_name,
                  'stage_pending', private.ops_client_pending(c.id, st.position, st.position + 1),
                  'can_move', private.ops_can_move_client(c.id),
                  'onboarding_meeting', case when m.id is null then null else jsonb_build_object('id', m.id, 'number', m.number, 'title', m.title,
                                          'status', m.status, 'starts_at', m.starts_at, 'cancel_kind', m.cancel_kind) end,
                  'meeting_ok', coalesce(m.status = 'realizada', false),
                  'meeting_scheduled', coalesce(m.status in ('agendada', 'realizada'), false),
                  'ops_task_ok', private.ops_onboarding_tem_tarefa_operacao(c.id),
                  'summary', private.ops_client_summary(c.id)) order by c.name), '[]')
                  from public.ops_client_ops o
                  join public.clients c on c.id = o.client_id
                  join public.ops_client_stages st on st.id = o.stage_id
                  left join public.profiles pa on pa.id = o.am_user_id
                  left join public.ops_meetings m on m.id = o.onboarding_meeting_id
                 where private.ops_client_visible(c.id)
                   and (not coalesce((f ->> 'mine')::boolean, false) or o.am_user_id = (select auth.uid()))
                   and (nullif(f ->> 'am_user_id', '') is null or o.am_user_id::text = f ->> 'am_user_id')
                   and (nullif(f ->> 'q', '') is null or c.name ilike '%' || (f ->> 'q') || '%')),
    'available', case when private.ops_can_manage_clients() then
                   (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name) order by c.name), '[]')
                      from public.clients c
                     where c.status <> 'encerrado' and not exists (select 1 from public.ops_client_ops o where o.client_id = c.id))
                 else '[]'::jsonb end,
    'can', jsonb_build_object('manage', private.ops_can_manage_clients(), 'release', private.ops_can('ops.tasks.create'),
                              'note', private.ops_can('ops.history.edit'))) end
$$;

-- ---------------------------------------------------------------- Avisos: dizem o que falta
create or replace function private.ops_onboarding_entrada_tg()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.stage_id = 'onboarding_pendente' and not private.ops_onboarding_reuniao_agendada(new.client_id) then
    perform private.ops_onboarding_avisar(new.client_id,
      'Vincule uma reunião de onboarding a ' || (select name from public.clients where id = new.client_id),
      'Sem reunião agendada o cliente não vai para Onboarding Agendado. Só vai para Realizado com a reunião marcada como Realizada e ao menos 1 tarefa para o time de operação.',
      'onb-entrada:' || new.client_id || ':' || new.version);
  end if;
  return null;
end;
$$;

create or replace function private.ops_onboarding_reuniao_status_tg()
returns trigger language plpgsql security definer set search_path = '' as $$
declare c record;
begin
  if new.status = old.status or new.status not in ('realizada', 'cancelada') then return null; end if;
  for c in select o.client_id, o.stage_id, cl.name from public.ops_client_ops o join public.clients cl on cl.id = o.client_id
            where o.onboarding_meeting_id = new.id and o.stage_id in ('onboarding_pendente', 'coleta_acessos') loop
    if new.status = 'realizada' then
      if private.ops_onboarding_tem_tarefa_operacao(c.client_id) then
        perform private.ops_onboarding_avisar(c.client_id, 'Reunião realizada: ' || c.name || ' pode ir para Onboarding Realizado',
          'A reunião de onboarding foi registrada como Realizada e já há tarefa para o time de operação. Mova o cliente para a próxima etapa.',
          'onb-realizada:' || c.client_id || ':' || new.id);
      else
        perform private.ops_onboarding_avisar(c.client_id, 'Reunião realizada: crie a tarefa da operação de ' || c.name,
          'Para ir a Onboarding Realizado, crie ao menos 1 tarefa para o time de operação (qualquer setor, menos Comercial) com os próximos passos do cliente.',
          'onb-realizada:' || c.client_id || ':' || new.id);
      end if;
    elsif new.cancel_kind = 'cliente_desistiu' then
      perform private.ops_onboarding_mover(c.client_id, 'configuracao_inicial', 'Reunião cancelada: cliente não fará mais onboarding');
      perform private.ops_onboarding_avisar(c.client_id, 'Onboarding cancelado: ' || c.name,
        'A reunião foi cancelada com o motivo "cliente não fará mais onboarding". O cliente foi para Onboarding Cancelado.', 'onb-desistiu:' || c.client_id || ':' || new.id);
    else
      perform private.ops_onboarding_avisar(c.client_id, 'Reunião de onboarding cancelada: ' || c.name,
        'O cliente está sem reunião de onboarding. Vincule ou crie outra para ele poder avançar.', 'onb-cancelada:' || c.client_id || ':' || new.id);
      if c.stage_id = 'coleta_acessos' then
        perform private.ops_onboarding_mover(c.client_id, 'onboarding_pendente', 'Voltou: a reunião de onboarding foi cancelada');
      end if;
    end if;
  end loop;
  return null;
end;
$$;

create or replace function private.ops_onboarding_reuniao_lembrar()
returns integer language plpgsql security definer set search_path = '' as $$
declare
  r record;
  v_dia text := to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM-DD');
  v_n integer := 0;
  v_t text;
  v_b text;
begin
  for r in
    select o.client_id, o.stage_id, cl.name, m.status as m_status, m.starts_at as m_inicio
      from public.ops_client_ops o
      join public.clients cl on cl.id = o.client_id and cl.status <> 'encerrado'
      left join public.ops_meetings m on m.id = o.onboarding_meeting_id
     where o.stage_id in ('onboarding_pendente', 'coleta_acessos')
  loop
    v_t := null;
    if r.stage_id = 'onboarding_pendente' then
      if r.m_status is null or r.m_status = 'cancelada' then
        v_t := 'Falta a reunião de onboarding de ' || r.name;
        v_b := 'Vincule ou crie a reunião no cartão do cliente. Sem reunião agendada, ele não vai para Onboarding Agendado.';
      elsif r.m_status = 'agendada' then
        v_t := 'Reunião marcada: mova ' || r.name || ' para Onboarding Agendado';
        v_b := 'A reunião de onboarding já está agendada. Arraste o cliente para Onboarding Agendado.';
      elsif not private.ops_onboarding_tem_tarefa_operacao(r.client_id) then
        v_t := 'Reunião realizada: crie a tarefa da operação de ' || r.name;
        v_b := 'Para ir a Onboarding Realizado, crie ao menos 1 tarefa para o time de operação (qualquer setor, menos Comercial) com os próximos passos.';
      else
        v_t := 'Reunião realizada: mova ' || r.name || ' para Onboarding Realizado';
        v_b := 'A reunião de onboarding foi realizada e já há tarefa para a operação. Arraste o cliente para Onboarding Realizado.';
      end if;
    else
      if r.m_status = 'agendada' and r.m_inicio > now() then continue; end if;
      if r.m_status = 'agendada' then
        v_t := 'A reunião de onboarding de ' || r.name || ' já passou: registre-a como Realizada';
        v_b := 'Abra a reunião, registre a ata e a presença e marque como Realizada para o cliente avançar.';
      elsif r.m_status = 'realizada' and not private.ops_onboarding_tem_tarefa_operacao(r.client_id) then
        v_t := 'Reunião realizada: crie a tarefa da operação de ' || r.name;
        v_b := 'Para ir a Onboarding Realizado, crie ao menos 1 tarefa para o time de operação (qualquer setor, menos Comercial) com os próximos passos.';
      elsif r.m_status = 'realizada' then
        v_t := 'Reunião realizada: mova ' || r.name || ' para Onboarding Realizado';
        v_b := 'A reunião de onboarding foi realizada e já há tarefa para a operação. Arraste o cliente para Onboarding Realizado.';
      else
        v_t := 'Falta a reunião de onboarding de ' || r.name;
        v_b := 'Vincule ou crie a reunião no cartão do cliente.';
      end if;
    end if;
    perform private.ops_onboarding_avisar(r.client_id, v_t, v_b, 'onb-lembrete:' || r.client_id || ':' || v_dia);
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;
