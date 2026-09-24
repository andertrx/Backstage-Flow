-- =============================================================================
-- Testes da Etapa 1 — perfis, papéis e regras de segurança (RLS)
--
-- Como rodar: executar este arquivo inteiro no SQL Editor do Supabase
-- (ou via MCP). Tudo roda dentro de uma transação que termina em ROLLBACK:
-- nenhum dado de teste fica gravado.
--
-- Se algum teste falhar, o script para com "FALHOU: <motivo>".
-- Se tudo passar, a última linha retorna 'TODOS OS TESTES PASSARAM'.
-- =============================================================================
begin;

-- E-mail de bootstrap só para este teste (desfeito no rollback)
insert into private.app_settings (key, value) values ('bootstrap_admin_email', 'bootstrap@teste.local')
on conflict (key) do update set value = excluded.value;

-- Remove temporariamente admins reais para testar o bootstrap (desfeito no rollback)
update public.profiles set role = 'visualizador' where role = 'admin';

-- Usuários de teste
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'BOOTSTRAP@teste.local', '{"full_name":"Admin Teste"}'),
  ('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'gestor@teste.local', '{}'),
  ('00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'inativo@teste.local', '{}');

-- 1. Gatilho de criação de perfil
do $$
declare r record;
begin
  select * into r from public.profiles where id = '00000000-0000-0000-0000-00000000000a';
  if r.role <> 'admin' or not r.active then raise exception 'FALHOU: e-mail de bootstrap deveria nascer admin ativo'; end if;
  if r.full_name <> 'Admin Teste' then raise exception 'FALHOU: nome do cadastro não foi copiado'; end if;

  select * into r from public.profiles where id = '00000000-0000-0000-0000-00000000000b';
  if r.role <> 'visualizador' or r.active then raise exception 'FALHOU: usuário comum deveria nascer visualizador inativo'; end if;

  if (select count(*) from public.audit_logs where action = 'user.bootstrap_admin'
        and target_id = '00000000-0000-0000-0000-00000000000a') <> 1 then
    raise exception 'FALHOU: bootstrap do admin não foi auditado';
  end if;
end $$;

-- 2. Bootstrap só funciona uma vez (já existe admin)
update private.app_settings set value = 'segundo@teste.local' where key = 'bootstrap_admin_email';
insert into auth.users (id, instance_id, aud, role, email)
values ('00000000-0000-0000-0000-00000000000d', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'segundo@teste.local');
do $$
begin
  if (select role from public.profiles where id = '00000000-0000-0000-0000-00000000000d') = 'admin' then
    raise exception 'FALHOU: segundo bootstrap não deveria virar admin';
  end if;
end $$;

-- Ativa o gestor (como o servidor faria)
update public.profiles set role = 'gestor', active = true where id = '00000000-0000-0000-0000-00000000000b';

-- 3. Visitante sem login (anon) não lê nada
set local role anon;
do $$
begin
  perform 1 from public.profiles;
  raise exception 'FALHOU: anon conseguiu consultar profiles';
exception when insufficient_privilege then null;
end $$;
reset role;

-- 4. Gestor ativo: lê só o próprio perfil, não lê auditoria, não muda o próprio papel
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';
do $$
begin
  if (select count(*) from public.profiles) <> 1 then raise exception 'FALHOU: gestor deveria ver apenas 1 perfil'; end if;
  if (select count(*) from public.audit_logs) <> 0 then raise exception 'FALHOU: gestor não deveria ver auditoria'; end if;

  update public.profiles set full_name = 'Gestor Renomeado' where id = '00000000-0000-0000-0000-00000000000b';
  if (select full_name from public.profiles where id = '00000000-0000-0000-0000-00000000000b') <> 'Gestor Renomeado' then
    raise exception 'FALHOU: gestor deveria poder alterar o próprio nome';
  end if;

  begin
    update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-00000000000b';
    raise exception 'FALHOU: gestor conseguiu se promover a admin';
  exception when insufficient_privilege then null;
  end;

  begin
    update public.profiles set active = true where id = '00000000-0000-0000-0000-00000000000c';
    raise exception 'FALHOU: gestor conseguiu ativar outro usuário';
  exception when insufficient_privilege then null;
  end;

  update public.profiles set full_name = 'invasão' where id = '00000000-0000-0000-0000-00000000000c';
  reset role;
  if (select full_name from public.profiles where id = '00000000-0000-0000-0000-00000000000c') = 'invasão' then
    raise exception 'FALHOU: gestor alterou o nome de outro usuário';
  end if;
end $$;
reset role;

-- 5. Usuário inativo: vê o próprio perfil (para a tela "acesso pendente"), mas não é admin nem altera nada
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated"}';
do $$
begin
  if (select count(*) from public.profiles) <> 1 then raise exception 'FALHOU: inativo deveria ver só o próprio perfil'; end if;
  if private.current_user_role() is not null then raise exception 'FALHOU: inativo não deveria ter papel efetivo'; end if;
  update public.profiles set full_name = 'x' where id = '00000000-0000-0000-0000-00000000000c';
  reset role;
  if (select full_name from public.profiles where id = '00000000-0000-0000-0000-00000000000c') = 'x' then
    raise exception 'FALHOU: usuário inativo conseguiu alterar o perfil';
  end if;
end $$;
reset role;

-- 6. Admin ativo: vê todos os perfis e a auditoria, mas também não muda papel direto pelo site
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
do $$
begin
  if (select count(*) from public.profiles where email like '%@teste.local') <> 4 then
    raise exception 'FALHOU: admin deveria ver todos os perfis';
  end if;
  if (select count(*) from public.audit_logs) < 1 then raise exception 'FALHOU: admin deveria ver a auditoria'; end if;
  begin
    update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-00000000000b';
    raise exception 'FALHOU: mudança de papel deve passar pelo servidor, não pelo site';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.audit_logs (action, target_type) values ('fake', 'x');
    raise exception 'FALHOU: site não pode gravar auditoria';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- 7. Admin desativado perde o acesso de admin imediatamente
update public.profiles set active = false where id = '00000000-0000-0000-0000-00000000000a';
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
do $$
begin
  if private.is_admin() then raise exception 'FALHOU: admin desativado continua admin'; end if;
  if (select count(*) from public.profiles) <> 1 then raise exception 'FALHOU: admin desativado ainda vê outros perfis'; end if;
end $$;
reset role;

-- 8. Tabela de configurações privadas é invisível para usuários logados
set local role authenticated;
do $$
begin
  perform 1 from private.app_settings;
  raise exception 'FALHOU: usuário logado leu private.app_settings';
exception when insufficient_privilege then null;
end $$;
reset role;

rollback;

-- Só chega aqui se nenhum teste falhou
select 'TODOS OS TESTES PASSARAM' as resultado;
