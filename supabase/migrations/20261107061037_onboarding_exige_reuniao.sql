-- Etapa 47.1 — Onboarding Pendente exige uma reunião vinculada e REALIZADA para o cliente avançar (pedido do Ander, 07/11/2026).
-- Vale para todos os clientes que estão nessa etapa (inclusive os 2 que já estavam). Voltar de etapa continua livre.
-- Nada é apagado: vincular/desvincular ficam no histórico operacional do cliente.

-- ---------------------------------------------------------------- Campo: a reunião que libera o cliente
alter table public.ops_client_ops add column onboarding_meeting_id uuid references public.ops_meetings (id);
comment on column public.ops_client_ops.onboarding_meeting_id is 'Etapa 47.1: reunião de onboarding do cliente. Só sai de "Onboarding Pendente" para a frente quando ela está "realizada".';
create index ops_client_ops_onb_meeting_idx on public.ops_client_ops (onboarding_meeting_id);

-- ---------------------------------------------------------------- Novo tipo de aviso no sino
alter table public.ops_notifications drop constraint ops_notifications_kind_check;
alter table public.ops_notifications add constraint ops_notifications_kind_check check (kind = any (array[
  'tarefa.atribuida', 'tarefa.mencao', 'tarefa.comentario', 'tarefa.concluida', 'tarefa.prazo', 'tarefa.atrasada',
  'reuniao.convite', 'reuniao.hoje', 'reuniao.item', 'cliente.am', 'lead.responsavel', 'envio.aprovar', 'cliente.reuniao']));

create or replace function private.ops_notification_prefs_save_impl(p_muted text[])
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_kinds text[] := array['tarefa.atribuida', 'tarefa.mencao', 'tarefa.comentario', 'tarefa.concluida', 'tarefa.prazo', 'tarefa.atrasada',
                          'reuniao.convite', 'reuniao.hoje', 'reuniao.item', 'cliente.am', 'lead.responsavel', 'envio.aprovar', 'cliente.reuniao'];
begin
  perform private.ops_need('ops.access');
  if exists (select 1 from unnest(coalesce(p_muted, '{}')) k where k <> all (v_kinds)) then
    raise exception 'Tipo de notificação desconhecido.' using errcode = '22023';
  end if;
  insert into public.ops_notification_prefs (user_id, muted, updated_at)
  values ((select auth.uid()), array(select distinct k from unnest(coalesce(p_muted, '{}')) k order by 1), now())
  on conflict (user_id) do update set muted = excluded.muted, updated_at = now();
end;
$$;

-- ---------------------------------------------------------------- A regra
create function private.ops_onboarding_reuniao_ok(p_client uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.ops_client_ops o join public.ops_meetings m on m.id = o.onboarding_meeting_id
                  where o.client_id = p_client and m.status = 'realizada')
$$;
revoke all on function private.ops_onboarding_reuniao_ok(uuid) from public, anon, authenticated;

-- Mover de etapa: a regra nova vale para quem sai de "Onboarding Pendente" para a frente (manual, avanço automático e MCP).
create or replace function private.ops_client_stage_move_impl(p_client uuid, p_version integer, p_stage text)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_o record;
  v_from integer;
  v_to integer;
  v_pending integer;
  v_onb integer;
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
    select position into v_onb from public.ops_client_stages where id = 'onboarding_pendente';
    if v_onb is not null and v_from <= v_onb and v_to > v_onb and not private.ops_onboarding_reuniao_ok(p_client) then
      raise exception 'Vincule uma reunião de onboarding a este cliente e marque-a como "Realizada" antes de avançar.' using errcode = '22023';
    end if;
    v_pending := private.ops_client_pending(p_client, v_from, v_to);
    if v_pending > 0 then
      raise exception 'Há % tarefa(s) obrigatória(s) aberta(s) nesta etapa. Conclua antes de avançar o cliente.', v_pending using errcode = '22023';
    end if;
  end if;
  update public.ops_client_ops set stage_id = p_stage, stage_since = now(), version = version + 1, updated_by = (select auth.uid())
   where client_id = p_client;
  perform private.ops_log(null, p_client, 'cliente.etapa', jsonb_build_object('etapa', v_o.stage_id),
    jsonb_build_object('etapa', p_stage, 'regra', case when v_to > v_from then 'Avanço manual: reunião de onboarding realizada e nenhuma tarefa obrigatória aberta'
                                                       else 'Retorno manual de etapa' end));
  return v_o.version + 1;
end;
$$;

-- Avanço automático: também precisa da reunião realizada quando sai de "Onboarding Pendente".
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
  if v_o.stage_id = 'onboarding_pendente' and not private.ops_onboarding_reuniao_ok(new.client_id) then return null; end if;
  if not exists (select 1 from public.ops_tasks t where t.client_id = new.client_id and t.client_stage_id = v_o.stage_id
                  and t.mandatory and t.archived_at is null) then return null; end if;
  if exists (select 1 from public.ops_tasks t join public.ops_statuses s on s.id = t.status_id
              where t.client_id = new.client_id and t.client_stage_id = v_o.stage_id and t.mandatory and t.archived_at is null
                and s.category not in ('concluido', 'cancelado')) then return null; end if;
  select id, name into v_next from public.ops_client_stages where active and position > v_o.position order by position limit 1;
  if v_next.id is null then return null; end if;
  update public.ops_client_ops set stage_id = v_next.id, stage_since = now(), version = version + 1 where client_id = new.client_id;
  perform private.ops_log(null, new.client_id, 'cliente.etapa', jsonb_build_object('etapa', v_o.stage_id),
    jsonb_build_object('etapa', v_next.id, 'regra', 'Avanço automático: todas as tarefas obrigatórias de "' || v_o.name || '" concluídas'), 'sistema');
  return null;
end;
$$;

-- ---------------------------------------------------------------- Vincular / desvincular a reunião
create function private.ops_client_meeting_link_impl(p_client uuid, p_meeting uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  m record;
  v_prev uuid;
begin
  if not exists (select 1 from public.ops_client_ops where client_id = p_client) or not private.ops_client_visible(p_client) then
    raise exception 'Este cliente não está no fluxo operacional.' using errcode = '22023';
  end if;
  if not private.ops_can_move_client(p_client) then
    raise exception 'Você não tem permissão para vincular reunião a este cliente.' using errcode = '42501';
  end if;
  select * into m from public.ops_meetings where id = p_meeting;
  if m.id is null then raise exception 'Reunião não encontrada.' using errcode = '22023'; end if;
  if m.status = 'cancelada' then raise exception 'Esta reunião foi cancelada. Escolha outra ou crie uma nova.' using errcode = '22023'; end if;
  if m.client_id is not null and m.client_id <> p_client then raise exception 'Esta reunião é de outro cliente.' using errcode = '22023'; end if;
  if exists (select 1 from public.ops_client_ops where onboarding_meeting_id = p_meeting and client_id <> p_client) then
    raise exception 'Esta reunião já está vinculada ao onboarding de outro cliente.' using errcode = '22023';
  end if;
  select onboarding_meeting_id into v_prev from public.ops_client_ops where client_id = p_client;
  update public.ops_client_ops set onboarding_meeting_id = p_meeting, updated_by = (select auth.uid()) where client_id = p_client;
  if m.client_id is null then
    update public.ops_meetings set client_id = p_client, version = version + 1, updated_by = (select auth.uid()) where id = p_meeting;
  end if;
  perform private.ops_log(null, p_client, 'cliente.reuniao_vinculada',
    case when v_prev is null then null else jsonb_build_object('reuniao', v_prev) end,
    jsonb_build_object('reuniao', p_meeting, 'numero', m.number, 'titulo', m.title, 'situacao', m.status));
end;
$$;
revoke all on function private.ops_client_meeting_link_impl(uuid, uuid) from public, anon;
grant execute on function private.ops_client_meeting_link_impl(uuid, uuid) to authenticated;
create function public.ops_client_meeting_link(p_client uuid, p_meeting uuid)
returns void language sql set search_path = '' as $$ select private.ops_client_meeting_link_impl(p_client, p_meeting) $$;
revoke all on function public.ops_client_meeting_link(uuid, uuid) from public, anon;
grant execute on function public.ops_client_meeting_link(uuid, uuid) to authenticated;

create function private.ops_client_meeting_unlink_impl(p_client uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_prev uuid;
begin
  if not exists (select 1 from public.ops_client_ops where client_id = p_client) or not private.ops_client_visible(p_client) then
    raise exception 'Este cliente não está no fluxo operacional.' using errcode = '22023';
  end if;
  if not private.ops_can_move_client(p_client) then
    raise exception 'Você não tem permissão para mudar a reunião deste cliente.' using errcode = '42501';
  end if;
  select onboarding_meeting_id into v_prev from public.ops_client_ops where client_id = p_client;
  if v_prev is null then return; end if;
  update public.ops_client_ops set onboarding_meeting_id = null, updated_by = (select auth.uid()) where client_id = p_client;
  perform private.ops_log(null, p_client, 'cliente.reuniao_desvinculada', jsonb_build_object('reuniao', v_prev), null);
end;
$$;
revoke all on function private.ops_client_meeting_unlink_impl(uuid) from public, anon;
grant execute on function private.ops_client_meeting_unlink_impl(uuid) to authenticated;
create function public.ops_client_meeting_unlink(p_client uuid)
returns void language sql set search_path = '' as $$ select private.ops_client_meeting_unlink_impl(p_client) $$;
revoke all on function public.ops_client_meeting_unlink(uuid) from public, anon;
grant execute on function public.ops_client_meeting_unlink(uuid) to authenticated;

-- ---------------------------------------------------------------- Avisos
-- Quem recebe: o Account Manager do cliente e os administradores (quem fez a ação não é avisado, como nos outros avisos).
create function private.ops_onboarding_avisar(p_client uuid, p_titulo text, p_corpo text, p_dedupe text)
returns void language plpgsql security definer set search_path = '' as $$
declare u uuid;
begin
  for u in
    select x from (
      select o.am_user_id as x from public.ops_client_ops o where o.client_id = p_client and o.am_user_id is not null
      union
      select p.id from public.profiles p where p.role = 'admin' and p.active
    ) q where x is not null
  loop
    perform private.ops_notify(u, 'cliente.reuniao', p_titulo, p_corpo, '/operacoes/onboarding?cliente=' || p_client, p_dedupe || ':' || u);
  end loop;
end;
$$;
revoke all on function private.ops_onboarding_avisar(uuid, text, text, text) from public, anon, authenticated;

-- Ao entrar em "Onboarding Pendente" (vindo do Comercial ou de volta de outra etapa): pede a reunião.
create function private.ops_onboarding_entrada_tg()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.stage_id = 'onboarding_pendente' and not private.ops_onboarding_reuniao_ok(new.client_id) then
    perform private.ops_onboarding_avisar(new.client_id,
      'Vincule uma reunião de onboarding a ' || (select name from public.clients where id = new.client_id),
      'O cliente só avança quando a reunião estiver marcada como Realizada.', 'onb-entrada:' || new.client_id || ':' || new.version);
  end if;
  return null;
end;
$$;
revoke all on function private.ops_onboarding_entrada_tg() from public, anon, authenticated;
create trigger ops_client_ops_onb_entrada after insert or update of stage_id on public.ops_client_ops
  for each row execute function private.ops_onboarding_entrada_tg();

-- Quando a reunião vinculada vira "Realizada" (pode avançar) ou "Cancelada" (voltou a faltar reunião).
create function private.ops_onboarding_reuniao_status_tg()
returns trigger language plpgsql security definer set search_path = '' as $$
declare c record;
begin
  if new.status = old.status or new.status not in ('realizada', 'cancelada') then return null; end if;
  for c in select o.client_id, cl.name from public.ops_client_ops o join public.clients cl on cl.id = o.client_id
            where o.onboarding_meeting_id = new.id and o.stage_id = 'onboarding_pendente' loop
    if new.status = 'realizada' then
      perform private.ops_onboarding_avisar(c.client_id, 'Reunião realizada: ' || c.name || ' pode avançar',
        'A reunião de onboarding foi registrada como Realizada. Mova o cliente para a próxima etapa.', 'onb-realizada:' || c.client_id || ':' || new.id);
    else
      perform private.ops_onboarding_avisar(c.client_id, 'Reunião de onboarding cancelada: ' || c.name,
        'O cliente está sem reunião de onboarding. Vincule ou crie outra para ele poder avançar.', 'onb-cancelada:' || c.client_id || ':' || new.id);
    end if;
  end loop;
  return null;
end;
$$;
revoke all on function private.ops_onboarding_reuniao_status_tg() from public, anon, authenticated;
create trigger ops_meetings_onb_status after update of status on public.ops_meetings
  for each row execute function private.ops_onboarding_reuniao_status_tg();

-- Lembrete nos dias úteis (9h de Brasília) enquanto faltar a reunião: sem vínculo/cancelada, ou vinculada que já passou e ainda não foi registrada.
create function private.ops_onboarding_reuniao_lembrar()
returns integer language plpgsql security definer set search_path = '' as $$
declare
  r record;
  v_dia text := to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM-DD');
  v_n integer := 0;
begin
  for r in
    select o.client_id, cl.name, m.status as m_status, m.starts_at as m_inicio
      from public.ops_client_ops o
      join public.clients cl on cl.id = o.client_id and cl.status <> 'encerrado'
      left join public.ops_meetings m on m.id = o.onboarding_meeting_id
     where o.stage_id = 'onboarding_pendente' and coalesce(m.status, 'sem') <> 'realizada'
  loop
    if r.m_status = 'agendada' and r.m_inicio > now() then continue; end if;   -- tem reunião marcada para o futuro: nada a cobrar ainda
    perform private.ops_onboarding_avisar(r.client_id,
      case when r.m_status = 'agendada' then 'A reunião de onboarding de ' || r.name || ' já passou: registre-a como Realizada'
           else 'Falta a reunião de onboarding de ' || r.name end,
      case when r.m_status = 'agendada' then 'Abra a reunião, registre a ata e a presença e marque como Realizada para o cliente avançar.'
           else 'Vincule ou crie a reunião no cartão do cliente. Sem ela, o cliente não avança.' end,
      'onb-lembrete:' || r.client_id || ':' || v_dia);
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;
revoke all on function private.ops_onboarding_reuniao_lembrar() from public, anon, authenticated;
select cron.schedule('ops-onboarding-reuniao', '0 12 * * 1-5', $cron$select private.ops_onboarding_reuniao_lembrar()$cron$);

-- ---------------------------------------------------------------- Quadro e ficha: a reunião de cada cartão
create or replace function private.ops_client_board_impl(f jsonb)
returns jsonb language sql stable security definer set search_path = '' as $$
  select case when not private.ops_can('ops.access') then null else jsonb_build_object(
    'clients', (select coalesce(jsonb_agg(jsonb_build_object(
                  'client_id', c.id, 'name', c.name, 'client_status', c.status, 'stage_id', o.stage_id, 'stage_since', o.stage_since,
                  'version', o.version, 'am_user_id', o.am_user_id, 'am_name', pa.full_name,
                  'stage_pending', private.ops_client_pending(c.id, st.position, st.position + 1),
                  'can_move', private.ops_can_move_client(c.id),
                  'onboarding_meeting', case when m.id is null then null else jsonb_build_object('id', m.id, 'number', m.number, 'title', m.title,
                                          'status', m.status, 'starts_at', m.starts_at) end,
                  'meeting_ok', coalesce(m.status = 'realizada', false),
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

-- Lembretes de hoje para quem já está na etapa (os 2 clientes que já estavam): sai uma vez agora.
select private.ops_onboarding_reuniao_lembrar();
