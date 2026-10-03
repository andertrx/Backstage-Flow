-- =============================================================================
-- Testes do filtro de objetivo do Monitoramento (Etapa 37, pedido de 03/10/2026):
-- grupos de objetivo, filtro salvo por pessoa e o filtro em resumo, histórico, comparação e lista de alertas.
-- Rodar inteiro no SQL Editor. Transação desfeita no final: nada fica gravado.
-- =============================================================================
begin;

insert into auth.users (id, instance_id, aud, role, email) values
  ('00000000-0000-0000-0000-00000377aa01', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@t377.local'),
  ('00000000-0000-0000-0000-00000377aa02', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'gestor@t377.local'),
  ('00000000-0000-0000-0000-00000377aa05', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'equipe@t377.local');
update public.profiles set active = true, role = 'admin', full_name = 'Admin T377' where id = '00000000-0000-0000-0000-00000377aa01';
update public.profiles set active = true, role = 'gestor', full_name = 'Gestor T377' where id = '00000000-0000-0000-0000-00000377aa02';
update public.profiles set active = true, role = 'equipe', full_name = 'Equipe T377' where id = '00000000-0000-0000-0000-00000377aa05';
insert into public.clients (id, name) values ('00000000-0000-0000-0000-00000377cc01', 'Cliente T377');
insert into public.user_client_access (user_id, client_id) values ('00000000-0000-0000-0000-00000377aa02', '00000000-0000-0000-0000-00000377cc01');
insert into public.ad_accounts (id, platform_id, external_id, client_id, name, currency, timezone) values
  ('00000000-0000-0000-0000-00000377ac01', 'meta', 't377', '00000000-0000-0000-0000-00000377cc01', 'Conta T377', 'BRL', 'America/Sao_Paulo');
insert into public.campaigns (id, ad_account_id, client_id, platform_id, external_id, name, objective, status) values
  ('00000000-0000-0000-0000-00000377ca01', '00000000-0000-0000-0000-00000377ac01', '00000000-0000-0000-0000-00000377cc01', 'meta', 'c1', 'Vendas T377', 'OUTCOME_SALES', 'ativa'),
  ('00000000-0000-0000-0000-00000377ca02', '00000000-0000-0000-0000-00000377ac01', '00000000-0000-0000-0000-00000377cc01', 'meta', 'c2', 'Leads T377', 'OUTCOME_LEADS', 'ativa'),
  ('00000000-0000-0000-0000-00000377ca03', '00000000-0000-0000-0000-00000377ac01', '00000000-0000-0000-0000-00000377cc01', 'meta', 'c3', 'Conversas T377', 'MESSAGES', 'ativa');
insert into public.monitor_alerts (dedupe_key, kind, level, metric, severity, client_id, platform_id, ad_account_id, campaign_id, currency,
                                   current_value, previous_value, variation_pct, period_from, period_to, prev_from, prev_to, explanation)
select 't377:' || n, 'limite', 'campaign', 'cpc', sev, '00000000-0000-0000-0000-00000377cc01', 'meta', '00000000-0000-0000-0000-00000377ac01',
       ('00000000-0000-0000-0000-00000377ca0' || n)::uuid, 'BRL', 2, 1, 100, current_date - 7, current_date - 1, current_date - 14, current_date - 8, 'Teste.'
  from (values (1, 'critico'), (2, 'atencao'), (3, 'critico')) v(n, sev);
-- Métricas por campanha (7 dias atuais e 7 anteriores): investimento 10, 20 e 30 por dia.
insert into public.metrics_daily (date, ad_account_id, level, entity_external_id, client_id, platform_id, campaign_id, currency, spend_micros, impressions, clicks, hash)
select current_date - d, '00000000-0000-0000-0000-00000377ac01', 'campaign', 'c' || n, '00000000-0000-0000-0000-00000377cc01', 'meta',
       ('00000000-0000-0000-0000-00000377ca0' || n)::uuid, 'BRL', n * 10000000, 1000, 50, 'h'
  from generate_series(1, 14) d, generate_series(1, 3) n;

create temp table r377 (what text, v text) on commit drop;
grant all on r377 to authenticated, anon;
create or replace function pg_temp.try(p_sql text) returns text language plpgsql as $$
begin
  execute p_sql;
  return 'ok';
exception when others then
  return sqlstate;
end $$;
grant execute on function pg_temp.try(text) to authenticated, anon;
create or replace function pg_temp.cmp(p_level text, p_obj text[]) returns text language sql as $$
  select coalesce(string_agg(case when p_level = 'account' then account_name else campaign_name end || '=' || (cur_spend_micros / 1000000), ',' order by case when p_level = 'account' then account_name else campaign_name end), '-')
    from public.monitor_compare(p_level, current_date - 7, current_date - 1, current_date - 14, current_date - 8,
                                '00000000-0000-0000-0000-00000377cc01', null, null, null, 500, p_obj) $$;
grant execute on function pg_temp.cmp(text, text[]) to authenticated;

-- Grupos de objetivo (nomes antigos entram no equivalente).
insert into r377 values ('grupos', concat_ws(',', private.monitor_objective_group('OUTCOME_SALES'), private.monitor_objective_group('conversions'),
  private.monitor_objective_group('OUTCOME_LEADS'), private.monitor_objective_group('MESSAGES'), private.monitor_objective_group('LINK_CLICKS'),
  private.monitor_objective_group('OUTCOME_AWARENESS'), private.monitor_objective_group(null), private.monitor_objective_group('SEARCH')));

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000377aa02","role":"authenticated"}';
insert into r377 select 'padrão', p::text from public.monitor_view_prefs_get() p;
select public.monitor_view_prefs_save(array['vendas', 'leads', 'vendas']);
insert into r377 select 'salvo (sem repetir, em ordem)', p::text from public.monitor_view_prefs_get() p;
insert into r377 values ('objetivo inválido', pg_temp.try($q$select public.monitor_view_prefs_save(array['compras'])$q$));
insert into r377 values ('escrever direto', pg_temp.try($q$insert into public.monitor_view_prefs (user_id, objectives) values ('00000000-0000-0000-0000-00000377aa02', '{}')$q$));

-- Resumo, histórico, comparação e lista com o filtro.
insert into r377 select 'resumo sem filtro', concat_ws(':', s -> 'open' ->> 'critico', s -> 'open' ->> 'atencao') from public.monitor_summary(null, null, null) s;
insert into r377 select 'resumo Vendas+Leads', concat_ws(':', s -> 'open' ->> 'critico', s -> 'open' ->> 'atencao') from public.monitor_summary(null, null, array['vendas', 'leads']) s;
insert into r377 select 'resumo Engajamento', concat_ws(':', s -> 'open' ->> 'critico', s -> 'open' ->> 'atencao', s -> 'top' -> 0 ->> 'entity_name') from public.monitor_summary(null, null, array['engajamento']) s;
insert into r377 select 'resumo antigo = sem filtro', concat_ws(':', s -> 'open' ->> 'critico', s -> 'open' ->> 'atencao') from public.monitor_summary() s;
insert into r377 select 'histórico Leads', h ->> 'created' from public.monitor_history(30, null, null, array['leads']) h;
insert into r377 values ('campanhas sem filtro', pg_temp.cmp('campaign', null));
insert into r377 values ('campanhas Vendas+Leads', pg_temp.cmp('campaign', array['vendas', 'leads']));
insert into r377 values ('conta sem filtro', pg_temp.cmp('account', null));
insert into r377 values ('conta só Vendas', pg_temp.cmp('account', array['vendas']));
insert into r377 select 'comparação antiga', count(*)::text from public.monitor_compare('campaign', current_date - 7, current_date - 1, current_date - 14, current_date - 8, '00000000-0000-0000-0000-00000377cc01');
insert into r377 select 'lista traz o objetivo', string_agg(x ->> 'campaign_objective', ',' order by x ->> 'campaign_objective')
  from jsonb_array_elements(public.monitor_alerts_query(true, 500)) x where x ->> 'client_name' = 'Cliente T377';

-- O filtro é de cada pessoa.
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000377aa01","role":"authenticated"}';
insert into r377 select 'admin tem o próprio filtro', p::text from public.monitor_view_prefs_get() p;
insert into r377 select 'admin não lê o filtro do gestor', count(*)::text from public.monitor_view_prefs;

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000377aa05","role":"authenticated"}';
insert into r377 values ('equipe lê', pg_temp.try($q$select public.monitor_view_prefs_get()$q$));
insert into r377 values ('equipe salva', pg_temp.try($q$select public.monitor_view_prefs_save(array['vendas'])$q$));
set local role anon;
insert into r377 values ('visitante', pg_temp.try($q$select public.monitor_view_prefs_get()$q$));
reset role;

do $$
declare
  expected jsonb := jsonb_build_object(
    'grupos', 'vendas,vendas,leads,engajamento,trafego,reconhecimento,outros,outros',
    'padrão', '{"objectives": []}',
    'salvo (sem repetir, em ordem)', '{"objectives": ["leads", "vendas"]}',
    'objetivo inválido', '22023',
    'escrever direto', '42501',
    'resumo sem filtro', '2:1',
    'resumo Vendas+Leads', '1:1',
    'resumo Engajamento', '1:0:Conversas T377',
    'resumo antigo = sem filtro', '2:1',
    'histórico Leads', '1',
    'campanhas sem filtro', 'Conversas T377=210,Leads T377=140,Vendas T377=70',
    'campanhas Vendas+Leads', 'Leads T377=140,Vendas T377=70',
    'conta sem filtro', '-',
    'conta só Vendas', 'Conta T377=70',
    'comparação antiga', '3',
    'lista traz o objetivo', 'MESSAGES,OUTCOME_LEADS,OUTCOME_SALES',
    'admin tem o próprio filtro', '{"objectives": []}',
    'admin não lê o filtro do gestor', '0',
    'equipe lê', '42501',
    'equipe salva', '42501',
    'visitante', '42501');
  r record;
begin
  for r in select * from r377 loop
    if expected ->> r.what is distinct from r.v then raise exception 'FALHOU: % = % (esperado %)', r.what, r.v, expected ->> r.what; end if;
  end loop;
  if (select count(*) from r377) <> (select count(*) from jsonb_object_keys(expected)) then
    raise exception 'FALHOU: faltou verificação (%)', (select count(*) from r377);
  end if;
  raise notice 'Filtro de objetivo: % verificações OK', (select count(*) from r377);
end $$;

rollback;
