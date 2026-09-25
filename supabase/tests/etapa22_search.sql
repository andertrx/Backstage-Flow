-- =============================================================================
-- Testes da Etapa 22 — Busca global (public.global_search)
-- Acentos/maiúsculas, trecho do nome, ID da plataforma, CNPJ, limites,
-- curingas, conta desvinculada e permissões (cada um só acha o que pode ver).
-- Rodar inteiro no SQL Editor. Transação desfeita no final: nada fica gravado.
-- =============================================================================
begin;

insert into auth.users (id, instance_id, aud, role, email) values
  ('00000000-0000-0000-0000-000000022a01', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@t22.local'),
  ('00000000-0000-0000-0000-000000022a02', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'gestor@t22.local'),
  ('00000000-0000-0000-0000-000000022a03', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cliente@t22.local'),
  ('00000000-0000-0000-0000-000000022a04', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'inativo@t22.local');
update public.profiles set active = true,  role = 'admin'   where id = '00000000-0000-0000-0000-000000022a01';
update public.profiles set active = true,  role = 'gestor'  where id = '00000000-0000-0000-0000-000000022a02';
update public.profiles set active = true,  role = 'cliente' where id = '00000000-0000-0000-0000-000000022a03';
update public.profiles set active = false, role = 'gestor'  where id = '00000000-0000-0000-0000-000000022a04';

insert into public.clients (id, name, company, cnpj) values
  ('00000000-0000-0000-0000-000000022c01', 'Excálibur Zzqt22', 'Academia Zzqt22 Ltda', '11222333000181'),
  ('00000000-0000-0000-0000-000000022c02', 'Outro Zzqt22', null, null);
insert into public.user_client_access (user_id, client_id)
select u, '00000000-0000-0000-0000-000000022c01'::uuid
from unnest(array['00000000-0000-0000-0000-000000022a02', '00000000-0000-0000-0000-000000022a03', '00000000-0000-0000-0000-000000022a04']::uuid[]) u;

insert into public.ad_accounts (id, platform_id, external_id, client_id, name, currency, status, unlinked_at) values
  ('00000000-0000-0000-0000-000000022001', 'meta',   '7770022001', '00000000-0000-0000-0000-000000022c01', 'CA - Excalibur Zzqt22', 'BRL', 'ativa', null),
  ('00000000-0000-0000-0000-000000022002', 'google', '7770022002', '00000000-0000-0000-0000-000000022c01', 'Google Excalibur Zzqt22', 'BRL', 'ativa', null),
  ('00000000-0000-0000-0000-000000022003', 'meta',   '7770022003', '00000000-0000-0000-0000-000000022c01', 'Antiga Excalibur Zzqt22', 'BRL', 'ativa', now()),
  ('00000000-0000-0000-0000-000000022004', 'meta',   '7770022004', '00000000-0000-0000-0000-000000022c02', 'CA - Outro Zzqt22', 'BRL', 'ativa', null);
insert into public.campaigns (id, ad_account_id, client_id, platform_id, external_id, name, status) values
  ('00000000-0000-0000-0000-00000022cc01', '00000000-0000-0000-0000-000000022001', '00000000-0000-0000-0000-000000022c01', 'meta', '9990022001', 'Promoção de Verão Zzqt22', 'ativa'),
  ('00000000-0000-0000-0000-00000022cc02', '00000000-0000-0000-0000-000000022002', '00000000-0000-0000-0000-000000022c01', 'google', '9990022002', 'Pesquisa Excalibur Zzqt22', 'ativa'),
  ('00000000-0000-0000-0000-00000022cc03', '00000000-0000-0000-0000-000000022004', '00000000-0000-0000-0000-000000022c02', 'meta', '9990022003', 'Promoção Outro Zzqt22', 'ativa');
insert into public.ad_groups (id, campaign_id, ad_account_id, client_id, platform_id, external_id, name, status) values
  ('00000000-0000-0000-0000-00000022ab01', '00000000-0000-0000-0000-00000022cc01', '00000000-0000-0000-0000-000000022001', '00000000-0000-0000-0000-000000022c01', 'meta', '8880022001', 'Público Frio Zzqt22', 'ativa');
insert into public.ads (ad_group_id, campaign_id, ad_account_id, client_id, platform_id, external_id, name, status)
select '00000000-0000-0000-0000-00000022ab01', '00000000-0000-0000-0000-00000022cc01', '00000000-0000-0000-0000-000000022001',
       '00000000-0000-0000-0000-000000022c01', 'meta', '66600220' || n, 'Anúncio Vídeo Zzqt22 ' || n, 'ativa'
from generate_series(10, 34) n;  -- 25 anúncios

create temp table t22 (who text, q text, lim int, kind text, name text, client uuid, parent text) on commit drop;
grant all on t22 to authenticated;

create function pg_temp.t22_run(p_who text, p_q text, p_lim int default 5) returns void language plpgsql as $x$
begin
  insert into t22 select p_who, p_q, p_lim, s.kind, s.name, s.client_id, s.parent_name
  from public.global_search(p_q, p_lim) s
  where s.client_id in ('00000000-0000-0000-0000-000000022c01', '00000000-0000-0000-0000-000000022c02');
end;
$x$;

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000022a01","role":"authenticated"}';
select pg_temp.t22_run('admin', 'excalibur zzqt22');
select pg_temp.t22_run('admin', 'EXCÁLIBUR ZZQT22');
select pg_temp.t22_run('admin', 'promocao de verao zzqt22');
select pg_temp.t22_run('admin', 'calibur zzq');
select pg_temp.t22_run('admin', '9990022001');
select pg_temp.t22_run('admin', 'act_7770022001');
select pg_temp.t22_run('admin', '11.222.333/0001-81');
select pg_temp.t22_run('admin', 'academia zzqt22');
select pg_temp.t22_run('admin', 'video zzqt22');
select pg_temp.t22_run('admin', 'video zzqt22', 100);
select pg_temp.t22_run('admin', 'a');
select pg_temp.t22_run('admin', '%%');
select pg_temp.t22_run('admin', '_zzqt22');
select pg_temp.t22_run('admin', 'zzqt22');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000022a02","role":"authenticated"}';
select pg_temp.t22_run('gestor', 'zzqt22', 20);
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000022a03","role":"authenticated"}';
select pg_temp.t22_run('cliente', 'zzqt22', 20);
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000022a04","role":"authenticated"}';
select pg_temp.t22_run('inativo', 'zzqt22', 20);
reset role;

do $$
declare
  c1 uuid := '00000000-0000-0000-0000-000000022c01';
  c2 uuid := '00000000-0000-0000-0000-000000022c02';
  n int;
  function_ok boolean;
begin
  -- Exemplo da etapa: "Excalibur" acha cliente, contas Meta e Google e campanha
  select count(*) into n from t22 where who = 'admin' and q = 'excalibur zzqt22' and kind = 'cliente' and name = 'Excálibur Zzqt22';
  if n <> 1 then raise exception 'FALHOU: "excalibur" (sem acento) deveria achar o cliente "Excálibur", achou %', n; end if;
  select count(*) into n from t22 where who = 'admin' and q = 'excalibur zzqt22' and kind = 'conta';
  if n <> 2 then raise exception 'FALHOU: deveria achar as 2 contas vinculadas (Meta e Google), achou %', n; end if;
  select count(*) into n from t22 where who = 'admin' and q = 'excalibur zzqt22' and kind = 'campanha' and name = 'Pesquisa Excalibur Zzqt22';
  if n <> 1 then raise exception 'FALHOU: deveria achar a campanha do Google, achou %', n; end if;
  select count(*) into n from t22 where who = 'admin' and q = 'excalibur zzqt22' and name like 'Antiga%';
  if n <> 0 then raise exception 'FALHOU: conta desvinculada não deveria aparecer'; end if;

  select count(*) into n from t22 where who = 'admin' and q = 'EXCÁLIBUR ZZQT22' and kind = 'cliente';
  if n <> 1 then raise exception 'FALHOU: maiúsculas e acento não deveriam importar'; end if;
  select count(*) into n from t22 where who = 'admin' and q = 'promocao de verao zzqt22' and kind = 'campanha' and name = 'Promoção de Verão Zzqt22';
  if n <> 1 then raise exception 'FALHOU: "promocao de verao" deveria achar "Promoção de Verão"'; end if;
  select count(*) into n from t22 where who = 'admin' and q = 'calibur zzq' and kind = 'cliente';
  if n <> 1 then raise exception 'FALHOU: trecho do meio do nome deveria achar'; end if;

  -- IDs da plataforma e CNPJ
  select count(*) into n from t22 where who = 'admin' and q = '9990022001' and kind = 'campanha' and name = 'Promoção de Verão Zzqt22';
  if n <> 1 then raise exception 'FALHOU: ID da campanha deveria achar a campanha'; end if;
  select count(*) into n from t22 where who = 'admin' and q = 'act_7770022001' and kind = 'conta' and name = 'CA - Excalibur Zzqt22';
  if n <> 1 then raise exception 'FALHOU: ID da conta com "act_" deveria achar a conta'; end if;
  select count(*) into n from t22 where who = 'admin' and q = '11.222.333/0001-81' and kind = 'cliente' and client = c1;
  if n <> 1 then raise exception 'FALHOU: CNPJ com pontuação deveria achar o cliente'; end if;
  select count(*) into n from t22 where who = 'admin' and q = 'academia zzqt22' and kind = 'cliente' and parent = 'Academia Zzqt22 Ltda';
  if n <> 1 then raise exception 'FALHOU: nome da empresa deveria achar o cliente'; end if;

  -- Limites
  select count(*) into n from t22 where who = 'admin' and q = 'video zzqt22' and lim = 5 and kind = 'anuncio';
  if n <> 5 then raise exception 'FALHOU: limite padrão de 5 anúncios, veio %', n; end if;
  select count(*) into n from t22 where who = 'admin' and q = 'video zzqt22' and lim = 100 and kind = 'anuncio';
  if n <> 20 then raise exception 'FALHOU: limite máximo de 20 por tipo, veio %', n; end if;
  select count(*) into n from t22 where who = 'admin' and q = 'video zzqt22' and lim = 5 and kind = 'anuncio' and parent = 'Promoção de Verão Zzqt22';
  if n <> 5 then raise exception 'FALHOU: anúncio deveria trazer o nome da campanha'; end if;
  select count(*) into n from t22 where who = 'admin' and q = 'a';
  if n <> 0 then raise exception 'FALHOU: 1 letra não deveria buscar'; end if;
  select count(*) into n from t22 where who = 'admin' and q = '%%';
  if n <> 0 then raise exception 'FALHOU: "%%" deveria ser texto, não curinga (veio %)', n; end if;
  select count(*) into n from t22 where who = 'admin' and q = '_zzqt22';
  if n <> 0 then raise exception 'FALHOU: "_" deveria ser texto, não curinga (veio %)', n; end if;

  select count(*) into n from t22 where who = 'admin' and q = 'zzqt22' and kind = 'cliente';
  if n <> 2 then raise exception 'FALHOU: admin deveria achar os 2 clientes, achou %', n; end if;

  -- Permissões
  select count(*) into n from t22 where who = 'gestor' and client = c1;
  if n = 0 then raise exception 'FALHOU: gestor deveria achar o cliente liberado'; end if;
  select count(*) into n from t22 where who = 'gestor' and client = c2;
  if n <> 0 then raise exception 'FALHOU: gestor achou % itens de cliente NÃO liberado', n; end if;
  select count(*) into n from t22 where who = 'cliente';
  if n <> 0 then raise exception 'FALHOU: perfil cliente não usa a busca (veio %)', n; end if;
  select count(*) into n from t22 where who = 'inativo';
  if n <> 0 then raise exception 'FALHOU: usuário desativado não deveria achar nada (veio %)', n; end if;
  select has_function_privilege('anon', 'public.global_search(text, integer)', 'execute') into function_ok;
  if function_ok then raise exception 'FALHOU: visitante sem login não pode chamar a busca'; end if;

  raise notice 'TODOS OS TESTES PASSARAM';
end;
$$;

select 'TODOS OS TESTES PASSARAM' as resultado;
rollback;
