-- =============================================================================
-- Testes da Etapa 36.7 — Central de Operações: painel operacional, visões
-- salvas, busca da Central e resumo pessoal.
-- Rodar inteiro no SQL Editor. Transação desfeita no final: nada fica gravado.
-- =============================================================================
begin;

insert into auth.users (id, instance_id, aud, role, email) values
  ('00000000-0000-0000-0000-00000367aa01', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@t367.local'),
  ('00000000-0000-0000-0000-00000367aa02', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'lider@t367.local'),
  ('00000000-0000-0000-0000-00000367aa03', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'design@t367.local'),
  ('00000000-0000-0000-0000-00000367aa04', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'vendas@t367.local');
update public.profiles set active = true, role = 'admin', full_name = 'Admin T367' where id = '00000000-0000-0000-0000-00000367aa01';
update public.profiles set active = true, role = 'equipe', full_name = 'Lider T367' where id = '00000000-0000-0000-0000-00000367aa02';
update public.profiles set active = true, role = 'equipe', full_name = 'Design T367' where id = '00000000-0000-0000-0000-00000367aa03';
update public.profiles set active = true, role = 'equipe', full_name = 'Vendas T367' where id = '00000000-0000-0000-0000-00000367aa04';

create temp table r367 (what text, v text) on commit drop;
create temp table k367 (k text, id uuid) on commit drop;
grant all on r367, k367 to authenticated, anon;
insert into public.ops_sectors (name, color, position) values ('Setor T367', '#2563EB', 99);
insert into k367 select 'setor', id from public.ops_sectors where name = 'Setor T367';
insert into k367 select 'comercial', id from public.ops_sectors where name = 'Comercial' and status = 'ativo';

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000367aa01","role":"authenticated"}';
select public.ops_member_save('00000000-0000-0000-0000-00000367aa02', (select id from k367 where k = 'setor'), '{}', 'Líder', true, true,
  '{ops.access,ops.tasks.create,ops.tasks.assign,ops.tasks.edit,ops.cards.move,ops.dashboard.view}');
select public.ops_member_save('00000000-0000-0000-0000-00000367aa03', (select id from k367 where k = 'setor'), '{}', 'Designer', true, true,
  '{ops.access,ops.tasks.create,ops.cards.move,ops.dashboard.view}');
select public.ops_member_save('00000000-0000-0000-0000-00000367aa04', (select id from k367 where k = 'comercial'), '{}', 'Vendas', true, true,
  '{ops.access,ops.commercial}');

-- Tarefas do setor de teste (criadas pelo líder).
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000367aa02","role":"authenticated"}';
insert into k367 select 't1', public.ops_task_save(null, null, jsonb_build_object('title', 'Arte atrasada T367', 'sector_id', (select id from k367 where k = 'setor'),
  'due_date', ((now() at time zone 'America/Sao_Paulo')::date - 1)::text, 'people', jsonb_build_object('principal', '00000000-0000-0000-0000-00000367aa03')));
insert into k367 select 't2', public.ops_task_save(null, null, jsonb_build_object('title', 'Sem dono T367', 'sector_id', (select id from k367 where k = 'setor'),
  'due_date', ((now() at time zone 'America/Sao_Paulo')::date)::text));
insert into k367 select 't3', public.ops_task_save(null, null, jsonb_build_object('title', 'Secreta T367', 'sector_id', (select id from k367 where k = 'setor'),
  'visibility', 'participantes', 'due_date', ((now() at time zone 'America/Sao_Paulo')::date + 3)::text,
  'people', jsonb_build_object('principal', '00000000-0000-0000-0000-00000367aa02')));
insert into k367 select 't4', public.ops_task_save(null, null, jsonb_build_object('title', 'Feita T367', 'sector_id', (select id from k367 where k = 'setor'),
  'people', jsonb_build_object('principal', '00000000-0000-0000-0000-00000367aa03')));
insert into k367 select 't5', public.ops_task_save(null, null, jsonb_build_object('title', 'Parada T367', 'sector_id', (select id from k367 where k = 'setor'),
  'people', jsonb_build_object('principal', '00000000-0000-0000-0000-00000367aa03')));
reset role;
-- Simula o tempo: t4 concluída há 2 dias (criada há 5), t5 sem movimento há 10 dias.
set local session_replication_role = replica;
update public.ops_tasks set status_id = (select id from public.ops_statuses where category = 'concluido' order by position limit 1),
  created_at = now() - interval '5 days', completed_at = now() - interval '2 days' where id = (select id from k367 where k = 't4');
update public.ops_tasks set updated_at = now() - interval '10 days' where id = (select id from k367 where k = 't5');
update public.ops_activity set created_at = now() - interval '10 days' where task_id = (select id from k367 where k = 't5');
set local session_replication_role = origin;
set local role authenticated;

-- Painel do líder, filtrado pelo setor de teste.
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000367aa02","role":"authenticated"}';
create temp table d367 on commit drop as select public.ops_dashboard(jsonb_build_object('sector_id', (select id from k367 where k = 'setor'))) as d;
reset role;
insert into r367 select 'cartões do líder', (select concat_ws('|', d #>> '{cards,abertas}', d #>> '{cards,atrasadas}', d #>> '{cards,vencem_hoje}',
  d #>> '{cards,vencem_7d}', d #>> '{cards,sem_responsavel}', d #>> '{cards,paradas}', d #>> '{cards,concluidas}', d #>> '{cards,media_dias}') from d367);
insert into r367 select 'por setor', (select concat_ws('|', jsonb_array_length(d -> 'by_sector'), d #>> '{by_sector,0,name}', d #>> '{by_sector,0,abertas}',
  d #>> '{by_sector,0,atrasadas}', d #>> '{by_sector,0,concluidas}') from d367);
insert into r367 select 'por pessoa', (select string_agg((x ->> 'name') || ':' || (x ->> 'abertas') || '/' || (x ->> 'atrasadas'), ',') from d367, jsonb_array_elements(d -> 'by_person') x);
insert into r367 select 'paradas listadas', (select string_agg((x ->> 'title') || ':' || (x ->> 'dias'), ',') from d367, jsonb_array_elements(d -> 'stalled') x);
insert into r367 select 'leads só para o Comercial', (select (d ? 'leads_overdue')::text || '|' || coalesce(d ->> 'leads_overdue', 'nulo') from d367);
insert into r367 select 'período padrão', (select ((d ->> 'to')::date - (d ->> 'from')::date)::text from d367);
drop table d367;
set local role authenticated;

-- Filtro por pessoa e período.
insert into r367 select 'filtro por pessoa', (select concat_ws('|', d #>> '{cards,abertas}', d #>> '{cards,concluidas}') from (
  select public.ops_dashboard(jsonb_build_object('sector_id', (select id from k367 where k = 'setor'), 'person_id', '00000000-0000-0000-0000-00000367aa03')) d) x);
insert into r367 select 'período sem concluídas', (select d #>> '{cards,concluidas}' from (
  select public.ops_dashboard(jsonb_build_object('sector_id', (select id from k367 where k = 'setor'),
    'from', ((now() at time zone 'America/Sao_Paulo')::date - 60)::text, 'to', ((now() at time zone 'America/Sao_Paulo')::date - 30)::text)) d) x);

-- O designer não vê a tarefa só de participantes: o painel conta só o que ele vê.
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000367aa03","role":"authenticated"}';
insert into r367 select 'painel do designer', (select concat_ws('|', d #>> '{cards,abertas}', d #>> '{cards,vencem_7d}') from (
  select public.ops_dashboard(jsonb_build_object('sector_id', (select id from k367 where k = 'setor'))) d) x);

-- Sem permissão de painel: nada.
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000367aa04","role":"authenticated"}';
insert into r367 select 'painel sem permissão', coalesce(public.ops_dashboard('{}')::text, 'nulo');

-- Busca da Central.
insert into k367 select 'l1', public.ops_lead_save(null, null, '{"company_name":"Empresa Busca T367"}');
insert into r367 select 'busca: comercial acha lead, não tarefa', (select string_agg(x ->> 'kind', ',' order by x ->> 'kind') from jsonb_array_elements(public.ops_search('t367')) x);
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000367aa03","role":"authenticated"}';
insert into r367 select 'busca: designer acha tarefas visíveis', (select string_agg(regexp_replace(x ->> 'title', '^#[0-9]+ ', ''), ',' order by regexp_replace(x ->> 'title', '^#[0-9]+ ', ''))
  from jsonb_array_elements(public.ops_search('T367')) x where x ->> 'kind' = 'tarefa') || '|' ||
  (select count(*) from jsonb_array_elements(public.ops_search('T367')) x where x ->> 'kind' = 'lead');
insert into r367 select 'busca por número', (select (x ->> 'link') = '/operacoes/tarefas?tarefa=' || (select id from k367 where k = 't1')
  from jsonb_array_elements(public.ops_search('#' || (select number from public.ops_tasks where id = (select id from k367 where k = 't1')))) x
  where x ->> 'kind' = 'tarefa')::text;
insert into r367 select 'busca curta ou com curinga', jsonb_array_length(public.ops_search('t')) || '|' || jsonb_array_length(public.ops_search('%%'));
insert into r367 select 'busca sem acento', (select count(*) from jsonb_array_elements(public.ops_search('SECRETA t367')) x) || '|' ||
  (select count(*) from jsonb_array_elements(public.ops_search('árte atrasada')) x);

-- Resumo pessoal.
insert into r367 select 'resumo do designer', (select concat_ws('|', s ->> 'abertas', s ->> 'atrasadas', s ->> 'hoje',
  ((s ->> 'unread')::int = (select count(*) from public.ops_notifications where user_id = '00000000-0000-0000-0000-00000367aa03' and read_at is null))::text)
  from (select public.ops_my_summary() s) x);

-- Visões salvas: só da própria pessoa; mesmo nome atualiza.
select public.ops_saved_view_save('tarefas', ' Minhas atrasadas ', '{"atrasadas":true}');
select public.ops_saved_view_save('tarefas', 'Minhas atrasadas', '{"atrasadas":true,"setor":"x"}');
insert into r367 select 'visão salva e atualizada', (select count(*) || '|' || max(name) || '|' || max(filters ->> 'setor') from public.ops_saved_views where page = 'tarefas');
do $$ begin
  perform public.ops_saved_view_save('financeiro', 'X', '{}');
  insert into r367 values ('tela inválida', 'aceita');
exception when sqlstate '22023' then insert into r367 values ('tela inválida', 'recusada');
end $$;
do $$ begin
  perform public.ops_saved_view_save('tarefas', 'Lista', '[1,2]');
  insert into r367 values ('filtro que não é objeto', 'aceito');
exception when sqlstate '22023' then insert into r367 values ('filtro que não é objeto', 'recusado');
end $$;
do $$ begin
  for i in 2..30 loop perform public.ops_saved_view_save('painel', 'Visão ' || i, '{}'); end loop;
  perform public.ops_saved_view_save('painel', 'Visão 1', '{}');
  perform public.ops_saved_view_save('painel', 'Visão 31', '{}');
  insert into r367 values ('limite de 30 por tela', 'aceito');
exception when sqlstate '22023' then insert into r367 values ('limite de 30 por tela', 'recusado');
end $$;
insert into k367 select 'v1', id from public.ops_saved_views where page = 'tarefas';
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000367aa02","role":"authenticated"}';
insert into r367 select 'outra pessoa vê a visão', (select count(*) from public.ops_saved_views where user_id = '00000000-0000-0000-0000-00000367aa03')::text;
do $$ begin
  perform public.ops_saved_view_delete((select id from k367 where k = 'v1'));
  insert into r367 values ('outra pessoa apaga a visão', 'sim');
exception when sqlstate '22023' then insert into r367 values ('outra pessoa apaga a visão', 'não');
end $$;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000367aa03","role":"authenticated"}';
select public.ops_saved_view_delete((select id from k367 where k = 'v1'));
insert into r367 select 'dono apaga a visão', (select count(*) from public.ops_saved_views where page = 'tarefas')::text;
do $$ begin
  insert into public.ops_saved_views (user_id, page, name) values ('00000000-0000-0000-0000-00000367aa03', 'tarefas', 'Direto');
  insert into r367 values ('gravar direto na tabela', 'sim');
exception when insufficient_privilege then insert into r367 values ('gravar direto na tabela', 'não');
end $$;

-- Visitante (fora da Central): nada.
reset role;
set local role anon;
set local request.jwt.claims = '{}';
do $$ begin
  perform public.ops_search('T367');
  insert into r367 values ('visitante usa a busca', 'sim');
exception when insufficient_privilege then insert into r367 values ('visitante usa a busca', 'não');
end $$;
reset role;

do $$
declare
  expected jsonb := jsonb_build_object(
    'cartões do líder', '4|1|1|1|1|1|1|3.0',
    'por setor', '1|Setor T367|4|1|1',
    'por pessoa', 'Design T367:2/1,Lider T367:1/0',
    'paradas listadas', 'Parada T367:10',
    'leads só para o Comercial', 'true|nulo',
    'período padrão', '29',
    'filtro por pessoa', '2|1',
    'período sem concluídas', '0',
    'painel do designer', '3|0',
    'painel sem permissão', 'nulo',
    'busca: comercial acha lead, não tarefa', 'lead',
    'busca: designer acha tarefas visíveis', 'Arte atrasada T367,Feita T367,Parada T367,Sem dono T367|0',
    'busca por número', 'true',
    'busca curta ou com curinga', '0|0',
    'busca sem acento', '0|1',
    'resumo do designer', '2|1|0|true',
    'visão salva e atualizada', '1|Minhas atrasadas|x',
    'tela inválida', 'recusada',
    'filtro que não é objeto', 'recusado',
    'limite de 30 por tela', 'recusado',
    'outra pessoa vê a visão', '0',
    'outra pessoa apaga a visão', 'não',
    'dono apaga a visão', '0',
    'gravar direto na tabela', 'não',
    'visitante usa a busca', 'não');
  r record;
begin
  for r in select * from r367 loop
    if expected ->> r.what is distinct from r.v then raise exception 'FALHOU: % = % (esperado %)', r.what, r.v, expected ->> r.what; end if;
  end loop;
  if (select count(*) from r367) <> (select count(*) from jsonb_object_keys(expected)) then
    raise exception 'FALHOU: faltou verificação (%)', (select count(*) from r367);
  end if;
  raise notice 'Etapa 36.7: % verificações OK', (select count(*) from r367);
end $$;

rollback;
