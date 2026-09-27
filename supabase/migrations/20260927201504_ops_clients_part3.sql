-- Etapa 36.3 (parte 3): filas por setor, etapas do cliente (com regras), demandas,
-- registro manual, visão do Account Manager e configurações.

-- Correção da parte 1: a regra de leitura das demandas compara com o id da DEMANDA.
drop policy "Vê demandas com tarefa visível ou do cliente que acompanha" on public.ops_demands;
create policy "Vê demandas com tarefa visível ou do cliente que acompanha" on public.ops_demands for select to authenticated
  using ((select private.ops_client_visible(client_id))
         or exists (select 1 from public.ops_tasks t where t.demand_id = ops_demands.id and (select private.ops_task_visible(t.id))));

-- -----------------------------------------------------------------------------
-- Fila do setor: mover o cartão para uma coluna muda o status ligado a ela.
-- -----------------------------------------------------------------------------
create function private.ops_task_move_queue_impl(p_id uuid, p_version integer, p_column uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_t record;
  v_c record;
  v_old_name text;
begin
  select * into v_t from public.ops_tasks where id = p_id;
  if v_t.id is null or not private.ops_task_visible(p_id) then raise exception 'Tarefa não encontrada.' using errcode = '22023'; end if;
  select * into v_c from public.ops_queue_columns where id = p_column;
  if v_c.id is null or not v_c.active or v_c.sector_id <> v_t.sector_id then
    raise exception 'Esta coluna não é da fila do setor da tarefa.' using errcode = '22023';
  end if;
  select name into v_old_name from public.ops_queue_columns where id = v_t.queue_column_id;
  if v_t.status_id <> v_c.status_id then
    -- Mesmas regras de "mudar status" (permissão, versão, arquivada, dependências).
    perform private.ops_task_set_status_impl(p_id, p_version, v_c.status_id);
    update public.ops_tasks set queue_column_id = p_column where id = p_id;
  else
    if not (private.ops_can('ops.cards.move') or private.ops_can('ops.tasks.edit')) then
      raise exception 'Você não tem permissão para mover esta tarefa.' using errcode = '42501';
    end if;
    if v_t.archived_at is not null then raise exception 'Tarefa arquivada: desarquive para mover.' using errcode = '22023'; end if;
    if v_t.version <> coalesce(p_version, -1) then
      raise exception 'Alguém alterou esta tarefa antes de você. Recarregue para ver a versão atual.' using errcode = '40001';
    end if;
    update public.ops_tasks set queue_column_id = p_column, version = version + 1, updated_by = (select auth.uid()) where id = p_id;
  end if;
  if v_t.queue_column_id is distinct from p_column then
    perform private.ops_log(p_id, v_t.client_id, 'tarefa.fila', jsonb_build_object('coluna', v_old_name), jsonb_build_object('coluna', v_c.name));
  end if;
  return (select version from public.ops_tasks where id = p_id);
end;
$$;
revoke all on function private.ops_task_move_queue_impl(uuid, integer, uuid) from public, anon;
grant execute on function private.ops_task_move_queue_impl(uuid, integer, uuid) to authenticated;
create function public.ops_task_move_queue(p_id uuid, p_version integer, p_column uuid)
returns integer language sql set search_path = '' as $$ select private.ops_task_move_queue_impl(p_id, p_version, p_column) $$;
revoke all on function public.ops_task_move_queue(uuid, integer, uuid) from public, anon;
grant execute on function public.ops_task_move_queue(uuid, integer, uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Etapas do cliente
-- -----------------------------------------------------------------------------
-- Tarefas obrigatórias ainda abertas nas etapas [de, até) que exigem obrigatórias.
create function private.ops_client_pending(p_client uuid, p_from integer, p_to integer)
returns integer language sql stable security definer set search_path = '' as $$
  select count(*)::integer
    from public.ops_tasks t
    join public.ops_client_stages st on st.id = t.client_stage_id
    join public.ops_statuses s on s.id = t.status_id
   where t.client_id = p_client and t.mandatory and t.archived_at is null
     and st.require_mandatory and st.position >= p_from and st.position < p_to
     and s.category not in ('concluido', 'cancelado')
$$;
revoke all on function private.ops_client_pending(uuid, integer, integer) from public, anon, authenticated;

-- Quem move o cliente de etapa: admin, o Account Manager dele, ou quem tem
-- "ver a ficha operacional" + "mover cartões".
create function private.ops_can_move_client(p_client uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_admin() or private.ops_is_am(p_client)
      or (private.ops_can('ops.clients.view') and private.ops_can('ops.cards.move'))
$$;
revoke all on function private.ops_can_move_client(uuid) from public, anon;
grant execute on function private.ops_can_move_client(uuid) to authenticated;

-- Quem coloca o cliente no fluxo e define o Account Manager.
create function private.ops_can_manage_clients()
returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_admin() or (private.ops_can('ops.clients.view') and private.ops_can('ops.tasks.assign'))
$$;
revoke all on function private.ops_can_manage_clients() from public, anon;
grant execute on function private.ops_can_manage_clients() to authenticated;

create function private.ops_client_start_impl(p_client uuid, p_stage text, p_am uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_stage text := coalesce(nullif(p_stage, ''), (select id from public.ops_client_stages where active order by position limit 1));
begin
  if not private.ops_can_manage_clients() then
    raise exception 'Você não tem permissão para colocar clientes no fluxo operacional.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.clients where id = p_client) then raise exception 'Cliente não encontrado.' using errcode = '22023'; end if;
  if exists (select 1 from public.ops_client_ops where client_id = p_client) then
    raise exception 'Este cliente já está no fluxo operacional.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.ops_client_stages where id = v_stage and active) then
    raise exception 'Escolha uma etapa ativa.' using errcode = '22023';
  end if;
  if p_am is not null and not private.ops_member_ok(p_am) then
    raise exception 'O Account Manager precisa estar ativo na Central.' using errcode = '22023';
  end if;
  insert into public.ops_client_ops (client_id, stage_id, am_user_id, created_by, updated_by)
  values (p_client, v_stage, p_am, (select auth.uid()), (select auth.uid()));
  perform private.ops_log(null, p_client, 'cliente.fluxo_iniciado', null, jsonb_build_object('etapa', v_stage, 'am', p_am));
end;
$$;
revoke all on function private.ops_client_start_impl(uuid, text, uuid) from public, anon;
grant execute on function private.ops_client_start_impl(uuid, text, uuid) to authenticated;
create function public.ops_client_start(p_client uuid, p_stage text default null, p_am uuid default null)
returns void language sql set search_path = '' as $$ select private.ops_client_start_impl(p_client, p_stage, p_am) $$;
revoke all on function public.ops_client_start(uuid, text, uuid) from public, anon;
grant execute on function public.ops_client_start(uuid, text, uuid) to authenticated;

create function private.ops_client_set_am_impl(p_client uuid, p_version integer, p_am uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_o record;
begin
  if not private.ops_can_manage_clients() then
    raise exception 'Você não tem permissão para trocar o Account Manager.' using errcode = '42501';
  end if;
  select * into v_o from public.ops_client_ops where client_id = p_client;
  if v_o.client_id is null then raise exception 'Este cliente ainda não está no fluxo operacional.' using errcode = '22023'; end if;
  if v_o.version <> coalesce(p_version, -1) then
    raise exception 'Alguém alterou este cliente antes de você. Recarregue para ver a versão atual.' using errcode = '40001';
  end if;
  if p_am is not null and not private.ops_member_ok(p_am) then
    raise exception 'O Account Manager precisa estar ativo na Central.' using errcode = '22023';
  end if;
  if p_am is not distinct from v_o.am_user_id then return v_o.version; end if;
  update public.ops_client_ops set am_user_id = p_am, version = version + 1, updated_by = (select auth.uid()) where client_id = p_client;
  perform private.ops_log(null, p_client, 'cliente.am', jsonb_build_object('am', v_o.am_user_id), jsonb_build_object('am', p_am));
  return v_o.version + 1;
end;
$$;
revoke all on function private.ops_client_set_am_impl(uuid, integer, uuid) from public, anon;
grant execute on function private.ops_client_set_am_impl(uuid, integer, uuid) to authenticated;
create function public.ops_client_set_am(p_client uuid, p_version integer, p_am uuid)
returns integer language sql set search_path = '' as $$ select private.ops_client_set_am_impl(p_client, p_version, p_am) $$;
revoke all on function public.ops_client_set_am(uuid, integer, uuid) from public, anon;
grant execute on function public.ops_client_set_am(uuid, integer, uuid) to authenticated;

-- Mover de etapa. Para a frente: só sem obrigatórias abertas nas etapas que ficam para trás.
create function private.ops_client_stage_move_impl(p_client uuid, p_version integer, p_stage text)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_o record;
  v_from integer;
  v_to integer;
  v_pending integer;
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
    v_pending := private.ops_client_pending(p_client, v_from, v_to);
    if v_pending > 0 then
      raise exception 'Há % tarefa(s) obrigatória(s) aberta(s) nesta etapa. Conclua antes de avançar o cliente.', v_pending using errcode = '22023';
    end if;
  end if;
  update public.ops_client_ops set stage_id = p_stage, stage_since = now(), version = version + 1, updated_by = (select auth.uid())
   where client_id = p_client;
  perform private.ops_log(null, p_client, 'cliente.etapa', jsonb_build_object('etapa', v_o.stage_id),
    jsonb_build_object('etapa', p_stage, 'regra', case when v_to > v_from then 'Avanço manual: nenhuma tarefa obrigatória aberta'
                                                       else 'Retorno manual de etapa' end));
  return v_o.version + 1;
end;
$$;
revoke all on function private.ops_client_stage_move_impl(uuid, integer, text) from public, anon;
grant execute on function private.ops_client_stage_move_impl(uuid, integer, text) to authenticated;
create function public.ops_client_stage_move(p_client uuid, p_version integer, p_stage text)
returns integer language sql set search_path = '' as $$ select private.ops_client_stage_move_impl(p_client, p_version, p_stage) $$;
revoke all on function public.ops_client_stage_move(uuid, integer, text) from public, anon;
grant execute on function public.ops_client_stage_move(uuid, integer, text) to authenticated;

-- Avanço automático: SÓ quando a etapa tem a regra ligada, tem ao menos uma
-- tarefa obrigatória e todas estão concluídas. Um passo por vez; fica no histórico.
create function private.ops_client_auto_advance_tg()
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
  select id, name into v_next from public.ops_client_stages where active and position > v_o.position order by position limit 1;
  if v_next.id is null then return null; end if;
  update public.ops_client_ops set stage_id = v_next.id, stage_since = now(), version = version + 1 where client_id = new.client_id;
  perform private.ops_log(null, new.client_id, 'cliente.etapa', jsonb_build_object('etapa', v_o.stage_id),
    jsonb_build_object('etapa', v_next.id, 'regra', 'Avanço automático: todas as tarefas obrigatórias de "' || v_o.name || '" concluídas'), 'sistema');
  return null;
end;
$$;
revoke all on function private.ops_client_auto_advance_tg() from public, anon, authenticated;
create trigger ops_tasks_client_auto_advance after update of status_id, archived_at on public.ops_tasks
  for each row when (new.mandatory and new.client_id is not null and new.client_stage_id is not null)
  execute function private.ops_client_auto_advance_tg();

-- -----------------------------------------------------------------------------
-- Liberar demanda para um ou vários setores (uma tarefa por setor, ligadas)
-- p: {client_id, title, briefing, client_stage_id, mandatory,
--     items: [{sector_id, title, principal, due_date, priority, depends_on (nº da linha anterior)}]}
-- -----------------------------------------------------------------------------
create function private.ops_demand_release_impl(p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := (select auth.uid());
  v_demand uuid;
  v_number bigint;
  v_item jsonb;
  v_i integer := 0;
  v_ids uuid[] := '{}';
  v_task uuid;
  v_dep integer;
  v_sector text;
begin
  perform private.ops_need('ops.tasks.create');
  if nullif(p ->> 'client_id', '') is null or not exists (select 1 from public.clients where id = (p ->> 'client_id')::uuid) then
    raise exception 'Escolha o cliente da demanda.' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p ->> 'title', ''))) < 3 then raise exception 'Escreva o título da demanda.' using errcode = '22023'; end if;
  if jsonb_typeof(p -> 'items') <> 'array' or jsonb_array_length(p -> 'items') not between 1 and 12 then
    raise exception 'Escolha de 1 a 12 setores.' using errcode = '22023';
  end if;
  insert into public.ops_demands (client_id, title, briefing, created_by)
  values ((p ->> 'client_id')::uuid, btrim(p ->> 'title'), nullif(btrim(p ->> 'briefing'), ''), v_me)
  returning id, number into v_demand, v_number;

  for v_item in select * from jsonb_array_elements(p -> 'items') loop
    select name into v_sector from public.ops_sectors where id = nullif(v_item ->> 'sector_id', '')::uuid;
    v_task := private.ops_task_save_impl(null, null, jsonb_build_object(
      'title', coalesce(nullif(btrim(v_item ->> 'title'), ''), btrim(p ->> 'title') || ' — ' || coalesce(v_sector, 'setor')),
      'description', p ->> 'briefing', 'client_id', p ->> 'client_id', 'sector_id', v_item ->> 'sector_id',
      'priority', coalesce(nullif(v_item ->> 'priority', ''), 'media'), 'due_date', v_item ->> 'due_date', 'visibility', 'setor',
      'client_stage_id', p ->> 'client_stage_id', 'mandatory', coalesce((p ->> 'mandatory')::boolean, false),
      'people', jsonb_build_object('principal', nullif(v_item ->> 'principal', ''))));
    update public.ops_tasks set demand_id = v_demand where id = v_task;
    v_ids := v_ids || v_task;
    v_dep := nullif(v_item ->> 'depends_on', '')::integer;
    if v_dep is not null then
      if v_dep < 0 or v_dep >= v_i then raise exception 'Uma linha só pode depender de uma linha anterior.' using errcode = '22023'; end if;
      insert into public.ops_task_deps (task_id, depends_on_id, created_by) values (v_task, v_ids[v_dep + 1], v_me);
      perform private.ops_log(v_task, (p ->> 'client_id')::uuid, 'tarefa.dependencia_incluida', null,
                              jsonb_build_object('depende_de', (select number from public.ops_tasks where id = v_ids[v_dep + 1])));
    end if;
    v_i := v_i + 1;
  end loop;
  perform private.ops_log(null, (p ->> 'client_id')::uuid, 'demanda.liberada', null,
    jsonb_build_object('demanda', v_number, 'titulo', btrim(p ->> 'title'), 'tarefas', v_i));
  return jsonb_build_object('id', v_demand, 'number', v_number, 'task_ids', to_jsonb(v_ids));
end;
$$;
revoke all on function private.ops_demand_release_impl(jsonb) from public, anon;
grant execute on function private.ops_demand_release_impl(jsonb) to authenticated;
create function public.ops_demand_release(p jsonb)
returns jsonb language sql set search_path = '' as $$ select private.ops_demand_release_impl(p) $$;
revoke all on function public.ops_demand_release(jsonb) from public, anon;
grant execute on function public.ops_demand_release(jsonb) to authenticated;

-- -----------------------------------------------------------------------------
-- Registro manual de atividades na ficha do cliente
-- p: {client_id, type_id, title, description, happened_at, responsible_id, sector_id, next_step, attachment_path, attachment_name}
-- -----------------------------------------------------------------------------
create function private.ops_client_note_add_impl(p jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_client uuid := nullif(p ->> 'client_id', '')::uuid;
  v_id uuid;
  v_path text := nullif(p ->> 'attachment_path', '');
begin
  perform private.ops_need('ops.history.edit');
  if v_client is null or not private.ops_client_visible(v_client) then raise exception 'Cliente não encontrado.' using errcode = '22023'; end if;
  if not exists (select 1 from public.ops_activity_types where id = p ->> 'type_id' and active) then
    raise exception 'Escolha o tipo de atividade.' using errcode = '22023';
  end if;
  if nullif(p ->> 'happened_at', '') is null then raise exception 'Informe a data e a hora.' using errcode = '22023'; end if;
  if nullif(p ->> 'responsible_id', '') is not null and not private.ops_member_ok((p ->> 'responsible_id')::uuid) then
    raise exception 'O responsável precisa estar ativo na Central.' using errcode = '22023';
  end if;
  if nullif(p ->> 'sector_id', '') is not null and not exists (select 1 from public.ops_sectors where id = (p ->> 'sector_id')::uuid and status = 'ativo') then
    raise exception 'Escolha um setor ativo.' using errcode = '22023';
  end if;
  if v_path is not null then
    if split_part(v_path, '/', 1) <> 'cliente-' || v_client::text then raise exception 'Arquivo fora da pasta do cliente.' using errcode = '22023'; end if;
    if not exists (select 1 from storage.objects where bucket_id = 'ops-files' and name = v_path) then
      raise exception 'O arquivo não chegou ao armazenamento. Envie de novo.' using errcode = '22023';
    end if;
  end if;
  insert into public.ops_client_notes (client_id, type_id, title, description, happened_at, responsible_id, sector_id, next_step,
                                       attachment_path, attachment_name, created_by)
  values (v_client, p ->> 'type_id', btrim(p ->> 'title'), nullif(btrim(p ->> 'description'), ''), (p ->> 'happened_at')::timestamptz,
          nullif(p ->> 'responsible_id', '')::uuid, nullif(p ->> 'sector_id', '')::uuid, nullif(btrim(p ->> 'next_step'), ''),
          v_path, case when v_path is not null then left(btrim(coalesce(p ->> 'attachment_name', 'anexo')), 200) end, (select auth.uid()))
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function private.ops_client_note_add_impl(jsonb) from public, anon;
grant execute on function private.ops_client_note_add_impl(jsonb) to authenticated;
create function public.ops_client_note_add(p jsonb)
returns uuid language sql set search_path = '' as $$ select private.ops_client_note_add_impl(p) $$;
revoke all on function public.ops_client_note_add(jsonb) from public, anon;
grant execute on function public.ops_client_note_add(jsonb) to authenticated;

create function private.ops_client_note_remove_impl(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_n record;
begin
  select * into v_n from public.ops_client_notes where id = p_id;
  if v_n.id is null or not private.ops_client_visible(v_n.client_id) then raise exception 'Atividade não encontrada.' using errcode = '22023'; end if;
  if v_n.created_by is distinct from (select auth.uid()) and not private.is_admin() then
    raise exception 'Só quem registrou (ou o admin) pode retirar a atividade.' using errcode = '42501';
  end if;
  if v_n.removed_at is not null then return; end if;
  update public.ops_client_notes set removed_at = now(), removed_by = (select auth.uid()) where id = p_id;
  perform private.ops_log(null, v_n.client_id, 'cliente.atividade_retirada', jsonb_build_object('titulo', v_n.title), null);
end;
$$;
revoke all on function private.ops_client_note_remove_impl(uuid) from public, anon;
grant execute on function private.ops_client_note_remove_impl(uuid) to authenticated;
create function public.ops_client_note_remove(p_id uuid)
returns void language sql set search_path = '' as $$ select private.ops_client_note_remove_impl(p_id) $$;
revoke all on function public.ops_client_note_remove(uuid) from public, anon;
grant execute on function public.ops_client_note_remove(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Visão do Account Manager: resumo por cliente (números sobre TODAS as tarefas
-- não arquivadas do cliente; as listas de tarefas continuam respeitando quem vê).
-- -----------------------------------------------------------------------------
create function private.ops_client_summary(p_client uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  with today as (select (now() at time zone 'America/Sao_Paulo')::date as d),
  t as (
    select t.*, s.category, private.ops_task_blockers(t.id) as blockers
      from public.ops_tasks t join public.ops_statuses s on s.id = t.status_id
     where t.client_id = p_client and t.archived_at is null
  )
  select jsonb_build_object(
    'abertas', count(*) filter (where category not in ('concluido', 'cancelado')),
    'concluidas', count(*) filter (where category = 'concluido'),
    'atrasadas', count(*) filter (where category not in ('concluido', 'cancelado') and due_date < (select d from today)),
    'urgentes', count(*) filter (where category not in ('concluido', 'cancelado') and priority = 'urgente'),
    'bloqueadas', count(*) filter (where category not in ('concluido', 'cancelado') and (category = 'bloqueado' or blockers > 0)),
    'aguardando_cliente', count(*) filter (where category = 'aguardando_cliente'),
    'proxima_entrega', min(due_date) filter (where category not in ('concluido', 'cancelado') and due_date >= (select d from today)),
    'obrigatorias', count(*) filter (where mandatory),
    'obrigatorias_concluidas', count(*) filter (where mandatory and category in ('concluido', 'cancelado')),
    'setores', coalesce(jsonb_agg(distinct sector_id) filter (where category not in ('concluido', 'cancelado')), '[]'),
    'ultima_atividade', greatest(
      (select max(a.created_at) from public.ops_activity a where a.client_id = p_client),
      (select max(n.happened_at) from public.ops_client_notes n where n.client_id = p_client and n.removed_at is null)))
  from t
$$;
revoke all on function private.ops_client_summary(uuid) from public, anon, authenticated;

create function private.ops_client_board_impl(f jsonb)
returns jsonb language sql stable security definer set search_path = '' as $$
  select case when not private.ops_can('ops.access') then null else jsonb_build_object(
    'clients', (select coalesce(jsonb_agg(jsonb_build_object(
                  'client_id', c.id, 'name', c.name, 'client_status', c.status, 'stage_id', o.stage_id, 'stage_since', o.stage_since,
                  'version', o.version, 'am_user_id', o.am_user_id, 'am_name', pa.full_name,
                  'stage_pending', private.ops_client_pending(c.id, st.position, st.position + 1),
                  'can_move', private.ops_can_move_client(c.id),
                  'summary', private.ops_client_summary(c.id)) order by c.name), '[]')
                  from public.ops_client_ops o
                  join public.clients c on c.id = o.client_id
                  join public.ops_client_stages st on st.id = o.stage_id
                  left join public.profiles pa on pa.id = o.am_user_id
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
revoke all on function private.ops_client_board_impl(jsonb) from public, anon;
grant execute on function private.ops_client_board_impl(jsonb) to authenticated;
create function public.ops_client_board(f jsonb default '{}')
returns jsonb language sql stable set search_path = '' as $$ select private.ops_client_board_impl(f) $$;
revoke all on function public.ops_client_board(jsonb) from public, anon;
grant execute on function public.ops_client_board(jsonb) to authenticated;

-- Ficha operacional de um cliente (também para quem ainda não está no fluxo).
create function private.ops_client_get_impl(p_client uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select case when not private.ops_client_visible(p_client) or not exists (select 1 from public.clients where id = p_client) then null else (
    select jsonb_build_object(
      'client', jsonb_build_object('id', c.id, 'name', c.name, 'status', c.status),
      'ops', (select jsonb_build_object('stage_id', o.stage_id, 'stage_since', o.stage_since, 'started_at', o.started_at, 'version', o.version,
                                        'am_user_id', o.am_user_id, 'am_name', pa.full_name,
                                        'stage_pending', private.ops_client_pending(o.client_id, st.position, st.position + 1))
                from public.ops_client_ops o join public.ops_client_stages st on st.id = o.stage_id
                left join public.profiles pa on pa.id = o.am_user_id where o.client_id = p_client),
      'summary', private.ops_client_summary(p_client),
      'demands', (select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'number', d.number, 'title', d.title, 'created_at', d.created_at,
                    'total', (select count(*) from public.ops_tasks t where t.demand_id = d.id and t.archived_at is null),
                    'done', (select count(*) from public.ops_tasks t join public.ops_statuses s on s.id = t.status_id
                              where t.demand_id = d.id and t.archived_at is null and s.category in ('concluido', 'cancelado')))
                    order by d.created_at desc), '[]') from public.ops_demands d where d.client_id = p_client),
      'notes', (select coalesce(jsonb_agg(jsonb_build_object('id', n.id, 'type_id', n.type_id, 'type_name', ty.name, 'title', n.title,
                    'description', n.description, 'happened_at', n.happened_at, 'responsible_id', n.responsible_id, 'responsible', pr.full_name,
                    'sector_id', n.sector_id, 'next_step', n.next_step, 'attachment_path', n.attachment_path, 'attachment_name', n.attachment_name,
                    'created_by', n.created_by, 'author', pc.full_name, 'created_at', n.created_at) order by n.happened_at desc), '[]')
                  from public.ops_client_notes n join public.ops_activity_types ty on ty.id = n.type_id
                  left join public.profiles pr on pr.id = n.responsible_id left join public.profiles pc on pc.id = n.created_by
                 where n.client_id = p_client and n.removed_at is null),
      'timeline', (select coalesce(jsonb_agg(y.x order by y.created_at desc), '[]') from (
                     select jsonb_build_object('id', a.id, 'action', a.action, 'actor', ph.full_name, 'origin', a.origin, 'before', a.before,
                                               'after', a.after, 'created_at', a.created_at, 'task_id', a.task_id, 'task_number', t.number,
                                               'task_visible', a.task_id is not null and private.ops_task_visible(a.task_id),
                                               'task_title', case when a.task_id is not null and private.ops_task_visible(a.task_id) then t.title end,
                                               'sector_id', t.sector_id) as x, a.created_at
                       from public.ops_activity a left join public.profiles ph on ph.id = a.actor_id left join public.ops_tasks t on t.id = a.task_id
                      where a.client_id = p_client order by a.created_at desc limit 300) y),
      'can', jsonb_build_object('move', private.ops_can_move_client(p_client), 'manage', private.ops_can_manage_clients(),
                                'note', private.ops_can('ops.history.edit'), 'release', private.ops_can('ops.tasks.create'), 'admin', private.is_admin()))
      from public.clients c where c.id = p_client) end
$$;
revoke all on function private.ops_client_get_impl(uuid) from public, anon;
grant execute on function private.ops_client_get_impl(uuid) to authenticated;
create function public.ops_client_get(p_client uuid)
returns jsonb language sql stable set search_path = '' as $$ select private.ops_client_get_impl(p_client) $$;
revoke all on function public.ops_client_get(uuid) from public, anon;
grant execute on function public.ops_client_get(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Configurações (só admin): etapas, colunas das filas e tipos de atividade
-- -----------------------------------------------------------------------------
create function private.ops_client_stage_save_impl(p_id text, p_name text, p_color text, p_require boolean, p_auto boolean)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_id text := p_id;
  v_before jsonb;
begin
  perform private.ops_require_admin();
  if exists (select 1 from public.ops_client_stages where lower(btrim(name)) = lower(btrim(p_name)) and id is distinct from p_id) then
    raise exception 'Já existe uma etapa com esse nome.' using errcode = '22023';
  end if;
  if p_id is null then
    insert into public.ops_client_stages (name, color, require_mandatory, auto_advance, position, updated_by)
    values (btrim(p_name), p_color, coalesce(p_require, true), coalesce(p_auto, false),
            coalesce((select max(position) from public.ops_client_stages), 0) + 1, (select auth.uid()))
    returning id into v_id;
  else
    select to_jsonb(s) into v_before from public.ops_client_stages s where id = p_id;
    if v_before is null then raise exception 'Etapa não encontrada.' using errcode = '22023'; end if;
    update public.ops_client_stages set name = btrim(p_name), color = p_color, require_mandatory = coalesce(p_require, true),
           auto_advance = coalesce(p_auto, false), updated_at = now(), updated_by = (select auth.uid()) where id = p_id;
  end if;
  insert into public.audit_logs (actor_id, action, target_type, target_id, details)
  values ((select auth.uid()), case when p_id is null then 'ops.client_stage.create' else 'ops.client_stage.update' end, 'ops_client_stage', v_id,
          jsonb_build_object('antes', v_before, 'depois', jsonb_build_object('nome', btrim(p_name), 'cor', p_color,
                             'exige_obrigatorias', coalesce(p_require, true), 'avanca_sozinho', coalesce(p_auto, false))));
  return v_id;
end;
$$;
revoke all on function private.ops_client_stage_save_impl(text, text, text, boolean, boolean) from public, anon;
grant execute on function private.ops_client_stage_save_impl(text, text, text, boolean, boolean) to authenticated;
create function public.ops_client_stage_save(p_id text, p_name text, p_color text, p_require boolean, p_auto boolean)
returns text language sql set search_path = '' as $$ select private.ops_client_stage_save_impl(p_id, p_name, p_color, p_require, p_auto) $$;
revoke all on function public.ops_client_stage_save(text, text, text, boolean, boolean) from public, anon;
grant execute on function public.ops_client_stage_save(text, text, text, boolean, boolean) to authenticated;

create function private.ops_client_stage_reorder_impl(p_ids text[])
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.ops_require_admin();
  update public.ops_client_stages s set position = o.ord, updated_at = now(), updated_by = (select auth.uid())
    from unnest(p_ids) with ordinality as o(id, ord) where s.id = o.id;
  insert into public.audit_logs (actor_id, action, target_type, target_id, details)
  values ((select auth.uid()), 'ops.client_stage.reorder', 'ops_client_stage', null, jsonb_build_object('ordem', to_jsonb(p_ids)));
end;
$$;
revoke all on function private.ops_client_stage_reorder_impl(text[]) from public, anon;
grant execute on function private.ops_client_stage_reorder_impl(text[]) to authenticated;
create function public.ops_client_stage_reorder(p_ids text[])
returns void language sql set search_path = '' as $$ select private.ops_client_stage_reorder_impl(p_ids) $$;
revoke all on function public.ops_client_stage_reorder(text[]) from public, anon;
grant execute on function public.ops_client_stage_reorder(text[]) to authenticated;

create function private.ops_client_stage_set_active_impl(p_id text, p_active boolean, p_move_to text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_count integer;
begin
  perform private.ops_require_admin();
  if not exists (select 1 from public.ops_client_stages where id = p_id) then raise exception 'Etapa não encontrada.' using errcode = '22023'; end if;
  if not p_active then
    if not exists (select 1 from public.ops_client_stages where active and id <> p_id) then
      raise exception 'Precisa haver pelo menos uma etapa ativa.' using errcode = '22023';
    end if;
    select count(*) into v_count from public.ops_client_ops where stage_id = p_id;
    if v_count > 0 then
      if p_move_to is null or p_move_to = p_id or not exists (select 1 from public.ops_client_stages where id = p_move_to and active) then
        raise exception 'Há % cliente(s) nesta etapa. Escolha para qual etapa eles vão antes de desativar.', v_count using errcode = '22023';
      end if;
      insert into public.ops_activity (task_id, client_id, action, actor_id, origin, before, after)
      select null, o.client_id, 'cliente.etapa', (select auth.uid()), 'sistema', jsonb_build_object('etapa', p_id),
             jsonb_build_object('etapa', p_move_to, 'regra', 'Etapa desativada pelo administrador')
        from public.ops_client_ops o where o.stage_id = p_id;
      update public.ops_client_ops set stage_id = p_move_to, stage_since = now(), version = version + 1 where stage_id = p_id;
    end if;
  end if;
  update public.ops_client_stages set active = p_active, updated_at = now(), updated_by = (select auth.uid()) where id = p_id;
  insert into public.audit_logs (actor_id, action, target_type, target_id, details)
  values ((select auth.uid()), 'ops.client_stage.active', 'ops_client_stage', p_id,
          jsonb_build_object('ativo', p_active, 'clientes_movidos', coalesce(v_count, 0), 'destino', p_move_to));
end;
$$;
revoke all on function private.ops_client_stage_set_active_impl(text, boolean, text) from public, anon;
grant execute on function private.ops_client_stage_set_active_impl(text, boolean, text) to authenticated;
create function public.ops_client_stage_set_active(p_id text, p_active boolean, p_move_to text default null)
returns void language sql set search_path = '' as $$ select private.ops_client_stage_set_active_impl(p_id, p_active, p_move_to) $$;
revoke all on function public.ops_client_stage_set_active(text, boolean, text) from public, anon;
grant execute on function public.ops_client_stage_set_active(text, boolean, text) to authenticated;

create function private.ops_queue_column_save_impl(p_id uuid, p_sector uuid, p_name text, p_color text, p_status text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := p_id;
  v_before jsonb;
begin
  perform private.ops_require_admin();
  if not exists (select 1 from public.ops_sectors where id = p_sector and status <> 'arquivado') then
    raise exception 'Setor não encontrado.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.ops_statuses where id = p_status and active) then
    raise exception 'Escolha um status ativo para a coluna.' using errcode = '22023';
  end if;
  if exists (select 1 from public.ops_queue_columns where sector_id = p_sector and lower(btrim(name)) = lower(btrim(p_name)) and id is distinct from p_id) then
    raise exception 'Este setor já tem uma coluna com esse nome.' using errcode = '22023';
  end if;
  if p_id is null then
    insert into public.ops_queue_columns (sector_id, name, color, status_id, position, updated_by)
    values (p_sector, btrim(p_name), p_color, p_status,
            coalesce((select max(position) from public.ops_queue_columns where sector_id = p_sector), 0) + 1, (select auth.uid()))
    returning id into v_id;
  else
    select to_jsonb(q) into v_before from public.ops_queue_columns q where id = p_id and sector_id = p_sector;
    if v_before is null then raise exception 'Coluna não encontrada.' using errcode = '22023'; end if;
    update public.ops_queue_columns set name = btrim(p_name), color = p_color, status_id = p_status, updated_at = now(), updated_by = (select auth.uid())
     where id = p_id;
  end if;
  insert into public.audit_logs (actor_id, action, target_type, target_id, details)
  values ((select auth.uid()), case when p_id is null then 'ops.queue_column.create' else 'ops.queue_column.update' end, 'ops_queue_column', v_id,
          jsonb_build_object('antes', v_before, 'depois', jsonb_build_object('setor', p_sector, 'nome', btrim(p_name), 'cor', p_color, 'status', p_status)));
  return v_id;
end;
$$;
revoke all on function private.ops_queue_column_save_impl(uuid, uuid, text, text, text) from public, anon;
grant execute on function private.ops_queue_column_save_impl(uuid, uuid, text, text, text) to authenticated;
create function public.ops_queue_column_save(p_id uuid, p_sector uuid, p_name text, p_color text, p_status text)
returns uuid language sql set search_path = '' as $$ select private.ops_queue_column_save_impl(p_id, p_sector, p_name, p_color, p_status) $$;
revoke all on function public.ops_queue_column_save(uuid, uuid, text, text, text) from public, anon;
grant execute on function public.ops_queue_column_save(uuid, uuid, text, text, text) to authenticated;

create function private.ops_queue_column_reorder_impl(p_sector uuid, p_ids uuid[])
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.ops_require_admin();
  update public.ops_queue_columns q set position = o.ord, updated_at = now(), updated_by = (select auth.uid())
    from unnest(p_ids) with ordinality as o(id, ord) where q.id = o.id and q.sector_id = p_sector;
  insert into public.audit_logs (actor_id, action, target_type, target_id, details)
  values ((select auth.uid()), 'ops.queue_column.reorder', 'ops_queue_column', p_sector::text, jsonb_build_object('ordem', to_jsonb(p_ids)));
end;
$$;
revoke all on function private.ops_queue_column_reorder_impl(uuid, uuid[]) from public, anon;
grant execute on function private.ops_queue_column_reorder_impl(uuid, uuid[]) to authenticated;
create function public.ops_queue_column_reorder(p_sector uuid, p_ids uuid[])
returns void language sql set search_path = '' as $$ select private.ops_queue_column_reorder_impl(p_sector, p_ids) $$;
revoke all on function public.ops_queue_column_reorder(uuid, uuid[]) from public, anon;
grant execute on function public.ops_queue_column_reorder(uuid, uuid[]) to authenticated;

create function private.ops_queue_column_set_active_impl(p_id uuid, p_active boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.ops_require_admin();
  if not exists (select 1 from public.ops_queue_columns where id = p_id) then raise exception 'Coluna não encontrada.' using errcode = '22023'; end if;
  -- As tarefas não mudam: sem a coluna, aparecem na primeira coluna ativa com o mesmo status.
  update public.ops_queue_columns set active = p_active, updated_at = now(), updated_by = (select auth.uid()) where id = p_id;
  insert into public.audit_logs (actor_id, action, target_type, target_id, details)
  values ((select auth.uid()), 'ops.queue_column.active', 'ops_queue_column', p_id::text, jsonb_build_object('ativo', p_active));
end;
$$;
revoke all on function private.ops_queue_column_set_active_impl(uuid, boolean) from public, anon;
grant execute on function private.ops_queue_column_set_active_impl(uuid, boolean) to authenticated;
create function public.ops_queue_column_set_active(p_id uuid, p_active boolean)
returns void language sql set search_path = '' as $$ select private.ops_queue_column_set_active_impl(p_id, p_active) $$;
revoke all on function public.ops_queue_column_set_active(uuid, boolean) from public, anon;
grant execute on function public.ops_queue_column_set_active(uuid, boolean) to authenticated;

create function private.ops_activity_type_save_impl(p_id text, p_name text, p_active boolean)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_id text := p_id;
begin
  perform private.ops_require_admin();
  if exists (select 1 from public.ops_activity_types where lower(btrim(name)) = lower(btrim(p_name)) and id is distinct from p_id) then
    raise exception 'Já existe um tipo com esse nome.' using errcode = '22023';
  end if;
  if p_id is null then
    insert into public.ops_activity_types (name, position) values (btrim(p_name), coalesce((select max(position) from public.ops_activity_types), 0) + 1)
    returning id into v_id;
  else
    update public.ops_activity_types set name = btrim(p_name), active = coalesce(p_active, active) where id = p_id;
    if not found then raise exception 'Tipo não encontrado.' using errcode = '22023'; end if;
  end if;
  insert into public.audit_logs (actor_id, action, target_type, target_id, details)
  values ((select auth.uid()), case when p_id is null then 'ops.activity_type.create' else 'ops.activity_type.update' end, 'ops_activity_type', v_id,
          jsonb_build_object('nome', btrim(p_name), 'ativo', coalesce(p_active, true)));
  return v_id;
end;
$$;
revoke all on function private.ops_activity_type_save_impl(text, text, boolean) from public, anon;
grant execute on function private.ops_activity_type_save_impl(text, text, boolean) to authenticated;
create function public.ops_activity_type_save(p_id text, p_name text, p_active boolean default true)
returns text language sql set search_path = '' as $$ select private.ops_activity_type_save_impl(p_id, p_name, p_active) $$;
revoke all on function public.ops_activity_type_save(text, text, boolean) from public, anon;
grant execute on function public.ops_activity_type_save(text, text, boolean) to authenticated;
