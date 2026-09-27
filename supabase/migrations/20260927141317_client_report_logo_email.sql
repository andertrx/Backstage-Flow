-- =============================================================================
-- Etapa 19.4 — Logo do cliente e e-mail semanal do relatório
--
-- Logo: arquivo no Storage (pasta client-logos/<cliente>/…), só PNG, JPG ou
--   WebP até 1 MB. O caminho fica em client_report_settings.logo_path.
--   Leitura pública pelo endereço do arquivo (para aparecer no e-mail e no
--   link secreto); envio e troca só por admin/gestor responsável.
-- E-mail: envio pelo Resend (API oficial). A chave fica no cofre (Vault):
--   nunca vai para o site nem para o código.
--   email_settings           → remetente e se há chave (1 linha, só admin vê)
--   client_report_email      → por cliente: ligado?, para quem, dia e hora
--   client_report_email_log  → histórico de cada envio (nada é apagado)
-- Remoção: supabase/rollback/remover_dashboard_cliente.sql
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Logo
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('client-logos', 'client-logos', true, 1048576, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = 1048576, allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp'];

-- Pasta = id do cliente. Confere o formato antes de converter (nunca dá erro).
create function private.can_edit_client_folder(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_folder text := split_part(coalesce(p_name, ''), '/', 1);
begin
  if v_folder !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return false; end if;
  return private.can_edit_client(v_folder::uuid);
end;
$$;
revoke all on function private.can_edit_client_folder(text) from public, anon;
grant execute on function private.can_edit_client_folder(text) to authenticated;

create policy "Admin e gestor enviam a logo do cliente" on storage.objects for insert to authenticated
  with check (bucket_id = 'client-logos' and (select private.can_edit_client_folder(name)));
create policy "Admin e gestor trocam a logo do cliente" on storage.objects for update to authenticated
  using (bucket_id = 'client-logos' and (select private.can_edit_client_folder(name)))
  with check (bucket_id = 'client-logos' and (select private.can_edit_client_folder(name)));
create policy "Admin e gestor apagam a logo do cliente" on storage.objects for delete to authenticated
  using (bucket_id = 'client-logos' and (select private.can_edit_client_folder(name)));

alter table public.client_report_settings
  add column logo_path text check (logo_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[A-Za-z0-9_-]{8,64}\.(png|jpg|webp)$');

-- -----------------------------------------------------------------------------
-- Remetente e chave do Resend (só admin)
-- -----------------------------------------------------------------------------
create function private.valid_email(p text)
returns boolean
language sql
immutable
set search_path = ''
as $$ select p ~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$' and char_length(p) <= 254 $$;

create table public.email_settings (
  id             boolean primary key default true check (id),
  from_name      text not null default 'Backstage Flow' check (char_length(from_name) between 1 and 60 and from_name !~ '[<>"\r\n]'),
  from_email     text not null default 'relatorios@backstageflow.com.br' check (private.valid_email(from_email)),
  reply_to       text check (reply_to is null or private.valid_email(reply_to)),
  has_key        boolean not null default false,
  key_updated_at timestamptz,
  last_test_at   timestamptz,
  last_test_ok   boolean,
  last_test_error text check (char_length(last_test_error) <= 500),
  updated_at     timestamptz not null default now(),
  updated_by     uuid references auth.users (id) on delete set null
);
comment on table public.email_settings is 'Etapa 19.4: remetente dos e-mails do relatório. A chave do Resend fica no Vault (resend_api_key).';
create index email_settings_updated_by_idx on public.email_settings (updated_by);
insert into public.email_settings (id) values (true) on conflict do nothing;
alter table public.email_settings enable row level security;
revoke all on public.email_settings from anon, authenticated;
grant select on public.email_settings to authenticated;
create policy "Só admin vê o remetente" on public.email_settings for select to authenticated
  using ((select private.current_user_role()) = 'admin');

create function private.email_settings_save_impl(p_from_name text, p_from_email text, p_reply_to text, p_api_key text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret uuid;
begin
  if private.current_user_role() is distinct from 'admin' then
    raise exception 'Só o administrador configura o envio de e-mails.' using errcode = '42501';
  end if;
  if p_api_key is not null and p_api_key !~ '^re_[A-Za-z0-9_]{10,200}$' then
    raise exception 'A chave do Resend começa com "re_". Confira e cole de novo.' using errcode = '22023';
  end if;
  update public.email_settings
     set from_name = trim(p_from_name), from_email = lower(trim(p_from_email)), reply_to = nullif(lower(trim(coalesce(p_reply_to, ''))), ''),
         updated_at = now(), updated_by = (select auth.uid())
   where id;
  if p_api_key is not null then
    select id into v_secret from vault.secrets where name = 'resend_api_key';
    if v_secret is null then
      perform vault.create_secret(p_api_key, 'resend_api_key', 'Chave do Resend (envio dos e-mails do relatório)');
    else
      perform vault.update_secret(v_secret, p_api_key);
    end if;
    update public.email_settings set has_key = true, key_updated_at = now(), last_test_at = null, last_test_ok = null, last_test_error = null where id;
  end if;
  insert into public.audit_logs (actor_id, action, target_type, target_id, details)
  values ((select auth.uid()), 'email_settings.update', 'email_settings', 'resend',
          jsonb_build_object('from_email', lower(trim(p_from_email)), 'nova_chave', p_api_key is not null));
end;
$$;
revoke all on function private.email_settings_save_impl(text, text, text, text) from public, anon;
grant execute on function private.email_settings_save_impl(text, text, text, text) to authenticated;

create function public.email_settings_save(p_from_name text, p_from_email text, p_reply_to text default null, p_api_key text default null)
returns void language sql set search_path = ''
as $$ select private.email_settings_save_impl(p_from_name, p_from_email, p_reply_to, p_api_key) $$;
revoke all on function public.email_settings_save(text, text, text, text) from public, anon;
grant execute on function public.email_settings_save(text, text, text, text) to authenticated;

create function private.email_settings_remove_key_impl()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.current_user_role() is distinct from 'admin' then
    raise exception 'Só o administrador configura o envio de e-mails.' using errcode = '42501';
  end if;
  delete from vault.secrets where name = 'resend_api_key';
  update public.email_settings set has_key = false, key_updated_at = now(), last_test_at = null, last_test_ok = null, last_test_error = null,
                                   updated_at = now(), updated_by = (select auth.uid()) where id;
  insert into public.audit_logs (actor_id, action, target_type, target_id, details)
  values ((select auth.uid()), 'email_settings.remove_key', 'email_settings', 'resend', '{}'::jsonb);
end;
$$;
revoke all on function private.email_settings_remove_key_impl() from public, anon;
grant execute on function private.email_settings_remove_key_impl() to authenticated;
create function public.email_settings_remove_key()
returns void language sql set search_path = ''
as $$ select private.email_settings_remove_key_impl() $$;
revoke all on function public.email_settings_remove_key() from public, anon;
grant execute on function public.email_settings_remove_key() to authenticated;

-- Só o servidor lê a chave.
create function public.email_api_key_get()
returns text
language sql
stable
security definer
set search_path = ''
as $$ select decrypted_secret from vault.decrypted_secrets where name = 'resend_api_key' $$;
revoke all on function public.email_api_key_get() from public, anon, authenticated;
grant execute on function public.email_api_key_get() to service_role;

-- -----------------------------------------------------------------------------
-- E-mail semanal por cliente
-- -----------------------------------------------------------------------------
create function private.valid_emails(p text[])
returns boolean
language sql
immutable
set search_path = ''
as $$ select coalesce(bool_and(private.valid_email(e)), true) from unnest(p) e $$;

create table public.client_report_email (
  client_id    uuid primary key references public.clients (id) on delete cascade,
  enabled      boolean not null default false,
  recipients   text[] not null default '{}' check (cardinality(recipients) <= 10 and private.valid_emails(recipients)),
  -- 1 = segunda … 7 = domingo; hora no fuso do cliente
  weekday      smallint not null default 1 check (weekday between 1 and 7),
  send_hour    smallint not null default 8 check (send_hour between 0 and 23),
  -- Botão do e-mail: login no site, link secreto (guardado no cofre) ou nenhum
  button       text not null default 'login' check (button in ('login', 'link', 'none')),
  last_sent_at timestamptz,
  updated_at   timestamptz not null default now(),
  updated_by   uuid references auth.users (id) on delete set null
);
comment on table public.client_report_email is 'Etapa 19.4: e-mail semanal do relatório por cliente (liga/desliga, destinatários, dia e hora).';
create index client_report_email_updated_by_idx on public.client_report_email (updated_by);
create trigger client_report_email_touch_updated_at before update on public.client_report_email
  for each row execute function private.touch_updated_at();
alter table public.client_report_email enable row level security;
revoke all on public.client_report_email from anon, authenticated;
grant select on public.client_report_email to authenticated;
grant insert (client_id, enabled, recipients, weekday, send_hour, button, updated_by),
      update (enabled, recipients, weekday, send_hour, button, updated_by) on public.client_report_email to authenticated;
create policy "Equipe vê o e-mail semanal" on public.client_report_email for select to authenticated
  using ((select private.current_user_role()) <> 'cliente' and (select private.can_view_client(client_id)));
create policy "Admin e gestor criam o e-mail semanal" on public.client_report_email for insert to authenticated
  with check ((select private.can_edit_client(client_id)));
create policy "Admin e gestor mudam o e-mail semanal" on public.client_report_email for update to authenticated
  using ((select private.can_edit_client(client_id))) with check ((select private.can_edit_client(client_id)));

create table public.client_report_email_log (
  id           bigint generated always as identity primary key,
  client_id    uuid not null references public.clients (id) on delete cascade,
  created_at   timestamptz not null default now(),
  trigger      text not null check (trigger in ('agendado', 'manual', 'teste')),
  status       text not null check (status in ('enviado', 'erro', 'pulado')),
  recipients   integer not null default 0,
  period_from  date,
  period_to    date,
  detail       text check (char_length(detail) <= 500),
  requested_by uuid references auth.users (id) on delete set null
);
comment on table public.client_report_email_log is 'Etapa 19.4: histórico dos envios do e-mail do relatório (nada é apagado).';
create index client_report_email_log_client_idx on public.client_report_email_log (client_id, created_at desc);
create index client_report_email_log_requested_by_idx on public.client_report_email_log (requested_by);
alter table public.client_report_email_log enable row level security;
revoke all on public.client_report_email_log from anon, authenticated;
grant select on public.client_report_email_log to authenticated;
create policy "Equipe vê os envios" on public.client_report_email_log for select to authenticated
  using ((select private.current_user_role()) <> 'cliente' and (select private.can_view_client(client_id)));

-- Link secreto usado no botão do e-mail: confere com o link ATUAL do cliente e
-- guarda no cofre (o banco continua sem o código em texto nas tabelas).
create function private.client_report_email_set_link_impl(p_client_id uuid, p_link text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text := substring(coalesce(p_link, '') from '/r/([A-Za-z0-9_-]{43})(?:[/?#].*)?$');
  v_name text := 'report_link:' || p_client_id::text;
  v_secret uuid;
begin
  if not private.can_edit_client(p_client_id) then
    raise exception 'Sem permissão para mudar o e-mail deste cliente.' using errcode = '42501';
  end if;
  if v_token is null then raise exception 'Cole o link completo (…/r/código).' using errcode = '22023'; end if;
  if not exists (select 1 from public.client_portal p where p.client_id = p_client_id and p.link_enabled
                   and p.link_token_hash = encode(extensions.digest(v_token, 'sha256'), 'hex')) then
    raise exception 'Este não é o link atual do cliente (ou o link está desligado). Gere/copie o link no card "Acesso do cliente".' using errcode = '22023';
  end if;
  select id into v_secret from vault.secrets where name = v_name;
  if v_secret is null then
    perform vault.create_secret(v_token, v_name, 'Link secreto do dashboard usado no botão do e-mail semanal');
  else
    perform vault.update_secret(v_secret, v_token);
  end if;
end;
$$;
revoke all on function private.client_report_email_set_link_impl(uuid, text) from public, anon;
grant execute on function private.client_report_email_set_link_impl(uuid, text) to authenticated;
create function public.client_report_email_set_link(p_client_id uuid, p_link text)
returns void language sql set search_path = ''
as $$ select private.client_report_email_set_link_impl(p_client_id, p_link) $$;
revoke all on function public.client_report_email_set_link(uuid, text) from public, anon;
grant execute on function public.client_report_email_set_link(uuid, text) to authenticated;

-- A equipe vê só SE há link guardado e se ele ainda é o atual.
create function public.client_report_email_link_status(p_client_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_token text;
begin
  if not private.can_view_client(p_client_id) or private.current_user_role() = 'cliente' then return null; end if;
  select decrypted_secret into v_token from vault.decrypted_secrets where name = 'report_link:' || p_client_id::text;
  if v_token is null then return 'sem_link'; end if;
  if exists (select 1 from public.client_portal p where p.client_id = p_client_id and p.link_enabled
               and (p.link_expires_at is null or p.link_expires_at > now())
               and p.link_token_hash = encode(extensions.digest(v_token, 'sha256'), 'hex')) then
    return 'ok';
  end if;
  return 'desatualizado';
end;
$$;
revoke all on function public.client_report_email_link_status(uuid) from public, anon;
grant execute on function public.client_report_email_link_status(uuid) to authenticated;

-- Servidor: o link guardado, só se ainda for o atual e estiver ligado.
create function public.client_report_email_link_get(p_client_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select s.decrypted_secret
    from vault.decrypted_secrets s
    join public.client_portal p on p.client_id = p_client_id
   where s.name = 'report_link:' || p_client_id::text and p.link_enabled
     and (p.link_expires_at is null or p.link_expires_at > now())
     and p.link_token_hash = encode(extensions.digest(s.decrypted_secret, 'sha256'), 'hex')
$$;
revoke all on function public.client_report_email_link_get(uuid) from public, anon, authenticated;
grant execute on function public.client_report_email_link_get(uuid) to service_role;

-- Quem está na vez: ligado, com destinatários, no dia e hora do cliente, e sem
-- envio nos últimos 6 dias (nunca manda duas vezes na mesma semana).
create function public.client_report_email_due(p_limit integer default 20)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select e.client_id
    from public.client_report_email e
    join public.clients c on c.id = e.client_id
   where e.enabled and cardinality(e.recipients) > 0
     and (select has_key from public.email_settings where id)
     and extract(isodow from now() at time zone c.timezone) = e.weekday
     and extract(hour from now() at time zone c.timezone) = e.send_hour
     and (e.last_sent_at is null or e.last_sent_at < now() - interval '6 days')
   order by e.last_sent_at nulls first
   limit greatest(1, least(p_limit, 50))
$$;
revoke all on function public.client_report_email_due(integer) from public, anon, authenticated;
grant execute on function public.client_report_email_due(integer) to service_role;

-- Agendador: de hora em hora (minuto 7), só chama o servidor se alguém está na vez.
create function private.trigger_report_emails()
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
  if not exists (select 1 from public.client_report_email_due(1)) then return; end if;
  perform net.http_post(
    url := v_url || '/client-report-email',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret),
    body := jsonb_build_object('action', 'scheduled'),
    timeout_milliseconds := 120000
  );
end;
$$;
revoke all on function private.trigger_report_emails() from public, anon, authenticated;
select cron.unschedule(jobid) from cron.job where jobname = 'report-emails';
select cron.schedule('report-emails', '7 * * * *', $$select private.trigger_report_emails()$$);
