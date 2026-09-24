-- =============================================================================
-- ETAPA 5 (parte 1) — Estrutura das campanhas e histórico de alterações
--
--   * private.visible_client_ids() → lista de clientes que o usuário enxerga,
--     calculada UMA vez por consulta (mais rápido que conferir linha a linha).
--   * public.campaigns / ad_groups / ads → estado atual de cada item.
--   * public.entity_changes → toda mudança de status, orçamento ou nome fica
--     registrada automaticamente (histórico de alterações).
--
-- Retenção: permanente. Nada aqui é apagado automaticamente.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Clientes visíveis ao usuário logado
-- -----------------------------------------------------------------------------
create function private.visible_client_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select c.id from public.clients c where private.current_user_role() = 'admin'
  union
  select a.client_id from public.user_client_access a
  where a.user_id = (select auth.uid()) and private.current_user_role() is not null
$$;

revoke all on function private.visible_client_ids() from public, anon;
grant execute on function private.visible_client_ids() to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Status normalizado de campanhas, conjuntos/grupos e anúncios
-- -----------------------------------------------------------------------------
create type public.entity_status as enum ('ativa', 'pausada', 'encerrada', 'arquivada', 'erro', 'desconhecida');
create type public.entity_level as enum ('account', 'campaign', 'ad_group', 'ad');

-- -----------------------------------------------------------------------------
-- Campanhas
-- -----------------------------------------------------------------------------
create table public.campaigns (
  id               uuid primary key default gen_random_uuid(),
  ad_account_id    uuid not null references public.ad_accounts (id),
  client_id        uuid not null references public.clients (id),
  platform_id      text not null references public.platforms (id),
  external_id      text not null check (external_id ~ '^[0-9A-Za-z_-]{1,64}$'),
  name             text not null,
  objective        text,
  status           public.entity_status not null default 'desconhecida',
  raw_status       text,
  effective_status text,
  budget_micros    bigint check (budget_micros is null or budget_micros >= 0),
  budget_period    text check (budget_period is null or budget_period in ('diario', 'vitalicio')),
  bid_strategy     text,
  start_date       date,
  end_date         date,
  first_seen_at    timestamptz not null default now(),
  last_seen_at     timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (ad_account_id, external_id)
);

comment on table public.campaigns is 'Estado atual das campanhas. Mudanças ficam em entity_changes. Nunca apagar.';
comment on column public.campaigns.budget_micros is 'Orçamento em micros (R$ 1,00 = 1.000.000). Null = sem orçamento na campanha (ex.: no conjunto).';
comment on column public.campaigns.last_seen_at is 'Última vez que a plataforma informou esta campanha.';

create index campaigns_client_status_idx on public.campaigns (client_id, status);
create index campaigns_account_status_idx on public.campaigns (ad_account_id, status);
create index campaigns_platform_idx on public.campaigns (platform_id);

-- -----------------------------------------------------------------------------
-- Conjuntos (Meta) / Grupos de anúncios (Google)
-- -----------------------------------------------------------------------------
create table public.ad_groups (
  id                uuid primary key default gen_random_uuid(),
  campaign_id       uuid not null references public.campaigns (id),
  ad_account_id     uuid not null references public.ad_accounts (id),
  client_id         uuid not null references public.clients (id),
  platform_id       text not null references public.platforms (id),
  external_id       text not null check (external_id ~ '^[0-9A-Za-z_-]{1,64}$'),
  name              text not null,
  status            public.entity_status not null default 'desconhecida',
  raw_status        text,
  effective_status  text,
  budget_micros     bigint check (budget_micros is null or budget_micros >= 0),
  budget_period     text check (budget_period is null or budget_period in ('diario', 'vitalicio')),
  optimization_goal text,
  first_seen_at     timestamptz not null default now(),
  last_seen_at      timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (ad_account_id, external_id)
);

comment on table public.ad_groups is 'Conjuntos de anúncios (Meta) e grupos de anúncios (Google). Nunca apagar.';

create index ad_groups_campaign_idx on public.ad_groups (campaign_id);
create index ad_groups_client_status_idx on public.ad_groups (client_id, status);
create index ad_groups_platform_idx on public.ad_groups (platform_id);

-- -----------------------------------------------------------------------------
-- Anúncios
-- -----------------------------------------------------------------------------
create table public.ads (
  id                uuid primary key default gen_random_uuid(),
  ad_group_id       uuid not null references public.ad_groups (id),
  campaign_id       uuid not null references public.campaigns (id),
  ad_account_id     uuid not null references public.ad_accounts (id),
  client_id         uuid not null references public.clients (id),
  platform_id       text not null references public.platforms (id),
  external_id       text not null check (external_id ~ '^[0-9A-Za-z_-]{1,64}$'),
  name              text not null,
  status            public.entity_status not null default 'desconhecida',
  raw_status        text,
  effective_status  text,
  creative_type     text,
  review_status     text,
  thumbnail_url     text check (thumbnail_url is null or thumbnail_url ~ '^https://'),
  first_seen_at     timestamptz not null default now(),
  last_seen_at      timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (ad_account_id, external_id)
);

comment on table public.ads is 'Anúncios. Nunca apagar.';

create index ads_ad_group_idx on public.ads (ad_group_id);
create index ads_campaign_idx on public.ads (campaign_id);
create index ads_client_status_idx on public.ads (client_id, status);
create index ads_platform_idx on public.ads (platform_id);

create trigger campaigns_touch_updated_at before update on public.campaigns for each row execute function private.touch_updated_at();
create trigger ad_groups_touch_updated_at before update on public.ad_groups for each row execute function private.touch_updated_at();
create trigger ads_touch_updated_at before update on public.ads for each row execute function private.touch_updated_at();

-- -----------------------------------------------------------------------------
-- Histórico de alterações (status, orçamento, nome...)
-- -----------------------------------------------------------------------------
create table public.entity_changes (
  id            bigint generated always as identity primary key,
  ad_account_id uuid not null references public.ad_accounts (id),
  client_id     uuid not null references public.clients (id),
  entity_level  public.entity_level not null,
  entity_id     uuid,
  external_id   text not null,
  field         text not null,
  old_value     jsonb,
  new_value     jsonb,
  source        text not null default 'sync' check (source in ('sync', 'platform_activity', 'manual')),
  changed_at    timestamptz,
  detected_at   timestamptz not null default now()
);

comment on table public.entity_changes is 'Histórico de alterações detectadas (sync) ou informadas pela plataforma (activities/change_event). Permanente.';
comment on column public.entity_changes.changed_at is 'Quando a mudança aconteceu na plataforma (se informado). detected_at = quando o sistema percebeu.';

create index entity_changes_client_time_idx on public.entity_changes (client_id, detected_at desc);
create index entity_changes_entity_idx on public.entity_changes (entity_level, entity_id, detected_at desc);
create index entity_changes_account_idx on public.entity_changes (ad_account_id, detected_at desc);

-- Registra automaticamente as mudanças importantes quando a sincronização
-- atualiza uma campanha, conjunto/grupo, anúncio ou conta.
create function private.track_entity_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  level        public.entity_level := tg_argv[0]::public.entity_level;
  watched      text[] := string_to_array(tg_argv[1], ',');
  before_row   jsonb := to_jsonb(old);
  after_row    jsonb := to_jsonb(new);
  field        text;
  account_id   uuid;
begin
  account_id := case when level = 'account' then new.id else (after_row ->> 'ad_account_id')::uuid end;
  foreach field in array watched loop
    if before_row -> field is distinct from after_row -> field then
      insert into public.entity_changes (ad_account_id, client_id, entity_level, entity_id, external_id, field, old_value, new_value)
      values (account_id, (after_row ->> 'client_id')::uuid, level, new.id, after_row ->> 'external_id', field,
              before_row -> field, after_row -> field);
    end if;
  end loop;
  return new;
end;
$$;

create trigger campaigns_track_changes after update on public.campaigns
  for each row execute function private.track_entity_changes('campaign', 'status,budget_micros,budget_period,name,objective,end_date');
create trigger ad_groups_track_changes after update on public.ad_groups
  for each row execute function private.track_entity_changes('ad_group', 'status,budget_micros,budget_period,name');
create trigger ads_track_changes after update on public.ads
  for each row execute function private.track_entity_changes('ad', 'status,name,review_status');
create trigger ad_accounts_track_changes after update on public.ad_accounts
  for each row execute function private.track_entity_changes('account', 'status,name,currency,timezone');

-- -----------------------------------------------------------------------------
-- Permissões: o site só lê; a sincronização (servidor) escreve.
-- -----------------------------------------------------------------------------
revoke all on public.campaigns, public.ad_groups, public.ads, public.entity_changes from anon, authenticated;
grant select on public.campaigns, public.ad_groups, public.ads, public.entity_changes to authenticated;

alter table public.campaigns enable row level security;
alter table public.ad_groups enable row level security;
alter table public.ads enable row level security;
alter table public.entity_changes enable row level security;

create policy "Vê campanhas dos clientes liberados" on public.campaigns for select to authenticated
  using (client_id in (select private.visible_client_ids()));
create policy "Vê conjuntos/grupos dos clientes liberados" on public.ad_groups for select to authenticated
  using (client_id in (select private.visible_client_ids()));
create policy "Vê anúncios dos clientes liberados" on public.ads for select to authenticated
  using (client_id in (select private.visible_client_ids()));
create policy "Vê alterações dos clientes liberados" on public.entity_changes for select to authenticated
  using (client_id in (select private.visible_client_ids()));
