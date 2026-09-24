-- =============================================================================
-- ETAPA 15 — Central de alertas
--
-- Tabela nova: public.alerts (explicada ao usuário antes de criar)
--   * Um registro por problema encontrado: data, cliente, plataforma, conta,
--     campanha, tipo, gravidade, descrição, ação recomendada e status.
--   * Status: aberto → visto → resolvido. Resolvido é permanente (histórico).
--   * Nunca é apagado (retenção permanente).
--   * Não duplica: enquanto um problema estiver aberto/visto, ele é o MESMO
--     alerta (alert_key única entre os não resolvidos); só "last_seen_at" anda.
--
-- Verificação: public.refresh_alerts()
--   * Avalia as regras sobre os dados já guardados (saldo, cobrança, status,
--     sincronização, métricas). Nada é inventado: sem dado, sem alerta.
--   * Cria os novos, atualiza os que continuam e resolve AUTOMATICAMENTE os
--     que deixaram de acontecer.
--   * Roda sozinha a cada 15 minutos (pg_cron) e pelo botão "Verificar agora".
--
-- As regras de saldo são as mesmas do código compartilhado
-- (packages/shared/src/balance/balance.ts) e têm os mesmos casos de teste.
-- =============================================================================

create table public.alerts (
  id                 bigint generated always as identity primary key,
  alert_key          text not null,
  type               text not null check (type in (
                       'sem_saldo', 'saldo_baixo', 'conta_restrita', 'conta_desativada', 'pagamento_pendente',
                       'cobranca_problema', 'sem_forma_pagamento', 'sincronizacao_atrasada', 'erro_api',
                       'campanha_sem_entrega', 'queda_resultados')),
  severity           text not null check (severity in ('critica', 'alta', 'media')),
  client_id          uuid not null references public.clients (id),
  platform_id        text references public.platforms (id),
  ad_account_id      uuid references public.ad_accounts (id),
  campaign_id        uuid references public.campaigns (id),
  description        text not null check (char_length(description) <= 500),
  recommended_action text check (recommended_action is null or char_length(recommended_action) <= 300),
  details            jsonb not null default '{}'::jsonb,
  status             text not null default 'aberto' check (status in ('aberto', 'visto', 'resolvido')),
  first_seen_at      timestamptz not null default now(),
  last_seen_at       timestamptz not null default now(),
  seen_at            timestamptz,
  seen_by            uuid references auth.users (id) on delete set null,
  resolved_at        timestamptz,
  resolved_by        uuid references auth.users (id) on delete set null,
  resolution         text check (resolution is null or resolution in ('automatica', 'manual')),
  check ((status = 'resolvido') = (resolved_at is not null and resolution is not null))
);

comment on table public.alerts is 'Central de alertas: um registro por problema (aberto → visto → resolvido). Permanente: nunca é apagado.';
comment on column public.alerts.alert_key is 'Identifica a condição (tipo + conta/campanha). Única entre os alertas não resolvidos.';
comment on column public.alerts.first_seen_at is 'Quando o problema foi encontrado pela primeira vez (a "data" do alerta).';
comment on column public.alerts.last_seen_at is 'Última verificação em que o problema ainda existia.';
comment on column public.alerts.recommended_action is 'Só quando existe uma orientação técnica objetiva; senão fica vazio.';
comment on column public.alerts.resolution is 'automatica = o problema deixou de acontecer; manual = alguém marcou como resolvido.';

create unique index alerts_open_key on public.alerts (alert_key) where status <> 'resolvido';
create index alerts_status_idx on public.alerts (status, severity, first_seen_at desc);
create index alerts_client_idx on public.alerts (client_id, first_seen_at desc);
create index alerts_account_idx on public.alerts (ad_account_id);
create index alerts_campaign_idx on public.alerts (campaign_id);
create index alerts_platform_idx on public.alerts (platform_id);
create index alerts_seen_by_idx on public.alerts (seen_by);
create index alerts_resolved_by_idx on public.alerts (resolved_by);

-- Leitura: equipe interna, só dos clientes liberados. Escrita: só pelas funções abaixo.
revoke all on public.alerts from anon, authenticated;
grant select on public.alerts to authenticated;
alter table public.alerts enable row level security;
create policy "Equipe vê alertas dos clientes liberados" on public.alerts for select to authenticated
  using (client_id in (select private.visible_client_ids()) and (select private.current_user_role()) <> 'cliente');

-- -----------------------------------------------------------------------------
-- Dinheiro no padrão brasileiro para as descrições (R$ 1.234,56 · US$ 70,00)
-- -----------------------------------------------------------------------------
create function private.format_money(p_micros bigint, p_currency text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case coalesce(p_currency, 'BRL') when 'BRL' then 'R$ ' when 'USD' then 'US$ ' when 'EUR' then '€ ' else coalesce(p_currency, '') || ' ' end
    || case when p_micros < 0 then '-' else '' end
    || translate(to_char(trunc(abs(p_micros) / 1000000.0), 'FM999,999,999,990'), ',', '.')
    || ',' || lpad(((round(abs(p_micros) / 10000.0))::bigint % 100)::text, 2, '0')
$$;

-- -----------------------------------------------------------------------------
-- Regras: o que está errado AGORA (uma linha por problema)
-- -----------------------------------------------------------------------------
create function private.alert_candidates()
returns table (
  alert_key text, type text, severity text, client_id uuid, platform_id text, ad_account_id uuid, campaign_id uuid,
  description text, recommended_action text, details jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  with h as (
    select x.*,
           a.timezone,
           (now() at time zone coalesce(a.timezone, 'America/Sao_Paulo'))::date as today,
           case when x.spend_days > 0 and x.spend_last_7_days_micros is not null
                then x.spend_last_7_days_micros::numeric / x.spend_days end as avg_daily
    from public.account_health() x
    join public.ad_accounts a on a.id = x.ad_account_id
  ),
  b as (
    select h.*,
           case when h.available_micros is not null and h.avg_daily > 0 then h.available_micros / h.avg_daily end as forecast_days,
           -- Problemas de cobrança: os informados + os que o status da conta já indica
           h.issues || case h.status::text
             when 'pagamento_pendente' then array['pagamento_pendente']
             when 'restrita' then array['conta_limitada']
             when 'desativada' then array['conta_desativada']
             else array[]::text[] end as all_issues
    from h
  ),
  billing as (
    -- Saldo
    select 'sem_saldo:' || b.ad_account_id, 'sem_saldo', 'critica', b.client_id, b.platform_id, b.ad_account_id, null::uuid,
           'Conta sem saldo: o limite de gastos foi atingido e os anúncios param de rodar.',
           'Adicionar saldo ou aumentar o limite de gastos da conta na plataforma.',
           jsonb_build_object('available_micros', b.available_micros, 'currency', b.currency)
    from b where b.available_micros = 0
    union all
    select 'saldo_baixo:' || b.ad_account_id, 'saldo_baixo', 'alta', b.client_id, b.platform_id, b.ad_account_id, null,
           'Saldo baixo: ' || private.format_money(b.available_micros, b.currency) || ' disponíveis'
             || case when b.forecast_days is not null
                     then ', cerca de ' || greatest(floor(b.forecast_days), 0)::int || ' dia(s) no ritmo atual de gasto.'
                     else '.' end,
           'Adicionar saldo ou aumentar o limite de gastos antes que acabe.',
           jsonb_build_object('available_micros', b.available_micros, 'currency', b.currency,
                              'forecast_days', round(b.forecast_days, 1), 'low_balance_days', b.low_balance_days)
    from b
    where b.available_micros > 0
      and ((b.forecast_days is not null and b.forecast_days < b.low_balance_days)
           or (b.low_balance_amount_micros is not null and b.available_micros <= b.low_balance_amount_micros))
    union all
    -- Cobrança e status informados pela plataforma
    select i.code || ':' || b.ad_account_id,
           case i.code when 'conta_limitada' then 'conta_restrita' else i.code end,
           case i.code when 'sem_forma_pagamento' then 'alta' else 'critica' end,
           b.client_id, b.platform_id, b.ad_account_id, null,
           case i.code
             when 'pagamento_pendente' then 'Problema de pagamento: a plataforma informa pagamento pendente.'
             when 'cobranca_problema' then 'Problema na cobrança informado pela plataforma.'
             when 'conta_limitada' then 'Conta restrita ou limitada pela plataforma.' || coalesce(' Motivo informado: ' || left(b.status_reason, 200), '')
             when 'conta_desativada' then 'Conta desativada pela plataforma.' || coalesce(' Motivo informado: ' || left(b.status_reason, 200), '')
             when 'sem_forma_pagamento' then 'Conta sem forma de pagamento ativa.'
           end,
           case i.code
             when 'pagamento_pendente' then 'Regularizar o pagamento nas configurações de cobrança da plataforma.'
             when 'cobranca_problema' then 'Conferir a forma de pagamento nas configurações de cobrança da plataforma.'
             when 'conta_limitada' then 'Ver o motivo da restrição na própria plataforma e seguir as orientações dela.'
             when 'conta_desativada' then 'Ver o motivo da desativação na própria plataforma e seguir as orientações dela.'
             when 'sem_forma_pagamento' then 'Cadastrar uma forma de pagamento ativa na plataforma.'
           end,
           jsonb_build_object('raw_status', b.raw_status)
    from b
    cross join lateral (select distinct unnest(b.all_issues) as code) i
    where i.code in ('pagamento_pendente', 'cobranca_problema', 'conta_limitada', 'conta_desativada', 'sem_forma_pagamento')
  ),
  sync as (
    -- Erro na API: conexão com erro/desconectada ou última sincronização com erro
    select 'erro_api:' || b.ad_account_id, 'erro_api', 'critica', b.client_id, b.platform_id, b.ad_account_id, null::uuid,
           case
             when b.connection_status = 'revogada' then 'A conexão com a plataforma foi desconectada.'
             when b.connection_status = 'erro' then 'Erro na conexão com a plataforma: ' || coalesce(left(b.connection_error, 300), 'sem detalhes.')
             else 'A última sincronização falhou: ' || coalesce(left(b.last_error_message, 300), 'sem detalhes.')
           end,
           case when b.connection_status in ('revogada', 'erro') then 'Reconectar a conta em Configurações → Integrações.'
                else 'Conferir a conexão em Configurações → Integrações e sincronizar de novo.' end,
           jsonb_build_object('sync_status', b.sync_status, 'connection_status', b.connection_status)
    from b
    where b.connection_status in ('revogada', 'erro') or b.sync_status = 'erro'
    union all
    -- Sincronização atrasada: já funcionou antes e parou há mais de 48 horas
    select 'sincronizacao_atrasada:' || b.ad_account_id, 'sincronizacao_atrasada', 'alta', b.client_id, b.platform_id, b.ad_account_id, null,
           'Sincronização atrasada: a última atualização com sucesso foi há '
             || floor(extract(epoch from now() - b.last_success_at) / 3600)::int || ' horas.',
           'Conferir a conexão em Configurações → Integrações.',
           jsonb_build_object('last_success_at', b.last_success_at)
    from b
    where b.last_success_at < now() - interval '48 hours'
      and not (b.connection_status in ('revogada', 'erro') or coalesce(b.sync_status, '') = 'erro')
  ),
  delivery as (
    -- Campanha ativa sem impressões nos 2 últimos dias completos, numa conta
    -- cujas campanhas FORAM sincronizadas nesses dias (senão seria falta de dado)
    select 'campanha_sem_entrega:' || c.id, 'campanha_sem_entrega', 'media', c.client_id, c.platform_id, c.ad_account_id, c.id,
           'Campanha ativa sem impressões em ' || to_char(b.today - 2, 'DD/MM') || ' e ' || to_char(b.today - 1, 'DD/MM') || '.',
           null::text,
           jsonb_build_object('campaign_name', c.name, 'days', jsonb_build_array(b.today - 2, b.today - 1))
    from public.campaigns c
    join b on b.ad_account_id = c.ad_account_id
    where c.status = 'ativa'
      and c.first_seen_at < now() - interval '2 days'
      -- Conta sem saldo/bloqueada já tem o próprio alerta (a causa): não repete por campanha
      and coalesce(b.available_micros, 1) > 0
      and b.status::text not in ('pagamento_pendente', 'restrita', 'desativada', 'encerrada')
      and exists (select 1 from public.metrics_daily m
                  where m.ad_account_id = c.ad_account_id and m.level = 'campaign' and m.date = b.today - 1)
      and exists (select 1 from public.metrics_daily m
                  where m.ad_account_id = c.ad_account_id and m.level = 'campaign' and m.date = b.today - 2)
      and not exists (select 1 from public.metrics_daily m
                      where m.campaign_id = c.id and m.level = 'campaign'
                        and m.date between b.today - 2 and b.today - 1 and m.impressions > 0)
  ),
  results as (
    -- Resultado principal: Meta = leads (ou conversões, se a conta não usa leads); Google = conversões
    select b.*, cur.leads as cur_leads, prev.leads as prev_leads, cur.conv as cur_conv, prev.conv as prev_conv, cur.days as cur_days, prev.days as prev_days
    from b
    cross join lateral (
      select sum(m.leads) as leads, sum(m.conversions) as conv, count(*) as days from public.metrics_daily m
      where m.ad_account_id = b.ad_account_id and m.level = 'account' and m.date between b.today - 7 and b.today - 1
    ) cur
    cross join lateral (
      select sum(m.leads) as leads, sum(m.conversions) as conv, count(*) as days from public.metrics_daily m
      where m.ad_account_id = b.ad_account_id and m.level = 'account' and m.date between b.today - 14 and b.today - 8
    ) prev
  ),
  picked as (
    select r.*,
           case when r.platform_id = 'meta' and coalesce(r.prev_leads, 0) > 0 then 'leads' else 'conversões' end as metric,
           case when r.platform_id = 'meta' and coalesce(r.prev_leads, 0) > 0 then coalesce(r.cur_leads, 0) else coalesce(r.cur_conv, 0) end as cur_v,
           case when r.platform_id = 'meta' and coalesce(r.prev_leads, 0) > 0 then r.prev_leads else coalesce(r.prev_conv, 0) end as prev_v
    from results r
  ),
  drops as (
    -- Queda significativa: 40% ou mais, com base mínima de 10 e dados em (quase) todos os dias
    select 'queda_resultados:' || p.ad_account_id, 'queda_resultados', 'media', p.client_id, p.platform_id, p.ad_account_id, null::uuid,
           initcap(p.metric) || ' caíram ' || round((1 - p.cur_v / p.prev_v) * 100)::int || '% nos últimos 7 dias (de '
             || replace(trim(to_char(p.prev_v, 'FM999999990.##')), '.', ',') || ' para '
             || replace(trim(to_char(p.cur_v, 'FM999999990.##')), '.', ',') || ') em relação aos 7 dias anteriores.',
           null::text,
           jsonb_build_object('metric', p.metric, 'current', p.cur_v, 'previous', p.prev_v)
    from picked p
    where p.prev_v >= 10 and p.cur_v <= p.prev_v * 0.6 and p.cur_days >= 5 and p.prev_days >= 5
  )
  select r.alert_key, r.type, r.severity, r.client_id, r.platform_id,
         r.ad_account_id, r.campaign_id, r.description, r.recommended_action, r.details
  from (
    select * from billing union all select * from sync union all select * from delivery union all select * from drops
  ) as r(alert_key, type, severity, client_id, platform_id, ad_account_id, campaign_id, description, recommended_action, details)
$$;

revoke all on function private.alert_candidates() from public, anon, authenticated;
revoke all on function private.format_money(bigint, text) from public, anon;

-- -----------------------------------------------------------------------------
-- Verificação: cria, atualiza e resolve automaticamente
-- -----------------------------------------------------------------------------
create function public.refresh_alerts()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_created  integer;
  v_updated  integer;
  v_resolved integer;
begin
  -- Pessoas: só quem gerencia alertas. O agendador (sem login) pode.
  if (select auth.uid()) is not null
     and coalesce((select private.current_user_role())::text, '') not in ('admin', 'gestor', 'operador') then
    raise exception 'Sem permissão para verificar alertas' using errcode = '42501';
  end if;

  -- Um único comando: os problemas de agora (n) são calculados uma vez só.
  with n as materialized (
    select * from private.alert_candidates()
  ),
  -- Continuam acontecendo: atualiza texto, gravidade e "visto por último"
  upd as (
    update public.alerts a
       set last_seen_at = now(), description = n.description, severity = n.severity,
           recommended_action = n.recommended_action, details = n.details
      from n
     where a.alert_key = n.alert_key and a.status <> 'resolvido'
    returning 1
  ),
  -- Novos
  ins as (
    insert into public.alerts (alert_key, type, severity, client_id, platform_id, ad_account_id, campaign_id,
                               description, recommended_action, details)
    select n.alert_key, n.type, n.severity, n.client_id, n.platform_id, n.ad_account_id, n.campaign_id,
           n.description, n.recommended_action, n.details
      from n
     where not exists (select 1 from public.alerts a where a.alert_key = n.alert_key and a.status <> 'resolvido')
    returning 1
  ),
  -- Deixaram de acontecer: resolvidos automaticamente (o histórico fica)
  res as (
    update public.alerts a
       set status = 'resolvido', resolved_at = now(), resolution = 'automatica'
     where a.status <> 'resolvido'
       and not exists (select 1 from n where n.alert_key = a.alert_key)
    returning 1
  )
  select (select count(*) from ins), (select count(*) from upd), (select count(*) from res)
    into v_created, v_updated, v_resolved;

  return jsonb_build_object('created', v_created, 'updated', v_updated, 'resolved', v_resolved, 'checked_at', now());
end;
$$;

comment on function public.refresh_alerts() is
  'Verifica os problemas agora: cria alertas novos, atualiza os que continuam e resolve os que sumiram. Admin, gestor e operador; e o agendador.';

revoke all on function public.refresh_alerts() from public, anon;
grant execute on function public.refresh_alerts() to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Mudar o status (visto / resolvido / reabrir)
-- -----------------------------------------------------------------------------
create function public.set_alert_status(p_id bigint, p_status text)
returns public.alerts
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.alerts;
begin
  if coalesce((select private.current_user_role())::text, '') not in ('admin', 'gestor', 'operador') then
    raise exception 'Sem permissão para alterar alertas' using errcode = '42501';
  end if;

  select * into a from public.alerts x
   where x.id = p_id and x.client_id in (select private.visible_client_ids())
   for update;
  if not found then
    raise exception 'Alerta não encontrado' using errcode = 'P0002';
  end if;
  if a.status = 'resolvido' then
    raise exception 'Alerta já resolvido (é histórico e não muda mais)' using errcode = '22023';
  end if;

  case p_status
    when 'visto' then
      update public.alerts set status = 'visto', seen_at = now(), seen_by = (select auth.uid()) where id = p_id returning * into a;
    when 'aberto' then
      update public.alerts set status = 'aberto', seen_at = null, seen_by = null where id = p_id returning * into a;
    when 'resolvido' then
      update public.alerts
         set status = 'resolvido', resolved_at = now(), resolved_by = (select auth.uid()), resolution = 'manual',
             seen_at = coalesce(seen_at, now()), seen_by = coalesce(seen_by, (select auth.uid()))
       where id = p_id returning * into a;
    else
      raise exception 'Status inválido: %', p_status using errcode = '22023';
  end case;
  return a;
end;
$$;

comment on function public.set_alert_status(bigint, text) is
  'Marca um alerta como visto, resolvido ou volta para aberto. Admin, gestor e operador; só clientes liberados.';

revoke all on function public.set_alert_status(bigint, text) from public, anon;
grant execute on function public.set_alert_status(bigint, text) to authenticated;

-- -----------------------------------------------------------------------------
-- Verificação automática a cada 15 minutos
-- -----------------------------------------------------------------------------
select cron.unschedule(jobid) from cron.job where jobname = 'refresh-alerts';
select cron.schedule('refresh-alerts', '*/15 * * * *', 'select public.refresh_alerts()');
