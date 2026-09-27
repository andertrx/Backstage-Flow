-- =============================================================================
-- Etapa 34.1 — Tracking: fundação
--
-- Módulo NOVO e separado. Só ACRESCENTA tabelas (prefixo tracking_) e funções;
-- nada que já existe é alterado. Remoção completa: supabase/rollback/remover_tracking.sql
--
--   tracking_containers  → um "container" por site de cliente (chave pública + domínios autorizados)
--   tracking_visitors    → visitante (tracking_id first-party) de um container
--   tracking_sessions    → sessão (session_id) do visitante
--   tracking_touchpoints → cada chegada com origem (UTMs, click IDs, IDs do anúncio, canal, evidência)
--   tracking_events      → eventos recebidos (PageView e outros), particionada por mês
--   private.track_limits → contadores do limite de requisições do endpoint público
--
-- Privacidade: nesta fase NÃO há dado pessoal (nome, e-mail, telefone, IP ou
-- user agent não são gravados). Só identificadores aleatórios gerados pelo script.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Containers
-- -----------------------------------------------------------------------------
create table public.tracking_containers (
  id              uuid primary key default gen_random_uuid(),
  client_id       uuid not null references public.clients (id),
  name            text not null check (char_length(btrim(name)) between 2 and 80),
  public_key      text not null unique default ('bf_' || encode(extensions.gen_random_bytes(12), 'hex'))
                  check (public_key ~ '^bf_[0-9a-f]{24}$'),
  allowed_domains text[] not null default '{}'
                  check (cardinality(allowed_domains) <= 20),
  status          text not null default 'ativo' check (status in ('ativo', 'pausado')),
  test_mode       boolean not null default true,
  consent_mode    text not null default 'nao_exigir' check (consent_mode in ('nao_exigir', 'aguardar_consentimento')),
  retention_days  integer not null default 180 check (retention_days in (90, 180, 365, 730)),
  created_at      timestamptz not null default now(),
  created_by      uuid references auth.users (id) on delete set null default auth.uid(),
  updated_at      timestamptz not null default now(),
  updated_by      uuid references auth.users (id) on delete set null
);

comment on table public.tracking_containers is
  'Tracking (Etapa 34): um container por site de cliente. public_key vai no script do site (não é segredo); só domínios autorizados podem enviar eventos.';
comment on column public.tracking_containers.test_mode is 'Modo teste: eventos marcados como teste (não são enviados às plataformas como reais).';
comment on column public.tracking_containers.retention_days is 'Retenção desejada dos eventos detalhados. A limpeza automática só será ligada com aprovação (fase posterior).';

create index tracking_containers_client_idx on public.tracking_containers (client_id);
create index tracking_containers_created_by_idx on public.tracking_containers (created_by);
create index tracking_containers_updated_by_idx on public.tracking_containers (updated_by);

-- Domínios no formato certo (minúsculas, sem protocolo e sem caminho).
create function private.valid_tracking_domains(p text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(bool_and(d ~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$' and char_length(d) <= 253), true)
  from unnest(p) d
$$;
alter table public.tracking_containers add constraint tracking_containers_domains_format
  check (private.valid_tracking_domains(allowed_domains));

-- Quem alterou é sempre quem está logado (não dá para informar outro usuário pela tela).
create function private.tracking_set_updated_by()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_by := coalesce((select auth.uid()), new.updated_by);
  return new;
end;
$$;
revoke all on function private.tracking_set_updated_by() from public, anon, authenticated;
create trigger tracking_containers_set_updated_by
  before update on public.tracking_containers
  for each row execute function private.tracking_set_updated_by();

create trigger tracking_containers_touch_updated_at
  before update on public.tracking_containers
  for each row execute function private.touch_updated_at();
create trigger tracking_containers_audit
  after insert or update on public.tracking_containers
  for each row execute function private.audit_row_change('tracking_container', 'id');

-- -----------------------------------------------------------------------------
-- Visitantes, sessões e touchpoints
-- -----------------------------------------------------------------------------
create table public.tracking_visitors (
  container_id    uuid not null references public.tracking_containers (id),
  visitor_id      text not null check (visitor_id ~ '^[A-Za-z0-9_-]{8,64}$'),
  client_id       uuid not null references public.clients (id),
  first_seen_at   timestamptz not null,
  last_seen_at    timestamptz not null,
  first_touch_id  bigint,
  last_touch_id   bigint,
  consent_status  text not null default 'nao_exigido' check (consent_status in ('nao_exigido', 'concedido')),
  consent_version text check (consent_version is null or char_length(consent_version) <= 40),
  consent_at      timestamptz,
  primary key (container_id, visitor_id)
);
comment on table public.tracking_visitors is 'Tracking: visitante identificado por um ID aleatório first-party (cookie do próprio site). Sem dado pessoal.';
create index tracking_visitors_client_idx on public.tracking_visitors (client_id, last_seen_at desc);

create table public.tracking_touchpoints (
  id                 bigint generated always as identity primary key,
  container_id       uuid not null references public.tracking_containers (id),
  client_id          uuid not null references public.clients (id),
  visitor_id         text not null,
  session_id         text not null,
  origin_event_id    text not null,
  occurred_at        timestamptz not null,
  channel            text not null check (channel in ('meta','google','tiktok','microsoft','linkedin','busca_organica','social_organico','email','whatsapp','referral','direto','outros')),
  paid               boolean,
  evidence           text not null check (evidence in ('confirmada','provavel','desconhecida')),
  reason             text not null check (char_length(reason) <= 300),
  -- Valores BRUTOS, exatamente como chegaram (auditoria) + fonte normalizada.
  utm_source         text check (char_length(utm_source) <= 500),
  utm_medium         text check (char_length(utm_medium) <= 500),
  utm_campaign       text check (char_length(utm_campaign) <= 500),
  utm_content        text check (char_length(utm_content) <= 500),
  utm_term           text check (char_length(utm_term) <= 500),
  source_normalized  text check (char_length(source_normalized) <= 500),
  fbclid             text check (char_length(fbclid) <= 500),
  gclid              text check (char_length(gclid) <= 500),
  wbraid             text check (char_length(wbraid) <= 500),
  gbraid             text check (char_length(gbraid) <= 500),
  other_click_ids    jsonb not null default '{}'::jsonb check (pg_column_size(other_click_ids) <= 2000),
  ad_campaign_id     text check (ad_campaign_id ~ '^\d{1,32}$'),
  ad_adset_id        text check (ad_adset_id ~ '^\d{1,32}$'),
  ad_ad_id           text check (ad_ad_id ~ '^\d{1,32}$'),
  landing_url        text check (char_length(landing_url) <= 2000),
  referrer_host      text check (char_length(referrer_host) <= 253),
  unique (container_id, origin_event_id),
  foreign key (container_id, visitor_id) references public.tracking_visitors (container_id, visitor_id)
);
comment on table public.tracking_touchpoints is 'Tracking: cada chegada ao site com a origem (bruta e normalizada), click IDs e IDs do anúncio. Nunca sobrescrito: o histórico de origens fica completo.';
create index tracking_touchpoints_visitor_idx on public.tracking_touchpoints (container_id, visitor_id, occurred_at);
create index tracking_touchpoints_client_time_idx on public.tracking_touchpoints (client_id, occurred_at desc);
create index tracking_touchpoints_campaign_idx on public.tracking_touchpoints (ad_campaign_id) where ad_campaign_id is not null;

alter table public.tracking_visitors
  add constraint tracking_visitors_first_touch_fk foreign key (first_touch_id) references public.tracking_touchpoints (id),
  add constraint tracking_visitors_last_touch_fk foreign key (last_touch_id) references public.tracking_touchpoints (id);
create index tracking_visitors_first_touch_idx on public.tracking_visitors (first_touch_id);
create index tracking_visitors_last_touch_idx on public.tracking_visitors (last_touch_id);

create table public.tracking_sessions (
  container_id    uuid not null references public.tracking_containers (id),
  session_id      text not null check (session_id ~ '^[A-Za-z0-9_-]{8,64}$'),
  client_id       uuid not null references public.clients (id),
  visitor_id      text not null,
  started_at      timestamptz not null,
  last_event_at   timestamptz not null,
  landing_url     text check (char_length(landing_url) <= 2000),
  referrer_host   text check (char_length(referrer_host) <= 253),
  device_type     text not null default 'desconhecido' check (device_type in ('mobile','tablet','desktop','desconhecido')),
  touchpoint_id   bigint references public.tracking_touchpoints (id),
  pageviews       integer not null default 0,
  events          integer not null default 0,
  test            boolean not null default false,
  primary key (container_id, session_id),
  foreign key (container_id, visitor_id) references public.tracking_visitors (container_id, visitor_id)
);
comment on table public.tracking_sessions is 'Tracking: sessão de navegação (nova após 30 min parado ou quando chega uma nova campanha).';
create index tracking_sessions_client_time_idx on public.tracking_sessions (client_id, started_at desc);
create index tracking_sessions_visitor_idx on public.tracking_sessions (container_id, visitor_id, started_at);
create index tracking_sessions_touch_idx on public.tracking_sessions (touchpoint_id);

-- -----------------------------------------------------------------------------
-- Eventos (particionada por mês, como metrics_daily)
-- -----------------------------------------------------------------------------
create table public.tracking_events (
  container_id    uuid not null,
  event_id        text not null check (event_id ~ '^[A-Za-z0-9_.:-]{8,80}$'),
  occurred_at     timestamptz not null,
  received_at     timestamptz not null default now(),
  client_id       uuid not null,
  visitor_id      text not null,
  session_id      text not null,
  event_name      text not null check (event_name ~ '^[A-Za-z][A-Za-z0-9_]{1,49}$'),
  page_url        text check (char_length(page_url) <= 2000),
  page_path       text check (char_length(page_path) <= 1000),
  referrer_host   text check (char_length(referrer_host) <= 253),
  touchpoint_id   bigint,
  custom_data     jsonb not null default '{}'::jsonb check (pg_column_size(custom_data) <= 4000),
  test            boolean not null default false,
  -- event_id + horário do evento (o mesmo reenvio traz os dois iguais) = sem duplicar.
  primary key (container_id, event_id, occurred_at)
) partition by range (occurred_at);
comment on table public.tracking_events is 'Tracking: eventos recebidos dos sites (PageView etc.). event_id evita duplicidade. Particionada por mês.';
create index tracking_events_client_time_idx on public.tracking_events (client_id, occurred_at desc);
create index tracking_events_session_idx on public.tracking_events (container_id, session_id, occurred_at);

-- Gaveta "de reserva": nenhum evento é perdido se o mês ainda não tiver gaveta.
create table history.tracking_events_default partition of public.tracking_events default;
revoke all on table history.tracking_events_default from public, anon, authenticated;
alter table history.tracking_events_default enable row level security;

create function private.ensure_tracking_partition(p_month date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  first_day date := date_trunc('month', p_month)::date;
  next_day  date := (date_trunc('month', p_month) + interval '1 month')::date;
  part_name text := 'tracking_events_' || to_char(first_day, 'YYYY_MM');
begin
  if to_regclass('history.' || part_name) is not null then return; end if;
  perform pg_advisory_xact_lock(hashtext(part_name));
  if to_regclass('history.' || part_name) is not null then return; end if;
  execute format('create table history.%I partition of public.tracking_events for values from (%L) to (%L)', part_name, first_day, next_day);
  execute format('revoke all on table history.%I from public, anon, authenticated', part_name);
  execute format('alter table history.%I enable row level security', part_name);
end;
$$;

create function private.ensure_tracking_partitions_ahead(p_months integer default 3)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  for i in 0..p_months loop
    perform private.ensure_tracking_partition((date_trunc('month', now()) + make_interval(months => i))::date);
  end loop;
end;
$$;
revoke all on function private.ensure_tracking_partition(date) from public, anon, authenticated;
revoke all on function private.ensure_tracking_partitions_ahead(integer) from public, anon, authenticated;
select private.ensure_tracking_partitions_ahead(3);
select cron.schedule('tracking-partitions', '10 3 * * *', $$select private.ensure_tracking_partitions_ahead(3)$$);

-- -----------------------------------------------------------------------------
-- Limite de requisições do endpoint público (por container e por IP cifrado)
-- -----------------------------------------------------------------------------
create table private.track_limits (
  bucket        text primary key check (char_length(bucket) <= 120),
  window_start  timestamptz not null,
  hits          integer not null
);
alter table private.track_limits enable row level security;
comment on table private.track_limits is 'Contadores do limite do endpoint de tracking. Uma linha por (container|IP cifrado), sobrescrita a cada janela. Não guarda IP em texto.';

create function private.track_limit_hit(p_bucket text, p_max integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hits integer;
begin
  insert into private.track_limits as t (bucket, window_start, hits)
  values (p_bucket, now(), 1)
  on conflict (bucket) do update
    set hits = case when t.window_start < now() - make_interval(secs => p_window_seconds) then 1 else t.hits + 1 end,
        window_start = case when t.window_start < now() - make_interval(secs => p_window_seconds) then now() else t.window_start end
  returning hits into v_hits;
  return v_hits <= p_max;
end;
$$;
revoke all on function private.track_limit_hit(text, integer, integer) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Ingestão (chamada só pelo servidor, com a chave de serviço)
-- -----------------------------------------------------------------------------
create function private.tracking_container_by_key(p_key text)
returns table (id uuid, client_id uuid, allowed_domains text[], status text, test_mode boolean, consent_mode text)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.client_id, c.allowed_domains, c.status, c.test_mode, c.consent_mode
  from public.tracking_containers c
  where c.public_key = p_key
$$;
revoke all on function private.tracking_container_by_key(text) from public, anon, authenticated;

/**
 * Grava um evento de forma idempotente. Se o event_id já existe, não muda nada
 * (status "duplicado"). Payload já validado pela Edge Function `track`.
 */
create function private.tracking_ingest(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_container uuid := (p ->> 'container_id')::uuid;
  v_client    uuid := (p ->> 'client_id')::uuid;
  v_visitor   text := p ->> 'visitor_id';
  v_session   text := p ->> 'session_id';
  v_event     jsonb := p -> 'event';
  v_touch     jsonb := p -> 'touch';
  v_at        timestamptz := (v_event ->> 'occurred_at')::timestamptz;
  v_test      boolean := coalesce((p ->> 'test')::boolean, false);
  v_is_page   boolean := (v_event ->> 'name') = 'PageView';
  v_touch_id  bigint;
  v_inserted  integer;
begin
  -- Horário do evento precisa ser recente (evita gavetas de meses aleatórios).
  if v_at is null or v_at < now() - interval '3 days' or v_at > now() + interval '1 hour' then
    return jsonb_build_object('status', 'fora_do_periodo');
  end if;
  perform private.ensure_tracking_partition(v_at::date);

  -- 1) Visitante (cria ou atualiza o "visto por último" e o consentimento)
  insert into public.tracking_visitors as v (container_id, visitor_id, client_id, first_seen_at, last_seen_at, consent_status, consent_version, consent_at)
  values (v_container, v_visitor, v_client, v_at, v_at, coalesce(p ->> 'consent_status', 'nao_exigido'),
          p ->> 'consent_version', case when p ->> 'consent_status' = 'concedido' then v_at end)
  on conflict (container_id, visitor_id) do update
    set last_seen_at = greatest(v.last_seen_at, excluded.last_seen_at),
        first_seen_at = least(v.first_seen_at, excluded.first_seen_at),
        consent_status = case when excluded.consent_status = 'concedido' then 'concedido' else v.consent_status end,
        consent_version = coalesce(excluded.consent_version, v.consent_version),
        consent_at = coalesce(v.consent_at, excluded.consent_at);

  -- 2) Evento (idempotente). Se já existia: nada mais muda.
  insert into public.tracking_events (container_id, event_id, occurred_at, client_id, visitor_id, session_id, event_name,
                                      page_url, page_path, referrer_host, custom_data, test)
  values (v_container, v_event ->> 'event_id', v_at, v_client, v_visitor, v_session, v_event ->> 'name',
          v_event ->> 'page_url', v_event ->> 'page_path', v_event ->> 'referrer_host',
          coalesce(v_event -> 'custom_data', '{}'::jsonb), v_test)
  on conflict do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    return jsonb_build_object('status', 'duplicado');
  end if;

  -- 3) Origem (touchpoint), quando o script detectou uma chegada com origem
  if v_touch is not null and jsonb_typeof(v_touch) = 'object' then
    insert into public.tracking_touchpoints (container_id, client_id, visitor_id, session_id, origin_event_id, occurred_at,
      channel, paid, evidence, reason, utm_source, utm_medium, utm_campaign, utm_content, utm_term, source_normalized,
      fbclid, gclid, wbraid, gbraid, other_click_ids, ad_campaign_id, ad_adset_id, ad_ad_id, landing_url, referrer_host)
    values (v_container, v_client, v_visitor, v_session, v_event ->> 'event_id', v_at,
      v_touch ->> 'channel', (v_touch ->> 'paid')::boolean, v_touch ->> 'evidence', v_touch ->> 'reason',
      v_touch ->> 'utm_source', v_touch ->> 'utm_medium', v_touch ->> 'utm_campaign', v_touch ->> 'utm_content', v_touch ->> 'utm_term',
      v_touch ->> 'source_normalized', v_touch ->> 'fbclid', v_touch ->> 'gclid', v_touch ->> 'wbraid', v_touch ->> 'gbraid',
      coalesce(v_touch -> 'other_click_ids', '{}'::jsonb), v_touch ->> 'ad_campaign_id', v_touch ->> 'ad_adset_id', v_touch ->> 'ad_ad_id',
      v_event ->> 'page_url', v_event ->> 'referrer_host')
    on conflict (container_id, origin_event_id) do nothing
    returning id into v_touch_id;

    if v_touch_id is not null then
      update public.tracking_events set touchpoint_id = v_touch_id
       where container_id = v_container and event_id = v_event ->> 'event_id' and occurred_at = v_at;
      -- Primeira origem nunca muda; a última acompanha a chegada mais recente.
      update public.tracking_visitors v
         set first_touch_id = coalesce(v.first_touch_id, v_touch_id),
             last_touch_id = case when v.last_touch_id is null
                                    or v_at >= (select t.occurred_at from public.tracking_touchpoints t where t.id = v.last_touch_id)
                                  then v_touch_id else v.last_touch_id end
       where v.container_id = v_container and v.visitor_id = v_visitor;
    end if;
  end if;

  -- 4) Sessão
  insert into public.tracking_sessions as s (container_id, session_id, client_id, visitor_id, started_at, last_event_at,
                                            landing_url, referrer_host, device_type, touchpoint_id, pageviews, events, test)
  values (v_container, v_session, v_client, v_visitor, v_at, v_at, v_event ->> 'page_url', v_event ->> 'referrer_host',
          coalesce(p ->> 'device_type', 'desconhecido'), v_touch_id, case when v_is_page then 1 else 0 end, 1, v_test)
  on conflict (container_id, session_id) do update
    set last_event_at = greatest(s.last_event_at, excluded.last_event_at),
        started_at = least(s.started_at, excluded.started_at),
        touchpoint_id = coalesce(s.touchpoint_id, excluded.touchpoint_id),
        pageviews = s.pageviews + excluded.pageviews,
        events = s.events + 1;

  return jsonb_build_object('status', 'ok', 'touchpoint_id', v_touch_id);
end;
$$;
revoke all on function private.tracking_ingest(jsonb) from public, anon, authenticated;

-- Portas públicas (PostgREST só enxerga o schema public) — só para o servidor.
create function public.tracking_container_by_key(p_key text)
returns table (id uuid, client_id uuid, allowed_domains text[], status text, test_mode boolean, consent_mode text)
language sql stable security invoker set search_path = ''
as $$ select * from private.tracking_container_by_key(p_key) $$;
create function public.tracking_ingest(p jsonb)
returns jsonb language sql security invoker set search_path = ''
as $$ select private.tracking_ingest(p) $$;
create function public.track_limit_hit(p_bucket text, p_max integer, p_window_seconds integer)
returns boolean language sql security invoker set search_path = ''
as $$ select private.track_limit_hit(p_bucket, p_max, p_window_seconds) $$;
revoke all on function public.tracking_container_by_key(text) from public, anon, authenticated;
revoke all on function public.tracking_ingest(jsonb) from public, anon, authenticated;
revoke all on function public.track_limit_hit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.tracking_container_by_key(text) to service_role;
grant execute on function public.tracking_ingest(jsonb) to service_role;
grant execute on function public.track_limit_hit(text, integer, integer) to service_role;
grant execute on function private.tracking_container_by_key(text) to service_role;
grant execute on function private.tracking_ingest(jsonb) to service_role;
grant execute on function private.track_limit_hit(text, integer, integer) to service_role;

-- -----------------------------------------------------------------------------
-- Acesso (RLS): a equipe vê os clientes liberados; o papel "cliente" não vê nada por enquanto.
-- Configurar containers: admin e gestor (dos clientes liberados).
-- -----------------------------------------------------------------------------
alter table public.tracking_containers enable row level security;
alter table public.tracking_visitors enable row level security;
alter table public.tracking_touchpoints enable row level security;
alter table public.tracking_sessions enable row level security;
alter table public.tracking_events enable row level security;

revoke all on public.tracking_containers, public.tracking_visitors, public.tracking_touchpoints,
              public.tracking_sessions, public.tracking_events from anon, authenticated;
grant select on public.tracking_containers, public.tracking_visitors, public.tracking_touchpoints,
                public.tracking_sessions, public.tracking_events to authenticated;
grant insert (client_id, name, allowed_domains, status, test_mode, consent_mode, retention_days),
      update (name, allowed_domains, status, test_mode, consent_mode, retention_days)
  on public.tracking_containers to authenticated;

create policy "Equipe vê containers dos clientes liberados" on public.tracking_containers for select to authenticated
  using (client_id in (select private.visible_client_ids()) and (select private.current_user_role()) <> 'cliente');
create policy "Admin e gestor criam containers" on public.tracking_containers for insert to authenticated
  with check (client_id in (select private.visible_client_ids()) and (select private.current_user_role()) in ('admin', 'gestor'));
create policy "Admin e gestor editam containers" on public.tracking_containers for update to authenticated
  using (client_id in (select private.visible_client_ids()) and (select private.current_user_role()) in ('admin', 'gestor'))
  with check (client_id in (select private.visible_client_ids()) and (select private.current_user_role()) in ('admin', 'gestor'));

create policy "Equipe vê visitantes dos clientes liberados" on public.tracking_visitors for select to authenticated
  using (client_id in (select private.visible_client_ids()) and (select private.current_user_role()) <> 'cliente');
create policy "Equipe vê origens dos clientes liberados" on public.tracking_touchpoints for select to authenticated
  using (client_id in (select private.visible_client_ids()) and (select private.current_user_role()) <> 'cliente');
create policy "Equipe vê sessões dos clientes liberados" on public.tracking_sessions for select to authenticated
  using (client_id in (select private.visible_client_ids()) and (select private.current_user_role()) <> 'cliente');
create policy "Equipe vê eventos dos clientes liberados" on public.tracking_events for select to authenticated
  using (client_id in (select private.visible_client_ids()) and (select private.current_user_role()) <> 'cliente');

-- -----------------------------------------------------------------------------
-- Resumo para a tela (contadores do dia e do período)
-- -----------------------------------------------------------------------------
create function public.tracking_overview(p_from timestamptz, p_to timestamptz, p_container_ids uuid[] default null)
returns table (container_id uuid, sessions bigint, visitors bigint, pageviews bigint, events bigint,
               paid_sessions bigint, unknown_origin_sessions bigint, last_event_at timestamptz)
language sql
stable
security invoker
set search_path = ''
as $$
  select c.id,
         (select count(*) from public.tracking_sessions s where s.container_id = c.id and s.started_at >= p_from and s.started_at < p_to),
         (select count(distinct s.visitor_id) from public.tracking_sessions s where s.container_id = c.id and s.started_at >= p_from and s.started_at < p_to),
         (select count(*) from public.tracking_events e where e.container_id = c.id and e.event_name = 'PageView' and e.occurred_at >= p_from and e.occurred_at < p_to),
         (select count(*) from public.tracking_events e where e.container_id = c.id and e.occurred_at >= p_from and e.occurred_at < p_to),
         (select count(*) from public.tracking_sessions s join public.tracking_touchpoints t on t.id = s.touchpoint_id
           where s.container_id = c.id and s.started_at >= p_from and s.started_at < p_to and t.paid),
         (select count(*) from public.tracking_sessions s left join public.tracking_touchpoints t on t.id = s.touchpoint_id
           where s.container_id = c.id and s.started_at >= p_from and s.started_at < p_to and (t.id is null or t.evidence = 'desconhecida')),
         (select max(e.received_at) from public.tracking_events e where e.container_id = c.id)
  from public.tracking_containers c
  where p_container_ids is null or c.id = any (p_container_ids)
$$;
revoke all on function public.tracking_overview(timestamptz, timestamptz, uuid[]) from public, anon;
grant execute on function public.tracking_overview(timestamptz, timestamptz, uuid[]) to authenticated, service_role;
