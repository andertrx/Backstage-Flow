-- =============================================================================
-- Testes da Etapa 36.1 — Central de Operações: setores, equipe, permissões e
-- papel "equipe" (sem acesso aos módulos de anúncios).
-- Rodar inteiro no SQL Editor. Transação desfeita no final: nada fica gravado.
-- =============================================================================
begin;

insert into auth.users (id, instance_id, aud, role, email) values
  ('00000000-0000-0000-0000-00000361aa01', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@t361.local'),
  ('00000000-0000-0000-0000-00000361aa02', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'designer@t361.local'),
  ('00000000-0000-0000-0000-00000361aa03', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'operador@t361.local'),
  ('00000000-0000-0000-0000-00000361aa04', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cliente@t361.local');
update public.profiles set active = true, role = 'admin', full_name = 'Admin T361' where id = '00000000-0000-0000-0000-00000361aa01';
update public.profiles set active = true, role = 'equipe', full_name = 'Designer T361' where id = '00000000-0000-0000-0000-00000361aa02';
update public.profiles set active = true, role = 'operador', full_name = 'Operador T361' where id = '00000000-0000-0000-0000-00000361aa03';
update public.profiles set active = true, role = 'cliente', full_name = 'Cliente T361' where id = '00000000-0000-0000-0000-00000361aa04';
insert into public.clients (id, name) values ('00000000-0000-0000-0000-00000361ac01', 'Cliente T361');
-- Mesmo liberado por engano, o papel equipe não vê o cliente pelos anúncios.
insert into public.user_client_access (user_id, client_id) values
  ('00000000-0000-0000-0000-00000361aa02', '00000000-0000-0000-0000-00000361ac01'),
  ('00000000-0000-0000-0000-00000361aa03', '00000000-0000-0000-0000-00000361ac01');

create temp table r361 (what text, v text) on commit drop;
create temp table ids361 (k text, id uuid) on commit drop;
grant all on r361, ids361 to authenticated, anon;
insert into ids361 select 'design', id from public.ops_sectors where name = 'Design' and status = 'ativo';
insert into ids361 select 'social', id from public.ops_sectors where name = 'Social Media' and status = 'ativo';
insert into ids361 select 'am', id from public.ops_sectors where name = 'Account Manager' and status = 'ativo';

-- ---------------------------------------------------------------- papel equipe x anúncios
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000361aa02","role":"authenticated"}';
insert into r361 select 'equipe vê cliente (anúncios)',
  (select count(*) from public.clients)::text || '|' || private.can_view_client('00000000-0000-0000-0000-00000361ac01')::text;
insert into r361 select 'equipe fora da Central', private.ops_can('ops.access')::text || '|' || (select count(*) from public.ops_sectors)::text
  || '|' || cardinality(public.ops_my_permissions())::text;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000361aa03","role":"authenticated"}';
insert into r361 select 'operador vê cliente (anúncios)', (select count(*) from public.clients)::text;
do $$ begin
  perform public.ops_sector_save(null, 'Setor Hacker', '#7C3AED');
  insert into r361 values ('operador cria setor', 'sim');
exception when insufficient_privilege then insert into r361 values ('operador cria setor', 'não');
end $$;

-- ---------------------------------------------------------------- admin configura
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000361aa01","role":"authenticated"}';
insert into r361 select 'setores iniciais', (select count(*) from public.ops_sectors where status = 'ativo' and name in
  ('Comercial','Atendimento','Account Manager','Operacional','Design','Copy','Gestão de Tráfego','Social Media','Desenvolvimento (Dev)','Áudio e Vídeo'))::text;
do $$ begin
  perform public.ops_sector_save(null, ' design ', '#7C3AED');
  insert into r361 values ('nome repetido', 'aceito');
exception when invalid_parameter_value then insert into r361 values ('nome repetido', 'recusado');
end $$;
do $$ begin
  perform public.ops_member_save('00000000-0000-0000-0000-00000361aa04', (select id from ids361 where k = 'design'), '{}', null, true, true, '{ops.access}');
  insert into r361 values ('cliente na Central', 'aceito');
exception when invalid_parameter_value then insert into r361 values ('cliente na Central', 'recusado');
end $$;
select public.ops_member_save('00000000-0000-0000-0000-00000361aa02', (select id from ids361 where k = 'design'),
  array[(select id from ids361 where k = 'social'), (select id from ids361 where k = 'design')], 'Designer', true, true,
  '{ops.access,ops.kanban.view,ops.tasks.create}');
insert into r361 select 'membro salvo', (select string_agg(case when s.is_primary then 'P:' else 'S:' end || x.name, ',' order by s.is_primary desc)
  from public.ops_member_sectors s join public.ops_sectors x on x.id = s.sector_id where s.user_id = '00000000-0000-0000-0000-00000361aa02');
do $$ begin
  perform public.ops_member_save('00000000-0000-0000-0000-00000361aa02', (select id from ids361 where k = 'design'), '{}', null, true, true, '{ops.nao_existe}');
  insert into r361 values ('permissão inventada', 'aceita');
exception when check_violation then insert into r361 values ('permissão inventada', 'recusada');
end $$;

-- ---------------------------------------------------------------- designer dentro da Central
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000361aa02","role":"authenticated"}';
insert into r361 select 'designer na Central', private.ops_can('ops.access')::text || '|' || private.ops_can('ops.tasks.create')::text
  || '|' || private.ops_can('ops.commercial')::text || '|' || (select count(*) from public.ops_sectors)::text;
insert into r361 select 'designer vê equipe sem permissões', (select count(*) || '|' || count(permissions) from public.ops_team());
insert into r361 select 'designer continua sem anúncios', (select count(*) from public.clients)::text;
do $$ begin
  perform public.ops_member_save('00000000-0000-0000-0000-00000361aa02', (select id from ids361 where k = 'design'), '{}', null, true, true,
    '{ops.access,ops.commercial}');
  insert into r361 values ('designer se dá permissão', 'sim');
exception when insufficient_privilege then insert into r361 values ('designer se dá permissão', 'não');
end $$;
do $$ begin
  insert into public.ops_member_permissions values ('00000000-0000-0000-0000-00000361aa02', 'ops.commercial');
  insert into r361 values ('designer grava direto na tabela', 'sim');
exception when insufficient_privilege then insert into r361 values ('designer grava direto na tabela', 'não');
end $$;

-- ---------------------------------------------------------------- desativar setor com gente
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000361aa01","role":"authenticated"}';
do $$ begin
  perform public.ops_sector_set_status((select id from ids361 where k = 'design'), 'arquivado', null);
  insert into r361 values ('arquivar sem destino', 'aceito');
exception when invalid_parameter_value then insert into r361 values ('arquivar sem destino', 'recusado');
end $$;
select public.ops_sector_set_status((select id from ids361 where k = 'design'), 'arquivado', (select id from ids361 where k = 'social'));
insert into r361 select 'depois de arquivar', (select string_agg(case when s.is_primary then 'P:' else 'S:' end || x.name, ',')
  from public.ops_member_sectors s join public.ops_sectors x on x.id = s.sector_id where s.user_id = '00000000-0000-0000-0000-00000361aa02')
  || '|' || (select status from public.ops_sectors where id = (select id from ids361 where k = 'design'));
-- Pessoa inativa na Central perde o acesso na hora
select public.ops_member_save('00000000-0000-0000-0000-00000361aa02', (select id from ids361 where k = 'social'), '{}', 'Designer', false, true,
  '{ops.access,ops.kanban.view}');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000361aa02","role":"authenticated"}';
insert into r361 select 'inativo na Central', private.ops_can('ops.access')::text || '|' || (select count(*) from public.ops_sectors)::text;

-- Visitante (anon) não lê nada
reset role;
set local role anon;
do $$ begin
  perform 1 from public.ops_sectors;
  insert into r361 values ('visitante lê setores', 'sim');
exception when insufficient_privilege then insert into r361 values ('visitante lê setores', 'não');
end $$;
reset role;

insert into r361 select 'auditoria', string_agg(action, ',' order by action)
  from public.audit_logs where actor_id = '00000000-0000-0000-0000-00000361aa01';

do $$
declare
  expected jsonb := jsonb_build_object(
    'equipe vê cliente (anúncios)', '0|false',
    'equipe fora da Central', 'false|0|0',
    'operador vê cliente (anúncios)', '1',
    'operador cria setor', 'não',
    'setores iniciais', '10',
    'nome repetido', 'recusado',
    'cliente na Central', 'recusado',
    'membro salvo', 'P:Design,S:Social Media',
    'permissão inventada', 'recusada',
    'designer na Central', 'true|true|false|10',
    'designer vê equipe sem permissões', '1|0',
    'designer continua sem anúncios', '0',
    'designer se dá permissão', 'não',
    'designer grava direto na tabela', 'não',
    'arquivar sem destino', 'recusado',
    'depois de arquivar', 'P:Social Media|arquivado',
    'inativo na Central', 'false|0',
    'visitante lê setores', 'não',
    'auditoria', 'ops.member.update,ops.member.update,ops.sector.status');
  r record;
begin
  for r in select * from r361 loop
    if expected ->> r.what is distinct from r.v then raise exception 'FALHOU: % = % (esperado %)', r.what, r.v, expected ->> r.what; end if;
  end loop;
  if (select count(*) from r361) <> (select count(*) from jsonb_object_keys(expected)) then
    raise exception 'FALHOU: faltou verificação (%)', (select count(*) from r361);
  end if;
  raise notice 'Etapa 36.1: % verificações OK', (select count(*) from r361);
end $$;

rollback;
