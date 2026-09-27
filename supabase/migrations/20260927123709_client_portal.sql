-- =============================================================================
-- Etapa 19.2 — Acesso do cliente ao dashboard (login e link secreto)
--
-- client_portal: dois interruptores por cliente, cada um liga/desliga sozinho:
--   login_enabled → usuários com papel "cliente" liberados para a empresa
--                   veem os dados dela. Desligado = não veem nada (o banco
--                   esconde, não só a tela).
--   link_enabled  → o endereço /r/<código> abre o dashboard sem login.
--                   Só a impressão digital (SHA-256) do código fica guardada;
--                   o código aparece uma única vez, quando é gerado.
--
-- Escrita só pelas funções abaixo (admin e gestor responsável), com registro
-- na auditoria. Remoção: supabase/rollback/remover_dashboard_cliente.sql
-- =============================================================================

create table public.client_portal (
  client_id         uuid primary key references public.clients (id) on delete cascade,
  login_enabled     boolean not null default false,
  link_enabled      boolean not null default false,
  link_token_hash   text unique check (link_token_hash ~ '^[0-9a-f]{64}$'),
  link_created_at   timestamptz,
  link_expires_at   timestamptz,
  link_last_used_at timestamptz,
  link_uses         integer not null default 0,
  updated_at        timestamptz not null default now(),
  updated_by        uuid references auth.users (id) on delete set null
);
comment on table public.client_portal is
  'Etapa 19.2: acesso do cliente ao dashboard — login (papel cliente) e link secreto, cada um com liga/desliga.';
create index client_portal_updated_by_idx on public.client_portal (updated_by);

alter table public.client_portal enable row level security;
revoke all on public.client_portal from anon, authenticated;
-- A equipe lê tudo, menos a impressão digital do código do link.
grant select (client_id, login_enabled, link_enabled, link_created_at, link_expires_at, link_last_used_at, link_uses, updated_at, updated_by)
  on public.client_portal to authenticated;
create policy "Equipe vê o acesso dos clientes liberados" on public.client_portal for select to authenticated
  using ((select private.current_user_role()) <> 'cliente' and (select private.can_view_client(client_id)));

-- -----------------------------------------------------------------------------
-- Papel "cliente" só enxerga a empresa quando o login está ligado.
-- (Estas duas funções sustentam o RLS de todas as tabelas de clientes.)
-- -----------------------------------------------------------------------------
create or replace function private.visible_client_ids()
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
    and (private.current_user_role() <> 'cliente'
         or exists (select 1 from public.client_portal p where p.client_id = a.client_id and p.login_enabled))
$$;

create or replace function private.can_view_client(target uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when private.current_user_role() is null then false
    when private.current_user_role() = 'admin' then true
    else exists (
      select 1 from public.user_client_access a
      where a.user_id = (select auth.uid()) and a.client_id = target
        and (private.current_user_role() <> 'cliente'
             or exists (select 1 from public.client_portal p where p.client_id = target and p.login_enabled))
    )
  end
$$;

-- -----------------------------------------------------------------------------
-- Interruptores (admin e gestor responsável). null = não mexe.
-- -----------------------------------------------------------------------------
create function public.client_portal_set(p_client_id uuid, p_login_enabled boolean default null, p_link_enabled boolean default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old public.client_portal;
begin
  if not private.can_edit_client(p_client_id) then
    raise exception 'Sem permissão para mudar o acesso deste cliente.' using errcode = '42501';
  end if;
  select * into v_old from public.client_portal where client_id = p_client_id;
  if p_link_enabled and v_old.link_token_hash is null then
    raise exception 'Gere o link antes de ligá-lo.' using errcode = '22023';
  end if;
  insert into public.client_portal (client_id, login_enabled, link_enabled, updated_by)
  values (p_client_id, coalesce(p_login_enabled, false), coalesce(p_link_enabled, false), (select auth.uid()))
  on conflict (client_id) do update
    set login_enabled = coalesce(p_login_enabled, public.client_portal.login_enabled),
        link_enabled = coalesce(p_link_enabled, public.client_portal.link_enabled),
        updated_at = now(), updated_by = (select auth.uid());
  if p_login_enabled is not null and p_login_enabled is distinct from coalesce(v_old.login_enabled, false) then
    insert into public.audit_logs (actor_id, action, target_type, target_id, details)
    values ((select auth.uid()), case when p_login_enabled then 'client_portal.login_on' else 'client_portal.login_off' end, 'client', p_client_id::text, '{}'::jsonb);
  end if;
  if p_link_enabled is not null and p_link_enabled is distinct from coalesce(v_old.link_enabled, false) then
    insert into public.audit_logs (actor_id, action, target_type, target_id, details)
    values ((select auth.uid()), case when p_link_enabled then 'client_portal.link_on' else 'client_portal.link_off' end, 'client', p_client_id::text, '{}'::jsonb);
  end if;
end;
$$;
revoke all on function public.client_portal_set(uuid, boolean, boolean) from public, anon;
grant execute on function public.client_portal_set(uuid, boolean, boolean) to authenticated;

-- Gera um código novo (o antigo para de funcionar na hora) e liga o link.
-- Devolve o código UMA vez; o banco guarda só o SHA-256.
create function public.client_portal_new_link(p_client_id uuid, p_valid_days integer default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text;
begin
  if not private.can_edit_client(p_client_id) then
    raise exception 'Sem permissão para mudar o acesso deste cliente.' using errcode = '42501';
  end if;
  if p_valid_days is not null and (p_valid_days < 1 or p_valid_days > 3650) then
    raise exception 'Validade inválida.' using errcode = '22023';
  end if;
  -- 32 bytes aleatórios → 43 caracteres seguros para endereço.
  v_token := rtrim(translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/', '-_'), '=');
  insert into public.client_portal (client_id, link_enabled, link_token_hash, link_created_at, link_expires_at, link_last_used_at, link_uses, updated_by)
  values (p_client_id, true, encode(extensions.digest(v_token, 'sha256'), 'hex'), now(),
          case when p_valid_days is null then null else now() + make_interval(days => p_valid_days) end, null, 0, (select auth.uid()))
  on conflict (client_id) do update
    set link_enabled = true, link_token_hash = excluded.link_token_hash, link_created_at = excluded.link_created_at,
        link_expires_at = excluded.link_expires_at, link_last_used_at = null, link_uses = 0,
        updated_at = now(), updated_by = (select auth.uid());
  insert into public.audit_logs (actor_id, action, target_type, target_id, details)
  values ((select auth.uid()), 'client_portal.link_new', 'client', p_client_id::text,
          jsonb_build_object('valid_days', p_valid_days));
  return v_token;
end;
$$;
revoke all on function public.client_portal_new_link(uuid, integer) from public, anon;
grant execute on function public.client_portal_new_link(uuid, integer) to authenticated;

-- -----------------------------------------------------------------------------
-- As funções do dashboard ignoram linhas substituídas mesmo sem o RLS
-- (a leitura pelo link roda sem usuário logado).
-- -----------------------------------------------------------------------------
create or replace function public.client_report_accounts(p_client_id uuid, p_from date, p_to date)
returns table (
  ad_account_id uuid, platform_id text, name text, external_id text, currency text,
  cur jsonb, prev jsonb, prev_from date, prev_to date, last_synced_at timestamptz
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_pfrom date := p_from - (p_to - p_from + 1);
  v_pto date := p_from - 1;
begin
  if p_from is null or p_to is null or p_to < p_from then raise exception 'Período inválido'; end if;
  if p_to - p_from > 400 then raise exception 'Período longo demais (máx. 400 dias)'; end if;

  return query
  with accts as (
    select a.id, a.platform_id, a.name, a.external_id, a.currency
      from public.ad_accounts a
     where a.client_id = p_client_id and a.unlinked_at is null
  ),
  tot as (
    select m.ad_account_id, (m.date >= p_from) as is_cur,
           sum(m.spend_micros)::bigint as spend, sum(m.impressions)::bigint as impressions, sum(m.clicks)::bigint as clicks,
           sum(m.link_clicks)::bigint as link_clicks, count(m.link_clicks) as link_clicks_days,
           sum(m.leads) as leads, count(m.leads) as leads_days, sum(m.messages) as messages, count(m.messages) as messages_days,
           sum(m.conversions) as conversions, sum(m.conversion_value_micros)::bigint as conversion_value,
           sum(m.video_views)::bigint as video_views, count(m.video_views) as video_views_days,
           count(*) as days, max(m.synced_at) as synced,
           private.sum_actions(array_agg(m.raw_actions) filter (where m.raw_actions is not null)) as actions
      from public.metrics_daily m
     where m.level = 'account' and not m.superseded and m.ad_account_id in (select id from accts)
       and m.date between v_pfrom and p_to
     group by 1, 2
  )
  select a.id, a.platform_id, a.name, a.external_id, a.currency,
         case when c.ad_account_id is null then null else jsonb_build_object(
           'spend_micros', c.spend, 'impressions', c.impressions, 'clicks', c.clicks,
           'link_clicks', case when c.link_clicks_days > 0 then c.link_clicks end,
           'leads', case when c.leads_days > 0 then c.leads end,
           'messages', case when c.messages_days > 0 then c.messages end,
           'conversions', c.conversions, 'conversion_value_micros', c.conversion_value,
           'video_views', case when c.video_views_days > 0 then c.video_views end,
           'days', c.days, 'reach', rc.reach, 'frequency', rc.frequency, 'actions', c.actions) end,
         case when p.ad_account_id is null then null else jsonb_build_object(
           'spend_micros', p.spend, 'impressions', p.impressions, 'clicks', p.clicks,
           'link_clicks', case when p.link_clicks_days > 0 then p.link_clicks end,
           'leads', case when p.leads_days > 0 then p.leads end,
           'messages', case when p.messages_days > 0 then p.messages end,
           'conversions', p.conversions, 'conversion_value_micros', p.conversion_value,
           'video_views', case when p.video_views_days > 0 then p.video_views end,
           'days', p.days, 'reach', rp.reach, 'frequency', rp.frequency, 'actions', p.actions) end,
         v_pfrom, v_pto, greatest(c.synced, p.synced)
    from accts a
    left join tot c on c.ad_account_id = a.id and c.is_cur
    left join tot p on p.ad_account_id = a.id and not p.is_cur
    left join public.period_reach rc on rc.ad_account_id = a.id and rc.level = 'account' and rc.entity_external_id = a.external_id
                                    and rc.period_start = p_from and rc.period_end = p_to
    left join public.period_reach rp on rp.ad_account_id = a.id and rp.level = 'account' and rp.entity_external_id = a.external_id
                                    and rp.period_start = v_pfrom and rp.period_end = v_pto
   order by coalesce(c.spend, 0) desc, a.platform_id, a.name;
end;
$$;

create or replace function public.client_report_daily(p_client_id uuid, p_from date, p_to date)
returns table (
  ad_account_id uuid, date date, spend_micros bigint, impressions bigint, clicks bigint, link_clicks bigint,
  leads numeric, messages numeric, conversions numeric, conversion_value_micros bigint, actions jsonb
)
language sql
stable
security invoker
set search_path = ''
as $$
  select m.ad_account_id, m.date, m.spend_micros, m.impressions, m.clicks, m.link_clicks, m.leads, m.messages, m.conversions,
         m.conversion_value_micros, case when m.raw_actions is null then null else private.sum_actions(array[m.raw_actions]) end
    from public.metrics_daily m
    join public.ad_accounts a on a.id = m.ad_account_id
   where a.client_id = p_client_id and a.unlinked_at is null and m.level = 'account' and not m.superseded
     and m.date between p_from and p_to and p_to >= p_from and p_to - p_from <= 400
   order by m.ad_account_id, m.date
$$;

create or replace function public.client_report_campaigns(p_client_id uuid, p_from date, p_to date)
returns table (
  campaign_id uuid, ad_account_id uuid, name text, status public.entity_status, objective text,
  spend_micros bigint, impressions bigint, clicks bigint, link_clicks bigint,
  leads numeric, messages numeric, conversions numeric, conversion_value_micros bigint, actions jsonb
)
language sql
stable
security invoker
set search_path = ''
as $$
  select c.id, c.ad_account_id, c.name, c.status, c.objective,
         sum(m.spend_micros)::bigint, sum(m.impressions)::bigint, sum(m.clicks)::bigint, sum(m.link_clicks)::bigint,
         sum(m.leads), sum(m.messages), sum(m.conversions), sum(m.conversion_value_micros)::bigint,
         private.sum_actions(array_agg(m.raw_actions) filter (where m.raw_actions is not null))
    from public.metrics_daily m
    join public.campaigns c on c.id = m.campaign_id
    join public.ad_accounts a on a.id = c.ad_account_id
   where a.client_id = p_client_id and a.unlinked_at is null and m.level = 'campaign' and not m.superseded
     and m.date between p_from and p_to and p_to >= p_from and p_to - p_from <= 400
   group by c.id, c.ad_account_id, c.name, c.status, c.objective
  having sum(m.spend_micros) > 0 or sum(m.leads) > 0 or sum(m.messages) > 0 or sum(m.conversions) > 0
   order by sum(m.spend_micros) desc nulls last
   limit 200
$$;

-- -----------------------------------------------------------------------------
-- Leitura pelo link secreto (sem login). Só funciona com o código certo,
-- com o link ligado e dentro da validade. Mesmo recorte do dashboard: nada
-- além dos números e do modelo do próprio cliente.
-- p_period: um período pronto; ou p_from/p_to (até 400 dias, sem o futuro);
-- nada = período padrão do modelo. Datas no fuso do cliente.
-- -----------------------------------------------------------------------------
create function public.client_report_public(p_token text, p_period text default null, p_from date default null, p_to date default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_portal public.client_portal;
  v_client public.clients;
  v_settings jsonb;
  v_period text;
  v_today date;
  v_from date;
  v_to date;
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{43}$' then
    raise exception 'Link inválido ou desativado.' using errcode = 'P0002';
  end if;
  select * into v_portal from public.client_portal
   where link_token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
     and link_enabled and (link_expires_at is null or link_expires_at > now());
  if not found then raise exception 'Link inválido ou desativado.' using errcode = 'P0002'; end if;
  -- No máximo 300 consultas a cada 10 minutos por link.
  if not private.rate_limit_hit_impl('client_report_link', v_portal.client_id, 300, 600) then
    raise exception 'Muitas consultas seguidas. Tente de novo em alguns minutos.' using errcode = '54000';
  end if;

  select * into v_client from public.clients where id = v_portal.client_id;
  select to_jsonb(s) - 'client_id' - 'updated_by' into v_settings from public.client_report_settings s where s.client_id = v_client.id;
  v_today := (now() at time zone v_client.timezone)::date;

  if p_from is not null or p_to is not null then
    if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 400 or p_to > v_today then
      raise exception 'Período inválido (até 400 dias, sem datas futuras).' using errcode = '22023';
    end if;
    v_period := 'custom'; v_from := p_from; v_to := p_to;
  else
    v_period := coalesce(p_period, v_settings ->> 'default_period', 'last_7_days');
    case v_period
      when 'last_7_days' then v_from := v_today - 7; v_to := v_today - 1;
      when 'last_14_days' then v_from := v_today - 14; v_to := v_today - 1;
      when 'last_30_days' then v_from := v_today - 30; v_to := v_today - 1;
      when 'this_month' then v_from := date_trunc('month', v_today)::date; v_to := v_today;
      when 'last_month' then v_from := (date_trunc('month', v_today) - interval '1 month')::date; v_to := date_trunc('month', v_today)::date - 1;
      else raise exception 'Período inválido.' using errcode = '22023';
    end case;
  end if;

  update public.client_portal set link_last_used_at = now(), link_uses = link_uses + 1 where client_id = v_client.id;

  return jsonb_build_object(
    'client', jsonb_build_object('name', v_client.name, 'timezone', v_client.timezone),
    'settings', v_settings,
    'period', v_period, 'from', v_from, 'to', v_to, 'today', v_today,
    'accounts', coalesce((select jsonb_agg(to_jsonb(a)) from public.client_report_accounts(v_client.id, v_from, v_to) a), '[]'::jsonb),
    'daily', coalesce((select jsonb_agg(to_jsonb(d)) from public.client_report_daily(v_client.id, v_from, v_to) d), '[]'::jsonb),
    'campaigns', coalesce((select jsonb_agg(to_jsonb(c)) from public.client_report_campaigns(v_client.id, v_from, v_to) c), '[]'::jsonb));
end;
$$;
revoke all on function public.client_report_public(text, text, date, date) from public;
grant execute on function public.client_report_public(text, text, date, date) to anon, authenticated;
