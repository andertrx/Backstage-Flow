-- =============================================================================
-- Testes da Etapa 25 — Tratamento de erros (public.error_logs)
-- Limpeza de segredos, registro pelo site (só logado e ativo), limite contra
-- excesso, leitura só do administrador e lista com nomes.
-- Rodar inteiro no SQL Editor. Transação desfeita no final: nada fica gravado.
-- =============================================================================
begin;

insert into auth.users (id, instance_id, aud, role, email) values
  ('00000000-0000-0000-0000-000000025a01', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@t25.local'),
  ('00000000-0000-0000-0000-000000025a02', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'gestor@t25.local'),
  ('00000000-0000-0000-0000-000000025a03', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cliente@t25.local'),
  ('00000000-0000-0000-0000-000000025a04', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'inativo@t25.local');
update public.profiles set active = true,  role = 'admin',   full_name = 'Admin T25'  where id = '00000000-0000-0000-0000-000000025a01';
update public.profiles set active = true,  role = 'gestor',  full_name = 'Gestor T25' where id = '00000000-0000-0000-0000-000000025a02';
update public.profiles set active = true,  role = 'cliente' where id = '00000000-0000-0000-0000-000000025a03';
update public.profiles set active = false, role = 'gestor'  where id = '00000000-0000-0000-0000-000000025a04';

insert into public.clients (id, name) values ('00000000-0000-0000-0000-000000025c01', 'Cliente T25');
insert into public.ad_accounts (id, platform_id, external_id, client_id, name, currency, status) values
  ('00000000-0000-0000-0000-000000025001', 'meta', '7770025001', '00000000-0000-0000-0000-000000025c01', 'Conta T25', 'BRL', 'ativa');

-- O servidor grava direto (service role), já com conta e cliente.
insert into public.error_logs (source, code, user_message, technical, context, ad_account_id, client_id)
values ('sincronizacao', 'RATE_LIMITED_T25', 'Não conseguimos atualizar os dados desta conta.', 'RATE_LIMITED — pausa',
        '{"periodo":"2026-09-01..2026-09-25"}', '00000000-0000-0000-0000-000000025001', '00000000-0000-0000-0000-000000025c01');

create temp table t25 (who text, ok boolean, n int) on commit drop;
grant all on t25 to authenticated, anon;

-- 1) Limpeza de segredos
do $$
declare
  cleaned text := private.redact_secrets(
    'GET https://graph.facebook.com/v23.0/act_1?access_token=EAABsbCS1iHgBAKZC9ZB&appsecret_proof=abc123&fields=name ' ||
    '{"password":"Senha!1","client_secret":"GOCSPX-x"} Bearer ya29.a0Af developer-token=XyZ ' ||
    'EAAG1234567890abcdefghijKLMN eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N');
  secret text;
begin
  foreach secret in array array['EAABsbCS1iHgBAKZC9ZB', 'abc123', 'Senha!1', 'GOCSPX-x', 'ya29.a0Af', 'XyZ', 'EAAG1234567890', 'dozjgNryP4J3'] loop
    if position(secret in cleaned) > 0 then raise exception 'FALHOU: segredo "%" continuou no texto: %', secret, cleaned; end if;
  end loop;
  if position('graph.facebook.com/v23.0/act_1' in cleaned) = 0 or position('fields=name' in cleaned) = 0 then
    raise exception 'FALHOU: a limpeza apagou texto comum: %', cleaned;
  end if;
  if private.redact_secrets('Cannot read properties of undefined') <> 'Cannot read properties of undefined' then
    raise exception 'FALHOU: texto sem segredo não deveria mudar';
  end if;
end $$;

-- 2) Site registra erros (gestor logado), já limpos
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000025a02","role":"authenticated"}';
insert into t25 select 'gestor', public.log_client_error('SITE_RENDER_ERROR<script>', 'Não conseguimos mostrar esta tela.',
  'TypeError: x ?access_token=EAAsegredoMuitoLongo1234567890', '{"pagina":"/campanhas","token":"token=abc"}'), null;
-- Sem permissão para ler (não é administrador)
insert into t25 select 'gestor-le', null, count(*)::int from public.error_logs;
insert into t25 select 'gestor-lista', null, count(*)::int from public.error_log_list();
-- Limite: 30 por 10 minutos
insert into t25 select 'gestor-limite', public.log_client_error('X' || g, null, 'erro ' || g, '{}'), null from generate_series(1, 35) g;
reset role;

-- Inativo e cliente final
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000025a04","role":"authenticated"}';
insert into t25 select 'inativo', public.log_client_error('X', null, 'y', '{}'), null;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000025a03","role":"authenticated"}';
insert into t25 select 'cliente', public.log_client_error('SITE_QUERY_ERROR', 'Mensagem', 'detalhe', '{}'), null;
insert into t25 select 'cliente-le', null, count(*)::int from public.error_logs;
reset role;

-- Administrador lê tudo, com nomes
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000025a01","role":"authenticated"}';
insert into t25 select 'admin-sync', null, count(*)::int from public.error_log_list(null, 'sincronizacao')
 where code = 'RATE_LIMITED_T25' and account_name = 'Conta T25' and client_name = 'Cliente T25';
insert into t25 select 'admin-site', null, count(*)::int from public.error_log_list(now() - interval '1 hour', 'site', null, 200)
 where user_id in ('00000000-0000-0000-0000-000000025a02', '00000000-0000-0000-0000-000000025a03');
insert into t25 select 'admin-nome', null, count(*)::int from public.error_log_list(null, 'site')
 where user_name = 'Gestor T25';
reset role;

-- Visitante (sem login) não pode registrar nem ler
do $$
begin
  set local role anon;
  begin
    perform public.log_client_error('X', null, 'y', '{}');
    raise exception 'FALHOU: visitante sem login conseguiu registrar erro';
  exception when insufficient_privilege then null;
  end;
  begin
    perform count(*) from public.error_logs;
    raise exception 'FALHOU: visitante sem login conseguiu ler os erros';
  exception when insufficient_privilege then null;
  end;
  reset role;
end $$;

do $$
declare
  v_n int;
  r record;
begin
  select ok into r from t25 where who = 'gestor';
  if r.ok is not true then raise exception 'FALHOU: gestor ativo deveria conseguir registrar erro do site'; end if;

  select * into r from public.error_logs where user_id = '00000000-0000-0000-0000-000000025a02' and code = 'SITE_RENDER_ERRORscript';
  if r.id is null then raise exception 'FALHOU: código deveria ser limpo (só letras, números e _.:-)'; end if;
  if r.source <> 'site' then raise exception 'FALHOU: origem deveria ser "site"'; end if;
  if position('EAAsegredo' in r.technical) > 0 then raise exception 'FALHOU: token ficou no detalhe técnico: %', r.technical; end if;
  if r.context->>'pagina' <> '/campanhas' then raise exception 'FALHOU: contexto deveria guardar a página'; end if;
  if position('abc' in r.context->>'token') > 0 then raise exception 'FALHOU: segredo ficou no contexto: %', r.context; end if;

  select n into v_n from t25 where who = 'gestor-le';
  if v_n <> 0 then raise exception 'FALHOU: gestor não deveria ler os erros técnicos (leu %)', v_n; end if;
  select n into v_n from t25 where who = 'gestor-lista';
  if v_n <> 0 then raise exception 'FALHOU: gestor não deveria receber linhas da lista (recebeu %)', v_n; end if;

  select count(*) into v_n from t25 where who = 'gestor-limite' and ok;
  if v_n <> 29 then raise exception 'FALHOU: limite deveria aceitar mais 29 (total 30 em 10 min), aceitou %', v_n; end if;
  select count(*) into v_n from public.error_logs where user_id = '00000000-0000-0000-0000-000000025a02';
  if v_n <> 30 then raise exception 'FALHOU: deveria haver 30 erros do gestor, há %', v_n; end if;

  select ok into r from t25 where who = 'inativo';
  if r.ok is not false then raise exception 'FALHOU: usuário inativo não deveria registrar'; end if;
  select ok into r from t25 where who = 'cliente';
  if r.ok is not true then raise exception 'FALHOU: cliente final logado deveria registrar erro do site'; end if;
  select n into v_n from t25 where who = 'cliente-le';
  if v_n <> 0 then raise exception 'FALHOU: cliente final não deveria ler os erros (leu %)', v_n; end if;

  select n into v_n from t25 where who = 'admin-sync';
  if v_n <> 1 then raise exception 'FALHOU: administrador deveria ver o erro da sincronização com conta e cliente (viu %)', v_n; end if;
  select n into v_n from t25 where who = 'admin-site';
  if v_n <> 31 then raise exception 'FALHOU: administrador deveria ver os 31 erros do site (viu %)', v_n; end if;
  select n into v_n from t25 where who = 'admin-nome';
  if v_n < 1 then raise exception 'FALHOU: lista deveria trazer o nome de quem estava usando'; end if;

  raise notice 'TODOS OS TESTES PASSARAM';
end $$;

select 'TODOS OS TESTES PASSARAM' as resultado;

rollback;
