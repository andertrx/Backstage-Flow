-- =============================================================================
-- Testes da Etapa 19.2 — Acesso do cliente (login e link secreto).
-- Rodar inteiro no SQL Editor. Transação desfeita no final: nada fica gravado.
-- =============================================================================
begin;

insert into auth.users (id, instance_id, aud, role, email) values
  ('00000000-0000-0000-0000-00000192aa01', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'gestor@t192.local'),
  ('00000000-0000-0000-0000-00000192aa02', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cliente@t192.local'),
  ('00000000-0000-0000-0000-00000192aa03', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'operador@t192.local');
update public.profiles set active = true, role = 'gestor' where id = '00000000-0000-0000-0000-00000192aa01';
update public.profiles set active = true, role = 'cliente' where id = '00000000-0000-0000-0000-00000192aa02';
update public.profiles set active = true, role = 'operador' where id = '00000000-0000-0000-0000-00000192aa03';
insert into public.clients (id, name, timezone) values
  ('00000000-0000-0000-0000-00000192ac01', 'Cliente T192', 'America/Sao_Paulo'),
  ('00000000-0000-0000-0000-00000192ac02', 'Outro T192', 'America/Sao_Paulo');
insert into public.user_client_access (user_id, client_id) values
  ('00000000-0000-0000-0000-00000192aa01', '00000000-0000-0000-0000-00000192ac01'),
  ('00000000-0000-0000-0000-00000192aa02', '00000000-0000-0000-0000-00000192ac01'),
  ('00000000-0000-0000-0000-00000192aa03', '00000000-0000-0000-0000-00000192ac01');
insert into public.ad_accounts (id, platform_id, external_id, client_id, name, currency, status) values
  ('00000000-0000-0000-0000-00000192ad01', 'meta', '192001', '00000000-0000-0000-0000-00000192ac01', 'T192 Meta', 'BRL', 'ativa');
-- Ontem (fuso do cliente): uma linha válida e uma substituída (não pode contar).
insert into public.metrics_daily (date, ad_account_id, level, entity_external_id, client_id, platform_id, currency, spend_micros, impressions, clicks, leads, hash, superseded)
select (now() at time zone 'America/Sao_Paulo')::date - 1, '00000000-0000-0000-0000-00000192ad01', 'account', v.ext,
       '00000000-0000-0000-0000-00000192ac01', 'meta', 'BRL', v.spend, 1000, 10, 5, md5(random()::text), v.sup
  from (values ('192001', 40000000::bigint, false), ('192001-antiga', 999000000::bigint, true)) v(ext, spend, sup);

create temp table r192 (what text, v text) on commit drop;
create temp table tok192 (t text) on commit drop;
grant all on r192, tok192 to authenticated, anon, service_role;

-- Cliente com login DESLIGADO (padrão): não vê a empresa nem os números
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000192aa02","role":"authenticated"}';
insert into r192 select 'cliente vê (login desligado)', (select count(*) from public.clients)::text || '|' || (select count(*) from public.metrics_daily);

-- Operador não mexe no acesso
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000192aa03","role":"authenticated"}';
do $$ begin
  perform public.client_portal_set('00000000-0000-0000-0000-00000192ac01', true, null);
  insert into r192 values ('operador liga login', 'sim');
exception when insufficient_privilege then insert into r192 values ('operador liga login', 'não');
end $$;

-- Gestor responsável: liga o login, tenta ligar link sem gerar, gera link
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000192aa01","role":"authenticated"}';
select public.client_portal_set('00000000-0000-0000-0000-00000192ac01', true, null);
do $$ begin
  perform public.client_portal_set('00000000-0000-0000-0000-00000192ac01', null, true);
  insert into r192 values ('liga link sem gerar', 'aceito');
exception when invalid_parameter_value then insert into r192 values ('liga link sem gerar', 'recusado');
end $$;
insert into tok192 select public.client_portal_new_link('00000000-0000-0000-0000-00000192ac01', 30);
insert into r192 select 'código gerado', (select length(t) from tok192)::text;
do $$ begin
  perform public.client_portal_new_link('00000000-0000-0000-0000-00000192ac02', null);
  insert into r192 values ('gestor em cliente não liberado', 'sim');
exception when insufficient_privilege then insert into r192 values ('gestor em cliente não liberado', 'não');
end $$;
insert into r192 select 'equipe vê acesso', login_enabled || '|' || link_enabled || '|' || (link_expires_at > now() + interval '29 days')
  from public.client_portal where client_id = '00000000-0000-0000-0000-00000192ac01';
do $$ begin
  perform link_token_hash from public.client_portal;
  insert into r192 values ('equipe lê impressão digital', 'sim');
exception when insufficient_privilege then insert into r192 values ('equipe lê impressão digital', 'não');
end $$;

-- Cliente com login LIGADO: vê a própria empresa (só ela) e os números; não vê o acesso
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000192aa02","role":"authenticated"}';
insert into r192 select 'cliente vê (login ligado)', (select count(*) from public.clients)::text || '|' ||
  (select cur ->> 'spend_micros' from public.client_report_accounts('00000000-0000-0000-0000-00000192ac01',
     (now() at time zone 'America/Sao_Paulo')::date - 7, (now() at time zone 'America/Sao_Paulo')::date - 1));
insert into r192 select 'cliente vê acesso', count(*)::text from public.client_portal;

-- Visitante sem login não chama a função do banco (só o servidor, pela Edge Function)
reset role;
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
do $$ begin
  perform public.client_report_public((select t from tok192));
  insert into r192 values ('visitante chama a função', 'sim');
exception when insufficient_privilege then insert into r192 values ('visitante chama a função', 'não');
end $$;
do $$ begin
  perform * from public.clients;
  insert into r192 values ('visitante lê tabela', (select count(*) from public.clients)::text);
exception when insufficient_privilege then insert into r192 values ('visitante lê tabela', 'não');
end $$;

-- O servidor (Edge Function client-report-link) com o código do link
reset role;
set local role service_role;
insert into r192 select 'link abre', (x -> 'client' ->> 'name') || '|' || (x ->> 'period') || '|' || jsonb_array_length(x -> 'accounts') || '|' ||
  (x -> 'accounts' -> 0 -> 'cur' ->> 'spend_micros')
  from (select public.client_report_public((select t from tok192)) x) s;
insert into r192 select 'link 30 dias', (x ->> 'period') || '|' || ((x ->> 'to')::date - (x ->> 'from')::date + 1)
  from (select public.client_report_public((select t from tok192), 'last_30_days') x) s;
do $$ begin
  perform public.client_report_public(repeat('A', 43));
  insert into r192 values ('código errado', 'abre');
exception when no_data_found then insert into r192 values ('código errado', 'recusado');
end $$;
do $$ begin
  perform public.client_report_public((select t from tok192), null, '2020-01-01', current_date);
  insert into r192 values ('link período longo', 'aceito');
exception when invalid_parameter_value then insert into r192 values ('link período longo', 'recusado');
end $$;

-- Link desligado e link trocado param na hora
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000192aa01","role":"authenticated"}';
select public.client_portal_set('00000000-0000-0000-0000-00000192ac01', null, false);
reset role;
set local role service_role;
do $$ begin
  perform public.client_report_public((select t from tok192));
  insert into r192 values ('link desligado', 'abre');
exception when no_data_found then insert into r192 values ('link desligado', 'recusado');
end $$;
reset role;
set local role authenticated;
select public.client_portal_new_link('00000000-0000-0000-0000-00000192ac01', null);
reset role;
set local role service_role;
do $$ begin
  perform public.client_report_public((select t from tok192));
  insert into r192 values ('código antigo após trocar', 'abre');
exception when no_data_found then insert into r192 values ('código antigo após trocar', 'recusado');
end $$;
reset role;

insert into r192 select 'uso registrado', link_uses::text from public.client_portal where client_id = '00000000-0000-0000-0000-00000192ac01';
insert into r192 select 'auditoria', string_agg(action, ',' order by action) from public.audit_logs
 where target_id = '00000000-0000-0000-0000-00000192ac01' and action like 'client_portal.%';

do $$
declare
  expected jsonb := jsonb_build_object(
    'cliente vê (login desligado)', '0|0',
    'operador liga login', 'não',
    'liga link sem gerar', 'recusado',
    'código gerado', '43',
    'gestor em cliente não liberado', 'não',
    'equipe vê acesso', 'true|true|true',
    'equipe lê impressão digital', 'não',
    'cliente vê (login ligado)', '1|40000000',
    'cliente vê acesso', '0',
    'link abre', 'Cliente T192|last_7_days|1|40000000',
    'link 30 dias', 'last_30_days|30',
    'código errado', 'recusado',
    'link período longo', 'recusado',
    'visitante lê tabela', 'não',
    'visitante chama a função', 'não',
    'link desligado', 'recusado',
    'código antigo após trocar', 'recusado',
    'uso registrado', '0',
    'auditoria', 'client_portal.link_new,client_portal.link_new,client_portal.link_off,client_portal.login_on');
  r record;
begin
  for r in select * from r192 loop
    if expected ->> r.what is distinct from r.v then raise exception 'FALHOU: % = % (esperado %)', r.what, r.v, expected ->> r.what; end if;
  end loop;
  if (select count(*) from r192) <> (select count(*) from jsonb_object_keys(expected)) then
    raise exception 'FALHOU: faltou verificação (%)', (select count(*) from r192);
  end if;
  raise notice 'Etapa 19.2: % verificações OK', (select count(*) from r192);
end $$;

rollback;
