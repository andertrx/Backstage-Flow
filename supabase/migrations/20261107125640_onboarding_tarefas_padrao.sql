-- Etapa 50.1 — Tarefas padrão do onboarding: cadastradas em Central de Operações → Configurações, escolhidas no cartão do cliente.
create table public.ops_onboarding_task_templates (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (char_length(btrim(title)) between 3 and 200),
  description text check (char_length(description) <= 5000),
  sector_id   uuid not null references public.ops_sectors (id),
  priority    text not null default 'media' check (priority in ('baixa', 'media', 'alta', 'urgente')),
  due_days    integer check (due_days between 0 and 90),
  position    integer not null default 0,
  active      boolean not null default true,
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
comment on table public.ops_onboarding_task_templates is 'Etapa 50.1: tarefas padrão oferecidas no onboarding do cliente (setor já definido). Desativar não apaga; guardadas enquanto a Central existir.';
create index ops_onboarding_task_templates_sector_idx on public.ops_onboarding_task_templates (sector_id);
create index ops_onboarding_task_templates_created_by_idx on public.ops_onboarding_task_templates (created_by);
alter table public.ops_onboarding_task_templates enable row level security;
revoke all on public.ops_onboarding_task_templates from anon, authenticated;
grant select on public.ops_onboarding_task_templates to authenticated;
create policy "Central vê as tarefas padrão do onboarding" on public.ops_onboarding_task_templates for select to authenticated
  using ((select private.ops_can('ops.access')));

insert into public.ops_onboarding_task_templates (title, description, sector_id, position)
select v.title, v.descr, s.id, v.pos
  from (values
    ('Pegar acessos (Meta, Google)', 'Solicitar ao cliente e conferir os acessos às contas do Meta e do Google.', 'Gestão de Tráfego', 1),
    ('Solicitar material de marca para site/catálogo', 'Pedir ao cliente logo, cores, fontes e demais materiais de marca para o site e o catálogo.', 'Desenvolvimento (Dev)', 2),
    ('Solicitar material de B-roll e agendar gravação', 'Pedir o material de B-roll ao cliente e agendar a gravação.', 'Design', 3),
    ('Copy de vendas', 'Escrever a copy de vendas do cliente.', 'Copy', 4)
  ) as v(title, descr, sector, pos)
  join public.ops_sectors s on s.name = v.sector and s.status = 'ativo';

create function private.ops_onboarding_template_save_impl(p_id uuid, p jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := p_id;
  v_title text := btrim(coalesce(p ->> 'title', ''));
  v_sector uuid := nullif(p ->> 'sector_id', '')::uuid;
  v_prio text := coalesce(nullif(p ->> 'priority', ''), 'media');
  v_days integer := nullif(p ->> 'due_days', '')::integer;
begin
  perform private.ops_require_admin();
  if char_length(v_title) < 3 then raise exception 'Dê um título à tarefa padrão (mínimo 3 letras).' using errcode = '22023'; end if;
  if v_prio not in ('baixa', 'media', 'alta', 'urgente') then raise exception 'Prioridade inválida.' using errcode = '22023'; end if;
  if v_days is not null and v_days not between 0 and 90 then raise exception 'O prazo vai de 0 a 90 dias.' using errcode = '22023'; end if;
  if not exists (select 1 from public.ops_sectors where id = v_sector and (status = 'ativo' or (p_id is not null and id = (select sector_id from public.ops_onboarding_task_templates where id = p_id)))) then
    raise exception 'Escolha um setor ativo.' using errcode = '22023';
  end if;
  if exists (select 1 from public.ops_onboarding_task_templates where lower(btrim(title)) = lower(v_title) and sector_id = v_sector and id is distinct from p_id and active) then
    raise exception 'Já existe uma tarefa padrão com esse título neste setor.' using errcode = '22023';
  end if;
  if p_id is null then
    insert into public.ops_onboarding_task_templates (title, description, sector_id, priority, due_days, position, created_by)
    values (v_title, nullif(btrim(p ->> 'description'), ''), v_sector, v_prio, v_days,
            coalesce((select max(position) from public.ops_onboarding_task_templates), 0) + 1, (select auth.uid()))
    returning id into v_id;
  else
    update public.ops_onboarding_task_templates
       set title = v_title, description = nullif(btrim(p ->> 'description'), ''), sector_id = v_sector, priority = v_prio, due_days = v_days, updated_at = now()
     where id = p_id;
    if not found then raise exception 'Tarefa padrão não encontrada.' using errcode = '22023'; end if;
  end if;
  insert into public.audit_logs (actor_id, action, target_type, target_id, details)
  values ((select auth.uid()), case when p_id is null then 'ops.onboarding_template.create' else 'ops.onboarding_template.update' end,
          'ops_onboarding_template', v_id::text, jsonb_build_object('titulo', v_title));
  return v_id;
end;
$$;
revoke all on function private.ops_onboarding_template_save_impl(uuid, jsonb) from public, anon;
grant execute on function private.ops_onboarding_template_save_impl(uuid, jsonb) to authenticated;
create function public.ops_onboarding_template_save(p_id uuid, p jsonb)
returns uuid language sql set search_path = '' as $$ select private.ops_onboarding_template_save_impl(p_id, p) $$;
revoke all on function public.ops_onboarding_template_save(uuid, jsonb) from public, anon;
grant execute on function public.ops_onboarding_template_save(uuid, jsonb) to authenticated;

create function private.ops_onboarding_template_set_active_impl(p_id uuid, p_active boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.ops_require_admin();
  update public.ops_onboarding_task_templates set active = coalesce(p_active, true), updated_at = now() where id = p_id;
  if not found then raise exception 'Tarefa padrão não encontrada.' using errcode = '22023'; end if;
  insert into public.audit_logs (actor_id, action, target_type, target_id, details)
  values ((select auth.uid()), 'ops.onboarding_template.active', 'ops_onboarding_template', p_id::text, jsonb_build_object('ativa', coalesce(p_active, true)));
end;
$$;
revoke all on function private.ops_onboarding_template_set_active_impl(uuid, boolean) from public, anon;
grant execute on function private.ops_onboarding_template_set_active_impl(uuid, boolean) to authenticated;
create function public.ops_onboarding_template_set_active(p_id uuid, p_active boolean)
returns void language sql set search_path = '' as $$ select private.ops_onboarding_template_set_active_impl(p_id, p_active) $$;
revoke all on function public.ops_onboarding_template_set_active(uuid, boolean) from public, anon;
grant execute on function public.ops_onboarding_template_set_active(uuid, boolean) to authenticated;

create function private.ops_onboarding_template_reorder_impl(p_ids uuid[])
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.ops_require_admin();
  update public.ops_onboarding_task_templates t set position = x.n
    from (select id, ordinality as n from unnest(p_ids) with ordinality as u(id, ordinality)) x where t.id = x.id;
end;
$$;
revoke all on function private.ops_onboarding_template_reorder_impl(uuid[]) from public, anon;
grant execute on function private.ops_onboarding_template_reorder_impl(uuid[]) to authenticated;
create function public.ops_onboarding_template_reorder(p_ids uuid[])
returns void language sql set search_path = '' as $$ select private.ops_onboarding_template_reorder_impl(p_ids) $$;
revoke all on function public.ops_onboarding_template_reorder(uuid[]) from public, anon;
grant execute on function public.ops_onboarding_template_reorder(uuid[]) to authenticated;
