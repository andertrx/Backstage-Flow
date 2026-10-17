-- =============================================================================
-- Etapa 39.2 — Inteligência de Resultados: leitura da planilha 3 vezes por dia
-- (8h, 12h e 16h de Brasília) e o botão "Atualizar agora".
--
-- A planilha é o banco de dados (pedido do Ander, 17/10/2026). O CRM guarda só a
-- ÚLTIMA leitura de cada planilha, para a tela abrir rápido; ela é TROCADA a cada
-- leitura boa (sem histórico de contatos). Nada de nome ou telefone legível: o
-- contato vira uma impressão digital (SHA-256) só para contar contatos únicos.
-- Se a leitura falhar, a última leitura boa continua valendo.
-- =============================================================================

alter table public.ri_sources
  add column read_status      text not null default 'nunca' check (read_status in ('nunca', 'lendo', 'ok', 'erro')),
  add column last_attempt_at  timestamptz,
  add column last_success_at  timestamptz,
  add column last_error       text check (char_length(last_error) <= 500),
  add column consecutive_failures integer not null default 0,
  add column lease_until      timestamptz;
comment on column public.ri_sources.read_status is 'Situação da leitura da planilha: nunca, lendo, ok (última leitura boa) ou erro (a última tentativa falhou).';

-- Última leitura boa de cada planilha (uma linha por planilha, trocada a cada leitura).
create table public.ri_snapshots (
  source_id  uuid primary key references public.ri_sources (id) on delete cascade,
  client_id  uuid not null references public.clients (id) on delete cascade,
  read_at    timestamptz not null default now(),
  trigger    text not null check (trigger in ('agendada', 'manual')),
  row_count  integer not null check (row_count >= 0),
  -- linhas normalizadas (ver packages/shared/src/results/read.ts: RiRow); sem nome nem telefone
  rows       jsonb not null check (jsonb_typeof(rows) = 'array'),
  -- números da qualidade da leitura (RiReadStats)
  stats      jsonb not null default '{}'::jsonb check (jsonb_typeof(stats) = 'object')
);
comment on table public.ri_snapshots is
  'Etapa 39.2: última leitura boa da planilha de cada cliente (trocada a cada leitura; contatos só como hash).';
create index ri_snapshots_client_idx on public.ri_snapshots (client_id);
alter table public.ri_snapshots enable row level security;
revoke all on public.ri_snapshots from anon, authenticated;
grant select on public.ri_snapshots to authenticated;
create policy "Equipe vê a última leitura dos clientes liberados" on public.ri_snapshots for select to authenticated
  using ((select private.current_user_role()) <> 'cliente' and (select private.can_view_client(client_id)));

-- -----------------------------------------------------------------------------
-- Funções do servidor (só a Edge Function "sheets", com a chave de serviço)
-- -----------------------------------------------------------------------------

-- Reserva a planilha para uma leitura (nunca duas ao mesmo tempo). true = pode ler.
-- A leitura agendada só escolhe planilhas ligadas; o botão "Atualizar agora" lê mesmo com a automática desligada.
create function public.ri_read_claim(p_source_id uuid)
returns boolean
language sql
security definer
set search_path = ''
as $$
  with c as (
    update public.ri_sources
       set read_status = 'lendo', last_attempt_at = now(), lease_until = now() + interval '5 minutes'
     where id = p_source_id and (lease_until is null or lease_until < now())
    returning id
  )
  select exists (select 1 from c)
$$;
revoke all on function public.ri_read_claim(uuid) from public, anon, authenticated;
grant execute on function public.ri_read_claim(uuid) to service_role;

-- Leitura boa: troca a última leitura e libera a planilha.
create function public.ri_read_store(p_source_id uuid, p_trigger text, p_rows jsonb, p_stats jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_client uuid := (select client_id from public.ri_sources where id = p_source_id);
begin
  if v_client is null then raise exception 'Planilha não encontrada.' using errcode = '22023'; end if;
  insert into public.ri_snapshots (source_id, client_id, read_at, trigger, row_count, rows, stats)
  values (p_source_id, v_client, now(), p_trigger, jsonb_array_length(p_rows), p_rows, coalesce(p_stats, '{}'::jsonb))
  on conflict (source_id) do update
    set read_at = excluded.read_at, trigger = excluded.trigger, row_count = excluded.row_count,
        rows = excluded.rows, stats = excluded.stats;
  update public.ri_sources
     set read_status = 'ok', last_success_at = now(), last_error = null, consecutive_failures = 0, lease_until = null
   where id = p_source_id;
end;
$$;
revoke all on function public.ri_read_store(uuid, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.ri_read_store(uuid, text, jsonb, jsonb) to service_role;

-- Leitura com erro: a última leitura boa continua; registra o motivo.
create function public.ri_read_fail(p_source_id uuid, p_error text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.ri_sources
     set read_status = 'erro', last_error = left(p_error, 500), consecutive_failures = consecutive_failures + 1, lease_until = null
   where id = p_source_id
$$;
revoke all on function public.ri_read_fail(uuid, text) from public, anon, authenticated;
grant execute on function public.ri_read_fail(uuid, text) to service_role;

-- Ligar/desligar a leitura automática (admin e gestor do cliente).
create function private.ri_source_set_enabled_impl(p_id uuid, p_enabled boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_client uuid := (select client_id from public.ri_sources where id = p_id);
begin
  if v_client is null or not private.can_edit_client(v_client) then
    raise exception 'Sem permissão para configurar a planilha deste cliente.' using errcode = '42501';
  end if;
  update public.ri_sources set enabled = coalesce(p_enabled, false), updated_by = (select auth.uid()) where id = p_id;
  insert into public.audit_logs (actor_id, action, target_type, target_id, details)
  values ((select auth.uid()), case when p_enabled then 'ri_source.enable' else 'ri_source.disable' end, 'ri_source', p_id::text,
          jsonb_build_object('cliente', v_client));
end;
$$;
revoke all on function private.ri_source_set_enabled_impl(uuid, boolean) from public, anon;
grant execute on function private.ri_source_set_enabled_impl(uuid, boolean) to authenticated;
create function public.ri_source_set_enabled(p_id uuid, p_enabled boolean)
returns void language sql set search_path = ''
as $$ select private.ri_source_set_enabled_impl(p_id, p_enabled) $$;
revoke all on function public.ri_source_set_enabled(uuid, boolean) from public, anon;
grant execute on function public.ri_source_set_enabled(uuid, boolean) to authenticated;

-- -----------------------------------------------------------------------------
-- Agendamento: 8h, 12h e 16h de Brasília (11h, 15h e 19h UTC)
-- -----------------------------------------------------------------------------
create function private.trigger_sheets_read()
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
  if not exists (select 1 from public.ri_sources where enabled) then return; end if;
  if not exists (select 1 from public.sheets_settings where has_key) then return; end if;
  perform net.http_post(
    url := v_url || '/sheets',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret),
    body := jsonb_build_object('action', 'scheduled'),
    timeout_milliseconds := 150000
  );
end;
$$;
revoke all on function private.trigger_sheets_read() from public, anon, authenticated;

select cron.schedule('sheets-read', '0 11,15,19 * * *', $cron$select private.trigger_sheets_read()$cron$);
