-- Etapa 36.5 (parte 2): funções de Dailies e reuniões.

-- -----------------------------------------------------------------------------
-- Criar / editar reunião. p: {title, category_id, starts_at, duration_min,
-- sector_id, client_id, location, agenda, people: [user_id]}
-- -----------------------------------------------------------------------------
create function private.ops_meeting_save_impl(p_id uuid, p_version integer, p jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := (select auth.uid());
  v_id uuid := p_id;
  v_old record;
  v_before jsonb;
  v_after jsonb;
  v_people uuid[];
  v_user uuid;
begin
  if p_id is null then
    perform private.ops_need('ops.meetings.manage');
  else
    select * into v_old from public.ops_meetings where id = p_id for update;
    if v_old.id is null or not private.ops_meeting_visible(p_id) then raise exception 'Reunião não encontrada.' using errcode = '22023'; end if;
    if not private.ops_meeting_can_edit(p_id) then
      raise exception 'Só quem organiza (ou tem "Criar reuniões e Dailies") altera a reunião.' using errcode = '42501';
    end if;
    if v_old.status = 'cancelada' then raise exception 'Reunião cancelada não pode ser alterada.' using errcode = '22023'; end if;
    if v_old.version <> coalesce(p_version, -1) then
      raise exception 'Alguém alterou esta reunião antes de você. Recarregue para ver a versão atual.' using errcode = '40001';
    end if;
  end if;

  if char_length(btrim(coalesce(p ->> 'title', ''))) < 3 then raise exception 'Dê um título à reunião (mínimo 3 letras).' using errcode = '22023'; end if;
  if not exists (select 1 from public.ops_meeting_categories where id = p ->> 'category_id'
                 and (active or (p_id is not null and id = v_old.category_id))) then
    raise exception 'Escolha o tipo da reunião.' using errcode = '22023';
  end if;
  if nullif(p ->> 'starts_at', '') is null then raise exception 'Informe a data e a hora.' using errcode = '22023'; end if;
  if coalesce(nullif(p ->> 'duration_min', '')::integer, 30) not between 5 and 600 then
    raise exception 'A duração vai de 5 minutos a 10 horas.' using errcode = '22023';
  end if;
  if nullif(p ->> 'sector_id', '') is not null and not exists (
       select 1 from public.ops_sectors where id = (p ->> 'sector_id')::uuid and (status = 'ativo' or (p_id is not null and id = v_old.sector_id))) then
    raise exception 'Escolha um setor ativo.' using errcode = '22023';
  end if;
  if nullif(p ->> 'client_id', '') is not null and not exists (select 1 from public.clients where id = (p ->> 'client_id')::uuid) then
    raise exception 'Cliente não encontrado.' using errcode = '22023';
  end if;
  v_people := array(select distinct x::uuid from jsonb_array_elements_text(coalesce(p -> 'people', '[]')) x where nullif(x, '') is not null);
  if cardinality(v_people) > 60 then raise exception 'No máximo 60 participantes.' using errcode = '22023'; end if;
  foreach v_user in array v_people loop
    if not private.ops_member_ok(v_user) then raise exception 'Todos os participantes precisam estar ativos na Central.' using errcode = '22023'; end if;
  end loop;

  if p_id is null then
    insert into public.ops_meetings (title, category_id, starts_at, duration_min, sector_id, client_id, location, agenda,
                                     organizer_id, created_by, updated_by)
    values (btrim(p ->> 'title'), p ->> 'category_id', (p ->> 'starts_at')::timestamptz, coalesce(nullif(p ->> 'duration_min', '')::integer, 30),
            nullif(p ->> 'sector_id', '')::uuid, nullif(p ->> 'client_id', '')::uuid, nullif(btrim(p ->> 'location'), ''),
            nullif(btrim(p ->> 'agenda'), ''), v_me, v_me, v_me)
    returning id into v_id;
    insert into public.ops_meeting_people (meeting_id, user_id) select v_id, u from unnest(v_people) u;
    perform private.ops_meeting_log(v_id, 'reuniao.criada', null, private.ops_meeting_snapshot(v_id));
  else
    v_before := private.ops_meeting_snapshot(p_id);
    update public.ops_meetings
       set title = btrim(p ->> 'title'), category_id = p ->> 'category_id', starts_at = (p ->> 'starts_at')::timestamptz,
           duration_min = coalesce(nullif(p ->> 'duration_min', '')::integer, 30), sector_id = nullif(p ->> 'sector_id', '')::uuid,
           client_id = nullif(p ->> 'client_id', '')::uuid, location = nullif(btrim(p ->> 'location'), ''),
           agenda = nullif(btrim(p ->> 'agenda'), ''), updated_by = v_me, version = version + 1
     where id = p_id;
    delete from public.ops_meeting_people where meeting_id = p_id and user_id <> all (v_people);
    insert into public.ops_meeting_people (meeting_id, user_id) select p_id, u from unnest(v_people) u on conflict do nothing;
    v_after := private.ops_meeting_snapshot(p_id);
    if v_after is distinct from v_before then
      perform private.ops_meeting_log(p_id, 'reuniao.editada',
        (select jsonb_object_agg(k, v_before -> k) from jsonb_object_keys(v_before) k where v_before -> k is distinct from v_after -> k),
        (select jsonb_object_agg(k, v_after -> k) from jsonb_object_keys(v_after) k where v_before -> k is distinct from v_after -> k));
    end if;
  end if;
  return v_id;
end;
$$;
revoke all on function private.ops_meeting_save_impl(uuid, integer, jsonb) from public, anon;
grant execute on function private.ops_meeting_save_impl(uuid, integer, jsonb) to authenticated;
create function public.ops_meeting_save(p_id uuid, p_version integer, p jsonb)
returns uuid language sql set search_path = '' as $$ select private.ops_meeting_save_impl(p_id, p_version, p) $$;
revoke all on function public.ops_meeting_save(uuid, integer, jsonb) from public, anon;
grant execute on function public.ops_meeting_save(uuid, integer, jsonb) to authenticated;

-- -----------------------------------------------------------------------------
-- Registrar a reunião: ata/resumo e presença. Pode ser refeito (fica no histórico).
-- -----------------------------------------------------------------------------
create function private.ops_meeting_record_impl(p_id uuid, p_version integer, p_notes text, p_attended uuid[])
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_old record;
  v_before jsonb;
begin
  select * into v_old from public.ops_meetings where id = p_id for update;
  if v_old.id is null or not private.ops_meeting_visible(p_id) then raise exception 'Reunião não encontrada.' using errcode = '22023'; end if;
  if not private.ops_meeting_can_edit(p_id) then
    raise exception 'Só quem organiza (ou tem "Criar reuniões e Dailies") registra a reunião.' using errcode = '42501';
  end if;
  if v_old.status = 'cancelada' then raise exception 'Reunião cancelada não pode ser registrada.' using errcode = '22023'; end if;
  if v_old.version <> coalesce(p_version, -1) then
    raise exception 'Alguém alterou esta reunião antes de você. Recarregue para ver a versão atual.' using errcode = '40001';
  end if;
  if exists (select 1 from unnest(coalesce(p_attended, '{}')) u
              where not exists (select 1 from public.ops_meeting_people p where p.meeting_id = p_id and p.user_id = u)) then
    raise exception 'Presença só de quem está na lista de participantes.' using errcode = '22023';
  end if;
  v_before := jsonb_build_object('ata', v_old.notes,
    'presentes', (select coalesce(jsonb_agg(pp.full_name order by pp.full_name), '[]') from public.ops_meeting_people p
                    join public.profiles pp on pp.id = p.user_id where p.meeting_id = p_id and p.attended));
  update public.ops_meetings set status = 'realizada', held_at = coalesce(held_at, now()), notes = nullif(btrim(p_notes), ''),
                                 updated_by = (select auth.uid()), version = version + 1
   where id = p_id;
  update public.ops_meeting_people set attended = (user_id = any (coalesce(p_attended, '{}'))) where meeting_id = p_id;
  perform private.ops_meeting_log(p_id, case when v_old.status = 'realizada' then 'reuniao.ata_editada' else 'reuniao.realizada' end,
    case when v_old.status = 'realizada' then v_before end,
    jsonb_build_object('ata', nullif(btrim(p_notes), ''),
      'presentes', (select coalesce(jsonb_agg(pp.full_name order by pp.full_name), '[]') from public.ops_meeting_people p
                      join public.profiles pp on pp.id = p.user_id where p.meeting_id = p_id and p.attended)));
end;
$$;
revoke all on function private.ops_meeting_record_impl(uuid, integer, text, uuid[]) from public, anon;
grant execute on function private.ops_meeting_record_impl(uuid, integer, text, uuid[]) to authenticated;
create function public.ops_meeting_record(p_id uuid, p_version integer, p_notes text, p_attended uuid[])
returns void language sql set search_path = '' as $$ select private.ops_meeting_record_impl(p_id, p_version, p_notes, p_attended) $$;
revoke all on function public.ops_meeting_record(uuid, integer, text, uuid[]) from public, anon;
grant execute on function public.ops_meeting_record(uuid, integer, text, uuid[]) to authenticated;

create function private.ops_meeting_cancel_impl(p_id uuid, p_version integer, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_old record;
begin
  select * into v_old from public.ops_meetings where id = p_id for update;
  if v_old.id is null or not private.ops_meeting_visible(p_id) then raise exception 'Reunião não encontrada.' using errcode = '22023'; end if;
  if not private.ops_meeting_can_edit(p_id) then
    raise exception 'Só quem organiza (ou tem "Criar reuniões e Dailies") cancela a reunião.' using errcode = '42501';
  end if;
  if v_old.status <> 'agendada' then raise exception 'Só reunião agendada pode ser cancelada.' using errcode = '22023'; end if;
  if v_old.version <> coalesce(p_version, -1) then
    raise exception 'Alguém alterou esta reunião antes de você. Recarregue para ver a versão atual.' using errcode = '40001';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then raise exception 'Informe o motivo do cancelamento.' using errcode = '22023'; end if;
  update public.ops_meetings set status = 'cancelada', cancel_reason = btrim(p_reason), updated_by = (select auth.uid()), version = version + 1
   where id = p_id;
  perform private.ops_meeting_log(p_id, 'reuniao.cancelada', null, jsonb_build_object('motivo', btrim(p_reason)));
end;
$$;
revoke all on function private.ops_meeting_cancel_impl(uuid, integer, text) from public, anon;
grant execute on function private.ops_meeting_cancel_impl(uuid, integer, text) to authenticated;
create function public.ops_meeting_cancel(p_id uuid, p_version integer, p_reason text)
returns void language sql set search_path = '' as $$ select private.ops_meeting_cancel_impl(p_id, p_version, p_reason) $$;
revoke all on function public.ops_meeting_cancel(uuid, integer, text) from public, anon;
grant execute on function public.ops_meeting_cancel(uuid, integer, text) to authenticated;

-- -----------------------------------------------------------------------------
-- Itens: objetivo, pendência, decisão, bloqueio. p: {kind, body, owner_id, sector_id, due_date}
-- -----------------------------------------------------------------------------
create function private.ops_meeting_item_add_impl(p_meeting uuid, p jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_m record;
  v_kind text := p ->> 'kind';
  v_id uuid;
begin
  select * into v_m from public.ops_meetings where id = p_meeting;
  if v_m.id is null or not private.ops_meeting_visible(p_meeting) then raise exception 'Reunião não encontrada.' using errcode = '22023'; end if;
  if not private.ops_meeting_can_add(p_meeting) then
    raise exception 'Só participantes e quem organiza registram itens na reunião.' using errcode = '42501';
  end if;
  if v_m.status = 'cancelada' then raise exception 'Reunião cancelada não recebe itens.' using errcode = '22023'; end if;
  if v_kind is null or v_kind not in ('objetivo', 'pendencia', 'decisao', 'bloqueio') then
    raise exception 'Escolha o tipo do item.' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p ->> 'body', ''))) < 2 then raise exception 'Escreva o item.' using errcode = '22023'; end if;
  if nullif(p ->> 'owner_id', '') is not null and not private.ops_member_ok((p ->> 'owner_id')::uuid) then
    raise exception 'O responsável precisa estar ativo na Central.' using errcode = '22023';
  end if;
  if nullif(p ->> 'sector_id', '') is not null and not exists (select 1 from public.ops_sectors where id = (p ->> 'sector_id')::uuid and status = 'ativo') then
    raise exception 'Escolha um setor ativo.' using errcode = '22023';
  end if;
  insert into public.ops_meeting_items (meeting_id, kind, body, owner_id, sector_id, due_date, created_by)
  values (p_meeting, v_kind, btrim(p ->> 'body'), nullif(p ->> 'owner_id', '')::uuid, nullif(p ->> 'sector_id', '')::uuid,
          case when v_kind in ('pendencia', 'bloqueio') then nullif(p ->> 'due_date', '')::date end, (select auth.uid()))
  returning id into v_id;
  perform private.ops_meeting_log(p_meeting, 'reuniao.item', null, jsonb_build_object('tipo', v_kind, 'texto', btrim(p ->> 'body')));
  return v_id;
end;
$$;
revoke all on function private.ops_meeting_item_add_impl(uuid, jsonb) from public, anon;
grant execute on function private.ops_meeting_item_add_impl(uuid, jsonb) to authenticated;
create function public.ops_meeting_item_add(p_meeting uuid, p jsonb)
returns uuid language sql set search_path = '' as $$ select private.ops_meeting_item_add_impl(p_meeting, p) $$;
revoke all on function public.ops_meeting_item_add(uuid, jsonb) from public, anon;
grant execute on function public.ops_meeting_item_add(uuid, jsonb) to authenticated;

-- Retirar item: só esconde (fica no histórico). Item que já virou tarefa não sai.
create function private.ops_meeting_item_remove_impl(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_i record;
begin
  select * into v_i from public.ops_meeting_items where id = p_id for update;
  if v_i.id is null or not private.ops_meeting_visible(v_i.meeting_id) then raise exception 'Item não encontrado.' using errcode = '22023'; end if;
  if v_i.created_by is distinct from (select auth.uid()) and not private.ops_meeting_can_edit(v_i.meeting_id) then
    raise exception 'Só quem registrou (ou quem organiza) retira o item.' using errcode = '42501';
  end if;
  if v_i.task_id is not null then raise exception 'Este item já virou tarefa. Arquive a tarefa se ela não for mais necessária.' using errcode = '22023'; end if;
  if v_i.removed_at is not null then return; end if;
  update public.ops_meeting_items set removed_at = now(), removed_by = (select auth.uid()) where id = p_id;
  perform private.ops_meeting_log(v_i.meeting_id, 'reuniao.item_retirado', jsonb_build_object('tipo', v_i.kind, 'texto', v_i.body), null);
end;
$$;
revoke all on function private.ops_meeting_item_remove_impl(uuid) from public, anon;
grant execute on function private.ops_meeting_item_remove_impl(uuid) to authenticated;
create function public.ops_meeting_item_remove(p_id uuid)
returns void language sql set search_path = '' as $$ select private.ops_meeting_item_remove_impl(p_id) $$;
revoke all on function public.ops_meeting_item_remove(uuid) from public, anon;
grant execute on function public.ops_meeting_item_remove(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Pendência/bloqueio → tarefa, com um clique. Usa as mesmas regras de criar
-- tarefa (permissão "criar tarefas"; outra pessoa como responsável exige
-- "atribuir responsáveis"). Clique duplo não cria duas: o item guarda a tarefa.
-- -----------------------------------------------------------------------------
create function private.ops_meeting_item_to_task_impl(p_item uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_i record;
  v_m record;
  v_sector uuid;
  v_task uuid;
  v_title text;
begin
  select * into v_i from public.ops_meeting_items where id = p_item for update;
  if v_i.id is null or v_i.removed_at is not null or not private.ops_meeting_visible(v_i.meeting_id) then
    raise exception 'Item não encontrado.' using errcode = '22023';
  end if;
  if v_i.task_id is not null then return v_i.task_id; end if;
  if v_i.kind not in ('pendencia', 'bloqueio') then raise exception 'Só pendências e bloqueios viram tarefa.' using errcode = '22023'; end if;
  select * into v_m from public.ops_meetings where id = v_i.meeting_id;
  if v_m.status = 'cancelada' then raise exception 'Reunião cancelada: não gera tarefas.' using errcode = '22023'; end if;
  v_sector := coalesce(v_i.sector_id, v_m.sector_id);
  if v_sector is null then raise exception 'Informe o setor da pendência (ou da reunião) para criar a tarefa.' using errcode = '22023'; end if;
  v_title := left(case when v_i.kind = 'bloqueio' then 'Resolver bloqueio: ' || v_i.body else v_i.body end, 200);
  if char_length(btrim(v_title)) < 3 then v_title := 'Pendência: ' || v_title; end if;
  v_task := private.ops_task_save_impl(null, null, jsonb_build_object(
    'title', v_title,
    'description', 'Criada a partir da reunião #' || v_m.number || ' "' || v_m.title || '" de '
                   || to_char(v_m.starts_at at time zone 'America/Sao_Paulo', 'DD/MM/YYYY') || '.'
                   || case when char_length(v_i.body) > 200 then E'\n\n' || v_i.body else '' end,
    'client_id', v_m.client_id, 'sector_id', v_sector,
    'priority', case when v_i.kind = 'bloqueio' then 'alta' else 'media' end,
    'due_date', v_i.due_date,
    'people', case when v_i.owner_id is not null then jsonb_build_object('principal', v_i.owner_id) else '{}'::jsonb end));
  update public.ops_meeting_items set task_id = v_task where id = p_item;
  perform private.ops_log(v_task, v_m.client_id, 'tarefa.da_reuniao', null, jsonb_build_object('reuniao', v_m.number, 'titulo_reuniao', v_m.title));
  perform private.ops_meeting_log(v_m.id, 'reuniao.tarefa_criada', null,
    jsonb_build_object('tarefa', (select number from public.ops_tasks where id = v_task), 'texto', v_i.body));
  return v_task;
end;
$$;
revoke all on function private.ops_meeting_item_to_task_impl(uuid) from public, anon;
grant execute on function private.ops_meeting_item_to_task_impl(uuid) to authenticated;
create function public.ops_meeting_item_to_task(p_item uuid)
returns uuid language sql set search_path = '' as $$ select private.ops_meeting_item_to_task_impl(p_item) $$;
revoke all on function public.ops_meeting_item_to_task(uuid) from public, anon;
grant execute on function public.ops_meeting_item_to_task(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Agenda e histórico. f: {from, to (datas no horário de Brasília), category_id,
-- sector_id, client_id, person_id, status, q, mine, order: 'asc'|'desc'}
-- -----------------------------------------------------------------------------
create function private.ops_meeting_list_impl(f jsonb)
returns jsonb language sql stable security definer set search_path = '' as $$
  select case when not private.ops_can('ops.access') then null else jsonb_build_object(
    'meetings', (select coalesce(jsonb_agg(x order by
                    case when f ->> 'order' = 'asc' then extract(epoch from (x ->> 'starts_at')::timestamptz) end,
                    case when coalesce(f ->> 'order', 'desc') <> 'asc' then extract(epoch from (x ->> 'starts_at')::timestamptz) end desc), '[]')
      from (
        select jsonb_build_object('id', m.id, 'number', m.number, 'title', m.title, 'category_id', m.category_id, 'category_name', c.name,
                 'color', c.color, 'status', m.status, 'starts_at', m.starts_at, 'duration_min', m.duration_min, 'sector_id', m.sector_id,
                 'sector_name', s.name, 'client_id', m.client_id, 'client_name', cl.name, 'location', m.location, 'organizer_id', m.organizer_id,
                 'organizer_name', po.full_name,
                 'people_count', (select count(*) from public.ops_meeting_people p where p.meeting_id = m.id),
                 'attended_count', (select count(*) from public.ops_meeting_people p where p.meeting_id = m.id and p.attended),
                 'open_items', (select count(*) from public.ops_meeting_items i where i.meeting_id = m.id and i.removed_at is null
                                  and i.kind in ('pendencia', 'bloqueio') and i.task_id is null),
                 'tasks_count', (select count(*) from public.ops_meeting_items i where i.meeting_id = m.id and i.task_id is not null),
                 'i_participate', m.organizer_id = (select auth.uid())
                    or exists (select 1 from public.ops_meeting_people p where p.meeting_id = m.id and p.user_id = (select auth.uid()))) as x
          from public.ops_meetings m
          join public.ops_meeting_categories c on c.id = m.category_id
          left join public.ops_sectors s on s.id = m.sector_id
          left join public.clients cl on cl.id = m.client_id
          left join public.profiles po on po.id = m.organizer_id
         where private.ops_meeting_visible(m.id)
           and (nullif(f ->> 'from', '') is null or (m.starts_at at time zone 'America/Sao_Paulo')::date >= (f ->> 'from')::date)
           and (nullif(f ->> 'to', '') is null or (m.starts_at at time zone 'America/Sao_Paulo')::date <= (f ->> 'to')::date)
           and (nullif(f ->> 'category_id', '') is null or m.category_id = f ->> 'category_id')
           and (nullif(f ->> 'sector_id', '') is null or m.sector_id::text = f ->> 'sector_id')
           and (nullif(f ->> 'client_id', '') is null or m.client_id::text = f ->> 'client_id')
           and (nullif(f ->> 'status', '') is null or m.status = f ->> 'status')
           and (nullif(f ->> 'person_id', '') is null or m.organizer_id::text = f ->> 'person_id'
                or exists (select 1 from public.ops_meeting_people p where p.meeting_id = m.id and p.user_id::text = f ->> 'person_id'))
           and (not coalesce((f ->> 'mine')::boolean, false) or m.organizer_id = (select auth.uid())
                or exists (select 1 from public.ops_meeting_people p where p.meeting_id = m.id and p.user_id = (select auth.uid())))
           and (nullif(f ->> 'q', '') is null or private.search_norm(m.title) like '%' || private.search_norm(f ->> 'q') || '%'
                or private.search_norm(coalesce(m.agenda, '')) like '%' || private.search_norm(f ->> 'q') || '%'
                or private.search_norm(coalesce(m.notes, '')) like '%' || private.search_norm(f ->> 'q') || '%'
                or m.number::text = ltrim(f ->> 'q', '#'))
         order by case when f ->> 'order' = 'asc' then m.starts_at end, case when coalesce(f ->> 'order', 'desc') <> 'asc' then m.starts_at end desc
         limit 300) y),
    'can', jsonb_build_object('create', private.ops_can('ops.meetings.manage'))) end
$$;
revoke all on function private.ops_meeting_list_impl(jsonb) from public, anon;
grant execute on function private.ops_meeting_list_impl(jsonb) to authenticated;
create function public.ops_meeting_list(f jsonb default '{}')
returns jsonb language sql stable set search_path = '' as $$ select private.ops_meeting_list_impl(f) $$;
revoke all on function public.ops_meeting_list(jsonb) from public, anon;
grant execute on function public.ops_meeting_list(jsonb) to authenticated;

create function private.ops_meeting_get_impl(p_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select case when not private.ops_meeting_visible(p_id) then null else (
    select jsonb_build_object(
      'meeting', jsonb_build_object('id', m.id, 'number', m.number, 'title', m.title, 'category_id', m.category_id, 'category_name', c.name,
                   'color', c.color, 'status', m.status, 'starts_at', m.starts_at, 'duration_min', m.duration_min, 'sector_id', m.sector_id,
                   'sector_name', s.name, 'client_id', m.client_id, 'client_name', cl.name, 'location', m.location, 'agenda', m.agenda,
                   'notes', m.notes, 'cancel_reason', m.cancel_reason, 'held_at', m.held_at, 'organizer_id', m.organizer_id,
                   'organizer_name', po.full_name, 'created_at', m.created_at, 'version', m.version),
      'people', (select coalesce(jsonb_agg(jsonb_build_object('user_id', p.user_id, 'name', pp.full_name, 'attended', p.attended)
                   order by pp.full_name), '[]')
                   from public.ops_meeting_people p join public.profiles pp on pp.id = p.user_id where p.meeting_id = m.id),
      'items', (select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'kind', i.kind, 'body', i.body, 'owner_id', i.owner_id,
                   'owner_name', pw.full_name, 'sector_id', i.sector_id, 'sector_name', si.name, 'due_date', i.due_date,
                   'task_id', i.task_id, 'task_number', t.number,
                   'task_visible', i.task_id is not null and private.ops_task_visible(i.task_id),
                   'task_title', case when i.task_id is not null and private.ops_task_visible(i.task_id) then t.title end,
                   'task_status', case when i.task_id is not null and private.ops_task_visible(i.task_id) then st.name end,
                   'task_done', st.category in ('concluido', 'cancelado'),
                   'created_by', i.created_by, 'author', pa.full_name, 'created_at', i.created_at) order by i.created_at), '[]')
                  from public.ops_meeting_items i
                  left join public.profiles pw on pw.id = i.owner_id left join public.profiles pa on pa.id = i.created_by
                  left join public.ops_sectors si on si.id = i.sector_id
                  left join public.ops_tasks t on t.id = i.task_id left join public.ops_statuses st on st.id = t.status_id
                 where i.meeting_id = m.id and i.removed_at is null),
      'events', (select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'action', a.action, 'actor', ph.full_name, 'origin', a.origin,
                   'before', a.before, 'after', a.after, 'created_at', a.created_at) order by a.created_at desc, a.id desc), '[]')
                   from public.ops_activity a left join public.profiles ph on ph.id = a.actor_id where a.meeting_id = m.id),
      'can', jsonb_build_object('edit', private.ops_meeting_can_edit(m.id), 'add', private.ops_meeting_can_add(m.id),
                                'task', private.ops_can('ops.tasks.create'), 'assign', private.ops_can('ops.tasks.assign')))
      from public.ops_meetings m
      join public.ops_meeting_categories c on c.id = m.category_id
      left join public.ops_sectors s on s.id = m.sector_id
      left join public.clients cl on cl.id = m.client_id
      left join public.profiles po on po.id = m.organizer_id
     where m.id = p_id) end
$$;
revoke all on function private.ops_meeting_get_impl(uuid) from public, anon;
grant execute on function private.ops_meeting_get_impl(uuid) to authenticated;
create function public.ops_meeting_get(p_id uuid)
returns jsonb language sql stable set search_path = '' as $$ select private.ops_meeting_get_impl(p_id) $$;
revoke all on function public.ops_meeting_get(uuid) from public, anon;
grant execute on function public.ops_meeting_get(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Configurações (só admin): tipos de reunião
-- -----------------------------------------------------------------------------
create function private.ops_meeting_category_save_impl(p_id text, p_name text, p_color text, p_active boolean)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_id text := p_id;
begin
  perform private.ops_require_admin();
  if char_length(btrim(coalesce(p_name, ''))) < 2 then raise exception 'Dê um nome ao tipo.' using errcode = '22023'; end if;
  if coalesce(p_color, '') !~ '^#[0-9A-Fa-f]{6}$' then raise exception 'Cor inválida.' using errcode = '22023'; end if;
  if exists (select 1 from public.ops_meeting_categories where lower(btrim(name)) = lower(btrim(p_name)) and id is distinct from p_id) then
    raise exception 'Já existe um tipo com esse nome.' using errcode = '22023';
  end if;
  if p_id is null then
    insert into public.ops_meeting_categories (name, color, position)
    values (btrim(p_name), p_color, coalesce((select max(position) from public.ops_meeting_categories), 0) + 1)
    returning id into v_id;
  else
    update public.ops_meeting_categories set name = btrim(p_name), color = p_color, active = coalesce(p_active, active) where id = p_id;
    if not found then raise exception 'Tipo não encontrado.' using errcode = '22023'; end if;
  end if;
  insert into public.audit_logs (actor_id, action, target_type, target_id, details)
  values ((select auth.uid()), case when p_id is null then 'ops.meeting_category.create' else 'ops.meeting_category.update' end,
          'ops_meeting_category', v_id, jsonb_build_object('nome', btrim(p_name), 'cor', p_color, 'ativo', coalesce(p_active, true)));
  return v_id;
end;
$$;
revoke all on function private.ops_meeting_category_save_impl(text, text, text, boolean) from public, anon;
grant execute on function private.ops_meeting_category_save_impl(text, text, text, boolean) to authenticated;
create function public.ops_meeting_category_save(p_id text, p_name text, p_color text, p_active boolean default true)
returns text language sql set search_path = '' as $$ select private.ops_meeting_category_save_impl(p_id, p_name, p_color, p_active) $$;
revoke all on function public.ops_meeting_category_save(text, text, text, boolean) from public, anon;
grant execute on function public.ops_meeting_category_save(text, text, text, boolean) to authenticated;
