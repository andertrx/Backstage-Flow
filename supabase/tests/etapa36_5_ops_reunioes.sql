-- =============================================================================
-- Testes da Etapa 36.5 — Central de Operações: Dailies e reuniões.
-- Rodar inteiro no SQL Editor. Transação desfeita no final: nada fica gravado.
-- =============================================================================
begin;

insert into auth.users (id, instance_id, aud, role, email) values
  ('00000000-0000-0000-0000-00000365aa01', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@t365.local'),
  ('00000000-0000-0000-0000-00000365aa02', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'lider@t365.local'),
  ('00000000-0000-0000-0000-00000365aa03', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'design@t365.local'),
  ('00000000-0000-0000-0000-00000365aa04', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'vendas@t365.local'),
  ('00000000-0000-0000-0000-00000365aa05', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'fora@t365.local');
update public.profiles set active = true, role = 'admin', full_name = 'Admin T365' where id = '00000000-0000-0000-0000-00000365aa01';
update public.profiles set active = true, role = 'equipe', full_name = 'Lider T365' where id = '00000000-0000-0000-0000-00000365aa02';
update public.profiles set active = true, role = 'equipe', full_name = 'Design T365' where id = '00000000-0000-0000-0000-00000365aa03';
update public.profiles set active = true, role = 'equipe', full_name = 'Vendas T365' where id = '00000000-0000-0000-0000-00000365aa04';
update public.profiles set active = true, role = 'equipe', full_name = 'Fora T365' where id = '00000000-0000-0000-0000-00000365aa05';
insert into public.clients (id, name) values ('00000000-0000-0000-0000-00000365ac01', 'Cliente Reunião T365');

create temp table r365 (what text, v text) on commit drop;
create temp table k365 (k text, id uuid) on commit drop;
grant all on r365, k365 to authenticated, anon;
insert into k365 select 'design', id from public.ops_sectors where name = 'Design' and status = 'ativo';
insert into k365 select 'comercial', id from public.ops_sectors where name = 'Comercial' and status = 'ativo';

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000365aa01","role":"authenticated"}';
select public.ops_member_save('00000000-0000-0000-0000-00000365aa02', (select id from k365 where k = 'design'), '{}', 'Líder', true, true,
  '{ops.access,ops.meetings.manage,ops.tasks.create,ops.tasks.assign}');
select public.ops_member_save('00000000-0000-0000-0000-00000365aa03', (select id from k365 where k = 'design'), '{}', 'Designer', true, true,
  '{ops.access,ops.tasks.create}');
select public.ops_member_save('00000000-0000-0000-0000-00000365aa04', (select id from k365 where k = 'comercial'), '{}', 'Vendas', true, true,
  '{ops.access,ops.tasks.create}');
insert into r365 select 'tipos iniciais', (select string_agg(name, ',' order by position) from public.ops_meeting_categories);

-- Sem "Criar reuniões e Dailies" não cria.
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000365aa03","role":"authenticated"}';
do $$ begin
  perform public.ops_meeting_save(null, null, jsonb_build_object('title', 'Daily sem permissão', 'category_id', 'daily', 'starts_at', now()));
  insert into r365 values ('designer cria reunião', 'sim');
exception when insufficient_privilege then insert into r365 values ('designer cria reunião', 'não');
end $$;

-- O líder cria a Daily do Design com o cliente e o designer.
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000365aa02","role":"authenticated"}';
do $$ begin
  perform public.ops_meeting_save(null, null, jsonb_build_object('title', 'Daily com quem não é da Central', 'category_id', 'daily', 'starts_at', now(),
    'people', jsonb_build_array('00000000-0000-0000-0000-00000365aa05')));
  insert into r365 values ('participante fora da Central', 'aceito');
exception when invalid_parameter_value then insert into r365 values ('participante fora da Central', 'recusado');
end $$;
insert into k365 select 'm1', public.ops_meeting_save(null, null, jsonb_build_object('title', 'Daily Design T365', 'category_id', 'daily',
  'starts_at', '2026-09-28T09:00:00-03:00', 'duration_min', 15, 'sector_id', (select id from k365 where k = 'design'),
  'client_id', '00000000-0000-0000-0000-00000365ac01', 'agenda', 'Entregas da semana',
  'people', jsonb_build_array('00000000-0000-0000-0000-00000365aa03')));
insert into k365 select 'm2', public.ops_meeting_save(null, null, jsonb_build_object('title', 'Alinhamento sem setor T365', 'category_id', 'alinhamento',
  'starts_at', '2026-09-29T14:00:00-03:00', 'people', jsonb_build_array('00000000-0000-0000-0000-00000365aa03')));
reset role;
insert into r365 select 'reunião criada', (select status || '|' || duration_min || '|' || (organizer_id = '00000000-0000-0000-0000-00000365aa02')::text
  || '|' || (select count(*) from public.ops_meeting_people where meeting_id = m.id)::text from public.ops_meetings m where id = (select id from k365 where k = 'm1'));
set local role authenticated;

-- Quem vê: participante sim; outro setor não; cliente vê o histórico no cliente.
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000365aa03","role":"authenticated"}';
insert into r365 select 'participante vê', (select count(*) from jsonb_array_elements(public.ops_meeting_list('{"q":"T365"}') -> 'meetings'))::text
  || '|' || (public.ops_meeting_list('{}') -> 'can' ->> 'create');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000365aa04","role":"authenticated"}';
insert into r365 select 'outro setor não vê', (select count(*) from jsonb_array_elements(public.ops_meeting_list('{"q":"T365"}') -> 'meetings'))::text
  || '|' || coalesce(public.ops_meeting_get((select id from k365 where k = 'm1'))::text, 'nada')
  || '|' || (select count(*) from public.ops_meetings where title like '%T365')::text;
do $$ begin
  perform public.ops_meeting_item_add((select id from k365 where k = 'm1'), '{"kind":"pendencia","body":"Intrometido"}');
  insert into r365 values ('fora da reunião registra item', 'sim');
exception when others then insert into r365 values ('fora da reunião registra item', 'não');
end $$;

-- Participante registra itens, mas não altera a reunião.
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000365aa03","role":"authenticated"}';
insert into k365 select 'i1', public.ops_meeting_item_add((select id from k365 where k = 'm1'), jsonb_build_object('kind', 'pendencia',
  'body', 'Refazer banner da campanha', 'owner_id', '00000000-0000-0000-0000-00000365aa03', 'due_date', '2026-10-01'));
insert into k365 select 'i2', public.ops_meeting_item_add((select id from k365 where k = 'm1'), jsonb_build_object('kind', 'pendencia',
  'body', 'Revisar logo', 'owner_id', '00000000-0000-0000-0000-00000365aa02'));
insert into k365 select 'i3', public.ops_meeting_item_add((select id from k365 where k = 'm1'), '{"kind":"decisao","body":"Paleta azul aprovada","due_date":"2026-10-05"}');
insert into k365 select 'i4', public.ops_meeting_item_add((select id from k365 where k = 'm2'), '{"kind":"bloqueio","body":"Sem acesso ao Drive"}');
insert into k365 select 'i5', public.ops_meeting_item_add((select id from k365 where k = 'm1'), '{"kind":"objetivo","body":"Fechar criativos"}');
reset role;
insert into r365 select 'decisão não guarda prazo', coalesce((select due_date::text from public.ops_meeting_items where id = (select id from k365 where k = 'i3')), 'vazio');
set local role authenticated;
do $$ begin
  perform public.ops_meeting_save((select id from k365 where k = 'm1'), 1, jsonb_build_object('title', 'Mudei', 'category_id', 'daily', 'starts_at', now()));
  insert into r365 values ('participante altera a reunião', 'sim');
exception when insufficient_privilege then insert into r365 values ('participante altera a reunião', 'não');
end $$;

-- Pendência → tarefa (mesmas regras de criar tarefa; sem duplicar).
do $$ begin
  perform public.ops_meeting_item_to_task((select id from k365 where k = 'i2'));
  insert into r365 values ('designer dá tarefa a outra pessoa', 'sim');
exception when insufficient_privilege then insert into r365 values ('designer dá tarefa a outra pessoa', 'não');
end $$;
insert into k365 select 't1', public.ops_meeting_item_to_task((select id from k365 where k = 'i1'));
insert into k365 select 't1b', public.ops_meeting_item_to_task((select id from k365 where k = 'i1'));
reset role;
insert into r365 select 'pendência vira tarefa', (select t.title || '|' || s.name || '|' || (t.client_id = '00000000-0000-0000-0000-00000365ac01')::text
  || '|' || t.due_date || '|' || (select p.role from public.ops_task_people p where p.task_id = t.id and p.user_id = '00000000-0000-0000-0000-00000365aa03')
  || '|' || (t.description like 'Criada a partir da reunião #%')::text
  from public.ops_tasks t join public.ops_sectors s on s.id = t.sector_id where t.id = (select id from k365 where k = 't1'));
insert into r365 select 'clique duplo não duplica', ((select id from k365 where k = 't1') = (select id from k365 where k = 't1b'))::text
  || '|' || (select count(*) from public.ops_tasks where title = 'Refazer banner da campanha')::text;
insert into r365 select 'origem no histórico da tarefa', (select count(*) from public.ops_activity where task_id = (select id from k365 where k = 't1')
  and action = 'tarefa.da_reuniao')::text;
set local role authenticated;
do $$ begin
  perform public.ops_meeting_item_to_task((select id from k365 where k = 'i3'));
  insert into r365 values ('decisão vira tarefa', 'sim');
exception when invalid_parameter_value then insert into r365 values ('decisão vira tarefa', 'não');
end $$;
do $$ begin
  perform public.ops_meeting_item_to_task((select id from k365 where k = 'i4'));
  insert into r365 values ('pendência sem setor vira tarefa', 'sim');
exception when invalid_parameter_value then insert into r365 values ('pendência sem setor vira tarefa', 'não');
end $$;
do $$ begin
  perform public.ops_meeting_item_remove((select id from k365 where k = 'i1'));
  insert into r365 values ('retirar item que virou tarefa', 'aceito');
exception when invalid_parameter_value then insert into r365 values ('retirar item que virou tarefa', 'recusado');
end $$;
select public.ops_meeting_item_remove((select id from k365 where k = 'i5'));
insert into r365 select 'ficha da reunião', (select jsonb_array_length(g -> 'items')::text || '|' || (g -> 'can' ->> 'edit') || '|' || (g -> 'can' ->> 'add')
  || '|' || (select (x ->> 'task_title') || '/' || (x ->> 'task_status') from jsonb_array_elements(g -> 'items') x where x ->> 'task_id' is not null)
  from (select public.ops_meeting_get((select id from k365 where k = 'm1')) g) z);

-- Líder: versão velha, presença, ata, cancelar.
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000365aa02","role":"authenticated"}';
select public.ops_meeting_save((select id from k365 where k = 'm1'), 1, jsonb_build_object('title', 'Daily Design T365', 'category_id', 'daily',
  'starts_at', '2026-09-28T09:00:00-03:00', 'duration_min', 20, 'sector_id', (select id from k365 where k = 'design'),
  'client_id', '00000000-0000-0000-0000-00000365ac01', 'agenda', 'Entregas da semana',
  'people', jsonb_build_array('00000000-0000-0000-0000-00000365aa03', '00000000-0000-0000-0000-00000365aa01')));
do $$ begin
  perform public.ops_meeting_record((select id from k365 where k = 'm1'), 1, 'Ata', '{}');
  insert into r365 values ('versão velha', 'aceita');
exception when serialization_failure then insert into r365 values ('versão velha', 'recusada');
end $$;
do $$ begin
  perform public.ops_meeting_record((select id from k365 where k = 'm1'), 2, 'Ata', '{00000000-0000-0000-0000-00000365aa04}');
  insert into r365 values ('presença de quem não participa', 'aceita');
exception when invalid_parameter_value then insert into r365 values ('presença de quem não participa', 'recusada');
end $$;
select public.ops_meeting_record((select id from k365 where k = 'm1'), 2, 'Banner refeito até quarta.', '{00000000-0000-0000-0000-00000365aa03}');
reset role;
insert into r365 select 'reunião registrada', (select m.status || '|' || (m.held_at is not null)::text || '|' || m.notes || '|'
  || (select string_agg(p.user_id::text || '=' || coalesce(p.attended::text, '?'), ',' order by p.user_id) from public.ops_meeting_people p where p.meeting_id = m.id)
  from public.ops_meetings m where m.id = (select id from k365 where k = 'm1'));
set local role authenticated;
do $$ begin
  perform public.ops_meeting_cancel((select id from k365 where k = 'm1'), 3, 'Não precisa mais');
  insert into r365 values ('cancelar reunião já realizada', 'aceito');
exception when invalid_parameter_value then insert into r365 values ('cancelar reunião já realizada', 'recusado');
end $$;
do $$ begin
  perform public.ops_meeting_cancel((select id from k365 where k = 'm2'), 1, '');
  insert into r365 values ('cancelar sem motivo', 'aceito');
exception when invalid_parameter_value then insert into r365 values ('cancelar sem motivo', 'recusado');
end $$;
select public.ops_meeting_cancel((select id from k365 where k = 'm2'), 1, 'Cliente remarcou');
do $$ begin
  perform public.ops_meeting_item_add((select id from k365 where k = 'm2'), '{"kind":"objetivo","body":"Depois de cancelada"}');
  insert into r365 values ('item em reunião cancelada', 'aceito');
exception when invalid_parameter_value then insert into r365 values ('item em reunião cancelada', 'recusado');
end $$;

-- Agenda e histórico com filtros.
insert into r365 select 'filtros', (select string_agg(x ->> 'title', ',') from jsonb_array_elements(public.ops_meeting_list('{"q":"T365","status":"cancelada"}') -> 'meetings') x)
  || '|' || (select string_agg(x ->> 'number', ',') = (select string_agg(number::text, ',' order by starts_at) from public.ops_meetings where title like '%T365')
             from jsonb_array_elements(public.ops_meeting_list('{"q":"T365","order":"asc"}') -> 'meetings') x)::text
  || '|' || (select count(*) from jsonb_array_elements(public.ops_meeting_list('{"q":"T365","from":"2026-09-29","to":"2026-09-29"}') -> 'meetings'))::text
  || '|' || (select count(*) from jsonb_array_elements(public.ops_meeting_list(jsonb_build_object('q', 'T365', 'client_id', '00000000-0000-0000-0000-00000365ac01')) -> 'meetings'))::text
  || '|' || (select x ->> 'tasks_count' || '/' || (x ->> 'attended_count') from jsonb_array_elements(public.ops_meeting_list('{"q":"Daily Design T365"}') -> 'meetings') x);
reset role;
insert into r365 select 'histórico da reunião', (select string_agg(distinct action, ',' order by action) from public.ops_activity where meeting_id = (select id from k365 where k = 'm1'))
  || '|' || (select count(*) from public.ops_activity where client_id = '00000000-0000-0000-0000-00000365ac01' and action = 'reuniao.criada')::text;
set local role authenticated;

-- Configuração só do admin; visitante não lê nada.
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000365aa02","role":"authenticated"}';
do $$ begin
  perform public.ops_meeting_category_save(null, 'Retrospectiva', '#123456', true);
  insert into r365 values ('líder configura tipos', 'sim');
exception when insufficient_privilege then insert into r365 values ('líder configura tipos', 'não');
end $$;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000365aa01","role":"authenticated"}';
select public.ops_meeting_category_save(null, 'Retrospectiva', '#123456', true);
insert into r365 select 'admin configura tipos', (select count(*) from public.ops_meeting_categories)::text;
reset role;
set local role anon;
do $$ begin
  perform 1 from public.ops_meetings;
  insert into r365 values ('visitante lê reuniões', 'sim');
exception when insufficient_privilege then insert into r365 values ('visitante lê reuniões', 'não');
end $$;
reset role;

do $$
declare
  expected jsonb := jsonb_build_object(
    'tipos iniciais', 'Daily,Reunião de setor,Reunião com cliente,Planejamento,Alinhamento interno,Outra',
    'designer cria reunião', 'não',
    'participante fora da Central', 'recusado',
    'reunião criada', 'agendada|15|true|1',
    'participante vê', '2|false',
    'outro setor não vê', '0|nada|0',
    'fora da reunião registra item', 'não',
    'decisão não guarda prazo', 'vazio',
    'participante altera a reunião', 'não',
    'designer dá tarefa a outra pessoa', 'não',
    'pendência vira tarefa', 'Refazer banner da campanha|Design|true|2026-10-01|principal|true',
    'clique duplo não duplica', 'true|1',
    'origem no histórico da tarefa', '1',
    'decisão vira tarefa', 'não',
    'pendência sem setor vira tarefa', 'não',
    'retirar item que virou tarefa', 'recusado',
    'ficha da reunião', '3|false|true|Refazer banner da campanha/Não Iniciado',
    'versão velha', 'recusada',
    'presença de quem não participa', 'recusada',
    'reunião registrada', 'realizada|true|Banner refeito até quarta.|00000000-0000-0000-0000-00000365aa01=false,00000000-0000-0000-0000-00000365aa03=true',
    'cancelar reunião já realizada', 'recusado',
    'cancelar sem motivo', 'recusado',
    'item em reunião cancelada', 'recusado',
    'filtros', 'Alinhamento sem setor T365|true|1|1|1/1',
    'histórico da reunião', 'reuniao.criada,reuniao.editada,reuniao.item,reuniao.item_retirado,reuniao.realizada,reuniao.tarefa_criada|1',
    'líder configura tipos', 'não',
    'admin configura tipos', '7',
    'visitante lê reuniões', 'não');
  r record;
begin
  for r in select * from r365 loop
    if expected ->> r.what is distinct from r.v then raise exception 'FALHOU: % = % (esperado %)', r.what, r.v, expected ->> r.what; end if;
  end loop;
  if (select count(*) from r365) <> (select count(*) from jsonb_object_keys(expected)) then
    raise exception 'FALHOU: faltou verificação (%)', (select count(*) from r365);
  end if;
  raise notice 'Etapa 36.5: % verificações OK', (select count(*) from r365);
end $$;

rollback;
