-- T5.36 (14/11/2026): o aviso "cliente sem gastar" passa a ser confirmado por ENTREGA, e não só pelo dinheiro.
--
-- Por que (pedido do Ander): o Meta (e o Google) demoram para atualizar quanto já foi COBRADO. A conta pode
-- estar entregando normalmente (impressões, alcance, cliques) enquanto o valor de gasto continua igual — e o
-- aviso saía dizendo "sem gasto". O dinheiro sozinho não prova que a conta parou.
--
-- O que muda:
--   - nova tabela public.account_delivery_readings: uma LEITURA de entrega por conta a cada sincronização
--     (impressões, alcance, cliques e gasto do dia, no fuso da conta). NULL = a plataforma não informou;
--   - a sincronização (public.ingest_metrics_daily) grava essa leitura a cada rodada — mesmo quando a
--     plataforma não devolve nada para o dia (aí a leitura fica com NULL, ou seja, "não houve entrega");
--   - private.wa_sem_gasto_gerar só avisa quando, além do gasto parado, NÃO houve entrega nas últimas 2 horas
--     (as impressões, o alcance ou os cliques não aumentaram nesse período).
--
-- A confirmação de entrega só pode DESLIGAR o aviso, nunca ligá-lo: sem leitura do dia (conta que ainda não
-- sincronizou hoje) nada é avisado.
--
-- Nada é apagado: as leituras são dados técnicos (batimento da sincronização) e a limpeza segue a mesma regra
-- dos logs técnicos (90 dias). O histórico de análise, campanhas e saldos não é tocado.

-- -----------------------------------------------------------------------------
-- 1) As leituras de entrega
-- -----------------------------------------------------------------------------
create table public.account_delivery_readings (
  id            bigint generated always as identity primary key,
  ad_account_id uuid not null references public.ad_accounts (id) on delete cascade,
  client_id     uuid not null references public.clients (id) on delete cascade,
  platform_id   text not null references public.platforms (id),
  date          date not null,
  captured_at   timestamptz not null,
  impressions   bigint check (impressions is null or impressions >= 0),
  reach         bigint check (reach is null or reach >= 0),
  clicks        bigint check (clicks is null or clicks >= 0),
  spend_micros  bigint check (spend_micros is null or spend_micros >= 0),
  unique (ad_account_id, date, captured_at)
);

comment on table public.account_delivery_readings is
  'T5.36: quanto cada conta entregou (impressões, alcance, cliques, gasto) em cada leitura da sincronização do dia. NULL = a plataforma não informou. Serve para confirmar o aviso "cliente sem gastar".';
comment on column public.account_delivery_readings.date is 'Dia no fuso da conta.';
comment on column public.account_delivery_readings.captured_at is 'Momento da leitura (quando a sincronização gravou).';
comment on column public.account_delivery_readings.reach is 'Alcance do dia (pessoas). NULL = a plataforma não informa alcance (Google).';

create index account_delivery_readings_account_time_idx on public.account_delivery_readings (ad_account_id, date, captured_at desc);
create index account_delivery_readings_client_time_idx on public.account_delivery_readings (client_id, captured_at desc);

alter table public.account_delivery_readings enable row level security;
revoke all on public.account_delivery_readings from anon, authenticated;
grant select on public.account_delivery_readings to authenticated;
create policy "Vê entregas dos clientes liberados" on public.account_delivery_readings for select to authenticated
  using (client_id in (select private.visible_client_ids()));

-- -----------------------------------------------------------------------------
-- 2) A sincronização passa a bater o ponto da entrega a cada rodada
-- -----------------------------------------------------------------------------
create or replace function public.ingest_metrics_daily(p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  month_start date;
  total       integer;
  existing    integer;
  affected    integer;
  inserted    integer;
  v_agora     timestamptz;
begin
  if jsonb_typeof(p_rows) is distinct from 'array' then
    raise exception 'p_rows deve ser uma lista JSON';
  end if;
  total := jsonb_array_length(p_rows);
  if total = 0 then return jsonb_build_object('received', 0, 'inserted', 0, 'updated', 0, 'unchanged', 0); end if;
  if total > 5000 then raise exception 'Lote grande demais (máx. 5000 linhas por chamada)'; end if;

  -- Nenhuma linha pode ser descartada em silêncio: conta desconhecida = erro.
  if exists (
    select 1 from jsonb_array_elements(p_rows) e
    left join public.ad_accounts a on a.id = (e ->> 'ad_account_id')::uuid
    where a.id is null
  ) then
    raise exception 'Lote contém conta de anúncio inexistente';
  end if;

  -- Garante as gavetas dos meses presentes no lote (inclui backfill antigo).
  for month_start in
    select distinct date_trunc('month', (e ->> 'date')::date)::date from jsonb_array_elements(p_rows) e
  loop
    perform private.ensure_metrics_partition(month_start);
  end loop;

  -- Quantas linhas do lote já existiam antes (para separar novas x atualizadas).
  select count(*) into existing
  from jsonb_to_recordset(p_rows) as r(date date, ad_account_id uuid, level public.entity_level, entity_external_id text)
  join public.metrics_daily m
    on m.ad_account_id = r.ad_account_id and m.level = r.level
   and m.entity_external_id = r.entity_external_id and m.date = r.date;

  with incoming as (
    select r.*, a.client_id, a.platform_id, coalesce(r.currency, a.currency) as final_currency
    from jsonb_to_recordset(p_rows) as r(
      date date, ad_account_id uuid, level public.entity_level, entity_external_id text,
      campaign_id uuid, ad_group_id uuid, ad_id uuid, currency text,
      spend_micros bigint, impressions bigint, reach bigint, clicks bigint, link_clicks bigint,
      leads numeric, messages numeric, conversions numeric, conversion_value_micros bigint,
      video_views bigint, platform_metrics jsonb, raw_actions jsonb
    )
    join public.ad_accounts a on a.id = r.ad_account_id -- cliente e plataforma vêm SEMPRE da conta
  ),
  upserted as (
    insert into public.metrics_daily as m (
      date, ad_account_id, level, entity_external_id, client_id, platform_id, campaign_id, ad_group_id, ad_id,
      currency, spend_micros, impressions, reach, clicks, link_clicks, leads, messages, conversions,
      conversion_value_micros, video_views, platform_metrics, raw_actions, hash, synced_at
    )
    select
      i.date, i.ad_account_id, i.level, i.entity_external_id, i.client_id, i.platform_id, i.campaign_id, i.ad_group_id, i.ad_id,
      i.final_currency, coalesce(i.spend_micros, 0), coalesce(i.impressions, 0), i.reach, coalesce(i.clicks, 0), i.link_clicks,
      i.leads, i.messages, i.conversions, i.conversion_value_micros, i.video_views,
      coalesce(i.platform_metrics, '{}'::jsonb), i.raw_actions,
      md5(jsonb_build_array(
        i.final_currency, i.spend_micros, i.impressions, i.reach, i.clicks, i.link_clicks, i.leads, i.messages,
        i.conversions, i.conversion_value_micros, i.video_views, i.platform_metrics, i.raw_actions,
        i.campaign_id, i.ad_group_id, i.ad_id
      )::text),
      now()
    from incoming i
    on conflict (ad_account_id, level, entity_external_id, date) do update set
      campaign_id = excluded.campaign_id,
      ad_group_id = excluded.ad_group_id,
      ad_id = excluded.ad_id,
      currency = excluded.currency,
      spend_micros = excluded.spend_micros,
      impressions = excluded.impressions,
      reach = excluded.reach,
      clicks = excluded.clicks,
      link_clicks = excluded.link_clicks,
      leads = excluded.leads,
      messages = excluded.messages,
      conversions = excluded.conversions,
      conversion_value_micros = excluded.conversion_value_micros,
      video_views = excluded.video_views,
      platform_metrics = excluded.platform_metrics,
      raw_actions = excluded.raw_actions,
      hash = excluded.hash,
      synced_at = excluded.synced_at
    where m.hash is distinct from excluded.hash -- nada mudou = não regrava
    returning 1
  )
  select count(*) into affected from upserted;

  -- T5.36: batimento da entrega. Uma leitura por conta a cada sincronização, com os números do dia.
  -- Se a plataforma não devolveu a conta do dia, a leitura fica com NULL (= não houve entrega informada).
  v_agora := clock_timestamp();
  insert into public.account_delivery_readings (ad_account_id, client_id, platform_id, date, captured_at, impressions, reach, clicks, spend_micros)
  select a.id, a.client_id, a.platform_id,
         (v_agora at time zone coalesce(a.timezone, 'America/Sao_Paulo'))::date,
         v_agora,
         m.impressions, m.reach, m.clicks, m.spend_micros
    from (select distinct (e ->> 'ad_account_id')::uuid as id from jsonb_array_elements(p_rows) e) c
    join public.ad_accounts a on a.id = c.id
    left join lateral (
      select (x ->> 'impressions')::bigint as impressions,
             (x ->> 'reach')::bigint as reach,
             (x ->> 'clicks')::bigint as clicks,
             (x ->> 'spend_micros')::bigint as spend_micros
        from jsonb_array_elements(p_rows) x
       where (x ->> 'ad_account_id')::uuid = c.id
         and x ->> 'level' = 'account'
         and (x ->> 'date')::date = (v_agora at time zone coalesce(a.timezone, 'America/Sao_Paulo'))::date
       limit 1
    ) m on true
  on conflict (ad_account_id, date, captured_at) do nothing;

  inserted := total - existing;
  return jsonb_build_object(
    'received', total,
    'inserted', inserted,
    'updated', affected - inserted,
    'unchanged', existing - (affected - inserted)
  );
end;
$$;

revoke all on function public.ingest_metrics_daily(jsonb) from public, anon, authenticated;
grant execute on function public.ingest_metrics_daily(jsonb) to service_role;

-- -----------------------------------------------------------------------------
-- 3) A regra do "sem gastar": o gasto parado só vira aviso se não houve entrega nas últimas 2 horas
-- -----------------------------------------------------------------------------
create or replace function private.wa_sem_gasto_gerar()
returns integer language plpgsql security definer set search_path = '' as $$
declare
  c public.wa_avisos_config;
  r record;
  v_n integer := 0;
  v_id bigint;
begin
  select * into c from public.wa_avisos_config where id;
  if not c.ativo or c.grupo_id is null or not ('sem_gasto' = any (c.tipos)) then return 0; end if;
  for r in
    select a.id as conta, cl.id as cliente, cl.name as cliente_nome, pl.name as plataforma,
           l.captured_at as lida_em, b.captured_at as base_em,
           coalesce(mc.minutos, c.sem_gasto_minutos) as minutos,
           coalesce(a.timezone, 'America/Sao_Paulo') as tz,
           (now() at time zone coalesce(a.timezone, 'America/Sao_Paulo')) as agora_local,
           le.captured_at as entrega_em, lb.captured_at as entrega_base_em
      from public.ad_accounts a
      join public.clients cl on cl.id = a.client_id and cl.status = 'ativo'
      join public.platforms pl on pl.id = a.platform_id
      left join public.wa_sem_gasto_minutos_clientes mc on mc.cliente_id = cl.id
      cross join lateral (select s.captured_at, s.amount_spent_micros from public.account_snapshots s
                           where s.ad_account_id = a.id and s.amount_spent_micros is not null order by s.captured_at desc limit 1) l
      cross join lateral (select s.captured_at, s.amount_spent_micros from public.account_snapshots s
                           where s.ad_account_id = a.id and s.amount_spent_micros is not null
                             and s.captured_at <= l.captured_at - make_interval(mins => coalesce(mc.minutos, c.sem_gasto_minutos) - 5)
                             and s.captured_at >= l.captured_at - interval '14 hours'
                           order by s.captured_at desc limit 1) b
      -- T5.36: a entrega. A leitura mais recente do dia e a de 2 horas atrás (sem as duas, não dá para
      -- afirmar que houve ou não entrega — e nada é avisado).
      cross join lateral (select r2.captured_at, r2.impressions, r2.reach, r2.clicks from public.account_delivery_readings r2
                           where r2.ad_account_id = a.id
                             and r2.date = (now() at time zone coalesce(a.timezone, 'America/Sao_Paulo'))::date
                           order by r2.captured_at desc limit 1) le
      cross join lateral (select r2.captured_at, r2.impressions, r2.reach, r2.clicks from public.account_delivery_readings r2
                           where r2.ad_account_id = a.id
                             and r2.date = (now() at time zone coalesce(a.timezone, 'America/Sao_Paulo'))::date
                             and r2.captured_at <= le.captured_at - interval '2 hours'
                           order by r2.captured_at desc limit 1) lb
     where a.status = 'ativa'
       and l.captured_at > now() - interval '90 minutes'
       and l.amount_spent_micros = b.amount_spent_micros
       -- T5.36: sem entrega nas últimas 2 horas. Alcance NULL (Google não informa) não impede o aviso.
       and coalesce(le.impressions, 0) <= coalesce(lb.impressions, 0)
       and coalesce(le.reach, 0) <= coalesce(lb.reach, 0)
       and coalesce(le.clicks, 0) <= coalesce(lb.clicks, 0)
       and not exists (select 1 from public.wa_sem_gasto_silenciados z where z.cliente_id = cl.id)
       and exists (select 1 from public.campaigns k where k.ad_account_id = a.id and k.status = 'ativa' and coalesce(upper(k.effective_status), 'ACTIVE') = 'ACTIVE')
       and not exists (select 1 from public.alerts x where x.ad_account_id = a.id and x.status <> 'resolvido'
                         and x.type in ('sem_saldo', 'conta_restrita', 'pagamento_pendente', 'conta_desativada'))
  loop
    -- janela do dia (fuso da conta): só avisa dentro dela
    continue when extract(hour from r.agora_local) < c.sem_gasto_inicio or extract(hour from r.agora_local) >= c.sem_gasto_fim;
    v_id := null;
    insert into public.wa_avisos (chave, tipo, cliente_id, texto)
    values ('semgasto:' || r.conta || ':' || r.agora_local::date || ':' || floor(extract(hour from r.agora_local) / c.repetir_horas)::int,
            'sem_gasto', r.cliente,
            '⏸️ ' || r.cliente_nome || ' (' || r.plataforma || '): sem gasto desde as ' || to_char(r.base_em at time zone r.tz, 'HH24:MI')
              || ' (última leitura às ' || to_char(r.lida_em at time zone r.tz, 'HH24:MI') || '), sem entrega nas últimas 2 h, com campanha ativa.')
    on conflict (chave) do nothing returning id into v_id;
    if v_id is not null then v_n := v_n + 1; end if;
  end loop;
  return v_n;
end;
$$;

-- -----------------------------------------------------------------------------
-- 4) Limpeza: as leituras de entrega são dados técnicos (90 dias, como as execuções da sincronização)
-- -----------------------------------------------------------------------------
create or replace function private.maintenance_cleanup()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare n_cron integer; n_runs integer; n_leituras integer;
begin
  delete from cron.job_run_details where start_time < now() - interval '7 days';
  get diagnostics n_cron = row_count;
  delete from public.sync_runs where started_at < now() - interval '90 days' and status <> 'executando';
  get diagnostics n_runs = row_count;
  delete from public.account_delivery_readings where captured_at < now() - interval '90 days';
  get diagnostics n_leituras = row_count;
  if n_cron + n_runs + n_leituras > 0 then
    insert into public.audit_logs (actor_id, action, target_type, target_id, details)
    values (null, 'maintenance.cleanup', 'sistema', 'logs-tecnicos', jsonb_build_object('log_do_agendador', n_cron, 'execucoes_de_sync', n_runs, 'leituras_de_entrega', n_leituras));
  end if;
end $$;
