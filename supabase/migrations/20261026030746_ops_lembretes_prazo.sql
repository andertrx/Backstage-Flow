-- Central de Operações 36.17 (26/10/2026): lembrete de tarefa vencida, 3 vezes por dia (8h, 12h e 17h de Brasília).
-- Para o RESPONSÁVEL (pessoa "principal") de cada tarefa com prazo vencido (hoje ou antes) e ainda aberta.
--  * Dentro do CRM: pop-up que fica até a pessoa clicar "Vi" (registro por dia e horário, vale em qualquer aparelho).
--  * Fora do CRM: notificação no computador/celular (Web Push), nos aparelhos que a pessoa autorizou.
-- As chaves do Web Push (VAPID) são geradas no servidor; a chave privada fica só no cofre (Vault).

-- Cada "Vi" de cada horário (pequeno; guardado para saber o que a pessoa já viu).
create table public.ops_due_reminder_views (
  user_id uuid not null references auth.users (id),
  day     date not null,
  slot    smallint not null check (slot in (8, 12, 17)),
  seen_at timestamptz not null default now(),
  primary key (user_id, day, slot)
);
comment on table public.ops_due_reminder_views is '36.17: quando cada pessoa clicou "Vi" no lembrete de tarefas vencidas (por dia e horário 8/12/17h).';

-- Aparelhos autorizados a receber notificação (um por navegador).
create table public.ops_push_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id),
  endpoint     text not null unique check (endpoint ~ '^https://' and char_length(endpoint) <= 1000),
  p256dh       text not null check (p256dh ~ '^[A-Za-z0-9_-]{80,100}$'),
  auth         text not null check (auth ~ '^[A-Za-z0-9_-]{16,32}$'),
  device       text check (char_length(device) <= 120),
  created_at   timestamptz not null default now(),
  last_sent_at timestamptz,
  last_error   text check (char_length(last_error) <= 300),
  failures     integer not null default 0,
  disabled_at  timestamptz
);
comment on table public.ops_push_subscriptions is '36.17: navegadores (computador/celular) autorizados a receber o lembrete. Desligado quando o navegador cancela (nunca apagado).';
create index ops_push_subscriptions_user_idx on public.ops_push_subscriptions (user_id) where disabled_at is null;

alter table public.ops_due_reminder_views enable row level security;
alter table public.ops_push_subscriptions enable row level security;
revoke all on public.ops_due_reminder_views, public.ops_push_subscriptions from anon, authenticated;
grant select on public.ops_due_reminder_views to authenticated;
grant select (id, device, created_at, last_sent_at, last_error, disabled_at) on public.ops_push_subscriptions to authenticated;
create policy "Cada um vê o que já viu" on public.ops_due_reminder_views for select to authenticated using (user_id = (select auth.uid()));
create policy "Cada um vê os seus aparelhos" on public.ops_push_subscriptions for select to authenticated using (user_id = (select auth.uid()));

-- Horário do lembrete agora (Brasília): 8, 12 ou 17; antes das 8h não há lembrete.
create function private.ops_due_slot(p_now timestamptz default now())
returns smallint
language sql
stable
set search_path = ''
as $$
  select case when h >= 17 then 17 when h >= 12 then 12 when h >= 8 then 8 end::smallint
    from (select extract(hour from p_now at time zone 'America/Sao_Paulo')::int as h) x
$$;

-- Tarefas vencidas e abertas de que a pessoa é a responsável (principal).
create function private.ops_due_tasks_for(p_user uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', t.id, 'number', t.number, 'title', t.title, 'client', c.name, 'due_date', t.due_date,
           'days_late', (now() at time zone 'America/Sao_Paulo')::date - t.due_date, 'version', t.version, 'status_id', t.status_id)
         order by t.due_date, t.number), '[]'::jsonb)
    from public.ops_tasks t
    join public.ops_statuses s on s.id = t.status_id
    join public.ops_task_people p on p.task_id = t.id and p.role = 'principal' and p.user_id = p_user
    left join public.clients c on c.id = t.client_id
   where t.archived_at is null and s.category not in ('concluido', 'cancelado')
     and t.due_date is not null and t.due_date <= (now() at time zone 'America/Sao_Paulo')::date
$$;

-- Tela: o lembrete de agora (horário, se já foi visto e as tarefas).
create function private.ops_due_reminder_impl()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_slot smallint := private.ops_due_slot();
  v_day  date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if v_user is null or not private.ops_can('ops.access') then
    return jsonb_build_object('slot', null, 'seen', true, 'tasks', '[]'::jsonb);
  end if;
  return jsonb_build_object(
    'day', v_day, 'slot', v_slot,
    'seen', v_slot is null or exists (select 1 from public.ops_due_reminder_views v where v.user_id = v_user and v.day = v_day and v.slot = v_slot),
    'tasks', private.ops_due_tasks_for(v_user));
end;
$$;

create function private.ops_due_reminder_seen_impl(p_day date, p_slot smallint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not private.ops_can('ops.access') then
    raise exception 'Sem acesso à Central de Operações.' using errcode = '42501';
  end if;
  if p_day <> (now() at time zone 'America/Sao_Paulo')::date or p_slot is distinct from private.ops_due_slot() then
    raise exception 'Lembrete fora do horário atual.' using errcode = '22023';
  end if;
  insert into public.ops_due_reminder_views (user_id, day, slot) values ((select auth.uid()), p_day, p_slot) on conflict do nothing;
end;
$$;

-- Aparelho: autorizar e cancelar (cada um só mexe nos seus).
create function private.ops_push_subscribe_impl(p_endpoint text, p_p256dh text, p_auth text, p_device text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if (select auth.uid()) is null or not private.ops_can('ops.access') then
    raise exception 'Sem acesso à Central de Operações.' using errcode = '42501';
  end if;
  if coalesce(p_endpoint, '') !~ '^https://' or coalesce(p_p256dh, '') !~ '^[A-Za-z0-9_-]{80,100}$' or coalesce(p_auth, '') !~ '^[A-Za-z0-9_-]{16,32}$' then
    raise exception 'Autorização do navegador inválida. Tente de novo.' using errcode = '22023';
  end if;
  insert into public.ops_push_subscriptions (user_id, endpoint, p256dh, auth, device)
  values ((select auth.uid()), p_endpoint, p_p256dh, p_auth, left(p_device, 120))
  on conflict (endpoint) do update
    set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, device = excluded.device,
        disabled_at = null, failures = 0, last_error = null
  returning id into v_id;
  return v_id;
end;
$$;

create function private.ops_push_unsubscribe_impl(p_endpoint text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.ops_push_subscriptions set disabled_at = now(), last_error = 'Desligado pela pessoa.'
   where endpoint = p_endpoint and user_id = (select auth.uid()) and disabled_at is null
$$;

-- Servidor: quem recebe a notificação agora (tarefas vencidas, horário ainda não visto, aparelhos ligados).
create function private.ops_push_targets()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with v as (select private.ops_due_slot() as slot, (now() at time zone 'America/Sao_Paulo')::date as day),
  u as (
    select distinct s.user_id from public.ops_push_subscriptions s where s.disabled_at is null
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'user_id', u.user_id, 'tasks', private.ops_due_tasks_for(u.user_id),
           'subscriptions', (select jsonb_agg(jsonb_build_object('id', s.id, 'endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth))
                               from public.ops_push_subscriptions s where s.user_id = u.user_id and s.disabled_at is null))), '[]'::jsonb)
    from u, v
   where v.slot is not null
     and jsonb_array_length(private.ops_due_tasks_for(u.user_id)) > 0
     and not exists (select 1 from public.ops_due_reminder_views w where w.user_id = u.user_id and w.day = v.day and w.slot = v.slot)
$$;

-- Servidor: resultado de cada envio (navegador que cancelou → desligado, nunca apagado).
create function private.ops_push_mark(p_id uuid, p_ok boolean, p_gone boolean, p_error text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.ops_push_subscriptions
     set last_sent_at = case when p_ok then now() else last_sent_at end,
         failures = case when p_ok then 0 else failures + 1 end,
         last_error = case when p_ok then null else left(p_error, 300) end,
         disabled_at = case when p_gone or (not p_ok and failures + 1 >= 5) then now() else disabled_at end
   where id = p_id
$$;

-- Servidor: chaves do Web Push (VAPID). A pública vai para o navegador; a privada fica só no cofre.
create function private.ops_push_keys()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'public', (select value from private.app_settings where key = 'vapid_public_key'),
    'private', (select decrypted_secret from vault.decrypted_secrets where name = 'vapid_private_jwk'))
$$;

create function private.ops_push_keys_set(p_public text, p_private_jwk text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from vault.secrets where name = 'vapid_private_jwk') then return false; end if;
  if coalesce(p_public, '') !~ '^[A-Za-z0-9_-]{80,100}$' then raise exception 'chave pública inválida'; end if;
  perform vault.create_secret(p_private_jwk, 'vapid_private_jwk', 'Chave privada do Web Push (lembretes da Central)');
  insert into private.app_settings (key, value) values ('vapid_public_key', p_public)
  on conflict (key) do update set value = excluded.value, updated_at = now();
  return true;
end;
$$;

-- Agendador: às 8h, 12h e 17h de Brasília (11h, 15h e 20h UTC) chama o servidor de notificações.
create function private.trigger_ops_push()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text := (select value from private.app_settings where key = 'functions_url');
  v_secret text := (select decrypted_secret from vault.decrypted_secrets where name = 'sync_cron_secret');
begin
  if v_url is null or v_secret is null then return; end if;
  if not exists (select 1 from public.ops_push_subscriptions where disabled_at is null) then return; end if;
  perform net.http_post(
    url := v_url || '/ops-push',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret),
    body := jsonb_build_object('action', 'send'),
    timeout_milliseconds := 60000
  );
end;
$$;

revoke all on function private.ops_due_slot(timestamptz) from public, anon;
revoke all on function private.ops_due_tasks_for(uuid) from public, anon, authenticated;
revoke all on function private.ops_due_reminder_impl() from public, anon;
revoke all on function private.ops_due_reminder_seen_impl(date, smallint) from public, anon;
revoke all on function private.ops_push_subscribe_impl(text, text, text, text) from public, anon;
revoke all on function private.ops_push_unsubscribe_impl(text) from public, anon;
revoke all on function private.ops_push_targets() from public, anon, authenticated;
revoke all on function private.ops_push_mark(uuid, boolean, boolean, text) from public, anon, authenticated;
revoke all on function private.ops_push_keys() from public, anon, authenticated;
revoke all on function private.ops_push_keys_set(text, text) from public, anon, authenticated;
revoke all on function private.trigger_ops_push() from public, anon, authenticated;
grant execute on function private.ops_due_slot(timestamptz) to authenticated, service_role;
grant execute on function private.ops_due_reminder_impl() to authenticated;
grant execute on function private.ops_due_reminder_seen_impl(date, smallint) to authenticated;
grant execute on function private.ops_push_subscribe_impl(text, text, text, text) to authenticated;
grant execute on function private.ops_push_unsubscribe_impl(text) to authenticated;
grant execute on function private.ops_push_targets() to service_role;
grant execute on function private.ops_push_mark(uuid, boolean, boolean, text) to service_role;
grant execute on function private.ops_push_keys() to service_role;
grant execute on function private.ops_push_keys_set(text, text) to service_role;

create function public.ops_due_reminder()
returns jsonb language sql stable set search_path = '' as $$ select private.ops_due_reminder_impl() $$;
create function public.ops_due_reminder_seen(p_day date, p_slot smallint)
returns void language sql set search_path = '' as $$ select private.ops_due_reminder_seen_impl(p_day, p_slot) $$;
create function public.ops_push_subscribe(p_endpoint text, p_p256dh text, p_auth text, p_device text)
returns uuid language sql set search_path = '' as $$ select private.ops_push_subscribe_impl(p_endpoint, p_p256dh, p_auth, p_device) $$;
create function public.ops_push_unsubscribe(p_endpoint text)
returns void language sql set search_path = '' as $$ select private.ops_push_unsubscribe_impl(p_endpoint) $$;
create function public.ops_push_targets()
returns jsonb language sql stable set search_path = '' as $$ select private.ops_push_targets() $$;
create function public.ops_push_mark(p_id uuid, p_ok boolean, p_gone boolean, p_error text)
returns void language sql set search_path = '' as $$ select private.ops_push_mark(p_id, p_ok, p_gone, p_error) $$;
create function public.ops_push_keys()
returns jsonb language sql stable set search_path = '' as $$ select private.ops_push_keys() $$;
create function public.ops_push_keys_set(p_public text, p_private_jwk text)
returns boolean language sql set search_path = '' as $$ select private.ops_push_keys_set(p_public, p_private_jwk) $$;
revoke all on function public.ops_due_reminder() from public, anon;
revoke all on function public.ops_due_reminder_seen(date, smallint) from public, anon;
revoke all on function public.ops_push_subscribe(text, text, text, text) from public, anon;
revoke all on function public.ops_push_unsubscribe(text) from public, anon;
revoke all on function public.ops_push_targets() from public, anon, authenticated;
revoke all on function public.ops_push_mark(uuid, boolean, boolean, text) from public, anon, authenticated;
revoke all on function public.ops_push_keys() from public, anon, authenticated;
revoke all on function public.ops_push_keys_set(text, text) from public, anon, authenticated;
grant execute on function public.ops_due_reminder() to authenticated;
grant execute on function public.ops_due_reminder_seen(date, smallint) to authenticated;
grant execute on function public.ops_push_subscribe(text, text, text, text) to authenticated;
grant execute on function public.ops_push_unsubscribe(text) to authenticated;
grant execute on function public.ops_push_targets() to service_role;
grant execute on function public.ops_push_mark(uuid, boolean, boolean, text) to service_role;
grant execute on function public.ops_push_keys() to service_role;
grant execute on function public.ops_push_keys_set(text, text) to service_role;

select cron.schedule('ops-due-push', '0 11,15,20 * * *', $cron$select private.trigger_ops_push()$cron$);
