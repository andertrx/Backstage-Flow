-- =============================================================================
-- Testes da Etapa 36.2 — Central de Operações: tarefas.
-- Rodar inteiro no SQL Editor. Transação desfeita no final: nada fica gravado.
-- =============================================================================
begin;

insert into auth.users (id, instance_id, aud, role, email) values
  ('00000000-0000-0000-0000-00000362aa01', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@t362.local'),
  ('00000000-0000-0000-0000-00000362aa02', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'designer@t362.local'),
  ('00000000-0000-0000-0000-00000362aa03', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'am@t362.local'),
  ('00000000-0000-0000-0000-00000362aa04', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'copy@t362.local'),
  ('00000000-0000-0000-0000-00000362aa05', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cliente@t362.local');
update public.profiles set active = true, role = 'admin', full_name = 'Admin T362' where id = '00000000-0000-0000-0000-00000362aa01';
update public.profiles set active = true, role = 'equipe', full_name = 'Designer T362' where id = '00000000-0000-0000-0000-00000362aa02';
update public.profiles set active = true, role = 'gestor', full_name = 'AM T362' where id = '00000000-0000-0000-0000-00000362aa03';
update public.profiles set active = true, role = 'equipe', full_name = 'Copy T362' where id = '00000000-0000-0000-0000-00000362aa04';
update public.profiles set active = true, role = 'cliente', full_name = 'Cliente T362' where id = '00000000-0000-0000-0000-00000362aa05';
insert into public.clients (id, name) values ('00000000-0000-0000-0000-00000362ac01', 'Loja T362');

create temp table r362 (what text, v text) on commit drop;
create temp table k362 (k text, id uuid, n integer) on commit drop;
grant all on r362, k362 to authenticated, anon;
insert into k362 (k, id) select 'design', id from public.ops_sectors where name = 'Design' and status = 'ativo';
insert into k362 (k, id) select 'am', id from public.ops_sectors where name = 'Account Manager' and status = 'ativo';
insert into k362 (k, id) select 'copy', id from public.ops_sectors where name = 'Copy' and status = 'ativo';

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000362aa01","role":"authenticated"}';
select public.ops_member_save('00000000-0000-0000-0000-00000362aa02', (select id from k362 where k = 'design'), '{}', 'Designer', true, true,
  '{ops.access,ops.kanban.view,ops.tasks.create,ops.tasks.edit,ops.cards.move}');
select public.ops_member_save('00000000-0000-0000-0000-00000362aa03', (select id from k362 where k = 'am'), '{}', 'AM', true, true,
  '{ops.access,ops.tasks.create,ops.tasks.edit,ops.tasks.assign,ops.tasks.archive,ops.cards.move}');
select public.ops_member_save('00000000-0000-0000-0000-00000362aa04', (select id from k362 where k = 'copy'), '{}', 'Copy', true, true, '{ops.access}');

-- ---------------------------------------------------------------- criar
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000362aa02","role":"authenticated"}';
insert into k362 (k, id) select 't1', public.ops_task_save(null, null, jsonb_build_object(
  'title', 'Criar criativos Black Friday', 'client_id', '00000000-0000-0000-0000-00000362ac01', 'sector_id', (select id from k362 where k = 'design'),
  'priority', 'alta', 'due_date', ((now() at time zone 'America/Sao_Paulo')::date - 1)::text, 'tags', '["Campanha","campanha"," "]'::jsonb,
  'people', jsonb_build_object('principal', '00000000-0000-0000-0000-00000362aa02')));
do $$ begin
  perform public.ops_task_save(null, null, jsonb_build_object('title', 'Outra', 'sector_id', (select id from k362 where k = 'design'),
    'people', jsonb_build_object('principal', '00000000-0000-0000-0000-00000362aa03')));
  insert into r362 values ('designer atribui outra pessoa', 'sim');
exception when insufficient_privilege then insert into r362 values ('designer atribui outra pessoa', 'não');
end $$;
insert into r362 select 'tarefa criada', t.title || '|' || t.status_id || '|' || (select string_agg(lower(g.name), ',') from public.ops_task_tags tt join public.ops_tags g on g.id = tt.tag_id where tt.task_id = t.id)
  from public.ops_tasks t where t.id = (select id from k362 where k = 't1');

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000362aa03","role":"authenticated"}';
insert into k362 (k, id) select 't2', public.ops_task_save(null, null, jsonb_build_object(
  'title', 'Subir campanha', 'client_id', '00000000-0000-0000-0000-00000362ac01', 'sector_id', (select id from k362 where k = 'am'),
  'people', jsonb_build_object('principal', '00000000-0000-0000-0000-00000362aa03', 'adicionais', jsonb_build_array('00000000-0000-0000-0000-00000362aa02'),
                               'observadores', jsonb_build_array('00000000-0000-0000-0000-00000362aa01'))));
insert into r362 select 'pessoas da tarefa', (select string_agg(role, ',' order by role) from public.ops_task_people where task_id = (select id from k362 where k = 't2'));
do $$ begin
  perform public.ops_task_save(null, null, jsonb_build_object('title', 'Com cliente', 'sector_id', (select id from k362 where k = 'am'),
    'people', jsonb_build_object('principal', '00000000-0000-0000-0000-00000362aa05')));
  insert into r362 values ('cliente como responsável', 'aceito');
exception when invalid_parameter_value then insert into r362 values ('cliente como responsável', 'recusado');
end $$;

-- ---------------------------------------------------------------- quem vê
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000362aa04","role":"authenticated"}';
insert into r362 select 'copy vê tarefa do Design', jsonb_array_length(public.ops_task_list('{}'))::text || '|' || coalesce(public.ops_task_get((select id from k362 where k = 't1'))::text, 'nada');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000362aa02","role":"authenticated"}';
insert into r362 select 'designer vê', jsonb_array_length(public.ops_task_list('{}'))::text;
insert into r362 select 'designer ainda sem anúncios', (select count(*) from public.clients)::text || '|' ||
  (select count(*) from jsonb_array_elements(public.ops_directory() -> 'clients') c where c ->> 'name' = 'Loja T362')::text;
insert into r362 select 'filtro atrasadas', jsonb_array_length(public.ops_task_list('{"due":"atrasadas"}'))::text;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000362aa05","role":"authenticated"}';
insert into r362 select 'cliente vê tarefas', jsonb_array_length(public.ops_task_list('{}'))::text || '|' || (select count(*) from public.ops_tasks)::text;

-- ---------------------------------------------------------------- versão, status e dependências
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000362aa02","role":"authenticated"}';
select public.ops_task_set_status((select id from k362 where k = 't1'), 1, 'em_andamento');
do $$ begin
  perform public.ops_task_set_status((select id from k362 where k = 't1'), 1, 'em_revisao');
  insert into r362 values ('versão velha', 'aceita');
exception when serialization_failure then insert into r362 values ('versão velha', 'recusada');
end $$;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000362aa01","role":"authenticated"}';
select public.ops_task_dependency((select id from k362 where k = 't2'), (select id from k362 where k = 't1'), true);
do $$ begin
  perform public.ops_task_dependency((select id from k362 where k = 't1'), (select id from k362 where k = 't2'), true);
  insert into r362 values ('ciclo', 'aceito');
exception when invalid_parameter_value then insert into r362 values ('ciclo', 'recusado');
end $$;
insert into r362 select 'bloqueios', (select string_agg(x ->> 'number' || ':' || (x ->> 'blockers'), ',' order by (x ->> 'number')::int)
  from jsonb_array_elements(public.ops_task_list('{}')) x);
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000362aa03","role":"authenticated"}';
do $$ begin
  perform public.ops_task_set_status((select id from k362 where k = 't2'), 1, 'finalizado');
  insert into r362 values ('finalizar bloqueada', 'aceito');
exception when invalid_parameter_value then insert into r362 values ('finalizar bloqueada', 'recusado');
end $$;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000362aa02","role":"authenticated"}';
select public.ops_task_set_status((select id from k362 where k = 't1'), 2, 'finalizado');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000362aa03","role":"authenticated"}';
select public.ops_task_set_status((select id from k362 where k = 't2'), 1, 'finalizado');
reset role;
insert into r362 select 'concluídas', (select string_agg(status_id || ':' || (completed_at is not null)::text, ',' order by number) from public.ops_tasks
  where id in (select id from k362 where k in ('t1', 't2')));
set local role authenticated;

-- ---------------------------------------------------------------- comentários e menções
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000362aa01","role":"authenticated"}';
select public.ops_comment_add((select id from k362 where k = 't1'), 'Aprovado @Designer', array['00000000-0000-0000-0000-00000362aa02']::uuid[]);
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000362aa02","role":"authenticated"}';
do $$ begin
  perform public.ops_comment_add((select id from k362 where k = 't1'), 'Ver com @copy', array['00000000-0000-0000-0000-00000362aa04']::uuid[]);
  insert into r362 values ('menciona quem não vê', 'aceito');
exception when invalid_parameter_value then insert into r362 values ('menciona quem não vê', 'recusado');
end $$;
insert into r362 select 'menções', (select count(*) from public.ops_mentions m join public.ops_comments c on c.id = m.comment_id
  where c.task_id = (select id from k362 where k = 't1'))::text;
do $$ begin
  perform public.ops_comment_remove((select max(id) from public.ops_comments where task_id = (select id from k362 where k = 't1')));
  insert into r362 values ('retirar comentário dos outros', 'sim');
exception when insufficient_privilege then insert into r362 values ('retirar comentário dos outros', 'não');
end $$;
do $$ begin
  perform public.ops_attachment_add((select id from k362 where k = 't1'), (select id from k362 where k = 't1')::text || '/nao-existe.pdf', 'x.pdf');
  insert into r362 values ('anexo sem arquivo', 'aceito');
exception when invalid_parameter_value then insert into r362 values ('anexo sem arquivo', 'recusado');
end $$;

-- ---------------------------------------------------------------- arquivar
do $$ begin
  perform public.ops_task_archive((select id from k362 where k = 't1'), true);
  insert into r362 values ('designer arquiva', 'sim');
exception when insufficient_privilege then insert into r362 values ('designer arquiva', 'não');
end $$;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000362aa03","role":"authenticated"}';
select public.ops_task_archive((select id from k362 where k = 't2'), true);
insert into r362 select 'arquivada some da lista', jsonb_array_length(public.ops_task_list('{}'))::text || '|' ||
  jsonb_array_length(public.ops_task_list('{"archived":true}'))::text;
do $$ begin
  perform public.ops_task_save((select id from k362 where k = 't2'), 3, jsonb_build_object('title', 'Mudou', 'sector_id', (select id from k362 where k = 'am')));
  insert into r362 values ('editar arquivada', 'aceito');
exception when invalid_parameter_value then insert into r362 values ('editar arquivada', 'recusado');
end $$;

-- ---------------------------------------------------------------- histórico e contagens
reset role;
insert into r362 select 'histórico t1', (select string_agg(action, ',' order by id) from public.ops_activity where task_id = (select id from k362 where k = 't1'));
set local role authenticated;
insert into r362 select 'contagem designer', (select abertas || '|' || concluidas_30d from public.ops_team_counts() where user_id = '00000000-0000-0000-0000-00000362aa02');

-- ---------------------------------------------------------------- status configuráveis (admin)
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000362aa01","role":"authenticated"}';
select public.ops_task_archive((select id from k362 where k = 't2'), false);
select public.ops_task_set_status((select id from k362 where k = 't2'), (select version from public.ops_tasks where id = (select id from k362 where k = 't2')), 'em_revisao');
do $$ begin
  perform public.ops_status_set_active('em_revisao', false, null);
  insert into r362 values ('desativar status em uso sem destino', 'aceito');
exception when invalid_parameter_value then insert into r362 values ('desativar status em uso sem destino', 'recusado');
end $$;
select public.ops_status_set_active('em_revisao', false, 'em_andamento');
insert into r362 select 'tarefa movida pelo sistema', (select status_id from public.ops_tasks where id = (select id from k362 where k = 't2')) || '|' ||
  (select origin from public.ops_activity where task_id = (select id from k362 where k = 't2') order by id desc limit 1);
do $$ begin
  perform public.ops_status_save('finalizado', 'Finalizado', '#10B981', 'aberto');
  insert into r362 values ('mudar grupo de status em uso', 'aceito');
exception when invalid_parameter_value then insert into r362 values ('mudar grupo de status em uso', 'recusado');
end $$;

reset role;
set local role anon;
do $$ begin
  perform 1 from public.ops_tasks;
  insert into r362 values ('visitante lê tarefas', 'sim');
exception when insufficient_privilege then insert into r362 values ('visitante lê tarefas', 'não');
end $$;
reset role;

do $$
declare
  expected jsonb := jsonb_build_object(
    'designer atribui outra pessoa', 'não',
    'tarefa criada', 'Criar criativos Black Friday|nao_iniciado|campanha',
    'pessoas da tarefa', 'adicional,observador,principal',
    'cliente como responsável', 'recusado',
    'copy vê tarefa do Design', '0|nada',
    'designer vê', '2',
    'designer ainda sem anúncios', '0|1',
    'filtro atrasadas', '1',
    'cliente vê tarefas', '0|0',
    'versão velha', 'recusada',
    'ciclo', 'recusado',
    'finalizar bloqueada', 'recusado',
    'bloqueios', '',
    'concluídas', 'finalizado:true,finalizado:true',
    'menciona quem não vê', 'recusado',
    'menções', '1',
    'retirar comentário dos outros', 'não',
    'anexo sem arquivo', 'recusado',
    'designer arquiva', 'não',
    'arquivada some da lista', '0|1',
    'editar arquivada', 'recusado',
    'histórico t1', 'tarefa.criada,tarefa.status,tarefa.status,tarefa.comentario',
    'contagem designer', '0|1',
    'desativar status em uso sem destino', 'recusado',
    'tarefa movida pelo sistema', 'em_andamento|sistema',
    'mudar grupo de status em uso', 'recusado',
    'visitante lê tarefas', 'não');
  r record;
begin
  for r in select * from r362 loop
    if r.what = 'bloqueios' then continue; end if;
    if expected ->> r.what is distinct from r.v then raise exception 'FALHOU: % = % (esperado %)', r.what, r.v, expected ->> r.what; end if;
  end loop;
  if (select v from r362 where what = 'bloqueios') !~ '^\d+:0,\d+:1$' then
    raise exception 'FALHOU: bloqueios = % (esperado t1:0,t2:1)', (select v from r362 where what = 'bloqueios');
  end if;
  if (select count(*) from r362) <> (select count(*) from jsonb_object_keys(expected)) then
    raise exception 'FALHOU: faltou verificação (%)', (select count(*) from r362);
  end if;
  raise notice 'Etapa 36.2: % verificações OK', (select count(*) from r362);
end $$;

rollback;
