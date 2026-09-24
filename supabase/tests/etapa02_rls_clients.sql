-- =============================================================================
-- Testes da Etapa 2 — clientes, acessos, CNPJ e auditoria
--
-- Como rodar: executar o arquivo inteiro no SQL Editor do Supabase.
-- Tudo acontece dentro de uma transação desfeita no final (ROLLBACK).
-- Sucesso: a última linha mostra 'TODOS OS TESTES PASSARAM'.
-- =============================================================================
begin;

-- ---------------------------------------------------------------- CNPJ
do $$
begin
  if not private.is_valid_cnpj('11222333000181') then raise exception 'FALHOU: CNPJ numérico válido recusado'; end if;
  if private.is_valid_cnpj('11222333000182') then raise exception 'FALHOU: dígito verificador errado aceito'; end if;
  if private.is_valid_cnpj('00000000000000') then raise exception 'FALHOU: CNPJ repetido aceito'; end if;
  if not private.is_valid_cnpj('12ABC34501DE35') then raise exception 'FALHOU: CNPJ alfanumérico válido recusado'; end if;
  if private.is_valid_cnpj('12ABC34501DE36') then raise exception 'FALHOU: CNPJ alfanumérico inválido aceito'; end if;
  if private.is_valid_cnpj('11.222.333/0001-81') then raise exception 'FALHOU: CNPJ com pontuação deveria chegar normalizado'; end if;
end $$;

-- ---------------------------------------------------------------- usuários de teste
insert into auth.users (id, instance_id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@t2.local'),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'gestor1@t2.local'),
  ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'gestor2@t2.local'),
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'visual@t2.local'),
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cliente@t2.local'),
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'inativo@t2.local');

update public.profiles set active = true, role = 'admin'        where id = '00000000-0000-0000-0000-0000000000a1';
update public.profiles set active = true, role = 'gestor'       where id in ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000b2');
update public.profiles set active = true, role = 'visualizador' where id = '00000000-0000-0000-0000-0000000000c1';
update public.profiles set active = true, role = 'cliente'      where id = '00000000-0000-0000-0000-0000000000d1';
update public.profiles set active = false, role = 'gestor'      where id = '00000000-0000-0000-0000-0000000000e1';

-- ---------------------------------------------------------------- admin cadastra cliente Y
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
insert into public.clients (id, name, company, cnpj, email, phone)
values ('00000000-0000-0000-0000-0000000000f2', 'Cliente Y', 'Y Ltda', '11222333000181', 'contato@y.com', '5545999998888');
reset role;

-- ---------------------------------------------------------------- gestor 1 cadastra cliente X (sem RETURNING, como o site faz)
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}';
insert into public.clients (id, name) values ('00000000-0000-0000-0000-0000000000f1', 'Excalibur Teste');
do $$
begin
  if (select count(*) from public.clients) <> 1 then raise exception 'FALHOU: gestor deveria ver só o cliente que cadastrou'; end if;
  if (select created_by from public.clients) <> '00000000-0000-0000-0000-0000000000b1' then
    raise exception 'FALHOU: created_by deveria ser o gestor';
  end if;

  update public.clients set notes = 'Cliente de academia' where id = '00000000-0000-0000-0000-0000000000f1';
  if (select notes from public.clients where id = '00000000-0000-0000-0000-0000000000f1') <> 'Cliente de academia' then
    raise exception 'FALHOU: gestor responsável deveria editar';
  end if;

  begin
    update public.clients set is_demo = true where id = '00000000-0000-0000-0000-0000000000f1';
    raise exception 'FALHOU: site conseguiu marcar dado como demonstração';
  exception when insufficient_privilege then null;
  end;

  begin
    update public.clients set created_by = null where id = '00000000-0000-0000-0000-0000000000f1';
    raise exception 'FALHOU: site conseguiu alterar created_by';
  exception when insufficient_privilege then null;
  end;

  begin
    delete from public.clients where id = '00000000-0000-0000-0000-0000000000f1';
    raise exception 'FALHOU: gestor conseguiu apagar cliente';
  exception when insufficient_privilege then null;
  end;

  begin
    insert into public.user_client_access (user_id, client_id)
    values ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000f1');
    raise exception 'FALHOU: gestor conseguiu liberar acesso para outro usuário';
  exception when insufficient_privilege then null;
  end;

  begin
    insert into public.clients (name, cnpj) values ('CNPJ ruim', '11222333000182');
    raise exception 'FALHOU: CNPJ inválido aceito';
  exception when check_violation then null;
  end;

  begin
    insert into public.clients (name, email) values ('Email ruim', 'nao-e-email');
    raise exception 'FALHOU: e-mail inválido aceito';
  exception when check_violation then null;
  end;

  begin
    insert into public.clients (name, phone) values ('Fone ruim', '(45) 9999-8888');
    raise exception 'FALHOU: telefone não normalizado aceito';
  exception when check_violation then null;
  end;

  begin
    insert into public.clients (name, cnpj) values ('Duplicado', '11222333000181');
    raise exception 'FALHOU: CNPJ duplicado aceito';
  exception when unique_violation then null;
  end;
end $$;
reset role;

-- ---------------------------------------------------------------- gestor 2 (sem acesso)
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}';
do $$
begin
  if (select count(*) from public.clients) <> 0 then raise exception 'FALHOU: gestor 2 vê clientes de outros'; end if;
  update public.clients set name = 'Invadido' where id = '00000000-0000-0000-0000-0000000000f1';
  reset role;
  if (select name from public.clients where id = '00000000-0000-0000-0000-0000000000f1') = 'Invadido' then
    raise exception 'FALHOU: gestor 2 alterou cliente sem acesso';
  end if;
end $$;
reset role;

-- ---------------------------------------------------------------- admin libera acessos
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
insert into public.user_client_access (user_id, client_id) values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000f1'),
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000f2'),
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000f1');
do $$
begin
  if (select count(*) from public.clients where id in ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000f2')) <> 2 then
    raise exception 'FALHOU: admin deveria ver todos os clientes';
  end if;
  if (select granted_by from public.user_client_access where user_id = '00000000-0000-0000-0000-0000000000c1') <> '00000000-0000-0000-0000-0000000000a1' then
    raise exception 'FALHOU: granted_by deveria ser o admin';
  end if;
end $$;
reset role;

-- ---------------------------------------------------------------- visualizador
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}';
do $$
begin
  if (select count(*) from public.clients) <> 1 then raise exception 'FALHOU: visualizador deveria ver 1 cliente'; end if;
  update public.clients set name = 'Alterado' where id = '00000000-0000-0000-0000-0000000000f1';
  begin
    insert into public.clients (name) values ('Novo');
    raise exception 'FALHOU: visualizador cadastrou cliente';
  exception when insufficient_privilege then null;
  end;
  reset role;
  if (select name from public.clients where id = '00000000-0000-0000-0000-0000000000f1') = 'Alterado' then
    raise exception 'FALHOU: visualizador alterou cliente';
  end if;
end $$;
reset role;

-- ---------------------------------------------------------------- cliente (papel)
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}';
do $$
begin
  if (select count(*) from public.clients) <> 1 or (select name from public.clients) <> 'Cliente Y' then
    raise exception 'FALHOU: usuário cliente deveria ver só a própria empresa';
  end if;
  if (select count(*) from public.user_client_access) <> 1 then
    raise exception 'FALHOU: usuário cliente deveria ver só o próprio acesso';
  end if;
end $$;
reset role;

-- ---------------------------------------------------------------- inativo com acesso liberado
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000e1","role":"authenticated"}';
do $$
begin
  if (select count(*) from public.clients) <> 0 then raise exception 'FALHOU: usuário inativo vê clientes'; end if;
end $$;
reset role;

-- ---------------------------------------------------------------- admin remove acesso; auditoria
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
delete from public.user_client_access where user_id = '00000000-0000-0000-0000-0000000000c1';
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}';
do $$
begin
  if (select count(*) from public.clients) <> 0 then raise exception 'FALHOU: acesso removido continua valendo'; end if;
end $$;
reset role;

do $$
declare d jsonb;
begin
  if (select count(*) from public.audit_logs where action = 'client.insert'
        and target_id in ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000f2')) <> 2 then
    raise exception 'FALHOU: cadastro de clientes não auditado';
  end if;
  select details into d from public.audit_logs where action = 'client.update' and target_id = '00000000-0000-0000-0000-0000000000f1';
  if d -> 'notes' ->> 'after' <> 'Cliente de academia' or d ? 'name' then
    raise exception 'FALHOU: auditoria deveria guardar só o campo alterado: %', d;
  end if;
  if (select count(*) from public.audit_logs where action = 'client_access.insert') < 4 then
    raise exception 'FALHOU: liberação de acesso não auditada (inclui a automática do gestor)';
  end if;
  if (select actor_id from public.audit_logs where action = 'client_access.delete') <> '00000000-0000-0000-0000-0000000000a1' then
    raise exception 'FALHOU: remoção de acesso não auditada com o autor certo';
  end if;
end $$;

rollback;

-- Só chega aqui se nenhum teste falhou
select 'TODOS OS TESTES PASSARAM' as resultado;
