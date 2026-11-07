-- Etapa 47.2 — Onboarding por etapas ligadas à reunião (pedido do Ander, 07/11/2026):
--   Pendente → Agendado: exige reunião AGENDADA vinculada; Agendado → Realizado: exige reunião REALIZADA;
--   reunião cancelada com o motivo "Cliente não fará mais onboarding" leva o cliente sozinho a Onboarding Cancelado.
-- Etapas (ids fixos): onboarding_pendente · coleta_acessos (Onboarding Agendado) · briefing (Onboarding Realizado) · configuracao_inicial (Onboarding Cancelado).

-- ---------------------------------------------------------------- Tipo do cancelamento da reunião
alter table public.ops_meetings add column cancel_kind text check (cancel_kind in ('outro', 'cliente_desistiu'));
comment on column public.ops_meetings.cancel_kind is 'Etapa 47.2: "cliente_desistiu" = cliente não fará mais onboarding (leva o cliente a Onboarding Cancelado); "outro" = remarcar etc.';

create function private.ops_meeting_cancel_kind_impl(p_id uuid, p_version integer, p_reason text, p_kind text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_reason text := p_reason;
begin
  if p_kind not in ('outro', 'cliente_desistiu') then raise exception 'Tipo de cancelamento inválido.' using errcode = '22023'; end if;
  if p_kind = 'cliente_desistiu' and char_length(btrim(coalesce(v_reason, ''))) < 3 then v_reason := 'Cliente não fará mais onboarding'; end if;
  -- o tipo é gravado antes: o gatilho do status lê o tipo. Se a permissão/versão falhar, a transação inteira é desfeita.
  update public.ops_meetings set cancel_kind = p_kind where id = p_id and status = 'agendada';
  perform private.ops_meeting_cancel_impl(p_id, p_version, v_reason);
end;
$$;
revoke all on function private.ops_meeting_cancel_kind_impl(uuid, integer, text, text) from public, anon;
grant execute on function private.ops_meeting_cancel_kind_impl(uuid, integer, text, text) to authenticated;
create function public.ops_meeting_cancel_kind(p_id uuid, p_version integer, p_reason text, p_kind text)
returns void language sql set search_path = '' as $$ select private.ops_meeting_cancel_kind_impl(p_id, p_version, p_reason, p_kind) $$;
revoke all on function public.ops_meeting_cancel_kind(uuid, integer, text, text) from public, anon;
grant execute on function public.ops_meeting_cancel_kind(uuid, integer, text, text) to authenticated;

-- ---------------------------------------------------------------- Regras de passagem
create function private.ops_onboarding_reuniao_agendada(p_client uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.ops_client_ops o join public.ops_meetings m on m.id = o.onboarding_meeting_id
                  where o.client_id = p_client and m.status in ('agendada', 'realizada'))
$$;
revoke all on function private.ops_onboarding_reuniao_agendada(uuid) from public, anon, authenticated;

-- Devolve a mensagem de recusa (ou nulo se pode passar). Só vale para quem avança.
create function private.ops_onboarding_gate_msg(p_client uuid, p_from integer, p_to integer, p_to_stage text)
returns text language plpgsql stable security definer set search_path = '' as $$
declare
  v_pend integer; v_real integer; v_status text; v_kind text;
begin
  if p_to <= p_from then return null; end if;
  select position into v_pend from public.ops_client_stages where id = 'onboarding_pendente';
  select position into v_real from public.ops_client_stages where id = 'briefing';
  select m.status, m.cancel_kind into v_status, v_kind
    from public.ops_client_ops o left join public.ops_meetings m on m.id = o.onboarding_meeting_id where o.client_id = p_client;
  if p_to_stage = 'configuracao_inicial' then
    if v_status = 'cancelada' and v_kind = 'cliente_desistiu' then return null; end if;
    return 'Para cancelar o onboarding, cancele a reunião do cliente marcando "Cliente não fará mais onboarding".';
  end if;
  if v_pend is not null and p_from <= v_pend and p_to > v_pend and coalesce(v_status, 'sem') not in ('agendada', 'realizada') then
    return 'Vincule uma reunião de onboarding agendada a este cliente antes de avançar para Onboarding Agendado.';
  end if;
  if v_real is not null and p_from < v_real and p_to >= v_real and coalesce(v_status, 'sem') <> 'realizada' then
    return 'Marque a reunião de onboarding como "Realizada" antes de avançar para Onboarding Realizado.';
  end if;
  return null;
end;
$$;
revoke all on function private.ops_onboarding_gate_msg(uuid, integer, integer, text) from public, anon, authenticated;

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
  if v_to > v_from then
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
    jsonb_build_object('etapa', p_stage, 'regra', case when v_to > v_from then 'Avanço manual: reunião de onboarding em dia e nenhuma tarefa obrigatória aberta'
                                                       else 'Retorno manual de etapa' end));
  return v_o.version + 1;
end;
$$;

create or replace function private.ops_client_auto_advance_tg()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_o record;
  v_next record;
begin
  select o.client_id, o.stage_id, s.position, s.name, s.auto_advance into v_o
    from public.ops_client_ops o join public.ops_client_stages s on s.id = o.stage_id
   where o.client_id = new.client_id;
  if v_o.client_id is null or v_o.stage_id <> new.client_stage_id or not v_o.auto_advance then return null; end if;
  if not exists (select 1 from public.ops_tasks t where t.client_id = new.client_id and t.client_stage_id = v_o.stage_id
                  and t.mandatory and t.archived_at is null) then return null; end if;
  if exists (select 1 from public.ops_tasks t join public.ops_statuses s on s.id = t.status_id
              where t.client_id = new.client_id and t.client_stage_id = v_o.stage_id and t.mandatory and t.archived_at is null
                and s.category not in ('concluido', 'cancelado')) then return null; end if;
  select id, name, position into v_next from public.ops_client_stages where active and position > v_o.position order by position limit 1;
  if v_next.id is null then return null; end if;
  if private.ops_onboarding_gate_msg(new.client_id, v_o.position, v_next.position, v_next.id) is not null then return null; end if;
  update public.ops_client_ops set stage_id = v_next.id, stage_since = now(), version = version + 1 where client_id = new.client_id;
  perform private.ops_log(null, new.client_id, 'cliente.etapa', jsonb_build_object('etapa', v_o.stage_id),
    jsonb_build_object('etapa', v_next.id, 'regra', 'Avanço automático: todas as tarefas obrigatórias de "' || v_o.name || '" concluídas'), 'sistema');
  return null;
end;
$$;

-- Mudança de etapa feita pelo sistema (reunião cancelada etc.).
create function private.ops_onboarding_mover(p_client uuid, p_stage text, p_regra text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_old text;
begin
  select stage_id into v_old from public.ops_client_ops where client_id = p_client;
  if v_old is null or v_old = p_stage or not exists (select 1 from public.ops_client_stages where id = p_stage and active) then return; end if;
  update public.ops_client_ops set stage_id = p_stage, stage_since = now(), version = version + 1 where client_id = p_client;
  perform private.ops_log(null, p_client, 'cliente.etapa', jsonb_build_object('etapa', v_old), jsonb_build_object('etapa', p_stage, 'regra', p_regra), 'sistema');
end;
$$;
revoke all on function private.ops_onboarding_mover(uuid, text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------- Desvincular: em Agendado volta para Pendente
create or replace function private.ops_client_meeting_unlink_impl(p_client uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_prev uuid; v_stage text;
begin
  if not exists (select 1 from public.ops_client_ops where client_id = p_client) or not private.ops_client_visible(p_client) then
    raise exception 'Este cliente não está no fluxo operacional.' using errcode = '22023';
  end if;
  if not private.ops_can_move_client(p_client) then
    raise exception 'Você não tem permissão para mudar a reunião deste cliente.' using errcode = '42501';
  end if;
  select onboarding_meeting_id, stage_id into v_prev, v_stage from public.ops_client_ops where client_id = p_client;
  if v_prev is null then return; end if;
  if v_stage = 'briefing' then raise exception 'O onboarding deste cliente já foi realizado: a reunião não pode ser desvinculada.' using errcode = '22023'; end if;
  update public.ops_client_ops set onboarding_meeting_id = null, updated_by = (select auth.uid()) where client_id = p_client;
  perform private.ops_log(null, p_client, 'cliente.reuniao_desvinculada', jsonb_build_object('reuniao', v_prev), null);
  if v_stage = 'coleta_acessos' then
    perform private.ops_onboarding_mover(p_client, 'onboarding_pendente', 'Voltou: a reunião de onboarding foi desvinculada');
  end if;
end;
$$;

-- ---------------------------------------------------------------- Avisos
create or replace function private.ops_onboarding_entrada_tg()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.stage_id = 'onboarding_pendente' and not private.ops_onboarding_reuniao_agendada(new.client_id) then
    perform private.ops_onboarding_avisar(new.client_id,
      'Vincule uma reunião de onboarding a ' || (select name from public.clients where id = new.client_id),
      'Sem reunião agendada o cliente não vai para Onboarding Agendado. Só vai para Realizado com a reunião marcada como Realizada.',
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
      perform private.ops_onboarding_avisar(c.client_id, 'Reunião realizada: ' || c.name || ' pode ir para Onboarding Realizado',
        'A reunião de onboarding foi registrada como Realizada. Mova o cliente para a próxima etapa.', 'onb-realizada:' || c.client_id || ':' || new.id);
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
      else
        v_t := 'Reunião realizada: mova ' || r.name || ' para Onboarding Realizado';
        v_b := 'A reunião de onboarding foi realizada. Arraste o cliente para Onboarding Realizado.';
      end if;
    else
      if r.m_status = 'agendada' and r.m_inicio > now() then continue; end if;
      if r.m_status = 'agendada' then
        v_t := 'A reunião de onboarding de ' || r.name || ' já passou: registre-a como Realizada';
        v_b := 'Abra a reunião, registre a ata e a presença e marque como Realizada para o cliente avançar.';
      elsif r.m_status = 'realizada' then
        v_t := 'Reunião realizada: mova ' || r.name || ' para Onboarding Realizado';
        v_b := 'A reunião de onboarding foi realizada. Arraste o cliente para Onboarding Realizado.';
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

-- ---------------------------------------------------------------- Quadro: situação da reunião de cada cartão
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
