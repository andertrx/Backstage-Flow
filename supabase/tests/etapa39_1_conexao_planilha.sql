-- =============================================================================
-- Testes da Etapa 39.1 — conexão com o Google Sheets (chave e planilha por cliente).
-- Rodar inteiro no SQL Editor. Transação desfeita no final: nada fica gravado.
-- =============================================================================
begin;
insert into auth.users (id, instance_id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000039a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@t39.local'),
  ('00000000-0000-0000-0000-0000000039a2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'gestor@t39.local'),
  ('00000000-0000-0000-0000-0000000039a3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'operador@t39.local'),
  ('00000000-0000-0000-0000-0000000039a4', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cliente@t39.local');
update public.profiles set active = true, role = 'admin'    where id = '00000000-0000-0000-0000-0000000039a1';
update public.profiles set active = true, role = 'gestor'   where id = '00000000-0000-0000-0000-0000000039a2';
update public.profiles set active = true, role = 'operador' where id = '00000000-0000-0000-0000-0000000039a3';
update public.profiles set active = true, role = 'cliente'  where id = '00000000-0000-0000-0000-0000000039a4';
insert into public.clients (id, name) values
  ('00000000-0000-0000-0000-0000000039c1', 'Cliente Liberado T39'),
  ('00000000-0000-0000-0000-0000000039c2', 'Cliente Bloqueado T39');
insert into public.user_client_access (user_id, client_id)
select u, '00000000-0000-0000-0000-0000000039c1'::uuid from unnest(array[
  '00000000-0000-0000-0000-0000000039a2', '00000000-0000-0000-0000-0000000039a3', '00000000-0000-0000-0000-0000000039a4']::uuid[]) u;

create temp table r (what text, v text);
grant all on r to authenticated;
create function pg_temp.try(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return 'aceitou'; exception when others then return 'recusou'; end $$;
grant execute on function pg_temp.try(text) to authenticated;

set local role authenticated;
-- Chave da conta de serviço: só admin; só aceita o JSON certo.
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000039a2","role":"authenticated"}';
insert into r select 'gestor salva chave', pg_temp.try($q$select public.sheets_settings_save('{"type":"service_account","client_email":"crm@p.iam.gserviceaccount.com","private_key":"-----BEGIN PRIVATE KEY-----\nAAA\n-----END PRIVATE KEY-----\n"}')$q$);
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000039a1","role":"authenticated"}';
insert into r select 'texto qualquer', pg_temp.try($q$select public.sheets_settings_save('abc')$q$);
insert into r select 'JSON sem chave privada', pg_temp.try($q$select public.sheets_settings_save('{"type":"service_account","client_email":"crm@p.iam.gserviceaccount.com"}')$q$);
insert into r select 'admin salva chave', public.sheets_settings_save('{"type":"service_account","client_email":"CRM@p.iam.gserviceaccount.com","private_key":"-----BEGIN PRIVATE KEY-----\nAAA\n-----END PRIVATE KEY-----\n"}');
insert into r select 'configuração visível', (select service_account_email || '|' || has_key from public.sheets_settings);
reset role;
insert into r select 'chave no cofre', (select (public.sheets_key_get())::jsonb ->> 'client_email');
set local role authenticated;
insert into r select 'equipe não lê a chave', pg_temp.try($q$select public.sheets_key_get()$q$);

-- Planilha do cliente
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000039a2","role":"authenticated"}';
insert into r select 'gestor salva planilha', pg_temp.try($q$select public.ri_source_save(null, '00000000-0000-0000-0000-0000000039c1',
  '1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789', 'Leads T39', 'Leads', 1,
  '{"record_id":"ID","profile":"Tipo de Cliente","campaign_name":"Campaign Name","ad_id":"Ad ID"}',
  '{"lojista":"lojista","sacoleira":"sacoleiro","consumidor":"consumidor_final"}')$q$);
insert into r select 'gestor em cliente não liberado', pg_temp.try($q$select public.ri_source_save(null, '00000000-0000-0000-0000-0000000039c2',
  '1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789', 'Leads', 'Leads', 1, '{"profile":"Tipo"}', '{}')$q$);
insert into r select 'mesma aba duas vezes', pg_temp.try($q$select public.ri_source_save(null, '00000000-0000-0000-0000-0000000039c1',
  '1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789', 'Leads', 'Leads', 1, '{"profile":"Tipo"}', '{}')$q$);
insert into r select 'sem coluna de perfil', pg_temp.try($q$select public.ri_source_save(null, '00000000-0000-0000-0000-0000000039c1',
  '1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789', 'Leads', 'Outra', 1, '{"record_id":"ID"}', '{}')$q$);
insert into r select 'campo desconhecido', pg_temp.try($q$select public.ri_source_save(null, '00000000-0000-0000-0000-0000000039c1',
  '1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789', 'Leads', 'Outra', 1, '{"profile":"Tipo","senha":"X"}', '{}')$q$);
insert into r select 'perfil inválido na regra', pg_temp.try($q$select public.ri_source_save(null, '00000000-0000-0000-0000-0000000039c1',
  '1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789', 'Leads', 'Outra', 1, '{"profile":"Tipo"}', '{"vip":"atacadista"}')$q$);
insert into r select 'ID da planilha inválido', pg_temp.try($q$select public.ri_source_save(null, '00000000-0000-0000-0000-0000000039c1',
  'https://x', 'Leads', 'Outra', 1, '{"profile":"Tipo"}', '{}')$q$);
insert into r select 'gestor altera', pg_temp.try($q$select public.ri_source_save((select id from public.ri_sources where spreadsheet_title = 'Leads T39'),
  null, '1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789', 'Leads T39', 'Leads', 2, '{"profile":"Tipo de Cliente"}', '{"lojista":"lojista"}')$q$);
insert into r select 'alteração gravada', (select header_row || '|' || (profile_rules ->> 'lojista') from public.ri_sources where spreadsheet_title = 'Leads T39');

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000039a3","role":"authenticated"}';
insert into r select 'operador vê a planilha', (select count(*)::text from public.ri_sources where spreadsheet_title = 'Leads T39');
insert into r select 'operador não altera', pg_temp.try($q$select public.ri_source_save((select id from public.ri_sources where spreadsheet_title = 'Leads T39'),
  null, '1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789', 'Leads T39', 'Leads', 3, '{"profile":"Tipo"}', '{}')$q$);
insert into r select 'operador vê a conta do Google', (select count(*)::text from public.sheets_settings);
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000039a4","role":"authenticated"}';
insert into r select 'cliente não vê a planilha', (select count(*)::text from public.ri_sources);
insert into r select 'cliente não vê a conta do Google', (select count(*)::text from public.sheets_settings);
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000039a1","role":"authenticated"}';
select public.sheets_settings_remove_key();
reset role;
insert into r select 'chave removida', (select has_key::text || '|' || coalesce(nullif(public.sheets_key_get(), ''), 'vazia') from public.sheets_settings);
insert into r select 'auditoria', (select count(*)::text from public.audit_logs
  where actor_id in ('00000000-0000-0000-0000-0000000039a1', '00000000-0000-0000-0000-0000000039a2')
    and action in ('sheets_settings.update', 'sheets_settings.remove_key', 'ri_source.create', 'ri_source.update'));

do $$
declare
  e jsonb := jsonb_build_object(
    'gestor salva chave', 'recusou',
    'texto qualquer', 'recusou',
    'JSON sem chave privada', 'recusou',
    'admin salva chave', 'crm@p.iam.gserviceaccount.com',
    'configuração visível', 'crm@p.iam.gserviceaccount.com|true',
    'chave no cofre', 'CRM@p.iam.gserviceaccount.com',
    'equipe não lê a chave', 'recusou',
    'gestor salva planilha', 'aceitou',
    'gestor em cliente não liberado', 'recusou',
    'mesma aba duas vezes', 'recusou',
    'sem coluna de perfil', 'recusou',
    'campo desconhecido', 'recusou',
    'perfil inválido na regra', 'recusou',
    'ID da planilha inválido', 'recusou',
    'gestor altera', 'aceitou',
    'alteração gravada', '2|lojista',
    'operador vê a planilha', '1',
    'operador não altera', 'recusou',
    'operador vê a conta do Google', '1',
    'cliente não vê a planilha', '0',
    'cliente não vê a conta do Google', '0',
    'chave removida', 'false|vazia',
    'auditoria', '4');
  x record;
begin
  for x in select * from r loop
    if e ->> x.what is distinct from x.v then raise exception 'FALHOU: % = % (esperado %)', x.what, x.v, e ->> x.what; end if;
  end loop;
  if (select count(*) from r) <> (select count(*) from jsonb_object_keys(e)) then raise exception 'FALHOU: faltou verificação'; end if;
  raise notice 'Etapa 39.1: % verificações OK', (select count(*) from r);
end $$;

rollback;
