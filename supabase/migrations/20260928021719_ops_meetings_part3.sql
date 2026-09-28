-- Etapa 36.5 (parte 3): criar reunião nova não lê a versão anterior (que não existe).
create or replace function private.ops_meeting_save_impl(p_id uuid, p_version integer, p jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := (select auth.uid());
  v_id uuid := p_id;
  v_old record;
  v_before jsonb;
  v_after jsonb;
  v_people uuid[];
  v_user uuid;
  v_old_category text;
  v_old_sector uuid;
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
    v_old_category := v_old.category_id;
    v_old_sector := v_old.sector_id;
  end if;

  if char_length(btrim(coalesce(p ->> 'title', ''))) < 3 then raise exception 'Dê um título à reunião (mínimo 3 letras).' using errcode = '22023'; end if;
  if not exists (select 1 from public.ops_meeting_categories where id = p ->> 'category_id'
                 and (active or id = v_old_category)) then
    raise exception 'Escolha o tipo da reunião.' using errcode = '22023';
  end if;
  if nullif(p ->> 'starts_at', '') is null then raise exception 'Informe a data e a hora.' using errcode = '22023'; end if;
  if coalesce(nullif(p ->> 'duration_min', '')::integer, 30) not between 5 and 600 then
    raise exception 'A duração vai de 5 minutos a 10 horas.' using errcode = '22023';
  end if;
  if nullif(p ->> 'sector_id', '') is not null and not exists (
       select 1 from public.ops_sectors where id = (p ->> 'sector_id')::uuid and (status = 'ativo' or id = v_old_sector)) then
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
