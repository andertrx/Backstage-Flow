-- =============================================================================
-- Testes da Etapa 37.5 — Monitoramento: notificações (preferências, avisos no sistema, e-mail,
-- WhatsApp "preparado", limite por hora, horário de silêncio, resumo diário e histórico de envios).
-- Rodar inteiro no SQL Editor. Transação desfeita no final: nada fica gravado.
-- =============================================================================
begin;

insert into auth.users (id, instance_id, aud, role, email) values
  ('00000000-0000-0000-0000-00000375aa01', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@t375.local'),
  ('00000000-0000-0000-0000-00000375aa02', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'gestor@t375.local'),
  ('00000000-0000-0000-0000-00000375aa03', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'operador@t375.local'),
  ('00000000-0000-0000-0000-00000375aa04', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'visual@t375.local'),
  ('00000000-0000-0000-0000-00000375aa05', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'equipe@t375.local'),
  ('00000000-0000-0000-0000-00000375aa06', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'gestor2@t375.local');
update public.profiles set active = true, role = 'admin', full_name = 'Admin T375' where id = '00000000-0000-0000-0000-00000375aa01';
update public.profiles set active = true, role = 'gestor', full_name = 'Gestor T375' where id = '00000000-0000-0000-0000-00000375aa02';
update public.profiles set active = true, role = 'operador', full_name = 'Operador T375' where id = '00000000-0000-0000-0000-00000375aa03';
update public.profiles set active = true, role = 'visualizador', full_name = 'Visual T375' where id = '00000000-0000-0000-0000-00000375aa04';
update public.profiles set active = true, role = 'equipe', full_name = 'Equipe T375' where id = '00000000-0000-0000-0000-00000375aa05';
update public.profiles set active = true, role = 'gestor', full_name = 'Gestor2 T375' where id = '00000000-0000-0000-0000-00000375aa06';

insert into public.clients (id, name) values
  ('00000000-0000-0000-0000-00000375cc01', 'Cliente A T375'),
  ('00000000-0000-0000-0000-00000375cc02', 'Cliente B T375');
insert into public.user_client_access (user_id, client_id) values
  ('00000000-0000-0000-0000-00000375aa02', '00000000-0000-0000-0000-00000375cc01'),
  ('00000000-0000-0000-0000-00000375aa03', '00000000-0000-0000-0000-00000375cc01'),
  ('00000000-0000-0000-0000-00000375aa04', '00000000-0000-0000-0000-00000375cc01'),
  ('00000000-0000-0000-0000-00000375aa06', '00000000-0000-0000-0000-00000375cc02');
insert into public.ad_accounts (id, platform_id, external_id, client_id, name, currency, timezone) values
  ('00000000-0000-0000-0000-00000375ac01', 'meta', 't375a', '00000000-0000-0000-0000-00000375cc01', 'Conta A T375', 'BRL', 'America/Sao_Paulo'),
  ('00000000-0000-0000-0000-00000375ac02', 'meta', 't375b', '00000000-0000-0000-0000-00000375cc02', 'Conta B T375', 'BRL', 'America/Sao_Paulo');
insert into public.campaigns (id, ad_account_id, client_id, platform_id, external_id, name, objective, status) values
  ('00000000-0000-0000-0000-00000375ca01', '00000000-0000-0000-0000-00000375ac01', '00000000-0000-0000-0000-00000375cc01', 'meta', 'c1', 'Leads T375', 'OUTCOME_LEADS', 'ativa'),
  ('00000000-0000-0000-0000-00000375ca02', '00000000-0000-0000-0000-00000375ac02', '00000000-0000-0000-0000-00000375cc02', 'meta', 'c2', 'Vendas T375', 'OUTCOME_LEADS', 'ativa');

create temp table r375 (what text, v text) on commit drop;
create temp table k375 (k text, id bigint) on commit drop;
grant all on r375, k375 to authenticated, anon, service_role;
create or replace function pg_temp.try(p_sql text) returns text language plpgsql as $$
begin
  execute p_sql;
  return 'ok';
exception when others then
  return sqlstate;
end $$;
grant execute on function pg_temp.try(text) to authenticated, anon, service_role;

-- Cria um alerta como o motor faria (alerta + evento "criado", que dispara os avisos).
create or replace function pg_temp.mk(p_key text, p_client integer, p_sev text) returns bigint language plpgsql as $$
declare v bigint;
begin
  insert into public.monitor_alerts (dedupe_key, kind, level, metric, severity, client_id, platform_id, ad_account_id, campaign_id, currency,
                                     current_value, previous_value, variation_pct, period_from, period_to, prev_from, prev_to, explanation)
  values ('t375:' || p_key, 'limite', 'campaign', 'cost_per_result', p_sev, ('00000000-0000-0000-0000-00000375cc0' || p_client)::uuid, 'meta',
          ('00000000-0000-0000-0000-00000375ac0' || p_client)::uuid, ('00000000-0000-0000-0000-00000375ca0' || p_client)::uuid, 'BRL',
          5, 2, 150, current_date - 7, current_date - 1, current_date - 14, current_date - 8, 'Custo por resultado: alta de 150,0%.')
  returning id into v;
  insert into public.monitor_alert_events (alert_id, kind, to_value) values (v, 'criado', p_sev);
  insert into k375 values (p_key, v);
  return v;
end $$;
create or replace function pg_temp.a(p_key text) returns bigint language sql as $$ select id from k375 where k = p_key $$;
grant execute on function pg_temp.a(text) to authenticated, anon, service_role;
-- Quem (das pessoas de teste) recebeu aviso no sistema de um tipo, para um alerta.
create or replace function pg_temp.who(p_alert bigint, p_kind text) returns text language sql as $$
  select coalesce(string_agg(p.full_name, ',' order by p.full_name), '-')
    from public.monitor_notifications n join public.profiles p on p.id = n.user_id
   where n.alert_id is not distinct from p_alert and n.kind = p_kind and p.full_name like '% T375' $$;
create or replace function pg_temp.dv(p_user text, p_alert bigint, p_channel text) returns text language sql as $$
  select coalesce(string_agg(d.status, ',' order by d.id), '-') from public.monitor_deliveries d
   where d.user_id = ('00000000-0000-0000-0000-00000375aa0' || p_user)::uuid and d.alert_id = p_alert and d.channel = p_channel $$;

set local role authenticated;

-- 1. Preferências: padrão, permissões e validações.
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000375aa02","role":"authenticated"}';
insert into r375 select 'padrão gestor', concat_ws(':', p ->> 'is_default', p ->> 'enabled', p ->> 'internal', p ->> 'email', p ->> 'min_severity', p ->> 'mode', p ->> 'digest_hour')
  from public.monitor_prefs_get() p;
insert into r375 values ('gestor vê preferências de outro', pg_temp.try($q$select public.monitor_prefs_get('00000000-0000-0000-0000-00000375aa01')$q$));
insert into r375 values ('gestor muda preferências de outro', pg_temp.try($q$select public.monitor_prefs_save('00000000-0000-0000-0000-00000375aa01', '{"min_severity":"critico","mode":"imediato","digest_hour":8}')$q$));
insert into r375 values ('gestor lista pessoas', pg_temp.try($q$select public.monitor_notify_people()$q$));
insert into r375 values ('gravidade inválida', pg_temp.try($q$select public.monitor_prefs_save(null, '{"min_severity":"x","mode":"imediato","digest_hour":8}')$q$));
insert into r375 values ('modo inválido', pg_temp.try($q$select public.monitor_prefs_save(null, '{"min_severity":"critico","mode":"x","digest_hour":8}')$q$));
insert into r375 values ('hora do resumo inválida', pg_temp.try($q$select public.monitor_prefs_save(null, '{"min_severity":"critico","mode":"resumo","digest_hour":25}')$q$));
insert into r375 values ('silêncio igual', pg_temp.try($q$select public.monitor_prefs_save(null, '{"min_severity":"critico","mode":"imediato","digest_hour":8,"quiet_start":5,"quiet_end":5}')$q$));
insert into r375 values ('silêncio sem fim', pg_temp.try($q$select public.monitor_prefs_save(null, '{"min_severity":"critico","mode":"imediato","digest_hour":8,"quiet_start":5}')$q$));
insert into r375 values ('escrever direto', pg_temp.try($q$insert into public.monitor_notifications (user_id, kind, title, link, dedupe_key) values ('00000000-0000-0000-0000-00000375aa02', 'alerta.novo', 'x', '/monitoramento', 'x')$q$));

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000375aa04","role":"authenticated"}';
insert into r375 select 'padrão visualizador', p ->> 'enabled' from public.monitor_prefs_get() p;

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000375aa05","role":"authenticated"}';
insert into r375 values ('equipe preferências', pg_temp.try($q$select public.monitor_prefs_get()$q$));
insert into r375 values ('equipe avisos', pg_temp.try($q$select public.monitor_notifications_list()$q$));

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000375aa01","role":"authenticated"}';
insert into r375 select 'admin vê de outro', p ->> 'user_name' from public.monitor_prefs_get('00000000-0000-0000-0000-00000375aa02') p;
insert into r375 select 'admin lista pessoas', (public.monitor_notify_people()::text like '%Gestor2 T375%')::text;

-- Clientes: só os liberados para a pessoa (o operador não enxerga o cliente B).
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000375aa03","role":"authenticated"}';
insert into r375 values ('cliente não liberado', pg_temp.try($q$select public.monitor_prefs_save(null, '{"min_severity":"critico","mode":"imediato","digest_hour":8,"client_ids":["00000000-0000-0000-0000-00000375cc02"]}')$q$));
select public.monitor_prefs_save(null, '{"min_severity":"critico","mode":"imediato","digest_hour":8,"client_ids":["00000000-0000-0000-0000-00000375cc01","00000000-0000-0000-0000-00000375cc02"]}');
insert into r375 select 'clientes filtrados', p -> 'client_ids' ->> 0 || ':' || jsonb_array_length(p -> 'client_ids') from public.monitor_prefs_get() p;

-- Gestor2 (cliente B): recebe a partir de "atenção" e também por e-mail.
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000375aa06","role":"authenticated"}';
select public.monitor_prefs_save(null, '{"enabled":true,"internal":true,"email":true,"min_severity":"atencao","mode":"imediato","digest_hour":8}');
insert into r375 select 'gestor2 salvou', concat_ws(':', p ->> 'is_default', p ->> 'email', p ->> 'min_severity') from public.monitor_prefs_get() p;

-- 2. Alerta novo: avisa quem enxerga o cliente e pediu essa gravidade.
reset role;
select pg_temp.mk('A', 1, 'critico');
select pg_temp.mk('B', 2, 'atencao');
insert into r375 values ('avisados alerta A', pg_temp.who(pg_temp.a('A'), 'alerta.novo'));
insert into r375 values ('avisados alerta B', pg_temp.who(pg_temp.a('B'), 'alerta.novo'));
insert into r375 select 'título e link', n.title || ' | ' || (n.link = '/monitoramento?aba=alertas&alerta=' || pg_temp.a('A'))::text
  from public.monitor_notifications n where n.alert_id = pg_temp.a('A') and n.user_id = '00000000-0000-0000-0000-00000375aa02';
insert into r375 values ('e-mail do gestor2', pg_temp.dv('6', pg_temp.a('B'), 'email'));
insert into r375 values ('sem e-mail do gestor', pg_temp.dv('2', pg_temp.a('A'), 'email'));
insert into public.monitor_alert_events (alert_id, kind, to_value) values (pg_temp.a('A'), 'criado', 'critico');
insert into r375 values ('não repete', pg_temp.who(pg_temp.a('A'), 'alerta.novo'));
-- Piorou: só avisa quando chega a crítico.
insert into public.monitor_alert_events (alert_id, kind, from_value, to_value) values (pg_temp.a('B'), 'piorou', 'informativo', 'atencao');
insert into r375 values ('piorou para atenção', pg_temp.who(pg_temp.a('B'), 'alerta.piorou'));
update public.monitor_alerts set severity = 'critico' where id = pg_temp.a('B');
insert into public.monitor_alert_events (alert_id, kind, from_value, to_value) values (pg_temp.a('B'), 'piorou', 'atencao', 'critico');
insert into r375 values ('piorou para crítico', pg_temp.who(pg_temp.a('B'), 'alerta.piorou'));

-- 3. Horário de silêncio: o aviso no sistema chega; o e-mail fica "pulado". WhatsApp só "preparado".
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000375aa06","role":"authenticated"}';
select public.monitor_prefs_save(null, jsonb_build_object('email', true, 'min_severity', 'atencao', 'mode', 'imediato', 'digest_hour', 8,
  'quiet_start', extract(hour from now() at time zone 'America/Sao_Paulo')::int,
  'quiet_end', (extract(hour from now() at time zone 'America/Sao_Paulo')::int + 1) % 24));
reset role;
select pg_temp.mk('C', 2, 'atencao');
insert into r375 values ('silêncio: sistema', pg_temp.dv('6', pg_temp.a('C'), 'interno'));
insert into r375 values ('silêncio: e-mail', pg_temp.dv('6', pg_temp.a('C'), 'email'));
set local role authenticated;
select public.monitor_prefs_save(null, '{"email":true,"whatsapp":true,"min_severity":"atencao","mode":"imediato","digest_hour":8}');
reset role;
select pg_temp.mk('D', 2, 'atencao');
insert into r375 values ('fora do silêncio: e-mail', pg_temp.dv('6', pg_temp.a('D'), 'email'));
insert into r375 values ('whatsapp preparado', pg_temp.dv('6', pg_temp.a('D'), 'whatsapp'));

-- 4. Limite de 10 avisos de alerta por hora (o resto vai para o resumo).
select pg_temp.mk('E' || g, 1, 'critico') from generate_series(1, 10) g;
insert into r375 select 'limite por hora', string_agg(s, ',' order by s) from (
  select d.status || ':' || count(*) s from public.monitor_deliveries d
   where d.user_id = '00000000-0000-0000-0000-00000375aa02' and d.channel = 'interno' and d.kind = 'alerta.novo' group by d.status) x;
insert into r375 select 'motivo do limite', d.reason from public.monitor_deliveries d
 where d.user_id = '00000000-0000-0000-0000-00000375aa02' and d.status = 'pulado';
insert into r375 select 'visualizador sem aviso', count(*)::text from public.monitor_notifications where user_id = '00000000-0000-0000-0000-00000375aa04';

-- 5. Responsável e avaliação posterior.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000375aa03","role":"authenticated"}';
select public.monitor_alert_assign(pg_temp.a('A'), '00000000-0000-0000-0000-00000375aa03', (select version from public.monitor_alerts where id = pg_temp.a('A')));
select public.monitor_alert_assign(pg_temp.a('A'), '00000000-0000-0000-0000-00000375aa02', (select version from public.monitor_alerts where id = pg_temp.a('A')));
select public.monitor_alert_action(pg_temp.a('A'), 'Troquei o criativo.');
reset role;
insert into r375 values ('aviso de responsável', pg_temp.who(pg_temp.a('A'), 'alerta.atribuido'));
insert into public.monitor_alert_events (alert_id, kind, to_value, note, data)
select pg_temp.a('A'), 'avaliacao', 'melhorou', 'Avaliação 3 dias após a providência: melhorou.',
       jsonb_build_object('providencia_id', e.id, 'days', 3)
  from public.monitor_alert_events e where e.alert_id = pg_temp.a('A') and e.kind = 'providencia';
insert into r375 values ('aviso de avaliação', pg_temp.who(pg_temp.a('A'), 'alerta.avaliacao'));

-- 6. Só resumo diário: nada na hora; um resumo por dia, na hora escolhida, sem repetir.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000375aa02","role":"authenticated"}';
select public.monitor_prefs_save(null, '{"min_severity":"critico","mode":"resumo","digest_hour":8}');
reset role;
select pg_temp.mk('F', 1, 'critico');
insert into r375 values ('resumo: nada na hora', pg_temp.dv('2', pg_temp.a('F'), 'interno'));
select private.monitor_digest((((now() at time zone 'America/Sao_Paulo')::date + time '09:30') at time zone 'America/Sao_Paulo'));
insert into r375 values ('resumo fora da hora', pg_temp.who(null, 'resumo.diario'));
select private.monitor_digest((((now() at time zone 'America/Sao_Paulo')::date + time '08:30') at time zone 'America/Sao_Paulo'));
select private.monitor_digest((((now() at time zone 'America/Sao_Paulo')::date + time '08:40') at time zone 'America/Sao_Paulo'));
insert into r375 select 'resumo', count(*) || ' | ' || min(n.title) || ' | ' || min(n.body) from public.monitor_notifications n
 where n.user_id = '00000000-0000-0000-0000-00000375aa02' and n.kind = 'resumo.diario';

-- 7. Meus avisos: lista, não lidos, marcar como lido; histórico de envios.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000375aa02","role":"authenticated"}';
insert into r375 select 'não lidos', (l ->> 'unread') || ':' || jsonb_array_length(l -> 'items') from public.monitor_notifications_list(50) l;
insert into r375 select 'mais recente', l -> 'items' -> 0 ->> 'kind' from public.monitor_notifications_list(5) l;
insert into r375 select 'marcar um', public.monitor_notifications_read(array[(select (public.monitor_notifications_list(1) -> 'items' -> 0 ->> 'id')::bigint)])::text;
insert into r375 select 'marcar todos', public.monitor_notifications_read()::text;
insert into r375 select 'depois de ler', (l ->> 'unread') || ':' || jsonb_array_length(l -> 'items') from public.monitor_notifications_list(50, true) l;
insert into r375 select 'só os meus envios', string_agg(distinct x ->> 'user_name', ',') from jsonb_array_elements(public.monitor_deliveries_list(500)) x;
insert into r375 select 'só as minhas linhas', count(*)::text from public.monitor_notifications where user_id <> '00000000-0000-0000-0000-00000375aa02';
insert into r375 values ('fila de e-mail pelo site', pg_temp.try($q$select * from public.monitor_email_queue(10)$q$));
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000375aa01","role":"authenticated"}';
insert into r375 select 'admin vê todos os envios', (count(distinct x ->> 'user_name') >= 3)::text from jsonb_array_elements(public.monitor_deliveries_list(500)) x;

-- 8. Fila de e-mail (só o servidor): envia, ou tenta 3 vezes e fica "falhou" com o motivo.
reset role;
set local role service_role;
insert into r375 select 'fila', string_agg(q.to_email || ':' || q.subject, ' / ' order by q.id) from public.monitor_email_queue(100) q where q.to_email like '%t375%';
select public.monitor_email_mark(d.id, false, 'O Resend recusou.') from public.monitor_deliveries d
 where d.user_id = '00000000-0000-0000-0000-00000375aa06' and d.channel = 'email' and d.alert_id = pg_temp.a('B') and d.kind = 'alerta.novo';
select public.monitor_email_mark(d.id, false, 'O Resend recusou.') from public.monitor_deliveries d
 where d.user_id = '00000000-0000-0000-0000-00000375aa06' and d.channel = 'email' and d.alert_id = pg_temp.a('B') and d.kind = 'alerta.novo';
insert into r375 select '2 falhas: ainda tenta', d.status || ':' || d.attempts from public.monitor_deliveries d
 where d.user_id = '00000000-0000-0000-0000-00000375aa06' and d.channel = 'email' and d.alert_id = pg_temp.a('B') and d.kind = 'alerta.novo';
select public.monitor_email_mark(d.id, false, 'O Resend recusou.') from public.monitor_deliveries d
 where d.user_id = '00000000-0000-0000-0000-00000375aa06' and d.channel = 'email' and d.alert_id = pg_temp.a('B') and d.kind = 'alerta.novo';
select public.monitor_email_mark(d.id, true) from public.monitor_deliveries d
 where d.user_id = '00000000-0000-0000-0000-00000375aa06' and d.channel = 'email' and d.alert_id = pg_temp.a('D');
reset role;
insert into r375 select '3 falhas', d.status || ':' || d.attempts || ':' || d.reason from public.monitor_deliveries d
 where d.user_id = '00000000-0000-0000-0000-00000375aa06' and d.channel = 'email' and d.alert_id = pg_temp.a('B') and d.kind = 'alerta.novo';
insert into r375 select 'enviado', d.status || ':' || (d.sent_at is not null) from public.monitor_deliveries d
 where d.user_id = '00000000-0000-0000-0000-00000375aa06' and d.channel = 'email' and d.alert_id = pg_temp.a('D');
insert into r375 select 'fila vazia', count(*)::text from public.monitor_email_queue(100) q where q.to_email like '%t375%';

do $$
declare
  expected jsonb := jsonb_build_object(
    'padrão gestor', 'true:true:true:false:critico:imediato:8',
    'gestor vê preferências de outro', '42501',
    'gestor muda preferências de outro', '42501',
    'gestor lista pessoas', '42501',
    'gravidade inválida', '22023',
    'modo inválido', '22023',
    'hora do resumo inválida', '22023',
    'silêncio igual', '22023',
    'silêncio sem fim', '22023',
    'escrever direto', '42501',
    'padrão visualizador', 'false',
    'equipe preferências', '42501',
    'equipe avisos', '42501',
    'admin vê de outro', 'Gestor T375',
    'admin lista pessoas', 'true',
    'cliente não liberado', '22023',
    'clientes filtrados', '00000000-0000-0000-0000-00000375cc01:1',
    'gestor2 salvou', 'false:true:atencao',
    'avisados alerta A', 'Admin T375,Gestor T375,Operador T375',
    'avisados alerta B', 'Gestor2 T375',
    'título e link', 'Alerta crítico: Leads T375 | true',
    'e-mail do gestor2', 'pendente',
    'sem e-mail do gestor', '-',
    'não repete', 'Admin T375,Gestor T375,Operador T375',
    'piorou para atenção', '-',
    'piorou para crítico', 'Admin T375,Gestor2 T375',
    'silêncio: sistema', 'enviado',
    'silêncio: e-mail', 'pulado',
    'fora do silêncio: e-mail', 'pendente',
    'whatsapp preparado', 'preparado',
    'limite por hora', 'enviado:10,pulado:1',
    'motivo do limite', 'Limite de 10 avisos por hora: vai no resumo diário.',
    'visualizador sem aviso', '0',
    'aviso de responsável', 'Gestor T375',
    'aviso de avaliação', 'Gestor T375,Operador T375') || jsonb_build_object(
    'resumo: nada na hora', '-',
    'resumo fora da hora', '-',
    'resumo', '1 | Resumo do monitoramento: 12 alerta(s) aberto(s) | 12 crítico(s), 0 de atenção e 0 informativo(s). Novos nas últimas 24 horas: 12.',
    'não lidos', '13:13',
    'mais recente', 'resumo.diario',
    'marcar um', '1',
    'marcar todos', '12',
    'depois de ler', '0:0',
    'só os meus envios', 'Gestor T375',
    'só as minhas linhas', '0',
    'fila de e-mail pelo site', '42501',
    'admin vê todos os envios', 'true',
    'fila', 'gestor2@t375.local:Alerta de atenção: Vendas T375 / gestor2@t375.local:Alerta piorou para crítico: Vendas T375 / gestor2@t375.local:Alerta de atenção: Vendas T375',
    '2 falhas: ainda tenta', 'pendente:2',
    '3 falhas', 'falhou:3:O Resend recusou.',
    'enviado', 'enviado:true',
    'fila vazia', '1');
  r record;
begin
  for r in select * from r375 loop
    if expected ->> r.what is distinct from r.v then raise exception 'FALHOU: % = % (esperado %)', r.what, r.v, expected ->> r.what; end if;
  end loop;
  if (select count(*) from r375) <> (select count(*) from jsonb_object_keys(expected)) then
    raise exception 'FALHOU: faltou verificação (%)', (select count(*) from r375);
  end if;
  raise notice 'Etapa 37.5: % verificações OK', (select count(*) from r375);
end $$;

rollback;
