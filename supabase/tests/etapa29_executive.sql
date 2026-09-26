-- =============================================================================
-- Testes da Etapa 29 — Dashboard executivo (public.executive_breakdown)
-- Totais por cliente × plataforma × moeda, mesma regra do Dashboard principal,
-- sem misturar moedas, e cada pessoa só vê os clientes liberados.
-- Rodar inteiro no SQL Editor. Transação desfeita no final: nada fica gravado.
-- =============================================================================
begin;

insert into auth.users (id, instance_id, aud, role, email) values
  ('00000000-0000-0000-0000-000000029a01', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'gestor@t29.local');
update public.profiles set active = true, role = 'gestor' where id = '00000000-0000-0000-0000-000000029a01';

insert into public.clients (id, name) values
  ('00000000-0000-0000-0000-000000029c01', 'Cliente T29'),
  ('00000000-0000-0000-0000-000000029c02', 'Outro T29');
insert into public.user_client_access (user_id, client_id) values
  ('00000000-0000-0000-0000-000000029a01', '00000000-0000-0000-0000-000000029c01');

insert into public.ad_accounts (id, platform_id, external_id, client_id, name, currency, status) values
  ('00000000-0000-0000-0000-000000029001', 'meta', 't29-meta', '00000000-0000-0000-0000-000000029c01', 'Meta T29', 'BRL', 'ativa'),
  ('00000000-0000-0000-0000-000000029002', 'google', '2900000001', '00000000-0000-0000-0000-000000029c01', 'Google T29', 'BRL', 'ativa'),
  ('00000000-0000-0000-0000-000000029003', 'google', '2900000002', '00000000-0000-0000-0000-000000029c01', 'Google USD T29', 'USD', 'ativa'),
  ('00000000-0000-0000-0000-000000029004', 'meta', 't29-outro', '00000000-0000-0000-0000-000000029c02', 'Outro T29', 'BRL', 'ativa');

-- Dois dias de números no nível conta (e um no nível campanha, que não pode somar de novo).
select public.ingest_metrics_daily(jsonb_build_array(
  jsonb_build_object('date', '2026-08-01', 'ad_account_id', '00000000-0000-0000-0000-000000029001', 'level', 'account', 'entity_external_id', 't29-meta',
                     'spend_micros', 100000000, 'leads', 10, 'messages', 5, 'conversions', 2, 'conversion_value_micros', 300000000),
  jsonb_build_object('date', '2026-08-02', 'ad_account_id', '00000000-0000-0000-0000-000000029001', 'level', 'account', 'entity_external_id', 't29-meta',
                     'spend_micros', 50000000, 'leads', 5, 'messages', 0, 'conversions', 1, 'conversion_value_micros', 0),
  jsonb_build_object('date', '2026-08-01', 'ad_account_id', '00000000-0000-0000-0000-000000029002', 'level', 'account', 'entity_external_id', '2900000001',
                     'spend_micros', 40000000, 'conversions', 4, 'conversion_value_micros', 80000000),
  jsonb_build_object('date', '2026-08-01', 'ad_account_id', '00000000-0000-0000-0000-000000029003', 'level', 'account', 'entity_external_id', '2900000002',
                     'spend_micros', 70000000, 'conversions', 7),
  jsonb_build_object('date', '2026-08-01', 'ad_account_id', '00000000-0000-0000-0000-000000029004', 'level', 'account', 'entity_external_id', 't29-outro',
                     'spend_micros', 999000000, 'leads', 99)
));

create temp table t29 (what text, v text) on commit drop;
grant all on t29 to authenticated;

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000029a01","role":"authenticated"}';
insert into t29 select 'linhas', count(*)::text from public.executive_breakdown('2026-08-01', '2026-08-02');
insert into t29 select 'outro_cliente', count(*)::text from public.executive_breakdown('2026-08-01', '2026-08-02') where client_id = '00000000-0000-0000-0000-000000029c02';
insert into t29 select 'meta_brl', concat_ws('|', spend_micros, trim_scale(leads), trim_scale(messages), trim_scale(conversions), conversion_value_micros, accounts)
  from public.executive_breakdown('2026-08-01', '2026-08-02') where platform_id = 'meta' and currency = 'BRL';
insert into t29 select 'google_brl', concat_ws('|', spend_micros, coalesce(leads::text, 'null'), trim_scale(conversions))
  from public.executive_breakdown('2026-08-01', '2026-08-02') where platform_id = 'google' and currency = 'BRL';
insert into t29 select 'usd_separado', count(*)::text from public.executive_breakdown('2026-08-01', '2026-08-02') where currency = 'USD';
insert into t29 select 'filtro_plataforma', count(*)::text from public.executive_breakdown('2026-08-01', '2026-08-02', null, array['google']);
-- Mesma soma do Dashboard principal, moeda a moeda.
insert into t29 select 'igual_dashboard', (
  select bool_and(e.s = d.spend_micros) from (
    select currency, sum(spend_micros) s from public.executive_breakdown('2026-08-01', '2026-08-02') group by currency) e
  join public.dashboard_summary('2026-08-01', '2026-08-02') d using (currency))::text;
reset role;

do $$
declare
  r record;
begin
  for r in select * from t29 loop
    if (r.what, r.v) not in (
      ('linhas', '3'), ('outro_cliente', '0'), ('meta_brl', '150000000|15|5|3|300000000|1'), ('google_brl', '40000000|null|4'),
      ('usd_separado', '1'), ('filtro_plataforma', '2'), ('igual_dashboard', 'true')
    ) then
      raise exception 'FALHOU: % = %', r.what, r.v;
    end if;
  end loop;
  if (select count(*) from t29) <> 7 then raise exception 'FALHOU: faltou verificação (%)', (select count(*) from t29); end if;

  -- Período inválido é recusado.
  begin
    perform public.executive_breakdown('2026-08-02', '2026-08-01');
    raise exception 'FALHOU: aceitou período invertido';
  exception when raise_exception then
    if sqlerrm like 'FALHOU%' then raise; end if;
  end;

  -- Visitante sem login não executa.
  if has_function_privilege('anon', 'public.executive_breakdown(date, date, uuid[], text[])', 'execute') then
    raise exception 'FALHOU: visitante pode executar executive_breakdown';
  end if;
end $$;

select 'Etapa 29: TODOS OS TESTES PASSARAM' as resultado;
rollback;
