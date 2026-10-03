-- Etapa 37.5 — Notificações do monitoramento (parte 1): preferências, avisos internos e histórico de envios.
-- Ícone próprio do Monitoramento (o sino da Central de Operações continua só da Central: módulos independentes).
-- Nada é apagado: avisos e envios ficam guardados para sempre.

create table public.monitor_notify_prefs (
  user_id uuid primary key references auth.users (id),
  enabled boolean not null default true,
  internal boolean not null default true,
  email boolean not null default false,
  whatsapp boolean not null default false,
  min_severity text not null default 'critico' check (min_severity in ('critico', 'atencao', 'informativo')),
  client_ids uuid[],
  mode text not null default 'imediato' check (mode in ('imediato', 'resumo', 'ambos')),
  digest_hour smallint not null default 8 check (digest_hour between 0 and 23),
  quiet_start smallint check (quiet_start between 0 and 23),
  quiet_end smallint check (quiet_end between 0 and 23),
  notify_assigned boolean not null default true,
  notify_followups boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id),
  check ((quiet_start is null) = (quiet_end is null))
);
comment on table public.monitor_notify_prefs is 'Etapa 37: o que cada pessoa quer receber do monitoramento (canais, gravidade mínima, clientes, imediato/resumo, silêncio). Uma linha por pessoa; sem linha = padrão.';
create index monitor_notify_prefs_updated_by_idx on public.monitor_notify_prefs (updated_by);
alter table public.monitor_notify_prefs enable row level security;
create policy monitor_notify_prefs_select on public.monitor_notify_prefs for select to authenticated
  using (user_id = (select auth.uid()) or (select private.monitor_can('admin')));
revoke insert, update, delete on public.monitor_notify_prefs from anon, authenticated;
grant select on public.monitor_notify_prefs to authenticated;

create table public.monitor_notifications (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id),
  kind text not null check (kind in ('alerta.novo', 'alerta.piorou', 'alerta.atribuido', 'alerta.avaliacao', 'resumo.diario')),
  title text not null check (char_length(title) <= 300),
  body text check (char_length(body) <= 600),
  link text not null check (link like '/monitoramento%'),
  alert_id bigint references public.monitor_alerts (id),
  dedupe_key text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  unique (user_id, dedupe_key)
);
comment on table public.monitor_notifications is 'Etapa 37: avisos do monitoramento no ícone do topo (por pessoa). Guardados para sempre.';
create index monitor_notifications_user_idx on public.monitor_notifications (user_id, created_at desc);
create index monitor_notifications_unread_idx on public.monitor_notifications (user_id) where read_at is null;
create index monitor_notifications_alert_idx on public.monitor_notifications (alert_id);
alter table public.monitor_notifications enable row level security;
create policy monitor_notifications_select on public.monitor_notifications for select to authenticated using (user_id = (select auth.uid()));
revoke insert, update, delete on public.monitor_notifications from anon, authenticated;
grant select on public.monitor_notifications to authenticated;

create table public.monitor_deliveries (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id),
  channel text not null check (channel in ('interno', 'email', 'whatsapp')),
  kind text not null,
  alert_id bigint references public.monitor_alerts (id),
  notification_id bigint references public.monitor_notifications (id),
  dedupe_key text not null,
  status text not null check (status in ('pendente', 'enviado', 'falhou', 'preparado', 'pulado')),
  reason text check (char_length(reason) <= 500),
  attempts integer not null default 0,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  unique (user_id, channel, dedupe_key)
);
comment on table public.monitor_deliveries is 'Etapa 37: histórico de cada envio do monitoramento (interno, e-mail, WhatsApp preparado), com a situação e o motivo. Guardado para sempre.';
create index monitor_deliveries_user_idx on public.monitor_deliveries (user_id, created_at desc);
create index monitor_deliveries_pending_idx on public.monitor_deliveries (created_at) where status = 'pendente';
create index monitor_deliveries_alert_idx on public.monitor_deliveries (alert_id);
create index monitor_deliveries_notification_idx on public.monitor_deliveries (notification_id);
create index monitor_deliveries_created_idx on public.monitor_deliveries (created_at desc);
alter table public.monitor_deliveries enable row level security;
create policy monitor_deliveries_select on public.monitor_deliveries for select to authenticated
  using (user_id = (select auth.uid()) or (select private.monitor_can('admin')));
revoke insert, update, delete on public.monitor_deliveries from anon, authenticated;
grant select on public.monitor_deliveries to authenticated;

-- Preferências efetivas (sem linha = padrão: quem trata alertas recebe os críticos no sistema; visualizador começa desligado).
create or replace function private.monitor_prefs_of(p_user uuid)
returns public.monitor_notify_prefs
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v public.monitor_notify_prefs;
begin
  select * into v from public.monitor_notify_prefs where user_id = p_user;
  if v.user_id is null then
    v.user_id := p_user;
    v.enabled := coalesce((select p.role::text in ('admin', 'gestor', 'operador') from public.profiles p where p.id = p_user), false);
    v.internal := true; v.email := false; v.whatsapp := false; v.min_severity := 'critico'; v.mode := 'imediato';
    v.digest_hour := 8; v.notify_assigned := true; v.notify_followups := true;
  end if;
  return v;
end;
$$;
revoke all on function private.monitor_prefs_of(uuid) from public, anon, authenticated;

create or replace function private.monitor_severity_rank(p text)
returns integer language sql immutable set search_path = '' as $$
  select case p when 'critico' then 3 when 'atencao' then 2 when 'informativo' then 1 else 0 end
$$;
revoke all on function private.monitor_severity_rank(text) from public, anon;

-- Esta pessoa (perfil ativo, papel que vê o monitoramento) enxerga este cliente?
create or replace function private.monitor_user_sees(p_user uuid, p_client uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
     where p.id = p_user and p.active and p.role::text in ('admin', 'gestor', 'operador', 'visualizador')
       and (p.role::text = 'admin' or exists (select 1 from public.user_client_access a where a.user_id = p_user and a.client_id = p_client)))
$$;
revoke all on function private.monitor_user_sees(uuid, uuid) from public, anon, authenticated;
