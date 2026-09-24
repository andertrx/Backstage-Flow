-- =============================================================================
-- Testes da Etapa 13 — estrutura por plataforma (platform_structure)
-- Rodar inteiro no SQL Editor. Transação desfeita no final: nada fica gravado.
-- =============================================================================
begin;

insert into auth.users (id, instance_id, aud, role, email) values
  ('00000000-0000-0000-0000-00000000d0a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@t13.local'),
  ('00000000-0000-0000-0000-00000000d0c1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'gestor@t13.local');
update public.profiles set active = true, role = 'admin' where id = '00000000-0000-0000-0000-00000000d0a1';
update public.profiles set active = true, role = 'gestor' where id = '00000000-0000-0000-0000-00000000d0c1';

insert into public.clients (id, name) values
  ('00000000-0000-0000-0000-00000000d0f1', 'Excalibur Fitness'),
  ('00000000-0000-0000-0000-00000000d0f2', 'Loja Internacional');
delete from public.user_client_access where user_id = '00000000-0000-0000-0000-00000000d0c1';
insert into public.user_client_access (user_id, client_id) values ('00000000-0000-0000-0000-00000000d0c1', '00000000-0000-0000-0000-00000000d0f1');

insert into public.ad_accounts (id, platform_id, external_id, client_id, name, currency, status, unlinked_at) values
  ('00000000-0000-0000-0000-00000000d001', 'meta',   'd01',        '00000000-0000-0000-0000-00000000d0f1', 'Excalibur Meta',   'BRL', 'ativa', null),
  ('00000000-0000-0000-0000-00000000d002', 'google', '7223334411', '00000000-0000-0000-0000-00000000d0f1', 'Excalibur Google', 'BRL', 'ativa', null),
  ('00000000-0000-0000-0000-00000000d003', 'meta',   'd03',        '00000000-0000-0000-0000-00000000d0f2', 'Loja Meta',        'USD', 'ativa', null),
  ('00000000-0000-0000-0000-00000000d009', 'meta',   'd09',        '00000000-0000-0000-0000-00000000d0f1', 'Antiga (desvinculada)', 'BRL', 'ativa', now());

insert into public.campaigns (id, ad_account_id, client_id, platform_id, external_id, name, status) values
  ('00000000-0000-0000-0000-00000000dc01', '00000000-0000-0000-0000-00000000d001', '00000000-0000-0000-0000-00000000d0f1', 'meta',   'c1', 'Leads',       'ativa'),
  ('00000000-0000-0000-0000-00000000dc02', '00000000-0000-0000-0000-00000000d001', '00000000-0000-0000-0000-00000000d0f1', 'meta',   'c2', 'Remarketing', 'pausada'),
  ('00000000-0000-0000-0000-00000000dc03', '00000000-0000-0000-0000-00000000d002', '00000000-0000-0000-0000-00000000d0f1', 'google', 'c3', 'Pesquisa',    'ativa'),
  ('00000000-0000-0000-0000-00000000dc04', '00000000-0000-0000-0000-00000000d003', '00000000-0000-0000-0000-00000000d0f2', 'meta',   'c4', 'Loja US',     'ativa'),
  ('00000000-0000-0000-0000-00000000dc09', '00000000-0000-0000-0000-00000000d009', '00000000-0000-0000-0000-00000000d0f1', 'meta',   'c9', 'Antiga',      'ativa');

insert into public.ad_groups (id, campaign_id, ad_account_id, client_id, platform_id, external_id, name, status) values
  ('00000000-0000-0000-0000-00000000d201', '00000000-0000-0000-0000-00000000dc01', '00000000-0000-0000-0000-00000000d001', '00000000-0000-0000-0000-00000000d0f1', 'meta', 'g1', 'Frio',   'ativa'),
  ('00000000-0000-0000-0000-00000000d202', '00000000-0000-0000-0000-00000000dc01', '00000000-0000-0000-0000-00000000d001', '00000000-0000-0000-0000-00000000d0f1', 'meta', 'g2', 'Quente', 'pausada'),
  ('00000000-0000-0000-0000-00000000d203', '00000000-0000-0000-0000-00000000dc02', '00000000-0000-0000-0000-00000000d001', '00000000-0000-0000-0000-00000000d0f1', 'meta', 'g3', 'Remkt',  'pausada');

insert into public.ads (ad_group_id, campaign_id, ad_account_id, client_id, platform_id, external_id, name, status) values
  ('00000000-0000-0000-0000-00000000d201', '00000000-0000-0000-0000-00000000dc01', '00000000-0000-0000-0000-00000000d001', '00000000-0000-0000-0000-00000000d0f1', 'meta', 'a1', 'Vídeo',   'ativa'),
  ('00000000-0000-0000-0000-00000000d201', '00000000-0000-0000-0000-00000000dc01', '00000000-0000-0000-0000-00000000d001', '00000000-0000-0000-0000-00000000d0f1', 'meta', 'a2', 'Imagem',  'ativa'),
  ('00000000-0000-0000-0000-00000000d203', '00000000-0000-0000-0000-00000000dc02', '00000000-0000-0000-0000-00000000d001', '00000000-0000-0000-0000-00000000d0f1', 'meta', 'a3', 'Carrossel', 'erro');

-- ---------------------------------------------------------------- administrador
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000d0a1","role":"authenticated"}';
do $$
declare n bigint;
begin
  -- Meta, todos os clientes: 3 campanhas (2 ativas + 1 pausada), sem a da conta desvinculada nem a do Google
  select sum(total) into n from public.platform_structure('meta', array['00000000-0000-0000-0000-00000000d0f1', '00000000-0000-0000-0000-00000000d0f2']::uuid[]) where level = 'campaign';
  if n <> 3 then raise exception 'FALHOU: campanhas do Meta = % (esperado 3)', n; end if;
  select total into n from public.platform_structure('meta', array['00000000-0000-0000-0000-00000000d0f1', '00000000-0000-0000-0000-00000000d0f2']::uuid[]) where level = 'campaign' and status = 'ativa';
  if n <> 2 then raise exception 'FALHOU: campanhas ativas do Meta = %', n; end if;
  select total into n from public.platform_structure('meta', array['00000000-0000-0000-0000-00000000d0f1', '00000000-0000-0000-0000-00000000d0f2']::uuid[]) where level = 'ad_group' and status = 'pausada';
  if n <> 2 then raise exception 'FALHOU: conjuntos pausados = %', n; end if;
  select total into n from public.platform_structure('meta', array['00000000-0000-0000-0000-00000000d0f1', '00000000-0000-0000-0000-00000000d0f2']::uuid[]) where level = 'ad' and status = 'erro';
  if n <> 1 then raise exception 'FALHOU: anúncios com erro = %', n; end if;

  -- Google separado do Meta
  select sum(total) into n from public.platform_structure('google', array['00000000-0000-0000-0000-00000000d0f1', '00000000-0000-0000-0000-00000000d0f2']::uuid[]) where level = 'campaign';
  if n <> 1 then raise exception 'FALHOU: campanhas do Google = %', n; end if;

  -- Filtros: cliente, conta, campanha
  select sum(total) into n from public.platform_structure('meta', array['00000000-0000-0000-0000-00000000d0f2']::uuid[]) where level = 'campaign';
  if n <> 1 then raise exception 'FALHOU: filtro por cliente'; end if;
  select sum(total) into n from public.platform_structure('meta', null, array['00000000-0000-0000-0000-00000000d001']::uuid[]) where level = 'ad';
  if n <> 3 then raise exception 'FALHOU: filtro por conta'; end if;
  select sum(total) into n from public.platform_structure('meta', null, null, array['00000000-0000-0000-0000-00000000dc01']::uuid[]) where level = 'ad_group';
  if n <> 2 then raise exception 'FALHOU: filtro por campanha'; end if;

  -- Plataforma desconhecida: nada
  if exists (select 1 from public.platform_structure('tiktok', array['00000000-0000-0000-0000-00000000d0f1', '00000000-0000-0000-0000-00000000d0f2']::uuid[])) then raise exception 'FALHOU: plataforma desconhecida'; end if;
end $$;
reset role;

-- ---------------------------------------------------------------- gestor (só Excalibur)
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000d0c1","role":"authenticated"}';
do $$
declare n bigint;
begin
  select sum(total) into n from public.platform_structure('meta') where level = 'campaign';
  if n <> 2 then raise exception 'FALHOU: gestor contou campanhas de cliente não liberado (%)', n; end if;
  if exists (select 1 from public.platform_structure('meta', array['00000000-0000-0000-0000-00000000d0f2']::uuid[])) then
    raise exception 'FALHOU: gestor viu estrutura de cliente não liberado';
  end if;
end $$;
reset role;

set local role anon;
do $$
begin
  perform public.platform_structure('meta');
  raise exception 'FALHOU: anônimo consultou a estrutura';
exception when insufficient_privilege then null;
end $$;
reset role;

rollback;

select 'TODOS OS TESTES PASSARAM' as resultado;
