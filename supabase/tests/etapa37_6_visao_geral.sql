-- =============================================================================
-- Testes da Etapa 37.6 — Monitoramento: resumo (Visão geral, dashboard, ficha do cliente, Meta/Google)
-- e histórico dos alertas. Rodar inteiro no SQL Editor. Transação desfeita no final: nada fica gravado.
-- =============================================================================
begin;

insert into auth.users (id, instance_id, aud, role, email) values
  ('00000000-0000-0000-0000-00000376aa01', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@t376.local'),
  ('00000000-0000-0000-0000-00000376aa02', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'gestor@t376.local'),
  ('00000000-0000-0000-0000-00000376aa04', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'visual@t376.local'),
  ('00000000-0000-0000-0000-00000376aa05', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'equipe@t376.local');
update public.profiles set active = true, role = 'admin', full_name = 'Admin T376' where id = '00000000-0000-0000-0000-00000376aa01';
update public.profiles set active = true, role = 'gestor', full_name = 'Gestor T376' where id = '00000000-0000-0000-0000-00000376aa02';
update public.profiles set active = true, role = 'visualizador', full_name = 'Visual T376' where id = '00000000-0000-0000-0000-00000376aa04';
update public.profiles set active = true, role = 'equipe', full_name = 'Equipe T376' where id = '00000000-0000-0000-0000-00000376aa05';

insert into public.clients (id, name) values
  ('00000000-0000-0000-0000-00000376cc01', 'Cliente A T376'),
  ('00000000-0000-0000-0000-00000376cc02', 'Cliente B T376');
insert into public.user_client_access (user_id, client_id) values
  ('00000000-0000-0000-0000-00000376aa02', '00000000-0000-0000-0000-00000376cc01'),
  ('00000000-0000-0000-0000-00000376aa04', '00000000-0000-0000-0000-00000376cc01');
insert into public.ad_accounts (id, platform_id, external_id, client_id, name, currency, timezone) values
  ('00000000-0000-0000-0000-00000376ac01', 'meta', 't376a', '00000000-0000-0000-0000-00000376cc01', 'Conta A T376', 'BRL', 'America/Sao_Paulo'),
  ('00000000-0000-0000-0000-00000376ac02', 'google', 't376b', '00000000-0000-0000-0000-00000376cc02', 'Conta B T376', 'BRL', 'America/Sao_Paulo');
insert into public.campaigns (id, ad_account_id, client_id, platform_id, external_id, name, objective, status) values
  ('00000000-0000-0000-0000-00000376ca01', '00000000-0000-0000-0000-00000376ac01', '00000000-0000-0000-0000-00000376cc01', 'meta', 'c1', 'Leads T376', 'OUTCOME_LEADS', 'ativa'),
  ('00000000-0000-0000-0000-00000376ca02', '00000000-0000-0000-0000-00000376ac02', '00000000-0000-0000-0000-00000376cc02', 'google', 'c2', 'Pesquisa T376', 'SEARCH', 'ativa');

create temp table r376 (what text, v text) on commit drop;
grant all on r376 to authenticated, anon;
create or replace function pg_temp.try(p_sql text) returns text language plpgsql as $$
begin
  execute p_sql;
  return 'ok';
exception when others then
  return sqlstate;
end $$;
grant execute on function pg_temp.try(text) to authenticated, anon;

-- Alerta como o motor deixaria. c = 1 (cliente A, Meta) ou 2 (cliente B, Google).
create or replace function pg_temp.mk(p_key text, c integer, p_sev text, p_metric text, p_first timestamptz,
                                      p_status text default 'novo', p_resolved timestamptz default null, p_resolution text default null,
                                      p_details jsonb default '{}', p_assigned uuid default null) returns bigint language plpgsql as $$
declare v bigint;
begin
  insert into public.monitor_alerts (dedupe_key, kind, level, metric, severity, client_id, platform_id, ad_account_id, campaign_id, currency,
                                     current_value, previous_value, variation_pct, period_from, period_to, prev_from, prev_to, explanation,
                                     first_detected_at, last_detected_at, status, resolved_at, resolution, details, assigned_to)
  values ('t376:' || p_key, 'limite', 'campaign', p_metric, p_sev, ('00000000-0000-0000-0000-00000376cc0' || c)::uuid,
          case c when 1 then 'meta' else 'google' end, ('00000000-0000-0000-0000-00000376ac0' || c)::uuid,
          ('00000000-0000-0000-0000-00000376ca0' || c)::uuid, 'BRL', 5, 2, 150, current_date - 7, current_date - 1, current_date - 14, current_date - 8,
          'Teste.', p_first, coalesce(p_resolved, p_first), p_status, p_resolved, p_resolution, p_details, p_assigned)
  returning id into v;
  return v;
end $$;

select pg_temp.mk('a1', 1, 'critico', 'cpc', now() - interval '1 hour', p_assigned => '00000000-0000-0000-0000-00000376aa02');
select pg_temp.mk('a2', 1, 'atencao', 'cpm', now() - interval '2 hours', 'em_analise');
select pg_temp.mk('a3', 1, 'critico', 'cpm', now() - interval '3 hours', 'ignorado');
select pg_temp.mk('a4', 1, 'atencao', 'ctr', now() - interval '3 days', 'resolvido', now() - interval '2 days', 'manual');
select pg_temp.mk('a5', 1, 'atencao', 'cpm', now() - interval '3 days', 'resolvido', now() - interval '1 day', 'automatica', '{"closed_reason":"inativo"}');
select pg_temp.mk('a6', 1, 'critico', 'cpc', now() - interval '40 days', 'resolvido', now() - interval '35 days', 'automatica');
select pg_temp.mk('b1', 2, 'critico', 'cpc', now() - interval '1 hour');
insert into public.monitor_alert_events (alert_id, kind, to_value, note, created_at)
select id, 'avaliacao', 'melhorou', 'Avaliação 3 dias: melhorou.', now() - interval '1 day' from public.monitor_alerts where dedupe_key = 't376:a4';

set local role authenticated;

-- Gestor (só o cliente A).
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000376aa02","role":"authenticated"}';
insert into r376 select 'gestor abertos', s -> 'open' ->> 'critico' || ':' || (s -> 'open' ->> 'atencao') || ':' || (s -> 'open' ->> 'informativo')
  from public.monitor_summary() s;
insert into r376 select 'gestor ignorado/novo/sem responsável/meus', concat_ws(':', s ->> 'ignored', s ->> 'new', s ->> 'unassigned', s ->> 'mine') from public.monitor_summary() s;
insert into r376 select 'gestor por cliente', string_agg(x ->> 'client_name' || '=' || (x ->> 'critico') || '/' || (x ->> 'atencao'), ',')
  from public.monitor_summary() s, jsonb_array_elements(s -> 'by_client') x;
insert into r376 select 'mais urgente', s -> 'top' -> 0 ->> 'severity' || ':' || (s -> 'top' -> 0 ->> 'entity_name') || ':' || (s -> 'top' -> 0 ->> 'assignee_name')
  || ':' || jsonb_array_length(s -> 'top') from public.monitor_summary() s;
insert into r376 select 'gestor pede cliente B', (s -> 'open' ->> 'critico') || ':' || jsonb_array_length(s -> 'by_client') from public.monitor_summary('00000000-0000-0000-0000-00000376cc02') s;
insert into r376 select 'gestor só Google', s -> 'open' ->> 'critico' from public.monitor_summary(null, 'google') s;
insert into r376 values ('plataforma inválida', pg_temp.try($q$select public.monitor_summary(null, 'tiktok')$q$));

insert into r376 select 'histórico: criados', concat_ws(':', h ->> 'created', h -> 'created_by_severity' ->> 'critico', h -> 'created_by_severity' ->> 'atencao', h ->> 'still_open')
  from public.monitor_history(30) h;
insert into r376 select 'histórico: resolvidos', concat_ws(':', h ->> 'resolved', h ->> 'resolved_manual', h ->> 'resolved_auto', h ->> 'resolved_inactive', h ->> 'median_hours')
  from public.monitor_history(30) h;
insert into r376 select 'histórico: dias', jsonb_array_length(h -> 'days') || ':' || (select sum((d ->> 'created')::int) from jsonb_array_elements(h -> 'days') d)
  || ':' || (select sum((d ->> 'resolved')::int) from jsonb_array_elements(h -> 'days') d)
  || ':' || ((h ->> 'to')::date = (now() at time zone 'America/Sao_Paulo')::date) from public.monitor_history(30) h;
insert into r376 select 'histórico: avaliações', concat_ws(':', h -> 'followups' ->> 'melhorou', h -> 'followups' ->> 'piorou', h -> 'followups' ->> 'igual', h -> 'followups' ->> 'sem_dados')
  from public.monitor_history(30) h;
insert into r376 select 'histórico: por métrica', string_agg(x ->> 'metric' || '=' || (x ->> 'created'), ',') from public.monitor_history(30) h, jsonb_array_elements(h -> 'by_metric') x;
insert into r376 select 'histórico 90 dias pega o antigo', concat_ws(':', h ->> 'created', h ->> 'resolved') from public.monitor_history(90) h;
insert into r376 values ('período curto', pg_temp.try($q$select public.monitor_history(3)$q$));
insert into r376 values ('período longo', pg_temp.try($q$select public.monitor_history(200)$q$));

-- Visualizador: mesmos números do cliente liberado (só leitura).
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000376aa04","role":"authenticated"}';
insert into r376 select 'visualizador abertos', concat_ws(':', s -> 'open' ->> 'critico', s -> 'open' ->> 'atencao', s ->> 'mine') from public.monitor_summary() s;

-- Admin: vê o cliente B e filtra por plataforma.
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000376aa01","role":"authenticated"}';
insert into r376 select 'admin cliente B Google', concat_ws(':', s -> 'open' ->> 'critico', s -> 'by_client' -> 0 ->> 'client_name') from public.monitor_summary('00000000-0000-0000-0000-00000376cc02', 'google') s;
insert into r376 select 'admin cliente B Meta', s -> 'open' ->> 'critico' from public.monitor_summary('00000000-0000-0000-0000-00000376cc02', 'meta') s;
insert into r376 select 'admin histórico B', h ->> 'created' from public.monitor_history(30, '00000000-0000-0000-0000-00000376cc02') h;

-- Equipe e visitante: bloqueados.
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000376aa05","role":"authenticated"}';
insert into r376 values ('equipe resumo', pg_temp.try($q$select public.monitor_summary()$q$));
insert into r376 values ('equipe histórico', pg_temp.try($q$select public.monitor_history()$q$));
set local role anon;
insert into r376 values ('visitante', pg_temp.try($q$select public.monitor_summary()$q$));
reset role;

do $$
declare
  expected jsonb := jsonb_build_object(
    'gestor abertos', '1:1:0',
    'gestor ignorado/novo/sem responsável/meus', '1:1:1:1',
    'gestor por cliente', 'Cliente A T376=1/1',
    'mais urgente', 'critico:Leads T376:Gestor T376:2',
    'gestor pede cliente B', '0:0',
    'gestor só Google', '0',
    'plataforma inválida', '22023',
    'histórico: criados', '5:2:3:3',
    'histórico: resolvidos', '2:1:0:1:36.0',
    'histórico: dias', '30:5:2:true',
    'histórico: avaliações', '1:0:0:0',
    'histórico: por métrica', 'cpm=3,cpc=1,ctr=1',
    'histórico 90 dias pega o antigo', '6:3',
    'período curto', '22023',
    'período longo', '22023',
    'visualizador abertos', '1:1:0',
    'admin cliente B Google', '1:Cliente B T376',
    'admin cliente B Meta', '0',
    'admin histórico B', '1',
    'equipe resumo', '42501',
    'equipe histórico', '42501',
    'visitante', '42501');
  r record;
begin
  for r in select * from r376 loop
    if expected ->> r.what is distinct from r.v then raise exception 'FALHOU: % = % (esperado %)', r.what, r.v, expected ->> r.what; end if;
  end loop;
  if (select count(*) from r376) <> (select count(*) from jsonb_object_keys(expected)) then
    raise exception 'FALHOU: faltou verificação (%)', (select count(*) from r376);
  end if;
  raise notice 'Etapa 37.6: % verificações OK', (select count(*) from r376);
end $$;

rollback;
