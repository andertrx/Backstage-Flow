-- =============================================================================
-- Testes da Etapa 37.4 — Monitoramento: tratar alertas (estados, responsável, comentários,
-- providências, virar tarefa, resolver e avaliação posterior 3 e 7 dias depois).
-- Rodar inteiro no SQL Editor. Transação desfeita no final: nada fica gravado.
-- =============================================================================
begin;

insert into auth.users (id, instance_id, aud, role, email) values
  ('00000000-0000-0000-0000-00000374aa01', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@t374.local'),
  ('00000000-0000-0000-0000-00000374aa02', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'gestor@t374.local'),
  ('00000000-0000-0000-0000-00000374aa03', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'operador@t374.local'),
  ('00000000-0000-0000-0000-00000374aa04', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'visual@t374.local'),
  ('00000000-0000-0000-0000-00000374aa05', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'equipe@t374.local'),
  ('00000000-0000-0000-0000-00000374aa06', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'gestor2@t374.local');
update public.profiles set active = true, role = 'admin', full_name = 'Admin T374' where id = '00000000-0000-0000-0000-00000374aa01';
update public.profiles set active = true, role = 'gestor', full_name = 'Gestor T374' where id = '00000000-0000-0000-0000-00000374aa02';
update public.profiles set active = true, role = 'operador', full_name = 'Operador T374' where id = '00000000-0000-0000-0000-00000374aa03';
update public.profiles set active = true, role = 'visualizador', full_name = 'Visual T374' where id = '00000000-0000-0000-0000-00000374aa04';
update public.profiles set active = true, role = 'equipe', full_name = 'Equipe T374' where id = '00000000-0000-0000-0000-00000374aa05';
update public.profiles set active = true, role = 'gestor', full_name = 'Gestor2 T374' where id = '00000000-0000-0000-0000-00000374aa06';

insert into public.clients (id, name) values
  ('00000000-0000-0000-0000-00000374cc01', 'Cliente A T374'),
  ('00000000-0000-0000-0000-00000374cc02', 'Cliente B T374');
insert into public.user_client_access (user_id, client_id) values
  ('00000000-0000-0000-0000-00000374aa02', '00000000-0000-0000-0000-00000374cc01'),
  ('00000000-0000-0000-0000-00000374aa03', '00000000-0000-0000-0000-00000374cc01'),
  ('00000000-0000-0000-0000-00000374aa04', '00000000-0000-0000-0000-00000374cc01'),
  ('00000000-0000-0000-0000-00000374aa06', '00000000-0000-0000-0000-00000374cc02');
insert into public.ad_accounts (id, platform_id, external_id, client_id, name, currency, timezone) values
  ('00000000-0000-0000-0000-00000374ac01', 'meta', 't374a', '00000000-0000-0000-0000-00000374cc01', 'Conta A T374', 'BRL', 'America/Sao_Paulo'),
  ('00000000-0000-0000-0000-00000374ac02', 'meta', 't374b', '00000000-0000-0000-0000-00000374cc02', 'Conta B T374', 'BRL', 'America/Sao_Paulo');
insert into public.campaigns (id, ad_account_id, client_id, platform_id, external_id, name, objective, status) values
  ('00000000-0000-0000-0000-00000374ca01', '00000000-0000-0000-0000-00000374ac01', '00000000-0000-0000-0000-00000374cc01', 'meta', 'c1', 'Leads T374', 'OUTCOME_LEADS', 'ativa'),
  ('00000000-0000-0000-0000-00000374ca02', '00000000-0000-0000-0000-00000374ac02', '00000000-0000-0000-0000-00000374cc02', 'meta', 'c2', 'Vendas T374', 'OUTCOME_LEADS', 'ativa');

-- Dois alertas abertos (cliente A e cliente B), como o motor deixaria.
insert into public.monitor_alerts (dedupe_key, kind, level, metric, severity, client_id, platform_id, ad_account_id, campaign_id, currency,
                                   current_value, previous_value, variation_pct, period_from, period_to, prev_from, prev_to, explanation)
values
  ('t374:a', 'limite', 'campaign', 'cost_per_result', 'critico', '00000000-0000-0000-0000-00000374cc01', 'meta', '00000000-0000-0000-0000-00000374ac01',
   '00000000-0000-0000-0000-00000374ca01', 'BRL', 5, 2, 150, current_date - 7, current_date - 1, current_date - 14, current_date - 8,
   'Custo por resultado: alta de 150,0% (de R$ 2,00 para R$ 5,00) nos últimos 7 dias em relação aos 7 dias anteriores. Limite crítico: 40%.'),
  ('t374:b', 'limite', 'campaign', 'cpm', 'atencao', '00000000-0000-0000-0000-00000374cc02', 'meta', '00000000-0000-0000-0000-00000374ac02',
   '00000000-0000-0000-0000-00000374ca02', 'BRL', 13, 10, 30, current_date - 7, current_date - 1, current_date - 14, current_date - 8,
   'CPM: alta de 30,0%.');

-- Métricas da campanha A: 7 dias antes de hoje a R$ 2,00 por lead; 7 dias depois de hoje a R$ 1,00 por lead (para a avaliação posterior).
insert into public.metrics_daily (date, ad_account_id, level, entity_external_id, client_id, platform_id, campaign_id, currency, spend_micros, impressions, clicks, leads, hash)
select g::date, '00000000-0000-0000-0000-00000374ac01', 'campaign', 'c1', '00000000-0000-0000-0000-00000374cc01', 'meta', '00000000-0000-0000-0000-00000374ca01', 'BRL',
       10000000, 1000, 50, case when g::date < (now() at time zone 'America/Sao_Paulo')::date then 5 else 10 end, 'h'
  from generate_series((now() at time zone 'America/Sao_Paulo')::date - 7, (now() at time zone 'America/Sao_Paulo')::date + 7, interval '1 day') g
 where g::date <> (now() at time zone 'America/Sao_Paulo')::date;

create temp table r374 (what text, v text) on commit drop;
create temp table k374 (k text, id bigint, u uuid) on commit drop;
grant all on r374, k374 to authenticated, anon;
insert into k374 (k, id) select 'a', id from public.monitor_alerts where dedupe_key = 't374:a';
insert into k374 (k, id) select 'b', id from public.monitor_alerts where dedupe_key = 't374:b';
insert into k374 (k, u) select 'setor', id from public.ops_sectors where name = 'Account Manager' and status = 'ativo' limit 1;
create or replace function pg_temp.try(p_sql text) returns text language plpgsql as $$
begin
  execute p_sql;
  return 'ok';
exception when others then
  return sqlstate;
end $$;
grant execute on function pg_temp.try(text) to authenticated, anon;
create or replace function pg_temp.a() returns bigint language sql as $$ select id from k374 where k = 'a' $$;
create or replace function pg_temp.st() returns text language sql as $$
  select status || ':v' || version from public.monitor_alerts where id = (select id from k374 where k = 'a') $$;
grant execute on function pg_temp.a(), pg_temp.st() to authenticated, anon;

set local role authenticated;

-- 1. Visualizador: vê, mas não trata; abrir não muda o estado.
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000374aa04","role":"authenticated"}';
select public.monitor_alert_seen(pg_temp.a());
insert into r374 select 'visualizador abre', pg_temp.st();
insert into r374 values ('visualizador muda estado', pg_temp.try($q$select public.monitor_alert_set_status(pg_temp.a(), 'em_analise', 1)$q$));
insert into r374 values ('visualizador comenta', pg_temp.try($q$select public.monitor_alert_comment(pg_temp.a(), 'oi')$q$));
insert into r374 select 'visualizador detalhe', (d -> 'alert' ->> 'client_name') || ':' || (d ->> 'can_handle')
  from (select public.monitor_alert_detail(pg_temp.a()) d) x;

-- 2. Operador abre: vira "Visualizado". Depois "Em análise" (com a versão certa); versão velha é recusada.
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000374aa03","role":"authenticated"}';
select public.monitor_alert_seen(pg_temp.a());
insert into r374 select 'operador abre', pg_temp.st();
insert into r374 select 'em análise', public.monitor_alert_set_status(pg_temp.a(), 'em_analise', 2)::text;
insert into r374 values ('versão velha', pg_temp.try($q$select public.monitor_alert_set_status(pg_temp.a(), 'aguardando_acao', 2)$q$));
insert into r374 values ('estado inválido', pg_temp.try($q$select public.monitor_alert_set_status(pg_temp.a(), 'resolvido', 3)$q$));
-- 3. Responsável: só quem pode tratar alertas do cliente.
insert into r374 select 'pode ser responsável', string_agg(x ->> 'name', ',' order by x ->> 'name')
  from jsonb_array_elements(public.monitor_alert_assignees(pg_temp.a())) x where x ->> 'name' like '%T374';
insert into r374 values ('responsável sem acesso', pg_temp.try($q$select public.monitor_alert_assign(pg_temp.a(), '00000000-0000-0000-0000-00000374aa06', 3)$q$));
insert into r374 values ('responsável visualizador', pg_temp.try($q$select public.monitor_alert_assign(pg_temp.a(), '00000000-0000-0000-0000-00000374aa04', 3)$q$));
insert into r374 select 'atribui gestor', public.monitor_alert_assign(pg_temp.a(), '00000000-0000-0000-0000-00000374aa02', 3)::text;
-- 4. Comentário e providência.
insert into r374 values ('comentário vazio', pg_temp.try($q$select public.monitor_alert_comment(pg_temp.a(), '   ')$q$));
select public.monitor_alert_comment(pg_temp.a(), 'O cliente mudou a oferta na terça.');
insert into r374 values ('providência curta', pg_temp.try($q$select public.monitor_alert_action(pg_temp.a(), 'ok')$q$));
select public.monitor_alert_action(pg_temp.a(), 'Troquei o criativo principal e reduzi o público.');
-- 5. Alerta de cliente sem acesso.
insert into r374 values ('alerta de outro cliente', pg_temp.try(format($q$select public.monitor_alert_set_status(%s, 'em_analise', 1)$q$, (select id from k374 where k = 'b'))));

-- 6. Virar tarefa: o gestor é da Central, mas sem permissão de criar tarefa (recusado); o admin cria.
--    O responsável do alerta (gestor, ativo na Central) vira o responsável principal da tarefa.
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000374aa01","role":"authenticated"}';
select public.ops_member_save('00000000-0000-0000-0000-00000374aa02', (select u from k374 where k = 'setor'), '{}', 'AM', true, true, '{ops.access}');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000374aa02","role":"authenticated"}';
insert into r374 values ('gestor sem Central cria tarefa',
  pg_temp.try(format($q$select public.monitor_alert_to_task(pg_temp.a(), %L, null, 4)$q$, (select u from k374 where k = 'setor'))));
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000374aa01","role":"authenticated"}';
insert into k374 (k, u) select 'task', public.monitor_alert_to_task(pg_temp.a(), (select u from k374 where k = 'setor'), null, 4);
reset role;
insert into r374 select 'tarefa criada', t.priority || ':' || (t.client_id = '00000000-0000-0000-0000-00000374cc01') || ':' || left(t.title, 40) || ':'
       || coalesce((select string_agg(p.role || '=' || pr.full_name, ',') from public.ops_task_people p join public.profiles pr on pr.id = p.user_id where p.task_id = t.id), 'sem responsável')
       || ':' || (t.description like '%alerta de desempenho nº%')
  from public.ops_tasks t where t.id = (select u from k374 where k = 'task');
insert into r374 select 'alerta ligado à tarefa', (task_id = (select u from k374 where k = 'task'))::text || ':' || status
  from public.monitor_alerts where id = pg_temp.a();
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000374aa01","role":"authenticated"}';
insert into r374 values ('tarefa de novo',
  pg_temp.try(format($q$select public.monitor_alert_to_task(pg_temp.a(), %L, null, 5)$q$, (select u from k374 where k = 'setor'))));
reset role;

-- 7. Avaliação posterior: 3 e 7 dias depois da providência (custo por lead foi de R$ 2,00 para R$ 1,00).
insert into r374 select 'avaliações antes da hora', private.monitor_followups((now() at time zone 'America/Sao_Paulo')::date + 3)::text;
insert into r374 select 'avaliações no dia certo', private.monitor_followups((now() at time zone 'America/Sao_Paulo')::date + 8)::text;
insert into r374 select 'não repete', private.monitor_followups((now() at time zone 'America/Sao_Paulo')::date + 8)::text;
insert into r374 select 'avaliação 3 dias', note from public.monitor_alert_events
 where alert_id = pg_temp.a() and kind = 'avaliacao' and data ->> 'days' = '3';
insert into r374 select 'avaliação 7 dias', to_value || ':' || (data ->> 'pct') from public.monitor_alert_events
 where alert_id = pg_temp.a() and kind = 'avaliacao' and data ->> 'days' = '7';

-- 8. Resolver à mão; depois disso, não muda mais o estado, mas aceita comentário.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000374aa03","role":"authenticated"}';
select public.monitor_alert_resolve(pg_temp.a(), 'Resolvido com a troca do criativo.', 5);
reset role;
insert into r374 select 'resolvido', status || ':' || resolution || ':' || (resolved_by = '00000000-0000-0000-0000-00000374aa03')
  from public.monitor_alerts where id = pg_temp.a();
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000374aa03","role":"authenticated"}';
insert into r374 values ('estado depois de resolvido', pg_temp.try($q$select public.monitor_alert_set_status(pg_temp.a(), 'em_analise', 6)$q$));
insert into r374 values ('comentário depois de resolvido', pg_temp.try($q$select public.monitor_alert_comment(pg_temp.a(), 'Conferido.')$q$));
-- 9. Linha do tempo completa, na ordem.
insert into r374 select 'linha do tempo', string_agg(e ->> 'kind', ',' order by ord)
  from jsonb_array_elements(public.monitor_alert_detail(pg_temp.a()) -> 'events') with ordinality as t(e, ord);
insert into r374 select 'quem fez', string_agg(coalesce(e ->> 'actor_name', 'sistema'), ',' order by ord)
  from jsonb_array_elements(public.monitor_alert_detail(pg_temp.a()) -> 'events') with ordinality as t(e, ord);

-- 10. Lista: cada um vê só os clientes dele; equipe e visitante bloqueados; ninguém escreve direto na tabela.
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000374aa06","role":"authenticated"}';
insert into r374 select 'gestor2 lista', string_agg(x ->> 'campaign_name', ',')
  from jsonb_array_elements(public.monitor_alerts_query(false, 1000)) x where x ->> 'client_name' like '%T374';
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000374aa02","role":"authenticated"}';
insert into r374 select 'gestor lista', string_agg((x ->> 'campaign_name') || ':' || (x ->> 'assignee_name') || ':' || (x ->> 'task_number' is not null), ',')
  from jsonb_array_elements(public.monitor_alerts_query(false, 1000)) x where x ->> 'client_name' like '%T374';
insert into r374 values ('lista grande demais', pg_temp.try($q$select public.monitor_alerts_query(true, 5000)$q$));
insert into r374 values ('escrever direto', pg_temp.try($q$update public.monitor_alerts set status = 'ignorado'$q$));
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000374aa05","role":"authenticated"}';
insert into r374 values ('equipe lista', pg_temp.try($q$select public.monitor_alerts_query()$q$));
insert into r374 values ('equipe detalhe', pg_temp.try($q$select public.monitor_alert_detail(pg_temp.a())$q$));
reset role;
set local role anon;
insert into r374 values ('visitante trata', pg_temp.try($q$select public.monitor_alert_comment(1, 'x')$q$));
reset role;

-- 11. Ignorar (outro alerta, cliente B, pelo gestor2): continua aberto, fora da contagem.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000374aa06","role":"authenticated"}';
insert into r374 select 'ignorar', public.monitor_alert_set_status((select id from k374 where k = 'b'), 'ignorado', 1)::text;
reset role;
insert into r374 select 'ignorado aberto', status || ':' || (resolved_at is null) from public.monitor_alerts where id = (select id from k374 where k = 'b');

do $$
declare
  expected jsonb := jsonb_build_object(
    'visualizador abre', 'novo:v1',
    'visualizador muda estado', '42501',
    'visualizador comenta', '42501',
    'visualizador detalhe', 'Cliente A T374:false',
    'operador abre', 'visualizado:v2',
    'em análise', '3',
    'versão velha', '40001',
    'estado inválido', '22023',
    'pode ser responsável', 'Admin T374,Gestor T374,Operador T374',
    'responsável sem acesso', '22023',
    'responsável visualizador', '22023',
    'atribui gestor', '4',
    'comentário vazio', '22023',
    'providência curta', '22023',
    'alerta de outro cliente', '22023',
    'gestor sem Central cria tarefa', '42501',
    'tarefa criada', 'alta:true:Alerta: Custo por resultado — Leads T374:principal=Gestor T374:true',
    'alerta ligado à tarefa', 'true:em_analise',
    'tarefa de novo', '22023',
    'avaliações antes da hora', '0',
    'avaliações no dia certo', '2',
    'não repete', '0',
    'avaliação 3 dias', 'Avaliação 3 dias após a providência: custo por resultado R$ 1,00 (antes R$ 2,00, -50,0%) — melhorou.',
    'avaliação 7 dias', 'melhorou:-50.0',
    'resolvido', 'resolvido:manual:true',
    'estado depois de resolvido', '22023',
    'comentário depois de resolvido', 'ok',
    'linha do tempo', 'estado,estado,atribuido,comentario,providencia,tarefa,avaliacao,avaliacao,estado,comentario',
    'quem fez', 'Operador T374,Operador T374,Operador T374,Operador T374,Operador T374,Admin T374,sistema,sistema,Operador T374,Operador T374',
    'gestor2 lista', 'Vendas T374',
    'gestor lista', 'Leads T374:Gestor T374:true',
    'lista grande demais', '22023',
    'escrever direto', '42501',
    'equipe lista', '42501',
    'equipe detalhe', '42501',
    'visitante trata', '42501',
    'ignorar', '2',
    'ignorado aberto', 'ignorado:true');
  r record;
begin
  for r in select * from r374 loop
    if expected ->> r.what is distinct from r.v then raise exception 'FALHOU: % = % (esperado %)', r.what, r.v, expected ->> r.what; end if;
  end loop;
  if (select count(*) from r374) <> (select count(*) from jsonb_object_keys(expected)) then
    raise exception 'FALHOU: faltou verificação (%)', (select count(*) from r374);
  end if;
  raise notice 'Etapa 37.4: % verificações OK', (select count(*) from r374);
end $$;

rollback;
