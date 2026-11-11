-- T5.32 etapa 5 — Subtarefas padrão nos modelos do onboarding e progresso de subtarefas no resumo do cliente.
alter table public.ops_onboarding_task_templates
  add column subtasks text[] not null default '{}' check (cardinality(subtasks) <= 20);
comment on column public.ops_onboarding_task_templates.subtasks is 'T5.32: títulos das subtarefas oferecidas junto com a tarefa padrão (até 20). Guardadas enquanto o modelo existir.';

create or replace function private.ops_onboarding_template_save_impl(p_id uuid, p jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := p_id;
  v_title text := btrim(coalesce(p ->> 'title', ''));
  v_sector uuid := nullif(p ->> 'sector_id', '')::uuid;
  v_prio text := coalesce(nullif(p ->> 'priority', ''), 'media');
  v_days integer := nullif(p ->> 'due_days', '')::integer;
  v_subs text[] := '{}';
  v_item text;
begin
  perform private.ops_require_admin();
  if char_length(v_title) < 3 then raise exception 'Dê um título à tarefa padrão (mínimo 3 letras).' using errcode = '22023'; end if;
  if v_prio not in ('baixa', 'media', 'alta', 'urgente') then raise exception 'Prioridade inválida.' using errcode = '22023'; end if;
  if v_days is not null and v_days not between 0 and 90 then raise exception 'O prazo vai de 0 a 90 dias.' using errcode = '22023'; end if;
  if jsonb_typeof(p -> 'subtasks') = 'array' then
    for v_item in select btrim(x) from jsonb_array_elements_text(p -> 'subtasks') x loop
      if v_item = '' then continue; end if;
      if char_length(v_item) not between 3 and 200 then raise exception 'Cada subtarefa padrão precisa de 3 a 200 letras.' using errcode = '22023'; end if;
      v_subs := v_subs || v_item;
    end loop;
    if cardinality(v_subs) > 20 then raise exception 'No máximo 20 subtarefas por tarefa padrão.' using errcode = '22023'; end if;
  end if;
  if not exists (select 1 from public.ops_sectors where id = v_sector and (status = 'ativo' or (p_id is not null and id = (select sector_id from public.ops_onboarding_task_templates where id = p_id)))) then
    raise exception 'Escolha um setor ativo.' using errcode = '22023';
  end if;
  if exists (select 1 from public.ops_onboarding_task_templates where lower(btrim(title)) = lower(v_title) and sector_id = v_sector and id is distinct from p_id and active) then
    raise exception 'Já existe uma tarefa padrão com esse título neste setor.' using errcode = '22023';
  end if;
  if p_id is null then
    insert into public.ops_onboarding_task_templates (title, description, sector_id, priority, due_days, subtasks, position, created_by)
    values (v_title, nullif(btrim(p ->> 'description'), ''), v_sector, v_prio, v_days, v_subs,
            coalesce((select max(position) from public.ops_onboarding_task_templates), 0) + 1, (select auth.uid()))
    returning id into v_id;
  else
    update public.ops_onboarding_task_templates
       set title = v_title, description = nullif(btrim(p ->> 'description'), ''), sector_id = v_sector, priority = v_prio, due_days = v_days,
           subtasks = v_subs, updated_at = now()
     where id = p_id;
    if not found then raise exception 'Tarefa padrão não encontrada.' using errcode = '22023'; end if;
  end if;
  insert into public.audit_logs (actor_id, action, target_type, target_id, details)
  values ((select auth.uid()), case when p_id is null then 'ops.onboarding_template.create' else 'ops.onboarding_template.update' end,
          'ops_onboarding_template', v_id::text, jsonb_build_object('titulo', v_title, 'subtarefas', cardinality(v_subs)));
  return v_id;
end;
$$;

-- Resumo do cliente: acrescenta o progresso das subtarefas (as demais contas continuam iguais).
create or replace function private.ops_client_summary(p_client uuid)
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
    'subtarefas', count(*) filter (where parent_id is not null),
    'subtarefas_concluidas', count(*) filter (where parent_id is not null and category in ('concluido', 'cancelado')),
    'setores', coalesce(jsonb_agg(distinct sector_id) filter (where category not in ('concluido', 'cancelado')), '[]'),
    'ultima_atividade', greatest(
      (select max(a.created_at) from public.ops_activity a where a.client_id = p_client),
      (select max(n.happened_at) from public.ops_client_notes n where n.client_id = p_client and n.removed_at is null)))
  from t
$$;
