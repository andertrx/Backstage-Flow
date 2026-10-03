-- Etapa 37.4 — Central de alertas (parte 1): responsável, tarefa ligada, controle de versão e funções de apoio.
-- Nada é apagado: cada ação vira um evento permanente na linha do tempo do alerta.
alter table public.monitor_alerts
  add column assigned_to uuid references auth.users (id),
  add column task_id uuid references public.ops_tasks (id),
  add column version integer not null default 1,
  add column status_changed_at timestamptz;
comment on column public.monitor_alerts.assigned_to is 'Etapa 37.4: responsável pelo alerta (quem pode tratar alertas deste cliente).';
comment on column public.monitor_alerts.task_id is 'Etapa 37.4: tarefa da Central de Operações criada a partir do alerta (só quando alguém clica).';
comment on column public.monitor_alerts.version is 'Etapa 37.4: sobe a cada ação de uma pessoa; evita que duas pessoas sobrescrevam uma à outra.';
create index monitor_alerts_assigned_idx on public.monitor_alerts (assigned_to) where resolved_at is null;
create index monitor_alerts_task_idx on public.monitor_alerts (task_id);

alter table public.monitor_alert_events add column data jsonb not null default '{}';
comment on column public.monitor_alert_events.data is 'Etapa 37.4: dados extras do evento (ex.: tarefa criada, números da avaliação posterior).';

-- Esta pessoa pode tratar alertas deste cliente? (perfil ativo, papel que trata e acesso ao cliente)
create or replace function private.monitor_user_can_handle(p_user uuid, p_client uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
     where p.id = p_user and p.active and p.role::text in ('admin', 'gestor', 'operador')
       and (p.role::text = 'admin' or exists (select 1 from public.user_client_access a where a.user_id = p_user and a.client_id = p_client)))
$$;
revoke all on function private.monitor_user_can_handle(uuid, uuid) from public, anon, authenticated;

-- Carrega o alerta para uma ação: confere a permissão, o cliente e a versão.
create or replace function private.monitor_alert_lock(p_id bigint, p_version integer, p_open_only boolean default true)
returns public.monitor_alerts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.monitor_alerts;
begin
  if not private.monitor_can('handle') then
    raise exception 'Sem permissão para tratar alertas de desempenho' using errcode = '42501';
  end if;
  select * into v from public.monitor_alerts where id = p_id for update;
  if v.id is null or not private.can_view_client(v.client_id) then
    raise exception 'Alerta não encontrado.' using errcode = '22023';
  end if;
  if p_version is not null and v.version <> p_version then
    raise exception 'Alguém alterou este alerta antes de você. Recarregue para ver a versão atual.' using errcode = '40001';
  end if;
  if p_open_only and v.resolved_at is not null then
    raise exception 'Este alerta já foi encerrado.' using errcode = '22023';
  end if;
  return v;
end;
$$;
revoke all on function private.monitor_alert_lock(bigint, integer, boolean) from public, anon, authenticated;

create or replace function private.monitor_user_name(p_user uuid)
returns text language sql stable security definer set search_path = '' as $$
  select coalesce(nullif(btrim(p.full_name), ''), 'Usuário') from public.profiles p where p.id = p_user
$$;
revoke all on function private.monitor_user_name(uuid) from public, anon, authenticated;

create or replace function private.monitor_status_label(p_status text)
returns text language sql immutable set search_path = '' as $$
  select case p_status when 'novo' then 'Novo' when 'visualizado' then 'Visualizado' when 'em_analise' then 'Em análise'
                       when 'aguardando_acao' then 'Aguardando ação' when 'resolvido' then 'Resolvido' when 'ignorado' then 'Ignorado'
                       else p_status end
$$;
revoke all on function private.monitor_status_label(text) from public, anon;
