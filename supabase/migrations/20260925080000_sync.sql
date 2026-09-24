-- =============================================================================
-- ETAPA 16 — Sincronização automática
--
-- Tabela nova: public.sync_runs (explicada ao usuário antes de criar)
--   * Um registro por sincronização de uma conta: quem pediu (ou agendada),
--     início/fim/duração, período buscado, registros atualizados, resultado e
--     erro. É o "log de sincronização". Permanente.
--
-- Quem faz o trabalho é a Edge Function "sync" (servidor), que busca os dados
-- nas APIs oficiais e grava com a chave de serviço. Aqui ficam:
--   * sync_claim_due()  → pega as contas cuja vez chegou (com trava, sem repetir)
--   * sync_lock()       → trava contas pedidas manualmente ("Sincronizar agora")
--   * sync_cron_secret_ok() → confere a senha interna do agendador
--   * sync_overview()   → a tela de Sincronização (com o RLS de quem pergunta)
--   * agendamento: a cada 5 minutos o banco chama a função "sync", que só
--     sincroniza as contas cuja próxima sincronização já chegou (1 em 1 hora).
-- =============================================================================

create table public.sync_runs (
  id              bigint generated always as identity primary key,
  ad_account_id   uuid not null references public.ad_accounts (id),
  client_id       uuid not null references public.clients (id),
  platform_id     text not null references public.platforms (id),
  trigger         text not null check (trigger in ('agendada', 'manual')),
  requested_by    uuid references auth.users (id) on delete set null,
  status          text not null default 'executando' check (status in ('executando', 'sucesso', 'erro')),
  started_at      timestamptz not null default now(),
  finished_at     timestamptz,
  duration_ms     integer check (duration_ms is null or duration_ms >= 0),
  date_from       date,
  date_to         date,
  records_updated integer not null default 0 check (records_updated >= 0),
  details         jsonb not null default '{}'::jsonb,
  error_code      text,
  error_message   text check (error_message is null or char_length(error_message) <= 500),
  check ((status = 'executando') = (finished_at is null))
);

comment on table public.sync_runs is 'Log de sincronização: uma linha por conta sincronizada (agendada ou manual). Permanente.';
comment on column public.sync_runs.records_updated is 'Registros gravados ou atualizados (estrutura + métricas diárias + alcance + saldo).';
comment on column public.sync_runs.details is 'Detalhe por parte: {"estrutura": n, "metricas": n, "alcance": n, "saldo": n, "avisos": [...]}.';

create index sync_runs_account_time_idx on public.sync_runs (ad_account_id, started_at desc);
create index sync_runs_client_time_idx on public.sync_runs (client_id, started_at desc);
create index sync_runs_time_idx on public.sync_runs (started_at desc);
create index sync_runs_platform_idx on public.sync_runs (platform_id);
create index sync_runs_requested_by_idx on public.sync_runs (requested_by);

revoke all on public.sync_runs from anon, authenticated;
grant select on public.sync_runs to authenticated;
alter table public.sync_runs enable row level security;
create policy "Equipe vê sincronizações dos clientes liberados" on public.sync_runs for select to authenticated
  using (client_id in (select private.visible_client_ids()) and (select private.current_user_role()) <> 'cliente');

-- -----------------------------------------------------------------------------
-- Contas cuja vez chegou (agendador). Trava para ninguém sincronizar em dobro.
-- -----------------------------------------------------------------------------
create function public.sync_claim_due(p_limit integer default 3, p_lock_minutes integer default 15)
returns setof uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Toda conta vinculada tem uma linha de estado (contas antigas podem não ter).
  insert into public.sync_state (ad_account_id, status)
  select a.id, 'pendente' from public.ad_accounts a
  where a.unlinked_at is null and not exists (select 1 from public.sync_state s where s.ad_account_id = a.id);

  return query
  with due as (
    select s.ad_account_id
    from public.sync_state s
    join public.ad_accounts a on a.id = s.ad_account_id
    join public.platform_connections c on c.id = a.connection_id
    where a.unlinked_at is null
      and c.status <> 'revogada'
      and coalesce(a.is_test_account, false) = false
      and (s.next_run_at is null or s.next_run_at <= now())
      and (s.locked_until is null or s.locked_until < now())
    order by s.next_run_at nulls first
    limit greatest(1, least(p_limit, 20))
    for update of s skip locked
  )
  update public.sync_state s
     set locked_until = now() + make_interval(mins => p_lock_minutes), status = 'executando', last_attempt_at = now()
    from due
   where s.ad_account_id = due.ad_account_id
  returning s.ad_account_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- "Sincronizar agora": trava as contas pedidas (as que já estão rodando ficam de fora)
-- -----------------------------------------------------------------------------
create function public.sync_lock(p_ad_account_ids uuid[], p_lock_minutes integer default 15)
returns setof uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.sync_state (ad_account_id, status)
  select a.id, 'pendente' from public.ad_accounts a
  where a.id = any (p_ad_account_ids) and a.unlinked_at is null
    and not exists (select 1 from public.sync_state s where s.ad_account_id = a.id);

  return query
  update public.sync_state s
     set locked_until = now() + make_interval(mins => p_lock_minutes), status = 'executando', last_attempt_at = now()
   where s.ad_account_id = any (p_ad_account_ids)
     and (s.locked_until is null or s.locked_until < now())
  returning s.ad_account_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Senha interna do agendador (fica no cofre; nunca vai para o site nem para o código)
-- -----------------------------------------------------------------------------
select vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'sync_cron_secret',
                           'Senha interna: o agendador do banco usa para chamar a função de sincronização.')
where not exists (select 1 from vault.secrets where name = 'sync_cron_secret');

create function public.sync_cron_secret_ok(p_secret text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(p_secret is not null and length(p_secret) >= 32 and exists (
    select 1 from vault.decrypted_secrets s where s.name = 'sync_cron_secret' and s.decrypted_secret = p_secret
  ), false)
$$;

revoke all on function public.sync_claim_due(integer, integer) from public, anon, authenticated;
revoke all on function public.sync_lock(uuid[], integer) from public, anon, authenticated;
revoke all on function public.sync_cron_secret_ok(text) from public, anon, authenticated;
grant execute on function public.sync_claim_due(integer, integer) to service_role;
grant execute on function public.sync_lock(uuid[], integer) to service_role;
grant execute on function public.sync_cron_secret_ok(text) to service_role;

-- -----------------------------------------------------------------------------
-- Tela de Sincronização (com o RLS de quem pergunta)
-- -----------------------------------------------------------------------------
create function public.sync_overview()
returns table (
  ad_account_id uuid, client_id uuid, client_name text, platform_id text, external_id text, name text,
  is_test_account boolean, has_connection boolean,
  status text, last_attempt_at timestamptz, last_success_at timestamptz, next_run_at timestamptz,
  last_error_message text, running boolean,
  run_status text, run_started_at timestamptz, run_finished_at timestamptz, run_duration_ms integer,
  run_records integer, run_trigger text, run_error text
)
language sql
stable
security invoker
set search_path = ''
as $$
  select a.id, a.client_id, c.name, a.platform_id, a.external_id, a.name,
         coalesce(a.is_test_account, false), a.connection_id is not null,
         coalesce(s.status, 'pendente'), s.last_attempt_at, s.last_success_at, s.next_run_at,
         s.last_error_message, coalesce(s.locked_until > now(), false),
         r.status, r.started_at, r.finished_at, r.duration_ms, r.records_updated, r.trigger, r.error_message
  from public.ad_accounts a
  join public.clients c on c.id = a.client_id
  left join public.sync_state s on s.ad_account_id = a.id
  left join lateral (
    select * from public.sync_runs x where x.ad_account_id = a.id order by x.started_at desc limit 1
  ) r on true
  where a.unlinked_at is null
  order by c.name, a.platform_id, a.name
$$;

revoke all on function public.sync_overview() from public, anon;
grant execute on function public.sync_overview() to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Agendamento: a cada 5 minutos, chama a função "sync" (ela decide quais contas
-- estão na vez). O endereço das funções fica em private.app_settings
-- ('functions_url'); sem ele configurado, nada é chamado.
-- -----------------------------------------------------------------------------
create function private.trigger_scheduled_sync()
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
  -- Só chama se alguma conta está na vez (evita chamadas à toa).
  if not exists (
    select 1 from public.ad_accounts a
    left join public.sync_state s on s.ad_account_id = a.id
    where a.unlinked_at is null and a.connection_id is not null
      and (s.next_run_at is null or s.next_run_at <= now())
      and (s.locked_until is null or s.locked_until < now())
  ) then
    return;
  end if;
  perform net.http_post(
    url := v_url || '/sync',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret),
    body := jsonb_build_object('action', 'scheduled'),
    timeout_milliseconds := 150000
  );
end;
$$;

revoke all on function private.trigger_scheduled_sync() from public, anon, authenticated;

select cron.unschedule(jobid) from cron.job where jobname = 'scheduled-sync';
select cron.schedule('scheduled-sync', '*/5 * * * *', 'select private.trigger_scheduled_sync()');
