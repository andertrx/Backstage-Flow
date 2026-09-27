-- =============================================================================
-- Testes da Etapa 36.3 — Central de Operações: onboarding, Account Manager,
-- filas por setor, demandas para vários setores e registro manual.
-- Rodar inteiro no SQL Editor. Transação desfeita no final: nada fica gravado.
-- =============================================================================
begin;

insert into auth.users (id, instance_id, aud, role, email) values
  ('00000000-0000-0000-0000-00000363aa01', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@t363.local'),
  ('00000000-0000-0000-0000-00000363aa02', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'designer@t363.local'),
  ('00000000-0000-0000-0000-00000363aa03', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'am@t363.local'),
  ('00000000-0000-0000-0000-00000363aa04', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'copy@t363.local');
update public.profiles set active = true, role = 'admin', full_name = 'Admin T363' where id = '00000000-0000-0000-0000-00000363aa01';
update public.profiles set active = true, role = 'equipe', full_name = 'Designer T363' where id = '00000000-0000-0000-0000-00000363aa02';
update public.profiles set active = true, role = 'gestor', full_name = 'AM T363' where id = '00000000-0000-0000-0000-00000363aa03';
update public.profiles set active = true, role = 'equipe', full_name = 'Copy T363' where id = '00000000-0000-0000-0000-00000363aa04';
insert into public.clients (id, name) values ('00000000-0000-0000-0000-00000363ac01', 'Loja T363');

create temp table r363 (what text, v text) on commit drop;
create temp table k363 (k text, id uuid, t text) on commit drop;
grant all on r363, k363 to authenticated, anon;
insert into k363 (k, id) select 'design', id from public.ops_sectors where name = 'Design' and status = 'ativo';
insert into k363 (k, id) select 'am', id from public.ops_sectors where name = 'Account Manager' and status = 'ativo';
insert into k363 (k, id) select 'copy', id from public.ops_sectors where name = 'Copy' and status = 'ativo';
insert into k363 (k, id) select 'col_producao', q.id from public.ops_queue_columns q join k363 s on s.k = 'design' and q.sector_id = s.id where q.name = 'Criativos em produção';
insert into k363 (k, id) select 'col_entregue', q.id from public.ops_queue_columns q join k363 s on s.k = 'design' and q.sector_id = s.id where q.name = 'Entregas concluídas';
insert into k363 (k, id) select 'col_copy', q.id from public.ops_queue_columns q join k363 s on s.k = 'copy' and q.sector_id = s.id where q.name = 'Textos em desenvolvimento';

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000363aa01","role":"authenticated"}';
select public.ops_member_save('00000000-0000-0000-0000-00000363aa02', (select id from k363 where k = 'design'), '{}', 'Designer', true, true,
  '{ops.access,ops.tasks.create,ops.tasks.edit,ops.cards.move}');
select public.ops_member_save('00000000-0000-0000-0000-00000363aa03', (select id from k363 where k = 'am'), '{}', 'AM', true, true,
  '{ops.access,ops.tasks.create,ops.tasks.edit,ops.tasks.assign,ops.cards.move}');
select public.ops_member_save('00000000-0000-0000-0000-00000363aa04', (select id from k363 where k = 'copy'), '{}', 'Copy', true, true, '{ops.access}');
insert into r363 select 'filas iniciais', (select count(*) from public.ops_queue_columns q join public.ops_sectors s on s.id = q.sector_id
  where s.name in ('Design', 'Copy', 'Gestão de Tráfego', 'Desenvolvimento (Dev)'))::text || '|' || (select count(*) from public.ops_client_stages)::text;

-- ---------------------------------------------------------------- colocar no fluxo
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000363aa02","role":"authenticated"}';
do $$ begin
  perform public.ops_client_start('00000000-0000-0000-0000-00000363ac01', null, null);
  insert into r363 values ('designer coloca cliente no fluxo', 'sim');
exception when insufficient_privilege then insert into r363 values ('designer coloca cliente no fluxo', 'não');
end $$;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000363aa01","role":"authenticated"}';
select public.ops_client_start('00000000-0000-0000-0000-00000363ac01', 'contrato_pago', '00000000-0000-0000-0000-00000363aa03');
do $$ begin
  perform public.ops_client_start('00000000-0000-0000-0000-00000363ac01', null, null);
  insert into r363 values ('cliente duas vezes no fluxo', 'aceito');
exception when invalid_parameter_value then insert into r363 values ('cliente duas vezes no fluxo', 'recusado');
end $$;

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000363aa03","role":"authenticated"}';
insert into r363 select 'AM se reconhece', ('ops.am' = any(public.ops_my_permissions()))::text || '|' ||
  jsonb_array_length(public.ops_client_board('{"mine":true}') -> 'clients')::text;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000363aa02","role":"authenticated"}';
insert into r363 select 'designer vê a ficha', jsonb_array_length(public.ops_client_board('{}') -> 'clients')::text || '|' ||
  coalesce(public.ops_client_get('00000000-0000-0000-0000-00000363ac01')::text, 'nada');

-- ---------------------------------------------------------------- liberar demanda (Design + Copy, Copy depende do Design)
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000363aa03","role":"authenticated"}';
do $$ begin
  perform public.ops_demand_release(jsonb_build_object('client_id', '00000000-0000-0000-0000-00000363ac01', 'title', 'Ciclo',
    'items', jsonb_build_array(jsonb_build_object('sector_id', (select id from k363 where k = 'design'), 'depends_on', 0))));
  insert into r363 values ('depender da própria linha', 'aceito');
exception when invalid_parameter_value then insert into r363 values ('depender da própria linha', 'recusado');
end $$;
insert into k363 (k, t) select 'demanda', public.ops_demand_release(jsonb_build_object(
  'client_id', '00000000-0000-0000-0000-00000363ac01', 'title', 'Lançamento', 'briefing', 'Campanha de lançamento',
  'client_stage_id', 'contrato_pago', 'mandatory', true,
  'items', jsonb_build_array(
    jsonb_build_object('sector_id', (select id from k363 where k = 'design'), 'principal', '00000000-0000-0000-0000-00000363aa02', 'priority', 'alta'),
    jsonb_build_object('sector_id', (select id from k363 where k = 'copy'), 'principal', '00000000-0000-0000-0000-00000363aa04', 'depends_on', 0))))::text;
insert into k363 (k, id) select 'td', t.id from public.ops_tasks t where t.demand_id = ((select t from k363 where k = 'demanda')::jsonb ->> 'id')::uuid
  and t.sector_id = (select id from k363 where k = 'design');
insert into k363 (k, id) select 'tc', t.id from public.ops_tasks t where t.demand_id = ((select t from k363 where k = 'demanda')::jsonb ->> 'id')::uuid
  and t.sector_id = (select id from k363 where k = 'copy');
reset role;
insert into r363 select 'demanda criou tarefas ligadas', (select count(*) from public.ops_tasks where demand_id = ((select t from k363 where k = 'demanda')::jsonb ->> 'id')::uuid
  and mandatory and client_stage_id = 'contrato_pago')::text || '|' || (select title from public.ops_tasks where id = (select id from k363 where k = 'td')) || '|' ||
  (select count(*) from public.ops_task_deps where task_id = (select id from k363 where k = 'tc') and depends_on_id = (select id from k363 where k = 'td'))::text;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000363aa02","role":"authenticated"}';
select public.ops_task_save(null, null, jsonb_build_object('title', 'Arte extra', 'client_id', '00000000-0000-0000-0000-00000363ac01',
  'sector_id', (select id from k363 where k = 'design'), 'people', jsonb_build_object('principal', '00000000-0000-0000-0000-00000363aa02')));
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000363aa03","role":"authenticated"}';
insert into r363 select 'AM vê as tarefas de todos os setores', jsonb_array_length(public.ops_task_list('{"client_id":"00000000-0000-0000-0000-00000363ac01"}'))::text;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000363aa04","role":"authenticated"}';
insert into r363 select 'copy vê a demanda sem ver o Design', (select string_agg((x ->> 'visible') || ':' || coalesce(x ->> 'title', '-'), ',' order by (x ->> 'number')::int)
  from jsonb_array_elements(public.ops_task_get((select id from k363 where k = 'tc')) -> 'demand' -> 'tasks') x);

-- ---------------------------------------------------------------- regra de avanço
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000363aa03","role":"authenticated"}';
do $$ begin
  perform public.ops_client_stage_move('00000000-0000-0000-0000-00000363ac01', 1, 'onboarding_pendente');
  insert into r363 values ('avançar com obrigatórias abertas', 'aceito');
exception when invalid_parameter_value then insert into r363 values ('avançar com obrigatórias abertas', 'recusado');
end $$;

-- ---------------------------------------------------------------- filas
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000363aa02","role":"authenticated"}';
select public.ops_task_move_queue((select id from k363 where k = 'td'), 1, (select id from k363 where k = 'col_producao'));
reset role;
insert into r363 select 'fila muda o status', (select status_id || '|' || (queue_column_id = (select id from k363 where k = 'col_producao'))::text
  from public.ops_tasks where id = (select id from k363 where k = 'td'));
set local role authenticated;
do $$ begin
  perform public.ops_task_move_queue((select id from k363 where k = 'td'), 2, (select id from k363 where k = 'col_copy'));
  insert into r363 values ('coluna de outro setor', 'aceita');
exception when invalid_parameter_value then insert into r363 values ('coluna de outro setor', 'recusada');
end $$;

-- ---------------------------------------------------------------- avanço automático (só com a regra ligada)
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000363aa01","role":"authenticated"}';
select public.ops_client_stage_save('contrato_pago', 'Contrato Pago', '#10B981', true, true);
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000363aa02","role":"authenticated"}';
select public.ops_task_move_queue((select id from k363 where k = 'td'), 2, (select id from k363 where k = 'col_entregue'));
reset role;
insert into r363 select 'uma obrigatória ainda aberta: não avança', (select stage_id from public.ops_client_ops where client_id = '00000000-0000-0000-0000-00000363ac01');
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000363aa04","role":"authenticated"}';
do $$ begin
  perform public.ops_task_set_status((select id from k363 where k = 'tc'), 1, 'finalizado');
  insert into r363 values ('copy sem "mover" muda status', 'sim');
exception when insufficient_privilege then insert into r363 values ('copy sem "mover" muda status', 'não');
end $$;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000363aa01","role":"authenticated"}';
select public.ops_task_set_status((select id from k363 where k = 'tc'), 1, 'finalizado');
reset role;
insert into r363 select 'avanço automático registrado', (select o.stage_id || '|' || o.version::text from public.ops_client_ops o where o.client_id = '00000000-0000-0000-0000-00000363ac01')
  || '|' || (select origin from public.ops_activity where client_id = '00000000-0000-0000-0000-00000363ac01' and action = 'cliente.etapa' order by id desc limit 1);
set local role authenticated;

-- ---------------------------------------------------------------- avanço e retorno manuais
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000363aa03","role":"authenticated"}';
do $$ begin
  perform public.ops_client_stage_move('00000000-0000-0000-0000-00000363ac01', 1, 'briefing');
  insert into r363 values ('versão velha do cliente', 'aceita');
exception when serialization_failure then insert into r363 values ('versão velha do cliente', 'recusada');
end $$;
select public.ops_client_stage_move('00000000-0000-0000-0000-00000363ac01', 2, 'contrato_pago');
select public.ops_client_stage_move('00000000-0000-0000-0000-00000363ac01', 3, 'briefing');
reset role;
insert into r363 select 'retorno e avanço manual', (select stage_id from public.ops_client_ops where client_id = '00000000-0000-0000-0000-00000363ac01') || '|' ||
  (select after ->> 'regra' from public.ops_activity where client_id = '00000000-0000-0000-0000-00000363ac01' and action = 'cliente.etapa' order by id desc limit 1);
set local role authenticated;

-- ---------------------------------------------------------------- registro manual e ficha
do $$ begin
  perform public.ops_client_note_add(jsonb_build_object('client_id', '00000000-0000-0000-0000-00000363ac01', 'type_id', 'reuniao_cliente',
    'title', 'Reunião de alinhamento', 'happened_at', now()::text));
  insert into r363 values ('AM sem "registrar atividades"', 'registra');
exception when insufficient_privilege then insert into r363 values ('AM sem "registrar atividades"', 'não registra');
end $$;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000363aa01","role":"authenticated"}';
select public.ops_client_note_add(jsonb_build_object('client_id', '00000000-0000-0000-0000-00000363ac01', 'type_id', 'reuniao_cliente',
  'title', 'Reunião de alinhamento', 'happened_at', now()::text, 'responsible_id', '00000000-0000-0000-0000-00000363aa03',
  'next_step', 'Enviar cronograma'));
do $$ begin
  perform public.ops_client_note_add(jsonb_build_object('client_id', '00000000-0000-0000-0000-00000363ac01', 'type_id', 'reuniao_cliente',
    'title', 'Com anexo falso', 'happened_at', now()::text, 'attachment_path', 'cliente-00000000-0000-0000-0000-00000363ac01/nao-existe.pdf'));
  insert into r363 values ('anexo que não chegou', 'aceito');
exception when invalid_parameter_value then insert into r363 values ('anexo que não chegou', 'recusado');
end $$;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000363aa03","role":"authenticated"}';
insert into r363 select 'ficha do AM', (select (s ->> 'concluidas') || '|' || (s ->> 'obrigatorias') || '|' || (s ->> 'obrigatorias_concluidas')
  from (select public.ops_client_get('00000000-0000-0000-0000-00000363ac01') -> 'summary' as s) x) || '|' ||
  jsonb_array_length(public.ops_client_get('00000000-0000-0000-0000-00000363ac01') -> 'notes')::text || '|' ||
  (select count(*) from jsonb_array_elements(public.ops_client_get('00000000-0000-0000-0000-00000363ac01') -> 'timeline') e
    where e ->> 'action' = 'demanda.liberada')::text;
insert into r363 select 'AM lê o histórico do cliente direto', (select count(*) from public.ops_activity
  where client_id = '00000000-0000-0000-0000-00000363ac01' and task_id is null and action = 'cliente.etapa')::text;

-- ---------------------------------------------------------------- configurações
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000363aa01","role":"authenticated"}';
do $$ begin
  perform public.ops_client_stage_set_active('briefing', false, null);
  insert into r363 values ('desativar etapa com cliente sem destino', 'aceito');
exception when invalid_parameter_value then insert into r363 values ('desativar etapa com cliente sem destino', 'recusado');
end $$;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000363aa03","role":"authenticated"}';
do $$ begin
  perform public.ops_queue_column_save(null, (select id from k363 where k = 'design'), 'Nova coluna', '#06B6D4', 'nao_iniciado');
  insert into r363 values ('AM cria coluna de fila', 'sim');
exception when insufficient_privilege then insert into r363 values ('AM cria coluna de fila', 'não');
end $$;

reset role;
set local role anon;
do $$ begin
  perform 1 from public.ops_client_ops;
  insert into r363 values ('visitante lê a operação', 'sim');
exception when insufficient_privilege then insert into r363 values ('visitante lê a operação', 'não');
end $$;
reset role;

do $$
declare
  expected jsonb := jsonb_build_object(
    'filas iniciais', '20|9',
    'designer coloca cliente no fluxo', 'não',
    'cliente duas vezes no fluxo', 'recusado',
    'AM se reconhece', 'true|1',
    'designer vê a ficha', '0|nada',
    'depender da própria linha', 'recusado',
    'demanda criou tarefas ligadas', '2|Lançamento — Design|1',
    'AM vê as tarefas de todos os setores', '3',
    'copy vê a demanda sem ver o Design', 'false:-,true:Lançamento — Copy',
    'avançar com obrigatórias abertas', 'recusado',
    'fila muda o status', 'em_andamento|true',
    'coluna de outro setor', 'recusada',
    'uma obrigatória ainda aberta: não avança', 'contrato_pago',
    'copy sem "mover" muda status', 'não',
    'avanço automático registrado', 'onboarding_pendente|2|sistema',
    'versão velha do cliente', 'recusada',
    'retorno e avanço manual', 'briefing|Avanço manual: nenhuma tarefa obrigatória aberta',
    'AM sem "registrar atividades"', 'não registra',
    'anexo que não chegou', 'recusado',
    'ficha do AM', '2|2|2|1|1',
    'AM lê o histórico do cliente direto', '3',
    'desativar etapa com cliente sem destino', 'recusado',
    'AM cria coluna de fila', 'não',
    'visitante lê a operação', 'não');
  r record;
begin
  for r in select * from r363 loop
    if expected ->> r.what is distinct from r.v then raise exception 'FALHOU: % = % (esperado %)', r.what, r.v, expected ->> r.what; end if;
  end loop;
  if (select count(*) from r363) <> (select count(*) from jsonb_object_keys(expected)) then
    raise exception 'FALHOU: faltou verificação (%)', (select count(*) from r363);
  end if;
  raise notice 'Etapa 36.3: % verificações OK', (select count(*) from r363);
end $$;

rollback;
