-- =============================================================================
-- Etapa 36.3 (parte 1): Kanban operacional — onboarding dos clientes, Account
-- Manager, filas por setor, demandas para vários setores e registro manual.
-- Só acrescenta: nada dos módulos de anúncios é tocado; clientes só são lidos.
-- Remoção: supabase/rollback/remover_central_operacoes.sql
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Etapas do onboarding / operação (configuráveis) e regras de avanço
-- -----------------------------------------------------------------------------
create table public.ops_client_stages (
  id               text primary key default gen_random_uuid()::text,
  name             text not null check (char_length(btrim(name)) between 2 and 40),
  color            text not null check (color ~ '^#[0-9A-Fa-f]{6}$'),
  position         integer not null default 0,
  active           boolean not null default true,
  -- Regra explícita: só sai desta etapa (para a frente) com as tarefas obrigatórias dela concluídas.
  require_mandatory boolean not null default true,
  -- Regra explícita: avança sozinho para a próxima etapa quando as obrigatórias desta forem concluídas.
  auto_advance     boolean not null default false,
  updated_at       timestamptz not null default now(),
  updated_by       uuid references auth.users (id) on delete set null
);
comment on table public.ops_client_stages is 'Etapa 36: etapas do onboarding/operação dos clientes (nome, cor, ordem e regras de avanço configuráveis).';
create index ops_client_stages_updated_by_idx on public.ops_client_stages (updated_by);
insert into public.ops_client_stages (id, name, color, position) values
  ('contrato_pago', 'Contrato Pago', '#10B981', 1),
  ('onboarding_pendente', 'Onboarding Pendente', '#06B6D4', 2),
  ('coleta_acessos', 'Coleta de Acessos e Materiais', '#22D3EE', 3),
  ('briefing', 'Briefing', '#3B82F6', 4),
  ('configuracao_inicial', 'Configuração Inicial', '#A855F7', 5),
  ('liberado_execucao', 'Liberado para Execução', '#F59E0B', 6),
  ('operacao_andamento', 'Operação em Andamento', '#EAB308', 7),
  ('acompanhamento', 'Acompanhamento', '#EC4899', 8),
  ('concluido', 'Concluído', '#64748B', 9);

-- Estado operacional do cliente (ligado ao cadastro atual; não duplica o cliente).
create table public.ops_client_ops (
  client_id    uuid primary key references public.clients (id),
  stage_id     text not null references public.ops_client_stages (id),
  am_user_id   uuid references public.profiles (id),
  started_at   timestamptz not null default now(),
  stage_since  timestamptz not null default now(),
  version      integer not null default 1,
  created_by   uuid references auth.users (id) on delete set null,
  updated_at   timestamptz not null default now(),
  updated_by   uuid references auth.users (id) on delete set null
);
comment on table public.ops_client_ops is 'Etapa 36: etapa do onboarding/operação e Account Manager de cada cliente (um por cliente; nunca apagado).';
create index ops_client_ops_stage_idx on public.ops_client_ops (stage_id);
create index ops_client_ops_am_idx on public.ops_client_ops (am_user_id);
create index ops_client_ops_created_by_idx on public.ops_client_ops (created_by);
create index ops_client_ops_updated_by_idx on public.ops_client_ops (updated_by);
create trigger ops_client_ops_touch before update on public.ops_client_ops for each row execute function private.touch_updated_at();

-- -----------------------------------------------------------------------------
-- Filas por setor: colunas próprias, cada uma ligada a um status
-- -----------------------------------------------------------------------------
create table public.ops_queue_columns (
  id         uuid primary key default gen_random_uuid(),
  sector_id  uuid not null references public.ops_sectors (id),
  name       text not null check (char_length(btrim(name)) between 2 and 40),
  color      text not null check (color ~ '^#[0-9A-Fa-f]{6}$'),
  status_id  text not null references public.ops_statuses (id),
  position   integer not null default 0,
  active     boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);
comment on table public.ops_queue_columns is 'Etapa 36: colunas da fila de cada setor (ex.: Design → Criativos pendentes). Mover o cartão muda o status ligado.';
create index ops_queue_columns_sector_idx on public.ops_queue_columns (sector_id, position);
create index ops_queue_columns_status_idx on public.ops_queue_columns (status_id);
create index ops_queue_columns_updated_by_idx on public.ops_queue_columns (updated_by);
insert into public.ops_queue_columns (sector_id, name, color, status_id, position)
select s.id, c.name, c.color, c.status_id, c.pos
  from (values
    ('Design', 'Criativos pendentes', '#06B6D4', 'nao_iniciado', 1), ('Design', 'Criativos em produção', '#F59E0B', 'em_andamento', 2),
    ('Design', 'Materiais em revisão', '#3B82F6', 'em_revisao', 3), ('Design', 'Aguardando aprovação', '#EAB308', 'aguardando_cliente', 4),
    ('Design', 'Entregas concluídas', '#10B981', 'finalizado', 5),
    ('Copy', 'Textos solicitados', '#06B6D4', 'nao_iniciado', 1), ('Copy', 'Textos em desenvolvimento', '#F59E0B', 'em_andamento', 2),
    ('Copy', 'Textos em revisão', '#3B82F6', 'em_revisao', 3), ('Copy', 'Aguardando aprovação', '#EAB308', 'aguardando_cliente', 4),
    ('Copy', 'Entregas concluídas', '#10B981', 'finalizado', 5),
    ('Gestão de Tráfego', 'Configurações pendentes', '#06B6D4', 'nao_iniciado', 1), ('Gestão de Tráfego', 'Campanhas em preparação', '#F59E0B', 'em_andamento', 2),
    ('Gestão de Tráfego', 'Demandas de ajustes', '#EF4444', 'em_andamento', 3), ('Gestão de Tráfego', 'Aguardando materiais', '#64748B', 'aguardando_interno', 4),
    ('Gestão de Tráfego', 'Tarefas concluídas', '#10B981', 'finalizado', 5),
    ('Desenvolvimento (Dev)', 'Solicitações pendentes', '#06B6D4', 'nao_iniciado', 1), ('Desenvolvimento (Dev)', 'Em desenvolvimento', '#F59E0B', 'em_andamento', 2),
    ('Desenvolvimento (Dev)', 'Testes', '#A855F7', 'em_revisao', 3), ('Desenvolvimento (Dev)', 'Revisões', '#3B82F6', 'em_revisao', 4),
    ('Desenvolvimento (Dev)', 'Entregas concluídas', '#10B981', 'finalizado', 5)
  ) as c(sector, name, color, status_id, pos)
  join public.ops_sectors s on s.name = c.sector and s.status <> 'arquivado';

-- -----------------------------------------------------------------------------
-- Demanda: a solicitação original liberada para um ou vários setores
-- -----------------------------------------------------------------------------
create table public.ops_demands (
  id          uuid primary key default gen_random_uuid(),
  number      bigint generated always as identity unique,
  client_id   uuid references public.clients (id),
  title       text not null check (char_length(btrim(title)) between 3 and 200),
  briefing    text check (char_length(briefing) <= 10000),
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now()
);
comment on table public.ops_demands is 'Etapa 36: demanda liberada para vários setores (cada setor recebe a sua tarefa, ligada aqui).';
create index ops_demands_client_idx on public.ops_demands (client_id, created_at desc);
create index ops_demands_created_by_idx on public.ops_demands (created_by);

-- Tarefa: demanda de origem, etapa do onboarding a que pertence, obrigatória, coluna da fila.
alter table public.ops_tasks
  add column demand_id       uuid references public.ops_demands (id),
  add column client_stage_id text references public.ops_client_stages (id),
  add column mandatory       boolean not null default false,
  add column queue_column_id uuid references public.ops_queue_columns (id);
create index ops_tasks_demand_idx on public.ops_tasks (demand_id);
create index ops_tasks_client_stage_idx on public.ops_tasks (client_id, client_stage_id) where mandatory;
create index ops_tasks_queue_column_idx on public.ops_tasks (queue_column_id);

-- -----------------------------------------------------------------------------
-- Registro manual de atividades na ficha do cliente
-- -----------------------------------------------------------------------------
create table public.ops_activity_types (
  id        text primary key default gen_random_uuid()::text,
  name      text not null check (char_length(btrim(name)) between 2 and 60),
  position  integer not null default 0,
  active    boolean not null default true
);
comment on table public.ops_activity_types is 'Etapa 36: tipos de atividade do registro manual (configuráveis).';
insert into public.ops_activity_types (id, name, position) values
  ('reuniao_cliente', 'Reunião com cliente', 1), ('solicitacao', 'Solicitação recebida', 2), ('ajuste_campanha', 'Ajuste de campanha', 3),
  ('envio_criativos', 'Envio de criativos', 4), ('aprovacao', 'Aprovação de material', 5), ('alteracao', 'Alteração operacional', 6),
  ('entrega', 'Entrega realizada', 7);

create table public.ops_client_notes (
  id              uuid primary key default gen_random_uuid(),
  client_id       uuid not null references public.clients (id),
  type_id         text not null references public.ops_activity_types (id),
  title           text not null check (char_length(btrim(title)) between 3 and 200),
  description     text check (char_length(description) <= 5000),
  happened_at     timestamptz not null,
  responsible_id  uuid references public.profiles (id),
  sector_id       uuid references public.ops_sectors (id),
  next_step       text check (char_length(next_step) <= 500),
  attachment_path text unique,
  attachment_name text check (char_length(attachment_name) <= 200),
  created_by      uuid references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  removed_at      timestamptz,
  removed_by      uuid references auth.users (id) on delete set null
);
comment on table public.ops_client_notes is 'Etapa 36: atividades registradas à mão na ficha do cliente. Retirar não apaga.';
create index ops_client_notes_client_idx on public.ops_client_notes (client_id, happened_at desc);
create index ops_client_notes_type_idx on public.ops_client_notes (type_id);
create index ops_client_notes_responsible_idx on public.ops_client_notes (responsible_id);
create index ops_client_notes_sector_idx on public.ops_client_notes (sector_id);
create index ops_client_notes_created_by_idx on public.ops_client_notes (created_by);
create index ops_client_notes_removed_by_idx on public.ops_client_notes (removed_by);

-- -----------------------------------------------------------------------------
-- Quem vê a ficha operacional do cliente: admin, quem tem "ver a ficha
-- operacional" e o Account Manager do cliente. Nada disso abre anúncios.
-- -----------------------------------------------------------------------------
create function private.ops_is_am(p_client uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.ops_can('ops.access')
     and exists (select 1 from public.ops_client_ops o where o.client_id = p_client and o.am_user_id = (select auth.uid()))
$$;
revoke all on function private.ops_is_am(uuid) from public, anon;
grant execute on function private.ops_is_am(uuid) to authenticated;

create function private.ops_client_visible(p_client uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_client is not null and (private.ops_can('ops.clients.view') or private.ops_is_am(p_client))
$$;
revoke all on function private.ops_client_visible(uuid) from public, anon;
grant execute on function private.ops_client_visible(uuid) to authenticated;

-- O Account Manager vê as demandas de todos os setores dos clientes dele
-- (menos as tarefas marcadas "só as pessoas da tarefa").
create or replace function private.ops_task_visible(p_task uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select case
    when private.is_admin() then exists (select 1 from public.ops_tasks where id = p_task)
    when not private.ops_can('ops.access') then false
    else exists (
      select 1 from public.ops_tasks t
       where t.id = p_task
         and (t.created_by = (select auth.uid())
              or t.visibility = 'equipe'
              or exists (select 1 from public.ops_task_people p where p.task_id = t.id and p.user_id = (select auth.uid()))
              or (t.visibility = 'setor' and exists (select 1 from public.ops_member_sectors s
                                                     where s.user_id = (select auth.uid()) and s.sector_id = t.sector_id))
              or (t.visibility <> 'participantes' and t.client_id is not null
                  and exists (select 1 from public.ops_client_ops o where o.client_id = t.client_id and o.am_user_id = (select auth.uid())))))
  end
$$;

-- Anexos: pasta "<id da tarefa>/…" (tarefas) ou "cliente-<id do cliente>/…" (registro manual).
create or replace function private.ops_task_folder_visible(p_name text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  v_folder text := split_part(coalesce(p_name, ''), '/', 1);
  v_uuid text := '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
begin
  if v_folder ~ ('^' || v_uuid || '$') then return private.ops_task_visible(v_folder::uuid); end if;
  if v_folder ~ ('^cliente-' || v_uuid || '$') then
    return private.ops_client_visible(substr(v_folder, 9)::uuid) and private.ops_can('ops.history.edit');
  end if;
  return false;
end;
$$;

-- "ops.am": marca para a tela saber que a pessoa é Account Manager de algum cliente.
create or replace function private.ops_my_permissions_impl()
returns text[] language sql stable security definer set search_path = '' as $$
  select case
    when private.is_admin() then array['ops.access', 'ops.kanban.view', 'ops.tasks.create', 'ops.tasks.edit', 'ops.tasks.archive',
      'ops.tasks.assign', 'ops.tasks.sector', 'ops.cards.move', 'ops.clients.view', 'ops.history.edit', 'ops.meetings.manage',
      'ops.dashboard.view', 'ops.commercial', 'ops.admin']
    when private.ops_can('ops.access') then
      array(select p.permission from public.ops_member_permissions p where p.user_id = (select auth.uid())
            union all
            select 'ops.am' where exists (select 1 from public.ops_client_ops o where o.am_user_id = (select auth.uid()))
            order by 1)
    else '{}'::text[]
  end
$$;

-- -----------------------------------------------------------------------------
-- Leitura direta (as telas usam funções; isto garante que nada vaze)
-- -----------------------------------------------------------------------------
alter table public.ops_client_stages enable row level security;
alter table public.ops_client_ops enable row level security;
alter table public.ops_queue_columns enable row level security;
alter table public.ops_demands enable row level security;
alter table public.ops_activity_types enable row level security;
alter table public.ops_client_notes enable row level security;
revoke all on public.ops_client_stages, public.ops_client_ops, public.ops_queue_columns, public.ops_demands, public.ops_activity_types,
  public.ops_client_notes from anon, authenticated;
grant select on public.ops_client_stages, public.ops_client_ops, public.ops_queue_columns, public.ops_demands, public.ops_activity_types,
  public.ops_client_notes to authenticated;
create policy "Central vê as etapas" on public.ops_client_stages for select to authenticated using ((select private.ops_can('ops.access')));
create policy "Central vê as colunas das filas" on public.ops_queue_columns for select to authenticated using ((select private.ops_can('ops.access')));
create policy "Central vê os tipos de atividade" on public.ops_activity_types for select to authenticated using ((select private.ops_can('ops.access')));
create policy "Vê a operação dos clientes que acompanha" on public.ops_client_ops for select to authenticated
  using ((select private.ops_client_visible(client_id)));
create policy "Vê atividades dos clientes que acompanha" on public.ops_client_notes for select to authenticated
  using ((select private.ops_client_visible(client_id)));
create policy "Vê demandas com tarefa visível ou do cliente que acompanha" on public.ops_demands for select to authenticated
  using ((select private.ops_client_visible(client_id))
         or exists (select 1 from public.ops_tasks t where t.demand_id = ops_demands.id and (select private.ops_task_visible(t.id))));
create policy "Vê histórico dos clientes que acompanha" on public.ops_activity for select to authenticated
  using (task_id is null and (select private.ops_client_visible(client_id)));
