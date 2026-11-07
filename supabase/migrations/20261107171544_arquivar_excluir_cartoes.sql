-- Etapa 51.3 — Arquivar e excluir cartões (tarefas da Central e leads do Comercial), pedido do Ander (07/11/2026):
--   arquivar: quem criou o cartão ou quem recebeu (responsável), além de quem já podia;
--   excluir: só quem criou (e o administrador). Excluir NÃO apaga do banco: marca deleted_at, some de todas as telas
--   (um cartão excluído também fica arquivado, para todas as contas e listas que já ignoram arquivados) e fica na lista
--   "Excluídos". Restaurar: só o administrador. Prazo de guarda: a definir pelo Ander (até lá, permanente).

-- ---------------------------------------------------------------- Colunas
alter table public.ops_tasks
  add column deleted_at timestamptz,
  add column deleted_by uuid references auth.users (id) on delete set null;
comment on column public.ops_tasks.deleted_at is 'Etapa 51.3: tarefa excluída (some de todas as telas; também fica arquivada). Restaurar: só admin.';
create index ops_tasks_deleted_by_idx on public.ops_tasks (deleted_by);
create index ops_tasks_deleted_idx on public.ops_tasks (deleted_at) where deleted_at is not null;

alter table public.ops_leads
  add column archived_by uuid references auth.users (id) on delete set null,
  add column deleted_at timestamptz,
  add column deleted_by uuid references auth.users (id) on delete set null;
comment on column public.ops_leads.deleted_at is 'Etapa 51.3: lead excluído (some de todas as telas; também fica arquivado). Restaurar: só admin.';
create index ops_leads_archived_by_idx on public.ops_leads (archived_by);
create index ops_leads_deleted_by_idx on public.ops_leads (deleted_by);
create index ops_leads_deleted_idx on public.ops_leads (deleted_at) where deleted_at is not null;

-- ---------------------------------------------------------------- Tarefa excluída não é vista por ninguém (listas, ficha, busca, RLS)
create or replace function private.ops_task_visible(p_task uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select case
    when private.is_admin() then exists (select 1 from public.ops_tasks where id = p_task and deleted_at is null)
    when not private.ops_can('ops.access') then false
    else exists (
      select 1 from public.ops_tasks t
       where t.id = p_task and t.deleted_at is null
         and (t.created_by = (select auth.uid())
              or t.visibility = 'equipe'
              or exists (select 1 from public.ops_task_people p where p.task_id = t.id and p.user_id = (select auth.uid()))
              or (t.visibility = 'setor' and exists (select 1 from public.ops_member_sectors s
                                                     where s.user_id = (select auth.uid()) and s.sector_id = t.sector_id))
              or (t.visibility <> 'participantes' and t.client_id is not null
                  and exists (select 1 from public.ops_client_ops o where o.client_id = t.client_id and o.am_user_id = (select auth.uid())))))
  end
$$;

-- ---------------------------------------------------------------- Quem pode
create function private.ops_can_archive_task(p_task uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.ops_task_visible(p_task) and (
    private.is_admin() or private.ops_can('ops.tasks.archive')
    or exists (select 1 from public.ops_tasks t where t.id = p_task and t.created_by = (select auth.uid()))
    or exists (select 1 from public.ops_task_people p where p.task_id = p_task and p.user_id = (select auth.uid())
                and p.role in ('principal', 'adicional')))
$$;
revoke all on function private.ops_can_archive_task(uuid) from public, anon, authenticated;

create function private.ops_can_delete_task(p_task uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.ops_task_visible(p_task) and (
    private.is_admin() or exists (select 1 from public.ops_tasks t where t.id = p_task and t.created_by = (select auth.uid())))
$$;
revoke all on function private.ops_can_delete_task(uuid) from public, anon, authenticated;

create function private.ops_can_archive_lead(p_lead uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.ops_can('ops.commercial') and exists (
    select 1 from public.ops_leads l where l.id = p_lead and l.deleted_at is null
       and (private.is_admin() or l.created_by = (select auth.uid()) or l.owner_id = (select auth.uid())))
$$;
revoke all on function private.ops_can_archive_lead(uuid) from public, anon, authenticated;

create function private.ops_can_delete_lead(p_lead uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.ops_can('ops.commercial') and exists (
    select 1 from public.ops_leads l where l.id = p_lead and l.deleted_at is null and l.client_id is null
       and (private.is_admin() or l.created_by = (select auth.uid())))
$$;
revoke all on function private.ops_can_delete_lead(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------- Arquivar (regra nova)
create or replace function private.ops_task_archive_impl(p_id uuid, p_archived boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_old record;
begin
  select * into v_old from public.ops_tasks where id = p_id;
  if v_old.id is null or not private.ops_task_visible(p_id) then raise exception 'Tarefa não encontrada.' using errcode = '22023'; end if;
  if not private.ops_can_archive_task(p_id) then
    raise exception 'Você só pode arquivar tarefas que criou ou que estão com você.' using errcode = '42501';
  end if;
  if (v_old.archived_at is not null) = p_archived then return; end if;
  update public.ops_tasks
     set archived_at = case when p_archived then now() end, archived_by = case when p_archived then (select auth.uid()) end,
         version = version + 1, updated_by = (select auth.uid())
   where id = p_id;
  perform private.ops_log(p_id, v_old.client_id, case when p_archived then 'tarefa.arquivada' else 'tarefa.desarquivada' end, null, null);
end;
$$;

create or replace function private.ops_lead_archive_impl(p_id uuid, p_archived boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_l record;
begin
  perform private.ops_need('ops.commercial');
  select * into v_l from public.ops_leads where id = p_id and deleted_at is null;
  if v_l.id is null then raise exception 'Lead não encontrado.' using errcode = '22023'; end if;
  if not private.ops_can_archive_lead(p_id) then
    raise exception 'Você só pode arquivar leads que criou ou que estão com você (responsável).' using errcode = '42501';
  end if;
  if (v_l.archived_at is not null) = p_archived then return; end if;
  update public.ops_leads set archived_at = case when p_archived then now() end, archived_by = case when p_archived then (select auth.uid()) end,
         version = version + 1, updated_by = (select auth.uid()) where id = p_id;
  perform private.ops_lead_log(p_id, case when p_archived then 'lead.arquivado' else 'lead.desarquivado' end, null, null);
end;
$$;

-- ---------------------------------------------------------------- Excluir e restaurar
create function private.ops_task_delete_impl(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_t record;
begin
  select * into v_t from public.ops_tasks where id = p_id;
  if v_t.id is null or not private.ops_task_visible(p_id) then raise exception 'Tarefa não encontrada.' using errcode = '22023'; end if;
  if not private.ops_can_delete_task(p_id) then
    raise exception 'Só quem criou a tarefa (ou um administrador) pode excluí-la. Você pode arquivar.' using errcode = '42501';
  end if;
  update public.ops_tasks set deleted_at = now(), deleted_by = (select auth.uid()),
         archived_at = coalesce(archived_at, now()), archived_by = coalesce(archived_by, (select auth.uid())),
         version = version + 1, updated_by = (select auth.uid())
   where id = p_id;
  perform private.ops_log(p_id, v_t.client_id, 'tarefa.excluida', null, null);
end;
$$;
revoke all on function private.ops_task_delete_impl(uuid) from public, anon;
grant execute on function private.ops_task_delete_impl(uuid) to authenticated;
create function public.ops_task_delete(p_id uuid)
returns void language sql set search_path = '' as $$ select private.ops_task_delete_impl(p_id) $$;
revoke all on function public.ops_task_delete(uuid) from public, anon;
grant execute on function public.ops_task_delete(uuid) to authenticated;

create function private.ops_task_restore_impl(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_t record;
begin
  if not private.is_admin() then raise exception 'Só o administrador restaura tarefas excluídas.' using errcode = '42501'; end if;
  select * into v_t from public.ops_tasks where id = p_id and deleted_at is not null;
  if v_t.id is null then raise exception 'Tarefa excluída não encontrada.' using errcode = '22023'; end if;
  -- volta como arquivada (desarquivar é um passo à parte)
  update public.ops_tasks set deleted_at = null, deleted_by = null, version = version + 1, updated_by = (select auth.uid()) where id = p_id;
  perform private.ops_log(p_id, v_t.client_id, 'tarefa.restaurada', null, null);
end;
$$;
revoke all on function private.ops_task_restore_impl(uuid) from public, anon;
grant execute on function private.ops_task_restore_impl(uuid) to authenticated;
create function public.ops_task_restore(p_id uuid)
returns void language sql set search_path = '' as $$ select private.ops_task_restore_impl(p_id) $$;
revoke all on function public.ops_task_restore(uuid) from public, anon;
grant execute on function public.ops_task_restore(uuid) to authenticated;

create function private.ops_lead_delete_impl(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_l record;
begin
  perform private.ops_need('ops.commercial');
  select * into v_l from public.ops_leads where id = p_id and deleted_at is null;
  if v_l.id is null then raise exception 'Lead não encontrado.' using errcode = '22023'; end if;
  if v_l.client_id is not null then
    raise exception 'Este lead já virou cliente: não pode ser excluído. Você pode arquivar.' using errcode = '22023';
  end if;
  if not private.ops_can_delete_lead(p_id) then
    raise exception 'Só quem criou o lead (ou um administrador) pode excluí-lo. Você pode arquivar.' using errcode = '42501';
  end if;
  update public.ops_leads set deleted_at = now(), deleted_by = (select auth.uid()),
         archived_at = coalesce(archived_at, now()), archived_by = coalesce(archived_by, (select auth.uid())),
         version = version + 1, updated_by = (select auth.uid())
   where id = p_id;
  perform private.ops_lead_log(p_id, 'lead.excluido', null, null);
end;
$$;
revoke all on function private.ops_lead_delete_impl(uuid) from public, anon;
grant execute on function private.ops_lead_delete_impl(uuid) to authenticated;
create function public.ops_lead_delete(p_id uuid)
returns void language sql set search_path = '' as $$ select private.ops_lead_delete_impl(p_id) $$;
revoke all on function public.ops_lead_delete(uuid) from public, anon;
grant execute on function public.ops_lead_delete(uuid) to authenticated;

create function private.ops_lead_restore_impl(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'Só o administrador restaura leads excluídos.' using errcode = '42501'; end if;
  if not exists (select 1 from public.ops_leads where id = p_id and deleted_at is not null) then
    raise exception 'Lead excluído não encontrado.' using errcode = '22023';
  end if;
  update public.ops_leads set deleted_at = null, deleted_by = null, version = version + 1, updated_by = (select auth.uid()) where id = p_id;
  perform private.ops_lead_log(p_id, 'lead.restaurado', null, null);
end;
$$;
revoke all on function private.ops_lead_restore_impl(uuid) from public, anon;
grant execute on function private.ops_lead_restore_impl(uuid) to authenticated;
create function public.ops_lead_restore(p_id uuid)
returns void language sql set search_path = '' as $$ select private.ops_lead_restore_impl(p_id) $$;
revoke all on function public.ops_lead_restore(uuid) from public, anon;
grant execute on function public.ops_lead_restore(uuid) to authenticated;

-- ---------------------------------------------------------------- Ficha da tarefa e do lead: permissões novas; lead excluído não abre
create function private.ops_task_get_v2_impl(p_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select case when j is null then null
              else jsonb_set(jsonb_set(j, '{can,archive}', to_jsonb(private.ops_can_archive_task(p_id))),
                             '{can,delete}', to_jsonb(private.ops_can_delete_task(p_id))) end
    from (select private.ops_task_get_impl(p_id) as j) x
$$;
revoke all on function private.ops_task_get_v2_impl(uuid) from public, anon;
grant execute on function private.ops_task_get_v2_impl(uuid) to authenticated;
create or replace function public.ops_task_get(p_id uuid)
returns jsonb language sql stable set search_path = '' as $$ select private.ops_task_get_v2_impl(p_id) $$;

create function private.ops_lead_get_v2_impl(p_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select case when j is null or exists (select 1 from public.ops_leads where id = p_id and deleted_at is not null) then null
              else jsonb_set(jsonb_set(j, '{can,archive}', to_jsonb(private.ops_can_archive_lead(p_id))),
                             '{can,delete}', to_jsonb(private.ops_can_delete_lead(p_id))) end
    from (select private.ops_lead_get_impl(p_id) as j) x
$$;
revoke all on function private.ops_lead_get_v2_impl(uuid) from public, anon;
grant execute on function private.ops_lead_get_v2_impl(uuid) to authenticated;
create or replace function public.ops_lead_get(p_id uuid)
returns jsonb language sql stable set search_path = '' as $$ select private.ops_lead_get_v2_impl(p_id) $$;

-- ---------------------------------------------------------------- Comercial: lead excluído some do filtro "Arquivados" e dos avisos de duplicado
create or replace function private.ops_lead_board_impl(f jsonb)
returns jsonb language sql stable security definer set search_path = '' as $$
  with today as (select (now() at time zone 'America/Sao_Paulo')::date as d)
  select case when not private.ops_can('ops.commercial') then null else jsonb_build_object(
    'leads', (select coalesce(jsonb_agg(jsonb_build_object(
                'id', l.id, 'number', l.number, 'company_name', l.company_name, 'contact_name', l.contact_name, 'segment', l.segment,
                'owner_id', l.owner_id, 'owner_name', po.full_name, 'entered_at', l.entered_at, 'last_interaction_at', l.last_interaction_at,
                'next_action', l.next_action, 'next_action_date', l.next_action_date, 'priority', l.priority, 'potential_value', l.potential_value,
                'currency', l.currency, 'origin', l.origin, 'stage_id', l.stage_id, 'version', l.version, 'client_id', l.client_id,
                'archived_at', l.archived_at, 'loss_reason', lr.name,
                'last_contact', (select jsonb_build_object('kind', e.kind, 'body', left(e.body, 140), 'at', coalesce(e.happened_at, e.created_at))
                                   from public.ops_lead_events e where e.lead_id = l.id and e.action = 'lead.interacao'
                                  order by date_trunc('minute', coalesce(e.happened_at, e.created_at)) desc, e.created_at desc, e.id desc limit 1),
                'overdue', s.category = 'aberto' and l.next_action_date < (select d from today)) order by l.next_action_date nulls last, l.number desc), '[]')
                from public.ops_leads l
                join public.ops_lead_stages s on s.id = l.stage_id
                left join public.profiles po on po.id = l.owner_id
                left join public.ops_loss_reasons lr on lr.id = l.loss_reason_id
               where l.deleted_at is null
                 and (case when coalesce((f ->> 'archived')::boolean, false) then l.archived_at is not null else l.archived_at is null end)
                 and (nullif(f ->> 'q', '') is null or private.search_norm(l.company_name) like '%' || private.search_norm(f ->> 'q') || '%'
                      or private.search_norm(l.contact_name) like '%' || private.search_norm(f ->> 'q') || '%'
                      or private.search_norm(l.segment) like '%' || private.search_norm(f ->> 'q') || '%'
                      or l.number::text = ltrim(f ->> 'q', '#'))
                 and (nullif(f ->> 'owner_id', '') is null or (f ->> 'owner_id' = 'nenhum' and l.owner_id is null) or l.owner_id::text = f ->> 'owner_id')
                 and (nullif(f ->> 'origin', '') is null or l.origin = f ->> 'origin')
                 and (nullif(f ->> 'priority', '') is null or l.priority = f ->> 'priority')
                 and (not coalesce((f ->> 'overdue')::boolean, false) or (s.category = 'aberto' and l.next_action_date < (select d from today)))),
    'origins', (select coalesce(jsonb_agg(distinct l.origin), '[]') from public.ops_leads l where l.origin is not null and l.deleted_at is null),
    'can', jsonb_build_object('create_client', private.current_user_role() in ('admin', 'gestor'), 'onboarding', private.ops_can_manage_clients()))
  end
$$;

create or replace function private.ops_lead_duplicates_impl(p jsonb)
returns jsonb language sql stable security definer set search_path = '' as $$
  with q as (
    select nullif(p ->> 'id', '')::uuid as id, private.ops_norm_name(p ->> 'company_name') as name,
           nullif(lower(btrim(p ->> 'email')), '') as email, private.ops_norm_phone(p ->> 'phone') as phone,
           nullif(upper(regexp_replace(coalesce(p ->> 'cnpj', ''), '[^0-9A-Za-z]', '', 'g')), '') as cnpj
  )
  select case when not private.ops_can('ops.commercial') then null else jsonb_build_object(
    'leads', (select coalesce(jsonb_agg(x order by x ->> 'company_name'), '[]') from (
      select jsonb_build_object('id', l.id, 'number', l.number, 'company_name', l.company_name, 'stage_name', s.name,
        'archived', l.archived_at is not null,
        'reason', case when q.cnpj is not null and l.cnpj = q.cnpj then 'mesmo CNPJ'
                       when q.email is not null and lower(l.email) = q.email then 'mesmo e-mail'
                       when q.phone is not null and regexp_replace(coalesce(l.phone, ''), '[^0-9]', '', 'g') = q.phone then 'mesmo telefone'
                       when private.ops_norm_name(l.company_name) = q.name then 'mesmo nome'
                       else 'nome parecido' end) as x
        from public.ops_leads l join public.ops_lead_stages s on s.id = l.stage_id, q
       where l.id is distinct from q.id and l.deleted_at is null
         and ((q.cnpj is not null and l.cnpj = q.cnpj)
           or (q.email is not null and lower(l.email) = q.email)
           or (q.phone is not null and regexp_replace(coalesce(l.phone, ''), '[^0-9]', '', 'g') = q.phone)
           or (char_length(q.name) >= 3 and extensions.similarity(private.ops_norm_name(l.company_name), q.name) >= 0.6))
       limit 10) d),
    'clients', (select coalesce(jsonb_agg(x order by x ->> 'name'), '[]') from (
      select jsonb_build_object('id', c.id, 'name', c.name, 'status', c.status,
        'reason', case when q.cnpj is not null and c.cnpj = q.cnpj then 'mesmo CNPJ'
                       when q.email is not null and lower(c.email) = q.email then 'mesmo e-mail'
                       when q.phone is not null and regexp_replace(coalesce(c.phone, ''), '[^0-9]', '', 'g') = q.phone then 'mesmo telefone'
                       when private.ops_norm_name(c.name) = q.name or private.ops_norm_name(c.company) = q.name then 'mesmo nome'
                       else 'nome parecido' end) as x
        from public.clients c, q
       where not c.is_demo
         and ((q.cnpj is not null and c.cnpj = q.cnpj)
           or (q.email is not null and lower(c.email) = q.email)
           or (q.phone is not null and regexp_replace(coalesce(c.phone, ''), '[^0-9]', '', 'g') = q.phone)
           or (char_length(q.name) >= 3 and (extensions.similarity(private.ops_norm_name(c.name), q.name) >= 0.6
                                              or extensions.similarity(private.ops_norm_name(c.company), q.name) >= 0.6)))
       limit 10) d)) end
$$;

-- ---------------------------------------------------------------- Tela "Arquivados e excluídos"
-- p_kind: 'tarefas' | 'leads'; p_state: 'arquivados' | 'excluidos'. Excluídos: quem criou, quem excluiu ou o administrador.
create function private.ops_archive_list_impl(p_kind text, p_state text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select case
    when p_kind = 'tarefas' and p_state = 'arquivados' and private.ops_can('ops.access') then
      (select coalesce(jsonb_agg(x order by x ->> 'at' desc), '[]') from (
         select jsonb_build_object('id', t.id, 'number', t.number, 'title', t.title, 'client_name', c.name, 'sector_name', s.name,
                  'at', t.archived_at, 'by_name', pa.full_name, 'created_by_name', pc.full_name,
                  'can_unarchive', private.ops_can_archive_task(t.id), 'can_delete', private.ops_can_delete_task(t.id)) as x
           from public.ops_tasks t left join public.clients c on c.id = t.client_id left join public.ops_sectors s on s.id = t.sector_id
           left join public.profiles pa on pa.id = t.archived_by left join public.profiles pc on pc.id = t.created_by
          where t.archived_at is not null and t.deleted_at is null and private.ops_task_visible(t.id)
          order by t.archived_at desc limit 500) y)
    when p_kind = 'tarefas' and p_state = 'excluidos' and private.ops_can('ops.access') then
      (select coalesce(jsonb_agg(x order by x ->> 'at' desc), '[]') from (
         select jsonb_build_object('id', t.id, 'number', t.number, 'title', t.title, 'client_name', c.name, 'sector_name', s.name,
                  'at', t.deleted_at, 'by_name', pd.full_name, 'created_by_name', pc.full_name, 'can_restore', private.is_admin()) as x
           from public.ops_tasks t left join public.clients c on c.id = t.client_id left join public.ops_sectors s on s.id = t.sector_id
           left join public.profiles pd on pd.id = t.deleted_by left join public.profiles pc on pc.id = t.created_by
          where t.deleted_at is not null
            and (private.is_admin() or t.created_by = (select auth.uid()) or t.deleted_by = (select auth.uid()))
          order by t.deleted_at desc limit 500) y)
    when p_kind = 'leads' and p_state = 'arquivados' and private.ops_can('ops.commercial') then
      (select coalesce(jsonb_agg(x order by x ->> 'at' desc), '[]') from (
         select jsonb_build_object('id', l.id, 'number', l.number, 'title', l.company_name, 'stage_name', st.name, 'owner_name', po.full_name,
                  'at', l.archived_at, 'by_name', pa.full_name, 'created_by_name', pc.full_name,
                  'can_unarchive', private.ops_can_archive_lead(l.id), 'can_delete', private.ops_can_delete_lead(l.id)) as x
           from public.ops_leads l join public.ops_lead_stages st on st.id = l.stage_id left join public.profiles po on po.id = l.owner_id
           left join public.profiles pa on pa.id = l.archived_by left join public.profiles pc on pc.id = l.created_by
          where l.archived_at is not null and l.deleted_at is null
          order by l.archived_at desc limit 500) y)
    when p_kind = 'leads' and p_state = 'excluidos' and private.ops_can('ops.commercial') then
      (select coalesce(jsonb_agg(x order by x ->> 'at' desc), '[]') from (
         select jsonb_build_object('id', l.id, 'number', l.number, 'title', l.company_name, 'stage_name', st.name, 'owner_name', po.full_name,
                  'at', l.deleted_at, 'by_name', pd.full_name, 'created_by_name', pc.full_name, 'can_restore', private.is_admin()) as x
           from public.ops_leads l join public.ops_lead_stages st on st.id = l.stage_id left join public.profiles po on po.id = l.owner_id
           left join public.profiles pd on pd.id = l.deleted_by left join public.profiles pc on pc.id = l.created_by
          where l.deleted_at is not null
            and (private.is_admin() or l.created_by = (select auth.uid()) or l.deleted_by = (select auth.uid()))
          order by l.deleted_at desc limit 500) y)
    else null end
$$;
revoke all on function private.ops_archive_list_impl(text, text) from public, anon;
grant execute on function private.ops_archive_list_impl(text, text) to authenticated;
create function public.ops_archive_list(p_kind text, p_state text)
returns jsonb language sql stable set search_path = '' as $$ select private.ops_archive_list_impl(p_kind, p_state) $$;
revoke all on function public.ops_archive_list(text, text) from public, anon;
grant execute on function public.ops_archive_list(text, text) to authenticated;
