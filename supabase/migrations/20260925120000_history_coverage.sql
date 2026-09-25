-- =============================================================================
-- ETAPA 23 — Banco histórico
--
-- O histórico diário já é gravado desde a Etapa 5 (metrics_daily, permanente).
-- Esta etapa acrescenta o que falta para responder "quanto gastou em agosto?"
-- com segurança:
--
--   1. COBERTURA: até onde vai o histórico de cada conta (history_from/to em
--      sync_state). Sem isso não dá para diferenciar "gastou zero" de "ainda
--      não temos esse período". Nenhuma tabela nova: colunas em sync_state.
--   2. IMPORTAÇÃO DO PASSADO: a sincronização buscava só 30 dias. Agora o
--      agendador importa, aos poucos (blocos de 30 dias), até 13 meses para trás
--      (history_target). Execuções ficam no log com origem "historico".
--   3. CONTA VINCULADA DE NOVO: quando a mesma conta da plataforma é vinculada
--      outra vez (ex.: nova conexão da BM), os dias repetidos da vinculação
--      antiga ficam marcados como "substituídos" e deixam de ser somados.
--      NADA é apagado (coluna superseded + regra de leitura).
--   4. Sincronizações interrompidas (tempo esgotado) deixam de ficar
--      "executando" para sempre.
--   5. history_coverage(): a tela de Histórico mostra a cobertura por conta.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 3. Conta vinculada de novo: dias repetidos da vinculação antiga
-- -----------------------------------------------------------------------------
alter table public.metrics_daily add column superseded boolean not null default false;
comment on column public.metrics_daily.superseded is
  'true = a mesma conta da plataforma foi vinculada de novo e a vinculação mais nova trouxe este mesmo dia/item. Guardado, mas não somado.';

create function private.metrics_supersede_older()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.metrics_daily o
     set superseded = true
    from new_rows n
    join public.ad_accounts na on na.id = n.ad_account_id
    join public.ad_accounts oa
      on oa.platform_id = na.platform_id and oa.external_id = na.external_id
     and oa.id <> na.id and oa.linked_at < na.linked_at
   where o.ad_account_id = oa.id
     and o.level = n.level
     and o.entity_external_id = n.entity_external_id
     and o.date = n.date
     and not o.superseded;
  return null;
end;
$$;

revoke all on function private.metrics_supersede_older() from public, anon, authenticated;

create trigger metrics_supersede_older
  after insert on public.metrics_daily
  referencing new table as new_rows
  for each statement execute function private.metrics_supersede_older();

-- Corrige o que já existe (ex.: Cravina Motos vinculada pela BM antiga e pela nova).
update public.metrics_daily o
   set superseded = true
  from public.metrics_daily n
  join public.ad_accounts na on na.id = n.ad_account_id
  join public.ad_accounts oa
    on oa.platform_id = na.platform_id and oa.external_id = na.external_id
   and oa.id <> na.id and oa.linked_at < na.linked_at
 where o.ad_account_id = oa.id
   and o.level = n.level
   and o.entity_external_id = n.entity_external_id
   and o.date = n.date
   and not n.superseded
   and not o.superseded;

-- Leitura pelo site: linhas substituídas não aparecem em nenhuma soma.
drop policy "Vê métricas dos clientes liberados" on public.metrics_daily;
create policy "Vê métricas dos clientes liberados" on public.metrics_daily for select to authenticated
  using (client_id in (select private.visible_client_ids()) and not superseded);

-- -----------------------------------------------------------------------------
-- 1. Cobertura do histórico (por conta)
-- -----------------------------------------------------------------------------
alter table public.sync_state
  add column history_from date,
  add column history_to date,
  add column backfill_locked_until timestamptz,
  add column backfill_next_at timestamptz,
  add column backfill_error text check (backfill_error is null or char_length(backfill_error) <= 500);

comment on column public.sync_state.history_from is 'Primeiro dia do histórico já buscado na API (sem buracos até history_to).';
comment on column public.sync_state.history_to is 'Último dia do histórico já buscado na API.';
comment on column public.sync_state.backfill_locked_until is 'Trava da importação do passado (não roda em dobro).';
comment on column public.sync_state.backfill_next_at is 'Depois de um erro na importação do passado, quando tentar de novo.';
comment on column public.sync_state.backfill_error is 'Último erro da importação do passado (mensagem amigável).';

-- Até onde o histórico é importado: 1º dia do mês, 12 meses atrás (13 meses com o atual).
create function public.history_target()
returns date
language sql
stable
set search_path = ''
as $$
  select (date_trunc('month', timezone('America/Sao_Paulo', now())) - interval '12 months')::date
$$;

revoke all on function public.history_target() from public, anon;
grant execute on function public.history_target() to authenticated, service_role;

-- Soma um período buscado com sucesso à cobertura (só se encostar nela).
create function public.sync_mark_coverage(p_ad_account_id uuid, p_from date, p_to date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_from is null or p_to is null or p_to < p_from then return; end if;
  update public.sync_state s
     set history_from = case
           when s.history_from is null or s.history_to is null then p_from
           when p_from > s.history_to + 1 then p_from               -- buraco: começa de novo (a importação cobre o resto)
           when p_to < s.history_from - 1 then s.history_from       -- período solto antes: ignora
           else least(s.history_from, p_from) end,
         history_to = case
           when s.history_from is null or s.history_to is null then p_to
           when p_from > s.history_to + 1 then p_to
           when p_to < s.history_from - 1 then s.history_to
           else greatest(s.history_to, p_to) end
   where s.ad_account_id = p_ad_account_id;
end;
$$;

revoke all on function public.sync_mark_coverage(uuid, date, date) from public, anon, authenticated;
grant execute on function public.sync_mark_coverage(uuid, date, date) to service_role;

-- Cobertura inicial, a partir das sincronizações que já deram certo
-- (último trecho contínuo de cada conta).
with runs as (
  select ad_account_id, date_from as f, date_to as t
  from public.sync_runs
  where status = 'sucesso' and date_from is not null and date_to is not null
),
ordered as (
  select *, max(t) over (partition by ad_account_id order by f, t rows between unbounded preceding and 1 preceding) as prev_max
  from runs
),
grouped as (
  select *, sum(case when prev_max is null or f > prev_max + 1 then 1 else 0 end)
              over (partition by ad_account_id order by f, t) as island
  from ordered
),
islands as (
  select ad_account_id, island, min(f) as f, max(t) as t from grouped group by ad_account_id, island
),
latest as (
  select distinct on (ad_account_id) ad_account_id, f, t from islands order by ad_account_id, t desc
)
update public.sync_state s
   set history_from = l.f, history_to = l.t
  from latest l
 where s.ad_account_id = l.ad_account_id;

-- -----------------------------------------------------------------------------
-- 2. Importação do passado
-- -----------------------------------------------------------------------------
alter table public.sync_runs drop constraint sync_runs_trigger_check;
alter table public.sync_runs add constraint sync_runs_trigger_check check (trigger in ('agendada', 'manual', 'historico'));
comment on column public.sync_runs.trigger is 'agendada | manual | historico (importação do passado, blocos de 30 dias).';

-- Contas que ainda não chegaram à meta de histórico (com trava própria).
create function public.sync_claim_backfill(p_limit integer default 2, p_lock_minutes integer default 15)
returns setof uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with due as (
    select s.ad_account_id
    from public.sync_state s
    join public.ad_accounts a on a.id = s.ad_account_id
    join public.platform_connections c on c.id = a.connection_id
    where a.unlinked_at is null
      and c.status <> 'revogada'
      and coalesce(a.is_test_account, false) = false
      and s.history_from is not null
      and s.history_from > public.history_target()
      and (s.backfill_locked_until is null or s.backfill_locked_until < now())
      and (s.backfill_next_at is null or s.backfill_next_at <= now())
    order by s.history_from desc
    limit greatest(1, least(p_limit, 10))
    for update of s skip locked
  )
  update public.sync_state s
     set backfill_locked_until = now() + make_interval(mins => p_lock_minutes)
    from due
   where s.ad_account_id = due.ad_account_id
  returning s.ad_account_id;
end;
$$;

revoke all on function public.sync_claim_backfill(integer, integer) from public, anon, authenticated;
grant execute on function public.sync_claim_backfill(integer, integer) to service_role;

-- Tela de Sincronização: a "última sincronização" continua sendo a do dia a dia
-- (a importação do passado aparece no log, com origem própria).
create or replace function public.sync_overview()
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
    select * from public.sync_runs x
    where x.ad_account_id = a.id and x.trigger <> 'historico'
    order by x.started_at desc limit 1
  ) r on true
  where a.unlinked_at is null
  order by c.name, a.platform_id, a.name
$$;

-- -----------------------------------------------------------------------------
-- 4. Agendador: chama a função quando há conta na vez OU passado a importar,
--    e fecha sincronizações que foram interrompidas (tempo esgotado).
-- -----------------------------------------------------------------------------
create index sync_runs_running_idx on public.sync_runs (started_at) where status = 'executando';

create or replace function private.trigger_scheduled_sync()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text := (select value from private.app_settings where key = 'functions_url');
  v_secret text := (select decrypted_secret from vault.decrypted_secrets where name = 'sync_cron_secret');
begin
  -- A função tem limite de ~150 s: passado de 30 min, foi interrompida.
  update public.sync_runs
     set status = 'erro', finished_at = now(),
         duration_ms = (extract(epoch from now() - started_at) * 1000)::integer,
         error_code = 'INTERRUPTED',
         error_message = 'A sincronização foi interrompida antes de terminar. Ela será feita de novo automaticamente.'
   where status = 'executando' and started_at < now() - interval '30 minutes';

  if v_url is null or v_secret is null then return; end if;
  if not exists (
    select 1 from public.ad_accounts a
    join public.platform_connections c on c.id = a.connection_id
    left join public.sync_state s on s.ad_account_id = a.id
    where a.unlinked_at is null and c.status <> 'revogada' and coalesce(a.is_test_account, false) = false
      and (
        ((s.next_run_at is null or s.next_run_at <= now()) and (s.locked_until is null or s.locked_until < now()))
        or (s.history_from > public.history_target()
            and (s.backfill_locked_until is null or s.backfill_locked_until < now())
            and (s.backfill_next_at is null or s.backfill_next_at <= now()))
      )
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

-- -----------------------------------------------------------------------------
-- 5. Cobertura para a tela de Histórico (com o RLS de quem pergunta)
-- -----------------------------------------------------------------------------
create function public.history_coverage(
  p_client_ids uuid[] default null,
  p_platforms text[] default null,
  p_ad_account_ids uuid[] default null
)
returns table (
  ad_account_id uuid,
  name text,
  client_id uuid,
  client_name text,
  platform_id text,
  currency text,
  history_from date,
  history_to date,
  target date,
  importing boolean,
  backfill_error text
)
language sql
stable
security invoker
set search_path = ''
as $$
  select a.id, a.name, a.client_id, c.name, a.platform_id, a.currency,
         s.history_from, s.history_to, public.history_target(),
         coalesce(s.backfill_locked_until > now(), false), s.backfill_error
  from public.ad_accounts a
  join public.clients c on c.id = a.client_id
  left join public.sync_state s on s.ad_account_id = a.id
  where a.unlinked_at is null
    and coalesce(a.is_test_account, false) = false
    and (p_client_ids is null or a.client_id = any (p_client_ids))
    and (p_platforms is null or a.platform_id = any (p_platforms))
    and (p_ad_account_ids is null or a.id = any (p_ad_account_ids))
  order by c.name, a.platform_id, a.name
$$;

revoke all on function public.history_coverage(uuid[], text[], uuid[]) from public, anon;
grant execute on function public.history_coverage(uuid[], text[], uuid[]) to authenticated, service_role;
