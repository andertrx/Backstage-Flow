-- =============================================================================
-- Testes da Etapa 26 — Segurança (auditoria automática do banco)
-- Falha se alguma mudança futura abrir uma brecha: tabela sem RLS, acesso de
-- visitante, função privilegiada liberada, função sem search_path fixo.
-- Também testa o limite de requisições (rate limiting).
-- Rodar inteiro no SQL Editor. Transação desfeita no final: nada fica gravado.
-- =============================================================================
begin;

do $$
declare
  v_list text;
begin
  -- 1) Toda tabela do schema public tem RLS ligado.
  select string_agg(c.relname, ', ') into v_list from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity;
  if v_list is not null then raise exception 'FALHOU: tabelas sem RLS: %', v_list; end if;

  -- 2) Visitante sem login (anon) não tem nenhuma permissão em tabelas.
  select string_agg(distinct table_name, ', ') into v_list from information_schema.role_table_grants
   where grantee = 'anon' and table_schema in ('public', 'private');
  if v_list is not null then raise exception 'FALHOU: visitante com acesso às tabelas: %', v_list; end if;

  -- 3) Visitante não executa nenhuma função do public nem do private.
  select string_agg(n.nspname || '.' || p.proname, ', ') into v_list from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('public', 'private') and has_function_privilege('anon', p.oid, 'execute');
  if v_list is not null then raise exception 'FALHOU: visitante pode executar: %', v_list; end if;

  -- 4) Visitante não enxerga o schema private.
  if has_schema_privilege('anon', 'private', 'usage') then raise exception 'FALHOU: visitante enxerga o schema private'; end if;

  -- 5) Toda função SECURITY DEFINER tem search_path fixo (evita sequestro de função).
  select string_agg(n.nspname || '.' || p.proname, ', ') into v_list from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('public', 'private') and p.prosecdef
     and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) cfg where cfg like 'search_path=%');
  if v_list is not null then raise exception 'FALHOU: funções privilegiadas sem search_path: %', v_list; end if;

  -- 6) Funções privilegiadas do public (cofre de tokens, sincronização, limite) só o servidor executa.
  select string_agg(p.proname, ', ') into v_list from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and (p.prosecdef or p.proname in ('rate_limit_hit'))
     and has_function_privilege('authenticated', p.oid, 'execute');
  if v_list is not null then raise exception 'FALHOU: usuário logado pode executar função do servidor: %', v_list; end if;

  -- 7) Cofre de tokens: nem o usuário logado lê.
  if has_function_privilege('authenticated', 'public.connection_secret_get(uuid)', 'execute') then
    raise exception 'FALHOU: usuário logado consegue ler token do cofre';
  end if;

  -- 8) Contador do limite não é visível para o site.
  if has_table_privilege('authenticated', 'private.rate_limits', 'select') then
    raise exception 'FALHOU: usuário logado lê o contador de limite';
  end if;
end $$;

-- 9) Limite de requisições: 3 por janela; a 4ª é barrada; nova janela libera.
insert into auth.users (id, instance_id, aud, role, email) values
  ('00000000-0000-0000-0000-000000026a01', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'gestor@t26.local');

do $$
declare
  v_ok boolean;
  v_user uuid := '00000000-0000-0000-0000-000000026a01';
  i int;
begin
  for i in 1..3 loop
    v_ok := private.rate_limit_hit_impl('teste.t26', v_user, 3, 600);
    if not v_ok then raise exception 'FALHOU: tentativa % deveria passar', i; end if;
  end loop;
  if private.rate_limit_hit_impl('teste.t26', v_user, 3, 600) then raise exception 'FALHOU: 4ª tentativa deveria ser barrada'; end if;
  -- outra ação tem contador próprio
  if not private.rate_limit_hit_impl('outra.t26', v_user, 3, 600) then raise exception 'FALHOU: contador deveria ser por ação'; end if;
  -- janela vencida: volta a liberar e a tabela continua com 1 linha por pessoa/ação
  update private.rate_limits set window_start = now() - interval '11 minutes' where bucket = 'teste.t26' and subject = v_user;
  if not private.rate_limit_hit_impl('teste.t26', v_user, 3, 600) then raise exception 'FALHOU: nova janela deveria liberar'; end if;
  if (select count(*) from private.rate_limits where subject = v_user) <> 2 then raise exception 'FALHOU: deveria haver 1 linha por ação'; end if;
  if (select hits from private.rate_limits where bucket = 'teste.t26' and subject = v_user) <> 1 then raise exception 'FALHOU: contador deveria recomeçar'; end if;
  begin
    perform private.rate_limit_hit_impl('teste.t26', v_user, 0, 600);
    raise exception 'FALHOU: parâmetro inválido deveria dar erro';
  exception when invalid_parameter_value then null;
  end;
end $$;

-- 10) Usuário logado não consegue chamar o limite nem o cofre diretamente.
do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000026a01","role":"authenticated"}', true);
  begin
    perform public.rate_limit_hit('x', '00000000-0000-0000-0000-000000026a01', 1, 60);
    raise exception 'FALHOU: usuário logado chamou rate_limit_hit';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.connection_secret_get('00000000-0000-0000-0000-000000000000');
    raise exception 'FALHOU: usuário logado chamou connection_secret_get';
  exception when insufficient_privilege then null;
  end;
  reset role;
end $$;

select 'TODOS OS TESTES PASSARAM' as resultado;

rollback;
