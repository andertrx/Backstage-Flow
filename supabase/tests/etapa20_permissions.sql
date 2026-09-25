-- =============================================================================
-- Testes da Etapa 20 — Permissões (matriz geral "quem pode o quê")
-- Perfis: admin, gestor, operador, visualizador, cliente, usuário desativado e
-- visitante sem login. Cada um tenta LER e ALTERAR os dados de um cliente
-- liberado (C1) e de um cliente NÃO liberado (C2).
-- Rodar inteiro no SQL Editor. Transação desfeita no final: nada fica gravado.
-- =============================================================================
begin;

insert into auth.users (id, instance_id, aud, role, email) values
  ('00000000-0000-0000-0000-000000020a01', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@t20.local'),
  ('00000000-0000-0000-0000-000000020a02', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'gestor@t20.local'),
  ('00000000-0000-0000-0000-000000020a03', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'operador@t20.local'),
  ('00000000-0000-0000-0000-000000020a04', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'visual@t20.local'),
  ('00000000-0000-0000-0000-000000020a05', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cliente@t20.local'),
  ('00000000-0000-0000-0000-000000020a06', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'inativo@t20.local');
update public.profiles set active = true, role = 'admin'        where id = '00000000-0000-0000-0000-000000020a01';
update public.profiles set active = true, role = 'gestor'       where id = '00000000-0000-0000-0000-000000020a02';
update public.profiles set active = true, role = 'operador'     where id = '00000000-0000-0000-0000-000000020a03';
update public.profiles set active = true, role = 'visualizador' where id = '00000000-0000-0000-0000-000000020a04';
update public.profiles set active = true, role = 'cliente'      where id = '00000000-0000-0000-0000-000000020a05';
update public.profiles set active = false, role = 'gestor'      where id = '00000000-0000-0000-0000-000000020a06';

insert into public.clients (id, name) values
  ('00000000-0000-0000-0000-000000020c01', 'Cliente Liberado T20'),
  ('00000000-0000-0000-0000-000000020c02', 'Cliente Bloqueado T20');
insert into public.user_client_access (user_id, client_id)
select u, '00000000-0000-0000-0000-000000020c01'::uuid from unnest(array[
  '00000000-0000-0000-0000-000000020a02', '00000000-0000-0000-0000-000000020a03', '00000000-0000-0000-0000-000000020a04',
  '00000000-0000-0000-0000-000000020a05', '00000000-0000-0000-0000-000000020a06']::uuid[]) u;

insert into public.platform_connections (id, platform_id, label, status) values
  ('00000000-0000-0000-0000-000000020b01', 'meta', 'Conexão T20', 'ativa');
insert into public.ad_accounts (id, platform_id, external_id, client_id, connection_id, name, currency, status) values
  ('00000000-0000-0000-0000-000000020001', 'meta', 't20-1', '00000000-0000-0000-0000-000000020c01', '00000000-0000-0000-0000-000000020b01', 'Conta C1', 'BRL', 'ativa'),
  ('00000000-0000-0000-0000-000000020002', 'meta', 't20-2', '00000000-0000-0000-0000-000000020c02', '00000000-0000-0000-0000-000000020b01', 'Conta C2', 'BRL', 'ativa');
insert into public.campaigns (id, ad_account_id, client_id, platform_id, external_id, name, status) values
  ('00000000-0000-0000-0000-00000002cc01', '00000000-0000-0000-0000-000000020001', '00000000-0000-0000-0000-000000020c01', 'meta', 't20-c1', 'Campanha C1', 'ativa'),
  ('00000000-0000-0000-0000-00000002cc02', '00000000-0000-0000-0000-000000020002', '00000000-0000-0000-0000-000000020c02', 'meta', 't20-c2', 'Campanha C2', 'ativa');
-- Gera histórico de alteração (entity_changes) nas duas campanhas
update public.campaigns set status = 'pausada' where id in ('00000000-0000-0000-0000-00000002cc01', '00000000-0000-0000-0000-00000002cc02');

select public.ingest_metrics_daily(jsonb_build_array(
  jsonb_build_object('date', current_date - 1, 'ad_account_id', '00000000-0000-0000-0000-000000020001', 'level', 'account', 'entity_external_id', 't20-1', 'spend_micros', 10000000, 'impressions', 100),
  jsonb_build_object('date', current_date - 1, 'ad_account_id', '00000000-0000-0000-0000-000000020002', 'level', 'account', 'entity_external_id', 't20-2', 'spend_micros', 20000000, 'impressions', 200)));

insert into public.account_snapshots (ad_account_id, client_id, platform_id, status, currency, available_micros, funding_description, issues) values
  ('00000000-0000-0000-0000-000000020001', '00000000-0000-0000-0000-000000020c01', 'meta', 'ativa', 'BRL', 1000000, 'Visa final 1234', '{}'),
  ('00000000-0000-0000-0000-000000020002', '00000000-0000-0000-0000-000000020c02', 'meta', 'ativa', 'BRL', 2000000, 'Visa final 9999', '{}');
insert into public.sync_state (ad_account_id, status, last_error_message) values
  ('00000000-0000-0000-0000-000000020001', 'erro', 'detalhe técnico C1'),
  ('00000000-0000-0000-0000-000000020002', 'erro', 'detalhe técnico C2');
insert into public.sync_runs (ad_account_id, client_id, platform_id, trigger, status, finished_at, duration_ms) values
  ('00000000-0000-0000-0000-000000020001', '00000000-0000-0000-0000-000000020c01', 'meta', 'agendada', 'sucesso', now(), 1),
  ('00000000-0000-0000-0000-000000020002', '00000000-0000-0000-0000-000000020c02', 'meta', 'agendada', 'sucesso', now(), 1);
insert into public.alerts (alert_key, type, severity, status, client_id, platform_id, ad_account_id, description) values
  ('t20:c1', 'sem_saldo', 'critica', 'aberto', '00000000-0000-0000-0000-000000020c01', 'meta', '00000000-0000-0000-0000-000000020001', 'Alerta C1'),
  ('t20:c2', 'sem_saldo', 'critica', 'aberto', '00000000-0000-0000-0000-000000020c02', 'meta', '00000000-0000-0000-0000-000000020002', 'Alerta C2');

-- ---------------------------------------------------------------- ferramenta: o que o usuário atual enxerga
create temp table t20_seen (role text, what text, c1 int, c2 int) on commit drop;
grant all on t20_seen to authenticated;

create function pg_temp.t20_look(p_role text) returns void language plpgsql as $$
declare
  c1 uuid := '00000000-0000-0000-0000-000000020c01';
  c2 uuid := '00000000-0000-0000-0000-000000020c02';
begin
  insert into t20_seen select p_role, 'clientes',   count(*) filter (where id = c1), count(*) filter (where id = c2) from public.clients;
  insert into t20_seen select p_role, 'contas',     count(*) filter (where client_id = c1), count(*) filter (where client_id = c2) from public.ad_accounts;
  insert into t20_seen select p_role, 'campanhas',  count(*) filter (where client_id = c1), count(*) filter (where client_id = c2) from public.campaigns;
  insert into t20_seen select p_role, 'metricas',   count(*) filter (where client_id = c1), count(*) filter (where client_id = c2) from public.metrics_daily;
  insert into t20_seen select p_role, 'saldo',      count(*) filter (where client_id = c1), count(*) filter (where client_id = c2) from public.account_snapshots;
  insert into t20_seen select p_role, 'alteracoes', count(*) filter (where client_id = c1), count(*) filter (where client_id = c2) from public.entity_changes;
  insert into t20_seen select p_role, 'sync_estado',
    count(*) filter (where ad_account_id = '00000000-0000-0000-0000-000000020001'), count(*) filter (where ad_account_id = '00000000-0000-0000-0000-000000020002') from public.sync_state;
  insert into t20_seen select p_role, 'sync_log',   count(*) filter (where client_id = c1), count(*) filter (where client_id = c2) from public.sync_runs;
  insert into t20_seen select p_role, 'alertas',    count(*) filter (where client_id = c1), count(*) filter (where client_id = c2) from public.alerts;
  insert into t20_seen select p_role, 'conexoes',   count(*) filter (where id = '00000000-0000-0000-0000-000000020b01'), 0 from public.platform_connections;
  insert into t20_seen select p_role, 'auditoria',  least(count(*), 1), 0 from public.audit_logs;
  insert into t20_seen select p_role, 'perfis',     count(*) filter (where email like '%@t20.local'), 0 from public.profiles;
  insert into t20_seen select p_role, 'dashboard',
    coalesce((select sum(spend_micros) from public.dashboard_summary(current_date - 7, current_date, array[c1], null, null, null, null)), 0)::int / 1000000,
    coalesce((select sum(spend_micros) from public.dashboard_summary(current_date - 7, current_date, array[c2], null, null, null, null)), 0)::int / 1000000;
end $$;
grant execute on function pg_temp.t20_look(text) to authenticated;

-- ---------------------------------------------------------------- leitura: cada perfil
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000020a01","role":"authenticated"}';
select pg_temp.t20_look('admin');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000020a02","role":"authenticated"}';
select pg_temp.t20_look('gestor');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000020a03","role":"authenticated"}';
select pg_temp.t20_look('operador');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000020a04","role":"authenticated"}';
select pg_temp.t20_look('visualizador');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000020a05","role":"authenticated"}';
select pg_temp.t20_look('cliente');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000020a06","role":"authenticated"}';
select pg_temp.t20_look('inativo');
reset role;

-- Matriz esperada: c1/c2 = linhas visíveis do cliente liberado / do bloqueado ("dashboard" = investimento em R$).
do $$
declare
  expected jsonb := '{
    "admin":        {"clientes":[1,1],"contas":[1,1],"campanhas":[1,1],"metricas":[1,1],"saldo":[1,1],"alteracoes":[1,1],"sync_estado":[1,1],"sync_log":[1,1],"alertas":[1,1],"conexoes":[1,0],"auditoria":[1,0],"perfis":[6,0],"dashboard":[10,20]},
    "gestor":       {"clientes":[1,0],"contas":[1,0],"campanhas":[1,0],"metricas":[1,0],"saldo":[1,0],"alteracoes":[1,0],"sync_estado":[1,0],"sync_log":[1,0],"alertas":[1,0],"conexoes":[1,0],"auditoria":[0,0],"perfis":[1,0],"dashboard":[10,0]},
    "operador":     {"clientes":[1,0],"contas":[1,0],"campanhas":[1,0],"metricas":[1,0],"saldo":[1,0],"alteracoes":[1,0],"sync_estado":[1,0],"sync_log":[1,0],"alertas":[1,0],"conexoes":[0,0],"auditoria":[0,0],"perfis":[1,0],"dashboard":[10,0]},
    "visualizador": {"clientes":[1,0],"contas":[1,0],"campanhas":[1,0],"metricas":[1,0],"saldo":[1,0],"alteracoes":[1,0],"sync_estado":[1,0],"sync_log":[1,0],"alertas":[1,0],"conexoes":[0,0],"auditoria":[0,0],"perfis":[1,0],"dashboard":[10,0]},
    "cliente":      {"clientes":[1,0],"contas":[1,0],"campanhas":[1,0],"metricas":[1,0],"saldo":[0,0],"alteracoes":[0,0],"sync_estado":[0,0],"sync_log":[0,0],"alertas":[0,0],"conexoes":[0,0],"auditoria":[0,0],"perfis":[1,0],"dashboard":[10,0]},
    "inativo":      {"clientes":[0,0],"contas":[0,0],"campanhas":[0,0],"metricas":[0,0],"saldo":[0,0],"alteracoes":[0,0],"sync_estado":[0,0],"sync_log":[0,0],"alertas":[0,0],"conexoes":[0,0],"auditoria":[0,0],"perfis":[1,0],"dashboard":[0,0]}
  }';
  r record;
  want jsonb;
  failures text := '';
begin
  for r in select * from t20_seen loop
    want := expected -> r.role -> r.what;
    if want is null then raise exception 'FALHOU: combinação não prevista % / %', r.role, r.what; end if;
    -- "alteracoes" (histórico) pode ter mais de uma linha: conta só se existe.
    if r.what = 'alteracoes' then r.c1 := least(r.c1, 1); r.c2 := least(r.c2, 1); end if;
    if r.c1 <> (want ->> 0)::int or r.c2 <> (want ->> 1)::int then
      failures := failures || format(E'\n  %s / %s: viu [%s,%s], esperado %s', r.role, r.what, r.c1, r.c2, want);
    end if;
  end loop;
  if (select count(*) from t20_seen) <> 6 * 13 then raise exception 'FALHOU: matriz incompleta (%)', (select count(*) from t20_seen); end if;
  if failures <> '' then raise exception 'FALHOU: matriz de leitura:%', failures; end if;
end $$;

-- ---------------------------------------------------------------- escrita: o que cada perfil pode (e não pode) alterar
create function pg_temp.t20_try(p_sql text) returns text language plpgsql as $$
begin
  execute p_sql;
  return 'ok';
exception when others then
  return 'bloqueado';
end $$;
grant execute on function pg_temp.t20_try(text) to authenticated;

create temp table t20_did (role text, what text, result text) on commit drop;
grant all on t20_did to authenticated;

create function pg_temp.t20_act(p_role text) returns void language plpgsql as $$
declare
  tag text := replace(p_role, 'visualizador', 'visual');
begin
  insert into t20_did values
    (p_role, 'cadastrar cliente', pg_temp.t20_try(format($q$insert into public.clients (name) values ('Novo %s T20')$q$, tag))),
    (p_role, 'editar cliente liberado', pg_temp.t20_try($q$do $x$ begin update public.clients set notes = 'x' where id = '00000000-0000-0000-0000-000000020c01'; if not found then raise exception 'nada'; end if; end $x$ $q$)),
    (p_role, 'editar cliente bloqueado', pg_temp.t20_try($q$do $x$ begin update public.clients set notes = 'x' where id = '00000000-0000-0000-0000-000000020c02'; if not found then raise exception 'nada'; end if; end $x$ $q$)),
    (p_role, 'liberar acesso a cliente', pg_temp.t20_try($q$insert into public.user_client_access (user_id, client_id) values ('00000000-0000-0000-0000-000000020a04', '00000000-0000-0000-0000-000000020c02')$q$)),
    (p_role, 'mudar o próprio papel', pg_temp.t20_try($q$do $x$ begin update public.profiles set role = 'admin' where id = (select auth.uid()); if not found then raise exception 'nada'; end if; end $x$ $q$)),
    (p_role, 'mudar o próprio nome', pg_temp.t20_try($q$do $x$ begin update public.profiles set full_name = 'Nome T20' where id = (select auth.uid()); if not found then raise exception 'nada'; end if; end $x$ $q$)),
    (p_role, 'alterar conta de anúncio', pg_temp.t20_try($q$do $x$ begin update public.ad_accounts set name = 'x' where id = '00000000-0000-0000-0000-000000020001'; if not found then raise exception 'nada'; end if; end $x$ $q$)),
    (p_role, 'gravar métricas', pg_temp.t20_try($q$select public.ingest_metrics_daily('[]'::jsonb)$q$)),
    (p_role, 'ler token da conexão', pg_temp.t20_try($q$select public.connection_secret_get('00000000-0000-0000-0000-000000020b01')$q$)),
    (p_role, 'marcar alerta como visto', pg_temp.t20_try($q$do $x$ begin perform public.set_alert_status((select id from public.alerts where alert_key = 't20:c1'), 'visto'); perform public.set_alert_status((select id from public.alerts where alert_key = 't20:c1'), 'aberto'); end $x$ $q$)),
    (p_role, 'apagar auditoria', pg_temp.t20_try($q$do $x$ begin delete from public.audit_logs; if not found then raise exception 'nada'; end if; end $x$ $q$)),
    (p_role, 'chamar gatilho direto', pg_temp.t20_try($q$select private.touch_updated_at()$q$));
end $$;
grant execute on function pg_temp.t20_act(text) to authenticated;

-- "Verificar alertas" por último: ela resolve alertas sem motivo (como o de teste) e mudaria as outras ações.
create function pg_temp.t20_refresh(p_role text) returns void language plpgsql as $$
begin
  insert into t20_did values (p_role, 'verificar alertas', pg_temp.t20_try($q$select public.refresh_alerts()$q$));
end $$;
grant execute on function pg_temp.t20_refresh(text) to authenticated;

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000020a01","role":"authenticated"}';
select pg_temp.t20_act('admin');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000020a02","role":"authenticated"}';
select pg_temp.t20_act('gestor');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000020a03","role":"authenticated"}';
select pg_temp.t20_act('operador');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000020a04","role":"authenticated"}';
select pg_temp.t20_act('visualizador');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000020a05","role":"authenticated"}';
select pg_temp.t20_act('cliente');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000020a06","role":"authenticated"}';
select pg_temp.t20_act('inativo');
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000020a01","role":"authenticated"}';
select pg_temp.t20_refresh('admin');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000020a02","role":"authenticated"}';
select pg_temp.t20_refresh('gestor');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000020a03","role":"authenticated"}';
select pg_temp.t20_refresh('operador');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000020a04","role":"authenticated"}';
select pg_temp.t20_refresh('visualizador');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000020a05","role":"authenticated"}';
select pg_temp.t20_refresh('cliente');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000020a06","role":"authenticated"}';
select pg_temp.t20_refresh('inativo');
reset role;

do $$
declare
  -- ok = permitido; - = bloqueado. Ordem: admin, gestor, operador, visualizador, cliente, inativo
  expected jsonb := '{
    "cadastrar cliente":        ["ok","ok","-","-","-","-"],
    "editar cliente liberado":  ["ok","ok","-","-","-","-"],
    "editar cliente bloqueado": ["ok","-","-","-","-","-"],
    "liberar acesso a cliente": ["ok","-","-","-","-","-"],
    "mudar o próprio papel":    ["-","-","-","-","-","-"],
    "mudar o próprio nome":     ["ok","ok","ok","ok","ok","-"],
    "alterar conta de anúncio": ["-","-","-","-","-","-"],
    "gravar métricas":          ["-","-","-","-","-","-"],
    "ler token da conexão":     ["-","-","-","-","-","-"],
    "verificar alertas":        ["ok","ok","ok","-","-","-"],
    "marcar alerta como visto": ["ok","ok","ok","-","-","-"],
    "apagar auditoria":         ["-","-","-","-","-","-"],
    "chamar gatilho direto":    ["-","-","-","-","-","-"]
  }';
  roles text[] := array['admin', 'gestor', 'operador', 'visualizador', 'cliente', 'inativo'];
  r record;
  want text;
  failures text := '';
begin
  if (select count(*) from t20_did) <> 6 * 13 then raise exception 'FALHOU: matriz de ações incompleta (%)', (select count(*) from t20_did); end if;
  for r in select * from t20_did loop
    want := expected -> r.what ->> (array_position(roles, r.role) - 1);
    if want is null then raise exception 'FALHOU: ação não prevista %', r.what; end if;
    if (want = 'ok') <> (r.result = 'ok') then
      failures := failures || format(E'\n  %s / %s: %s (esperado %s)', r.role, r.what, r.result, case want when 'ok' then 'permitido' else 'bloqueado' end);
    end if;
  end loop;
  if failures <> '' then raise exception 'FALHOU: matriz de ações:%', failures; end if;
  -- O papel continua o mesmo e o gatilho de auditoria continuou funcionando nas alterações permitidas.
  if exists (select 1 from public.profiles where email like '%@t20.local' and email <> 'admin@t20.local' and role = 'admin') then
    raise exception 'FALHOU: alguém virou administrador';
  end if;
  if not exists (select 1 from public.audit_logs where action = 'client.insert' and details ->> 'name' = 'Novo gestor T20') then
    raise exception 'FALHOU: auditoria não registrou o cadastro do gestor';
  end if;
  if not exists (select 1 from public.user_client_access a join public.clients c on c.id = a.client_id
                 where c.name = 'Novo gestor T20' and a.user_id = '00000000-0000-0000-0000-000000020a02') then
    raise exception 'FALHOU: gestor não recebeu acesso ao cliente que cadastrou';
  end if;
end $$;

-- ---------------------------------------------------------------- visitante sem login: nada
set local role anon;
do $$
declare
  t text;
  blocked int := 0;
begin
  foreach t in array array['clients', 'ad_accounts', 'campaigns', 'metrics_daily', 'account_snapshots', 'alerts', 'sync_runs', 'audit_logs', 'profiles', 'platform_connections'] loop
    begin
      execute format('select 1 from public.%I limit 1', t);
    exception when insufficient_privilege then
      blocked := blocked + 1;
    end;
  end loop;
  if blocked <> 10 then raise exception 'FALHOU: visitante leu % tabela(s)', 10 - blocked; end if;
  begin
    perform public.dashboard_summary(current_date - 7, current_date, null, null, null, null, null);
    raise exception 'FALHOU: visitante chamou o resumo';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

rollback;

select 'TODOS OS TESTES PASSARAM' as resultado;
