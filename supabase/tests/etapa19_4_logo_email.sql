-- =============================================================================
-- Testes da Etapa 19.4 — Logo do cliente e e-mail semanal (Resend).
-- Rodar inteiro no SQL Editor. Transação desfeita no final: nada fica gravado
-- (nem a chave de teste no cofre).
-- =============================================================================
begin;

insert into auth.users (id, instance_id, aud, role, email) values
  ('00000000-0000-0000-0000-00000194aa01', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'gestor@t194.local'),
  ('00000000-0000-0000-0000-00000194aa02', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cliente@t194.local'),
  ('00000000-0000-0000-0000-00000194aa03', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'operador@t194.local'),
  ('00000000-0000-0000-0000-00000194aa04', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@t194.local');
update public.profiles set active = true, role = 'gestor' where id = '00000000-0000-0000-0000-00000194aa01';
update public.profiles set active = true, role = 'cliente' where id = '00000000-0000-0000-0000-00000194aa02';
update public.profiles set active = true, role = 'operador' where id = '00000000-0000-0000-0000-00000194aa03';
update public.profiles set active = true, role = 'admin' where id = '00000000-0000-0000-0000-00000194aa04';
insert into public.clients (id, name, timezone) values
  ('00000000-0000-0000-0000-00000194ac01', 'Cliente T194', 'America/Sao_Paulo'),
  ('00000000-0000-0000-0000-00000194ac02', 'Outro T194', 'America/Sao_Paulo');
insert into public.user_client_access (user_id, client_id) values
  ('00000000-0000-0000-0000-00000194aa01', '00000000-0000-0000-0000-00000194ac01'),
  ('00000000-0000-0000-0000-00000194aa02', '00000000-0000-0000-0000-00000194ac01'),
  ('00000000-0000-0000-0000-00000194aa03', '00000000-0000-0000-0000-00000194ac01');
insert into public.client_portal (client_id, login_enabled) values ('00000000-0000-0000-0000-00000194ac01', true);
-- Estado atual do remetente (o teste mexe e a transação desfaz)
update public.email_settings set has_key = false where id;

create temp table r194 (what text, v text) on commit drop;
create temp table tok194 (t text) on commit drop;
grant all on r194, tok194 to authenticated, anon, service_role;

-- ---------------------------------------------------------------- Logo
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000194aa01","role":"authenticated"}';
insert into r194 select 'pasta da logo (gestor)',
  private.can_edit_client_folder('00000000-0000-0000-0000-00000194ac01/abcdefgh.png')::text || '|' ||
  private.can_edit_client_folder('00000000-0000-0000-0000-00000194ac02/abcdefgh.png')::text || '|' ||
  private.can_edit_client_folder('../qualquer/coisa.png')::text;
insert into public.client_report_settings (client_id, title, logo_path)
values ('00000000-0000-0000-0000-00000194ac01', 'T194', '00000000-0000-0000-0000-00000194ac01/abcdefgh12.png');
do $$ begin
  update public.client_report_settings set logo_path = 'http://site-mau.com/x.png' where client_id = '00000000-0000-0000-0000-00000194ac01';
  insert into r194 values ('caminho de logo estranho', 'aceito');
exception when check_violation then insert into r194 values ('caminho de logo estranho', 'recusado');
end $$;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000194aa03","role":"authenticated"}';
insert into r194 select 'pasta da logo (operador)', private.can_edit_client_folder('00000000-0000-0000-0000-00000194ac01/abcdefgh.png')::text;

-- ---------------------------------------------------------------- Remetente e chave (só admin)
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000194aa01","role":"authenticated"}';
insert into r194 select 'gestor lê remetente', (select count(*) from public.email_settings)::text;
do $$ begin
  perform public.email_settings_save('X', 'x@backstageflow.com.br', null, 're_chavedeteste_123456');
  insert into r194 values ('gestor salva chave', 'sim');
exception when insufficient_privilege then insert into r194 values ('gestor salva chave', 'não');
end $$;
do $$ begin
  perform public.email_api_key_get();
  insert into r194 values ('equipe lê a chave', 'sim');
exception when insufficient_privilege then insert into r194 values ('equipe lê a chave', 'não');
end $$;

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000194aa04","role":"authenticated"}';
do $$ begin
  perform public.email_settings_save('X', 'x@backstageflow.com.br', null, 'sk_nao_e_resend_123');
  insert into r194 values ('chave formato errado', 'aceito');
exception when invalid_parameter_value then insert into r194 values ('chave formato errado', 'recusado');
end $$;
select public.email_settings_save('Agência T194', 'Relatorios@BackstageFlow.com.br', 'contato@t194.local', 're_chavedeteste_123456');
insert into r194 select 'admin salva', from_email || '|' || has_key::text || '|' || reply_to from public.email_settings;
reset role;
insert into r194 select 'chave no cofre', (select decrypted_secret from vault.decrypted_secrets where name = 'resend_api_key');
insert into r194 select 'chave fora das tabelas', (select count(*) from public.email_settings e where to_jsonb(e)::text like '%re_chavedeteste%')::text;
set local role service_role;
insert into r194 select 'servidor lê a chave', public.email_api_key_get();

-- ---------------------------------------------------------------- E-mail por cliente
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000194aa03","role":"authenticated"}';
do $$ begin
  insert into public.client_report_email (client_id, enabled, recipients) values ('00000000-0000-0000-0000-00000194ac01', true, '{a@b.com}');
  insert into r194 values ('operador cria e-mail', 'sim');
exception when insufficient_privilege then insert into r194 values ('operador cria e-mail', 'não');
end $$;

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000194aa01","role":"authenticated"}';
do $$ begin
  insert into public.client_report_email (client_id, recipients) values ('00000000-0000-0000-0000-00000194ac01', '{dono@cliente.com, nao-e-email}');
  insert into r194 values ('e-mail inválido', 'aceito');
exception when check_violation then insert into r194 values ('e-mail inválido', 'recusado');
end $$;
do $$ begin
  insert into public.client_report_email (client_id, recipients)
  select '00000000-0000-0000-0000-00000194ac01', array_agg('p' || g || '@cliente.com') from generate_series(1, 11) g;
  insert into r194 values ('11 destinatários', 'aceito');
exception when check_violation then insert into r194 values ('11 destinatários', 'recusado');
end $$;
do $$ begin
  insert into public.client_report_email (client_id, recipients) values ('00000000-0000-0000-0000-00000194ac02', '{a@b.com}');
  insert into r194 values ('gestor em cliente não liberado', 'sim');
exception when insufficient_privilege then insert into r194 values ('gestor em cliente não liberado', 'não');
end $$;
-- Agora, no dia e hora atuais do cliente (para o agendador escolher)
insert into public.client_report_email (client_id, enabled, recipients, weekday, send_hour, button)
values ('00000000-0000-0000-0000-00000194ac01', true, '{dono@cliente.com,financeiro@cliente.com}',
        extract(isodow from now() at time zone 'America/Sao_Paulo')::smallint, extract(hour from now() at time zone 'America/Sao_Paulo')::smallint, 'link');
do $$ begin
  update public.client_report_email set last_sent_at = now() where client_id = '00000000-0000-0000-0000-00000194ac01';
  insert into r194 values ('equipe muda último envio', 'sim');
exception when insufficient_privilege then insert into r194 values ('equipe muda último envio', 'não');
end $$;

-- Link do botão: só o link ATUAL do cliente
insert into r194 select 'link antes de guardar', public.client_report_email_link_status('00000000-0000-0000-0000-00000194ac01');
insert into tok194 select public.client_portal_new_link('00000000-0000-0000-0000-00000194ac01', null);
do $$ begin
  perform public.client_report_email_set_link('00000000-0000-0000-0000-00000194ac01', 'https://www.backstageflow.com.br/r/' || repeat('A', 43));
  insert into r194 values ('link inventado', 'aceito');
exception when invalid_parameter_value then insert into r194 values ('link inventado', 'recusado');
end $$;
select public.client_report_email_set_link('00000000-0000-0000-0000-00000194ac01', 'https://www.backstageflow.com.br/r/' || (select t from tok194));
insert into r194 select 'link guardado', public.client_report_email_link_status('00000000-0000-0000-0000-00000194ac01');
do $$ begin
  perform public.client_report_email_link_get('00000000-0000-0000-0000-00000194ac01');
  insert into r194 values ('equipe lê o link', 'sim');
exception when insufficient_privilege then insert into r194 values ('equipe lê o link', 'não');
end $$;

-- O cliente (papel cliente) não vê nada do e-mail
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000194aa02","role":"authenticated"}';
insert into r194 select 'cliente vê config', (select count(*) from public.client_report_email)::text || '|' ||
  coalesce(public.client_report_email_link_status('00000000-0000-0000-0000-00000194ac01'), 'nada');

-- Servidor: quem está na vez e o link
set local role service_role;
insert into r194 select 'na vez', (select count(*) from public.client_report_email_due(50) d where d = '00000000-0000-0000-0000-00000194ac01')::text;
insert into r194 select 'servidor lê link', (public.client_report_email_link_get('00000000-0000-0000-0000-00000194ac01') = (select t from tok194))::text;
update public.client_report_email set last_sent_at = now() - interval '1 day' where client_id = '00000000-0000-0000-0000-00000194ac01';
insert into r194 select 'enviado ontem', (select count(*) from public.client_report_email_due(50) d where d = '00000000-0000-0000-0000-00000194ac01')::text;
update public.client_report_email set last_sent_at = null where client_id = '00000000-0000-0000-0000-00000194ac01';
insert into public.client_report_email_log (client_id, trigger, status, recipients, detail)
values ('00000000-0000-0000-0000-00000194ac01', 'manual', 'enviado', 2, '2 enviado(s).');

-- Novo link: o guardado deixa de valer
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000194aa01","role":"authenticated"}';
select public.client_portal_new_link('00000000-0000-0000-0000-00000194ac01', null);
insert into r194 select 'link depois de trocar', public.client_report_email_link_status('00000000-0000-0000-0000-00000194ac01');
insert into r194 select 'equipe vê envios', (select count(*) from public.client_report_email_log)::text;
set local role service_role;
insert into r194 select 'servidor lê link trocado', coalesce(public.client_report_email_link_get('00000000-0000-0000-0000-00000194ac01'), 'nada');

-- Sem chave: ninguém na vez
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000194aa04","role":"authenticated"}';
select public.email_settings_remove_key();
reset role;
insert into r194 select 'chave removida', (select count(*) from vault.secrets where name = 'resend_api_key')::text || '|' ||
  (select has_key::text from public.email_settings);
set local role service_role;
insert into r194 select 'na vez sem chave', (select count(*) from public.client_report_email_due(50))::text;
reset role;

-- Visitante (anon) não lê nada
set local role anon;
do $$ begin
  perform 1 from public.client_report_email;
  insert into r194 values ('visitante lê', 'sim');
exception when insufficient_privilege then insert into r194 values ('visitante lê', 'não');
end $$;
reset role;

insert into r194 select 'auditoria', string_agg(action, ',' order by action)
  from public.audit_logs where actor_id = '00000000-0000-0000-0000-00000194aa04';

do $$
declare
  expected jsonb := jsonb_build_object(
    'pasta da logo (gestor)', 'true|false|false',
    'caminho de logo estranho', 'recusado',
    'pasta da logo (operador)', 'false',
    'gestor lê remetente', '0',
    'gestor salva chave', 'não',
    'equipe lê a chave', 'não',
    'chave formato errado', 'recusado',
    'admin salva', 'relatorios@backstageflow.com.br|true|contato@t194.local',
    'chave no cofre', 're_chavedeteste_123456',
    'chave fora das tabelas', '0',
    'servidor lê a chave', 're_chavedeteste_123456',
    'operador cria e-mail', 'não',
    'e-mail inválido', 'recusado',
    '11 destinatários', 'recusado',
    'gestor em cliente não liberado', 'não',
    'equipe muda último envio', 'não',
    'link antes de guardar', 'sem_link',
    'link inventado', 'recusado',
    'link guardado', 'ok',
    'equipe lê o link', 'não',
    'cliente vê config', '0|nada',
    'na vez', '1',
    'servidor lê link', 'true',
    'enviado ontem', '0',
    'link depois de trocar', 'desatualizado',
    'equipe vê envios', '1',
    'servidor lê link trocado', 'nada',
    'chave removida', '0|false',
    'na vez sem chave', '0',
    'visitante lê', 'não',
    'auditoria', 'email_settings.remove_key,email_settings.update');
  r record;
begin
  for r in select * from r194 loop
    if expected ->> r.what is distinct from r.v then raise exception 'FALHOU: % = % (esperado %)', r.what, r.v, expected ->> r.what; end if;
  end loop;
  if (select count(*) from r194) <> (select count(*) from jsonb_object_keys(expected)) then
    raise exception 'FALHOU: faltou verificação (%)', (select count(*) from r194);
  end if;
  raise notice 'Etapa 19.4: % verificações OK', (select count(*) from r194);
end $$;

rollback;
