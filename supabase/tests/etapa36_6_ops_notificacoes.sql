-- =============================================================================
-- Testes da Etapa 36.6 — Central de Operações: notificações, avisos diários
-- e repetição de tarefas e reuniões.
-- Rodar inteiro no SQL Editor. Transação desfeita no final: nada fica gravado.
-- =============================================================================
begin;

insert into auth.users (id, instance_id, aud, role, email) values
  ('00000000-0000-0000-0000-00000366aa01', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@t366.local'),
  ('00000000-0000-0000-0000-00000366aa02', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'lider@t366.local'),
  ('00000000-0000-0000-0000-00000366aa03', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'design@t366.local'),
  ('00000000-0000-0000-0000-00000366aa04', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'vendas@t366.local');
update public.profiles set active = true, role = 'admin', full_name = 'Admin T366' where id = '00000000-0000-0000-0000-00000366aa01';
update public.profiles set active = true, role = 'equipe', full_name = 'Lider T366' where id = '00000000-0000-0000-0000-00000366aa02';
update public.profiles set active = true, role = 'equipe', full_name = 'Design T366' where id = '00000000-0000-0000-0000-00000366aa03';
update public.profiles set active = true, role = 'equipe', full_name = 'Vendas T366' where id = '00000000-0000-0000-0000-00000366aa04';

create temp table r366 (what text, v text) on commit drop;
create temp table k366 (k text, id uuid) on commit drop;
grant all on r366, k366 to authenticated, anon;
insert into k366 select 'design', id from public.ops_sectors where name = 'Design' and status = 'ativo';
insert into k366 select 'comercial', id from public.ops_sectors where name = 'Comercial' and status = 'ativo';
insert into k366 values ('lider', '00000000-0000-0000-0000-00000366aa02'), ('designer', '00000000-0000-0000-0000-00000366aa03'),
                        ('vendas', '00000000-0000-0000-0000-00000366aa04');
create temp view n366 as select n.*, (select k from k366 where id = n.user_id and k in ('lider', 'designer', 'vendas')) as who
  from public.ops_notifications n where n.user_id in (select id from k366 where k in ('lider', 'designer', 'vendas'));
grant select on n366 to authenticated;

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000366aa01","role":"authenticated"}';
select public.ops_member_save('00000000-0000-0000-0000-00000366aa02', (select id from k366 where k = 'design'), '{}', 'Líder', true, true,
  '{ops.access,ops.tasks.create,ops.tasks.assign,ops.tasks.edit,ops.cards.move,ops.meetings.manage}');
select public.ops_member_save('00000000-0000-0000-0000-00000366aa03', (select id from k366 where k = 'design'), '{}', 'Designer', true, true,
  '{ops.access,ops.tasks.create,ops.cards.move}');
select public.ops_member_save('00000000-0000-0000-0000-00000366aa04', (select id from k366 where k = 'comercial'), '{}', 'Vendas', true, true,
  '{ops.access,ops.commercial}');

-- Tarefa atribuída: avisa o responsável, não quem criou; editar não repete o aviso.
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000366aa02","role":"authenticated"}';
insert into k366 select 't1', public.ops_task_save(null, null, jsonb_build_object('title', 'Banner T366', 'sector_id', (select id from k366 where k = 'design'),
  'people', jsonb_build_object('principal', '00000000-0000-0000-0000-00000366aa03')));
select public.ops_task_save((select id from k366 where k = 't1'), 1, jsonb_build_object('title', 'Banner T366 v2', 'sector_id', (select id from k366 where k = 'design'),
  'people', jsonb_build_object('principal', '00000000-0000-0000-0000-00000366aa03')));
reset role;
insert into r366 select 'tarefa atribuída', (select string_agg(who || ':' || kind, ',' order by who) from n366)
  || '|' || (select title from n366 where kind = 'tarefa.atribuida');
set local role authenticated;

-- Menção avisa só como menção; comentário avisa as pessoas da tarefa.
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000366aa03","role":"authenticated"}';
select public.ops_comment_add((select id from k366 where k = 't1'), 'Pode revisar?', '{00000000-0000-0000-0000-00000366aa02}');
set constraints all immediate;
set constraints all deferred;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000366aa02","role":"authenticated"}';
select public.ops_comment_add((select id from k366 where k = 't1'), 'Revisado, pode seguir.', '{}');
set constraints all immediate;
set constraints all deferred;
reset role;
insert into r366 select 'menção e comentário', (select string_agg(who || ':' || kind, ',' order by id) from n366 where kind in ('tarefa.mencao', 'tarefa.comentario'));
set local role authenticated;

-- Preferência: quem desliga "comentário" não recebe mais.
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000366aa03","role":"authenticated"}';
select public.ops_notification_prefs_save('{tarefa.comentario}');
do $$ begin
  perform public.ops_notification_prefs_save('{inventado}');
  insert into r366 values ('tipo desconhecido nas preferências', 'aceito');
exception when invalid_parameter_value then insert into r366 values ('tipo desconhecido nas preferências', 'recusado');
end $$;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000366aa02","role":"authenticated"}';
select public.ops_comment_add((select id from k366 where k = 't1'), 'Mais um detalhe.', '{}');
set constraints all immediate;
set constraints all deferred;
reset role;
insert into r366 select 'tipo desligado não chega', (select count(*) from n366 where who = 'designer' and kind = 'tarefa.comentario')::text;
set local role authenticated;

-- Concluída: avisa quem criou.
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000366aa03","role":"authenticated"}';
select public.ops_task_set_status((select id from k366 where k = 't1'), (select version from public.ops_tasks where id = (select id from k366 where k = 't1')), 'finalizado');
reset role;
insert into r366 select 'tarefa concluída', (select string_agg(who, ',') from n366 where kind = 'tarefa.concluida');
set local role authenticated;

-- Reunião: convite e pendência para a pessoa.
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000366aa02","role":"authenticated"}';
insert into k366 select 'm1', public.ops_meeting_save(null, null, jsonb_build_object('title', 'Daily T366', 'category_id', 'daily',
  'starts_at', ((now() at time zone 'America/Sao_Paulo')::date + time '23:30') at time zone 'America/Sao_Paulo', 'duration_min', 15,
  'sector_id', (select id from k366 where k = 'design'), 'people', jsonb_build_array('00000000-0000-0000-0000-00000366aa03')));
select public.ops_meeting_item_add((select id from k366 where k = 'm1'), jsonb_build_object('kind', 'pendencia', 'body', 'Enviar arte',
  'owner_id', '00000000-0000-0000-0000-00000366aa03'));
reset role;
insert into r366 select 'reunião avisa participante', (select string_agg(who || ':' || kind, ',' order by id) from n366 where kind like 'reuniao.%');
set local role authenticated;

-- Lead: avisa quem tem "Comercial"; quem não tem não recebe dados do lead.
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000366aa01","role":"authenticated"}';
select public.ops_lead_save(null, null, '{"company_name":"Loja Lead T366","owner_id":"00000000-0000-0000-0000-00000366aa04"}');
select public.ops_lead_save(null, null, '{"company_name":"Outra Lead T366","owner_id":"00000000-0000-0000-0000-00000366aa03"}');
reset role;
insert into r366 select 'lead só para o Comercial', (select string_agg(who, ',') from n366 where kind = 'lead.responsavel');

-- Avisos do dia (pg_cron): prazo amanhã, atrasada e reunião hoje, sem repetir.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000366aa02","role":"authenticated"}';
insert into k366 select 't2', public.ops_task_save(null, null, jsonb_build_object('title', 'Prazo amanhã T366', 'sector_id', (select id from k366 where k = 'design'),
  'due_date', (now() at time zone 'America/Sao_Paulo')::date + 1, 'people', jsonb_build_object('principal', '00000000-0000-0000-0000-00000366aa03')));
insert into k366 select 't3', public.ops_task_save(null, null, jsonb_build_object('title', 'Atrasada T366', 'sector_id', (select id from k366 where k = 'design'),
  'due_date', (now() at time zone 'America/Sao_Paulo')::date - 2, 'people', jsonb_build_object('principal', '00000000-0000-0000-0000-00000366aa03')));
reset role;
-- O pg_cron roda sem ninguém logado.
set local request.jwt.claims = '{}';
create temp table d366 on commit drop as select private.ops_notify_daily() as n1;
insert into r366 select 'avisos do dia', (select string_agg(who || ':' || kind, ',' order by who, kind) from n366 where kind in ('tarefa.prazo', 'tarefa.atrasada', 'reuniao.hoje'))
  || '|' || (private.ops_notify_daily())::text;

-- Sino: contar, marcar como lida, e ninguém vê o sino dos outros.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000366aa03","role":"authenticated"}';
insert into r366 select 'sino', public.ops_notifications_unread()::text || '|' || jsonb_array_length(public.ops_notifications_list(true, 'tarefa.atribuida', 30) -> 'items')::text;
insert into r366 select 'marcar como lida', public.ops_notifications_read((select array_agg(id) from public.ops_notifications where kind = 'tarefa.atribuida'))::text;
insert into r366 select 'não lidas depois', public.ops_notifications_unread()::text;
insert into r366 select 'marcar todas', public.ops_notifications_read(null)::text;
insert into r366 select 'nenhuma não lida', public.ops_notifications_unread()::text;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000366aa02","role":"authenticated"}';
insert into r366 select 'sino é pessoal', (select count(*) from public.ops_notifications where user_id <> '00000000-0000-0000-0000-00000366aa02')::text;

-- Repetição de tarefa
do $$ begin
  perform public.ops_recurrence_save(jsonb_build_object('kind', 'tarefa', 'source_id', (select id from k366 where k = 't2'), 'frequency', 'diaria',
    'start_date', (now() at time zone 'America/Sao_Paulo')::date));
  insert into r366 values ('repetição começando hoje', 'aceita');
exception when invalid_parameter_value then insert into r366 values ('repetição começando hoje', 'recusada');
end $$;
do $$ begin
  perform public.ops_recurrence_save(jsonb_build_object('kind', 'tarefa', 'source_id', (select id from k366 where k = 't2'), 'frequency', 'semanal',
    'start_date', (now() at time zone 'America/Sao_Paulo')::date + 1));
  insert into r366 values ('semanal sem dias', 'aceita');
exception when invalid_parameter_value then insert into r366 values ('semanal sem dias', 'recusada');
end $$;
insert into k366 select 'rec1', public.ops_recurrence_save(jsonb_build_object('kind', 'tarefa', 'source_id', (select id from k366 where k = 't2'),
  'frequency', 'diaria', 'start_date', (now() at time zone 'America/Sao_Paulo')::date + 1));
do $$ begin
  perform public.ops_recurrence_save(jsonb_build_object('kind', 'tarefa', 'source_id', (select id from k366 where k = 't2'), 'frequency', 'diaria',
    'start_date', (now() at time zone 'America/Sao_Paulo')::date + 1));
  insert into r366 values ('segunda repetição da mesma tarefa', 'aceita');
exception when invalid_parameter_value then insert into r366 values ('segunda repetição da mesma tarefa', 'recusada');
end $$;
reset role;
set local request.jwt.claims = '{}';
-- Simula a chegada do dia: a repetição passa a valer hoje.
update public.ops_recurrences set start_date = (now() at time zone 'America/Sao_Paulo')::date where id = (select id from k366 where k = 'rec1');
create temp table g366 on commit drop as select private.ops_recurrence_generate((select id from k366 where k = 'rec1')) as n;
insert into r366 select 'ocorrência gerada', (select n from g366)::text || '|' || private.ops_recurrence_generate((select id from k366 where k = 'rec1'))::text
  || '|' || (select t.title || '|' || (t.occurrence_date = (now() at time zone 'America/Sao_Paulo')::date)::text || '|'
             || (t.due_date - t.start_date)::text || '|' || t.status_id || '|'
             || (select p.role from public.ops_task_people p where p.task_id = t.id and p.user_id = '00000000-0000-0000-0000-00000366aa03')
             || '|' || (select origin from public.ops_activity a where a.task_id = t.id and a.action = 'tarefa.criada')
             from public.ops_tasks t where t.recurrence_id = (select id from k366 where k = 'rec1'));
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000366aa02","role":"authenticated"}';
do $$ begin
  perform public.ops_recurrence_save(jsonb_build_object('kind', 'tarefa',
    'source_id', (select id from public.ops_tasks where recurrence_id = (select id from k366 where k = 'rec1')), 'frequency', 'diaria',
    'start_date', (now() at time zone 'America/Sao_Paulo')::date + 1));
  insert into r366 values ('repetir uma ocorrência', 'aceito');
exception when invalid_parameter_value then insert into r366 values ('repetir uma ocorrência', 'recusado');
end $$;
insert into r366 select 'ocorrência mostra a repetição', (select (x ->> 'is_source') || '|' || (x ->> 'frequency') || '|' || (x ->> 'occurrences')
  from (select public.ops_recurrence_for('tarefa', (select id from public.ops_tasks where recurrence_id = (select id from k366 where k = 'rec1'))) x) y);

-- Parar: o designer (não criou, sem editar tarefas) não para; o líder para.
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000366aa03","role":"authenticated"}';
do $$ begin
  perform public.ops_recurrence_stop((select id from k366 where k = 'rec1'));
  insert into r366 values ('designer para a repetição', 'sim');
exception when insufficient_privilege then insert into r366 values ('designer para a repetição', 'não');
end $$;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000366aa02","role":"authenticated"}';
select public.ops_recurrence_stop((select id from k366 where k = 'rec1'));
reset role;
insert into r366 select 'repetição parada', (select active::text || '|' || stop_reason from public.ops_recurrences where id = (select id from k366 where k = 'rec1'))
  || '|' || private.ops_recurrence_generate((select id from k366 where k = 'rec1'))::text
  || '|' || (select count(*) from public.ops_activity where task_id = (select id from k366 where k = 't2') and action in ('tarefa.repeticao', 'tarefa.repeticao_parada'))::text;

-- Repetição de reunião: aparece na agenda com 7 dias de antecedência, sem duplicar.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000366aa02","role":"authenticated"}';
insert into k366 select 'rec2', public.ops_recurrence_save(jsonb_build_object('kind', 'reuniao', 'source_id', (select id from k366 where k = 'm1'),
  'frequency', 'diaria', 'start_date', (now() at time zone 'America/Sao_Paulo')::date + 1));
reset role;
insert into r366 select 'reuniões repetidas', (select count(*) from public.ops_meetings where recurrence_id = (select id from k366 where k = 'rec2'))::text
  || '|' || private.ops_recurrence_generate((select id from k366 where k = 'rec2'))::text
  || '|' || (select bool_and(to_char(starts_at at time zone 'America/Sao_Paulo', 'HH24:MI') = '23:30') from public.ops_meetings where recurrence_id = (select id from k366 where k = 'rec2'))::text
  || '|' || (select count(*) from public.ops_meeting_people p join public.ops_meetings m on m.id = p.meeting_id where m.recurrence_id = (select id from k366 where k = 'rec2'))::text;

-- Quem criou perde a permissão: a repetição para sozinha.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000366aa02","role":"authenticated"}';
insert into k366 select 'rec3', public.ops_recurrence_save(jsonb_build_object('kind', 'tarefa', 'source_id', (select id from k366 where k = 't3'),
  'frequency', 'semanal', 'weekdays', jsonb_build_array(0, 1, 2, 3, 4, 5, 6), 'start_date', (now() at time zone 'America/Sao_Paulo')::date + 1));
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000366aa01","role":"authenticated"}';
select public.ops_member_save('00000000-0000-0000-0000-00000366aa02', (select id from k366 where k = 'design'), '{}', 'Líder', true, true, '{ops.access}');
reset role;
set local request.jwt.claims = '{}';
update public.ops_recurrences set start_date = (now() at time zone 'America/Sao_Paulo')::date where id = (select id from k366 where k = 'rec3');
insert into r366 select 'gera sem permissão', private.ops_recurrence_generate((select id from k366 where k = 'rec3'))::text;
insert into r366 select 'para sem permissão', (select active::text || '|' || stop_reason from public.ops_recurrences where id = (select id from k366 where k = 'rec3'));

set local role anon;
do $$ begin
  perform 1 from public.ops_notifications;
  insert into r366 values ('visitante lê notificações', 'sim');
exception when insufficient_privilege then insert into r366 values ('visitante lê notificações', 'não');
end $$;
reset role;

do $$
declare
  expected jsonb := jsonb_build_object(
    'tarefa atribuída', 'designer:tarefa.atribuida|Você entrou na tarefa #' || (select number from public.ops_tasks where id = (select id from k366 where k = 't1')) || ': Banner T366',
    'menção e comentário', 'lider:tarefa.mencao,designer:tarefa.comentario',
    'tipo desconhecido nas preferências', 'recusado',
    'tipo desligado não chega', '1',
    'tarefa concluída', 'lider',
    'reunião avisa participante', 'designer:reuniao.convite,designer:reuniao.item',
    'lead só para o Comercial', 'vendas',
    'avisos do dia', 'designer:reuniao.hoje,designer:tarefa.atrasada,designer:tarefa.prazo,lider:reuniao.hoje|0',
    'sino', '9|3',
    'marcar como lida', '3',
    'não lidas depois', '6',
    'marcar todas', '6',
    'nenhuma não lida', '0',
    'sino é pessoal', '0',
    'repetição começando hoje', 'recusada',
    'semanal sem dias', 'recusada',
    'segunda repetição da mesma tarefa', 'recusada',
    'ocorrência gerada', '1|0|Prazo amanhã T366|true|0|nao_iniciado|principal|sistema',
    'repetir uma ocorrência', 'recusado',
    'ocorrência mostra a repetição', 'false|diaria|1',
    'designer para a repetição', 'não',
    'repetição parada', 'false|Parada por Lider T366.|0|2',
    'reuniões repetidas', '6|0|true|6',
    'gera sem permissão', '0',
    'para sem permissão', 'false|Parada automaticamente: quem criou a repetição não tem mais permissão na Central.',
    'visitante lê notificações', 'não');
  r record;
begin
  for r in select * from r366 loop
    if expected ->> r.what is distinct from r.v then raise exception 'FALHOU: % = % (esperado %)', r.what, r.v, expected ->> r.what; end if;
  end loop;
  if (select count(*) from r366) <> (select count(*) from jsonb_object_keys(expected)) then
    raise exception 'FALHOU: faltou verificação (%)', (select count(*) from r366);
  end if;
  raise notice 'Etapa 36.6: % verificações OK', (select count(*) from r366);
end $$;

rollback;
