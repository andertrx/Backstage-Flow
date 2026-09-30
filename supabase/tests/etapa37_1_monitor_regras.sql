-- =============================================================================
-- Testes da Etapa 37.1 — Monitoramento de Desempenho: permissões e regras.
-- Rodar inteiro no SQL Editor. Transação desfeita no final: nada fica gravado.
-- =============================================================================
begin;

insert into auth.users (id, instance_id, aud, role, email) values
  ('00000000-0000-0000-0000-00000371aa01', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@t371.local'),
  ('00000000-0000-0000-0000-00000371aa02', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'gestor@t371.local'),
  ('00000000-0000-0000-0000-00000371aa03', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'operador@t371.local'),
  ('00000000-0000-0000-0000-00000371aa04', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'visual@t371.local'),
  ('00000000-0000-0000-0000-00000371aa05', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'equipe@t371.local');
update public.profiles set active = true, role = 'admin', full_name = 'Admin T371' where id = '00000000-0000-0000-0000-00000371aa01';
update public.profiles set active = true, role = 'gestor', full_name = 'Gestor T371' where id = '00000000-0000-0000-0000-00000371aa02';
update public.profiles set active = true, role = 'operador', full_name = 'Operador T371' where id = '00000000-0000-0000-0000-00000371aa03';
update public.profiles set active = true, role = 'visualizador', full_name = 'Visual T371' where id = '00000000-0000-0000-0000-00000371aa04';
update public.profiles set active = true, role = 'equipe', full_name = 'Equipe T371' where id = '00000000-0000-0000-0000-00000371aa05';

insert into public.clients (id, name) values
  ('00000000-0000-0000-0000-00000371cc01', 'Cliente A T371'),
  ('00000000-0000-0000-0000-00000371cc02', 'Cliente B T371');
insert into public.user_client_access (user_id, client_id) values
  ('00000000-0000-0000-0000-00000371aa02', '00000000-0000-0000-0000-00000371cc01'),
  ('00000000-0000-0000-0000-00000371aa03', '00000000-0000-0000-0000-00000371cc01'),
  ('00000000-0000-0000-0000-00000371aa04', '00000000-0000-0000-0000-00000371cc01');

create temp table r371 (what text, v text) on commit drop;
create temp table k371 (k text, id uuid) on commit drop;
grant all on r371, k371 to authenticated, anon;

-- Tenta executar e devolve 'ok' ou o código do erro.
create or replace function pg_temp.try(p_sql text) returns text language plpgsql as $$
begin
  execute p_sql;
  return 'ok';
exception when others then
  return sqlstate;
end $$;
grant execute on function pg_temp.try(text) to authenticated, anon;

set local role authenticated;

-- 1. Padrões: as 6 regras globais do prompt.
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000371aa01","role":"authenticated"}';
insert into r371 select 'padrões', string_agg(metric || ':' || direction || ':' || attention_pct::int || '/' || critical_pct::int, ',' order by metric)
  from public.monitor_rules_list() where scope = 'global';

-- 2. Gestor cria regra do cliente dele; não cria do cliente B nem global.
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000371aa02","role":"authenticated"}';
insert into k371 select 'ra', public.monitor_rule_save(null, 'client', '00000000-0000-0000-0000-00000371cc01', 'cpc', 'up', 25, 50, 30, true, ' Cliente sazonal ');
insert into r371 select 'gestor cria no cliente dele', scope || ':' || scope_name || ':' || attention_pct::int || ':' || min_volume || ':' || note
  from public.monitor_rules_list() where id = (select id from k371 where k = 'ra');
insert into r371 values ('gestor no cliente B', pg_temp.try($q$select public.monitor_rule_save(null, 'client', '00000000-0000-0000-0000-00000371cc02', 'cpc', 'up', 25, 50)$q$));
insert into r371 values ('gestor na regra global', pg_temp.try($q$select public.monitor_rule_save((select id from public.monitor_rules where scope = 'global' and metric = 'cpc' and archived_at is null), 'global', null, 'cpc', 'up', 30, 60)$q$));
insert into r371 values ('duplicada no mesmo lugar', pg_temp.try($q$select public.monitor_rule_save(null, 'client', '00000000-0000-0000-0000-00000371cc01', 'cpc', 'up', 10, 20)$q$));

-- 3. Validações.
insert into r371 values ('crítico menor que atenção', pg_temp.try($q$select public.monitor_rule_save(null, 'client', '00000000-0000-0000-0000-00000371cc01', 'ctr', 'down', 30, 15)$q$));
insert into r371 values ('limite zero', pg_temp.try($q$select public.monitor_rule_save(null, 'client', '00000000-0000-0000-0000-00000371cc01', 'ctr', 'down', 0, 15)$q$));
insert into r371 values ('métrica inválida', pg_temp.try($q$select public.monitor_rule_save(null, 'client', '00000000-0000-0000-0000-00000371cc01', 'lucro', 'down', 10, 15)$q$));
insert into r371 values ('escopo sem id', pg_temp.try($q$select public.monitor_rule_save(null, 'client', null, 'ctr', 'down', 10, 15)$q$));
insert into r371 values ('volume negativo', pg_temp.try($q$select public.monitor_rule_save(null, 'client', '00000000-0000-0000-0000-00000371cc01', 'ctr', 'down', 10, 15, -1)$q$));

-- 4. Editar = arquivar a anterior e criar a nova (histórico completo).
insert into k371 select 'rb', public.monitor_rule_save((select id from k371 where k = 'ra'), 'client', '00000000-0000-0000-0000-00000371cc01', 'cpc', 'up', 35, 70, null, false);
insert into r371 select 'edição gera versão', count(*) filter (where archived_at is null) || '|' || count(*) || '|' ||
  bool_or(id = (select id from k371 where k = 'rb') and replaces_id = (select id from k371 where k = 'ra') and not active)
  from public.monitor_rules_list(true) where scope = 'client' and client_id = '00000000-0000-0000-0000-00000371cc01';
insert into r371 values ('editar versão antiga', pg_temp.try($q$select public.monitor_rule_save((select id from k371 where k = 'ra'), 'client', '00000000-0000-0000-0000-00000371cc01', 'cpc', 'up', 40, 80)$q$));
insert into r371 values ('trocar métrica na edição', pg_temp.try($q$select public.monitor_rule_save((select id from k371 where k = 'rb'), 'client', '00000000-0000-0000-0000-00000371cc01', 'cpm', 'up', 40, 80)$q$));

-- 5. Operador e visualizador veem, mas não mudam; equipe nem vê.
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000371aa03","role":"authenticated"}';
insert into r371 select 'operador vê', count(*)::text from public.monitor_rules_list();
insert into r371 values ('operador cria', pg_temp.try($q$select public.monitor_rule_save(null, 'client', '00000000-0000-0000-0000-00000371cc01', 'ctr', 'down', 10, 20)$q$));
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000371aa04","role":"authenticated"}';
insert into r371 values ('visualizador arquiva', pg_temp.try($q$select public.monitor_rule_archive((select id from k371 where k = 'rb'))$q$));
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000371aa05","role":"authenticated"}';
insert into r371 values ('equipe lista', pg_temp.try($q$select * from public.monitor_rules_list()$q$));
insert into r371 select 'equipe lê a tabela', count(*)::text from public.monitor_rules;

-- 6. Admin cria no cliente B; o gestor (só cliente A) não enxerga.
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000371aa01","role":"authenticated"}';
insert into k371 select 'rc', public.monitor_rule_save(null, 'client', '00000000-0000-0000-0000-00000371cc02', 'roas', 'down', 10, 20);
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000371aa02","role":"authenticated"}';
insert into r371 select 'gestor não vê o cliente B', count(*)::text from public.monitor_rules_list(true) where client_id = '00000000-0000-0000-0000-00000371cc02';
insert into r371 select 'gestor não lê o cliente B na tabela', count(*)::text from public.monitor_rules where client_id = '00000000-0000-0000-0000-00000371cc02';
insert into r371 values ('gestor arquiva regra do B', pg_temp.try($q$select public.monitor_rule_archive((select id from k371 where k = 'rc'))$q$));

-- 7. Arquivar específica: volta a valer a global. Global não é removida.
insert into r371 values ('gestor arquiva a do cliente dele', pg_temp.try($q$select public.monitor_rule_archive((select id from k371 where k = 'rb'))$q$));
insert into r371 select 'arquivada fica no histórico', count(*) filter (where archived_at is null) || '|' || count(*)
  from public.monitor_rules_list(true) where scope = 'client' and client_id = '00000000-0000-0000-0000-00000371cc01';
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000371aa01","role":"authenticated"}';
insert into r371 values ('remover global', pg_temp.try($q$select public.monitor_rule_archive((select id from public.monitor_rules where scope = 'global' and metric = 'cpc' and archived_at is null))$q$));
insert into r371 values ('admin edita global', pg_temp.try($q$select public.monitor_rule_save((select id from public.monitor_rules where scope = 'global' and metric = 'ctr' and archived_at is null), 'global', null, 'ctr', 'down', 12, 25)$q$));
insert into r371 select 'global editada', attention_pct::int || '/' || critical_pct::int from public.monitor_rules_list() where scope = 'global' and metric = 'ctr';

-- 8. Gravação direta e visitante.
insert into r371 values ('gravar direto na tabela', pg_temp.try($q$insert into public.monitor_rules (scope, metric, direction, attention_pct, critical_pct) values ('global', 'spend', 'both', 10, 20)$q$));
insert into r371 values ('apagar direto na tabela', pg_temp.try($q$delete from public.monitor_rules$q$));
reset role;
set local role anon;
insert into r371 values ('visitante lista', pg_temp.try($q$select * from public.monitor_rules_list()$q$));
reset role;

-- 9. Colunas do criativo existem.
insert into r371 select 'colunas do criativo', count(*)::text from information_schema.columns
 where table_schema = 'public' and table_name = 'ads' and column_name in ('creative_external_id', 'preview_link');

do $$
declare
  expected jsonb := jsonb_build_object(
    'padrões', 'cost_per_result:up:20/40,cpc:up:20/40,cpm:up:20/40,ctr:down:15/30,results:down:20/40,roas:down:20/40',
    'gestor cria no cliente dele', 'client:Cliente A T371:25:30:Cliente sazonal',
    'gestor no cliente B', '22023',
    'gestor na regra global', '42501',
    'duplicada no mesmo lugar', '22023',
    'crítico menor que atenção', '22023',
    'limite zero', '22023',
    'métrica inválida', '22023',
    'escopo sem id', '22023',
    'volume negativo', '22023',
    'edição gera versão', '1|2|true',
    'editar versão antiga', '40001',
    'trocar métrica na edição', '22023',
    'operador vê', '7',
    'operador cria', '42501',
    'visualizador arquiva', '42501',
    'equipe lista', '42501',
    'equipe lê a tabela', '0',
    'gestor não vê o cliente B', '0',
    'gestor não lê o cliente B na tabela', '0',
    'gestor arquiva regra do B', '22023',
    'gestor arquiva a do cliente dele', 'ok',
    'arquivada fica no histórico', '0|2',
    'remover global', '22023',
    'admin edita global', 'ok',
    'global editada', '12/25',
    'gravar direto na tabela', '42501',
    'apagar direto na tabela', '42501',
    'visitante lista', '42501',
    'colunas do criativo', '2');
  r record;
begin
  for r in select * from r371 loop
    if expected ->> r.what is distinct from r.v then raise exception 'FALHOU: % = % (esperado %)', r.what, r.v, expected ->> r.what; end if;
  end loop;
  if (select count(*) from r371) <> (select count(*) from jsonb_object_keys(expected)) then
    raise exception 'FALHOU: faltou verificação (%)', (select count(*) from r371);
  end if;
  raise notice 'Etapa 37.1: % verificações OK', (select count(*) from r371);
end $$;

rollback;
