-- =============================================================================
-- Testes da Etapa 36.4 — Central de Operações: Kanban comercial.
-- Rodar inteiro no SQL Editor. Transação desfeita no final: nada fica gravado.
-- =============================================================================
begin;

insert into auth.users (id, instance_id, aud, role, email) values
  ('00000000-0000-0000-0000-00000364aa01', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@t364.local'),
  ('00000000-0000-0000-0000-00000364aa02', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'vendas@t364.local'),
  ('00000000-0000-0000-0000-00000364aa03', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'gestor@t364.local'),
  ('00000000-0000-0000-0000-00000364aa04', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'design@t364.local');
update public.profiles set active = true, role = 'admin', full_name = 'Admin T364' where id = '00000000-0000-0000-0000-00000364aa01';
update public.profiles set active = true, role = 'equipe', full_name = 'Vendas T364' where id = '00000000-0000-0000-0000-00000364aa02';
update public.profiles set active = true, role = 'gestor', full_name = 'Gestor T364' where id = '00000000-0000-0000-0000-00000364aa03';
update public.profiles set active = true, role = 'equipe', full_name = 'Design T364' where id = '00000000-0000-0000-0000-00000364aa04';
insert into public.clients (id, name) values ('00000000-0000-0000-0000-00000364ac01', 'Loja Existente T364');

create temp table r364 (what text, v text) on commit drop;
create temp table k364 (k text, id uuid) on commit drop;
grant all on r364, k364 to authenticated, anon;
insert into k364 select 'comercial', id from public.ops_sectors where name = 'Comercial' and status = 'ativo';
insert into k364 select 'design', id from public.ops_sectors where name = 'Design' and status = 'ativo';

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000364aa01","role":"authenticated"}';
select public.ops_member_save('00000000-0000-0000-0000-00000364aa02', (select id from k364 where k = 'comercial'), '{}', 'Vendas', true, true, '{ops.access,ops.commercial}');
select public.ops_member_save('00000000-0000-0000-0000-00000364aa03', (select id from k364 where k = 'comercial'), '{}', 'Gestor', true, true, '{ops.access,ops.commercial}');
select public.ops_member_save('00000000-0000-0000-0000-00000364aa04', (select id from k364 where k = 'design'), '{}', 'Design', true, true, '{ops.access,ops.tasks.create}');
insert into r364 select 'colunas e motivos iniciais', (select count(*) from public.ops_lead_stages)::text || '|' || (select count(*) from public.ops_loss_reasons)::text
  || '|' || (select string_agg(category, ',' order by position) from public.ops_lead_stages where category <> 'aberto');

-- ---------------------------------------------------------------- quem pode
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000364aa04","role":"authenticated"}';
do $$ begin
  perform public.ops_lead_save(null, null, '{"company_name":"Sem permissão"}');
  insert into r364 values ('sem "Comercial" cria lead', 'sim');
exception when insufficient_privilege then insert into r364 values ('sem "Comercial" cria lead', 'não');
end $$;
insert into r364 select 'sem "Comercial" vê o quadro', coalesce(public.ops_lead_board('{}')::text, 'nada') || '|' || (select count(*) from public.ops_leads)::text;

-- ---------------------------------------------------------------- cadastro e validações
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000364aa02","role":"authenticated"}';
insert into k364 select 'l1', public.ops_lead_save(null, null, jsonb_build_object('company_name', 'Padaria Sol T364', 'contact_name', 'Ana',
  'phone', '(45) 99999-8888', 'email', 'Ana@Sol.com', 'segment', 'Alimentação', 'origin', 'Instagram', 'state', 'pr',
  'potential_value', '1500.50', 'currency', 'BRL', 'owner_id', '00000000-0000-0000-0000-00000364aa02'));
insert into r364 select 'lead criado', (select stage_id || '|' || phone || '|' || email || '|' || state from public.ops_leads where id = (select id from k364 where k = 'l1'));
do $$ begin
  perform public.ops_lead_save(null, null, '{"company_name":"E-mail ruim","email":"ana@"}');
  insert into r364 values ('e-mail inválido', 'aceito');
exception when invalid_parameter_value then insert into r364 values ('e-mail inválido', 'recusado');
end $$;
do $$ begin
  perform public.ops_lead_save(null, null, '{"company_name":"Já perdido","stage_id":"perdido"}');
  insert into r364 values ('lead novo direto em Perdido', 'aceito');
exception when invalid_parameter_value then insert into r364 values ('lead novo direto em Perdido', 'recusado');
end $$;
insert into r364 select 'aviso de duplicado (não impede)',
  (select string_agg(x ->> 'reason', ',') from jsonb_array_elements(public.ops_lead_duplicates('{"company_name":"Outra coisa","email":"ana@sol.com"}') -> 'leads') x)
  || '|' || (select string_agg(x ->> 'reason', ',') from jsonb_array_elements(public.ops_lead_duplicates('{"company_name":"Loja Existente T364"}') -> 'clients') x);
insert into k364 select 'l2', public.ops_lead_save(null, null, jsonb_build_object('company_name', 'Loja Existente T364', 'email', 'ana@sol.com'));
insert into r364 select 'contato parecido cadastra mesmo assim', (select count(*) from public.ops_leads where email = 'ana@sol.com')::text;

-- ---------------------------------------------------------------- histórico sem dados de contato
select public.ops_lead_save((select id from k364 where k = 'l1'), 1, jsonb_build_object('company_name', 'Padaria Sol T364', 'contact_name', 'Ana',
  'phone', '45988887777', 'email', 'ana@sol.com', 'segment', 'Padaria', 'origin', 'Instagram', 'state', 'PR',
  'potential_value', '1500.50', 'currency', 'BRL', 'owner_id', '00000000-0000-0000-0000-00000364aa03'));
insert into r364 select 'edição no histórico', (select (after ->> 'telefone') || '|' || (after ->> 'segmento') || '|' || coalesce(before ->> 'telefone', 'vazio')
  from public.ops_lead_events where lead_id = (select id from k364 where k = 'l1') and action = 'lead.editado')
  || '|' || (select count(*) from public.ops_lead_events where lead_id = (select id from k364 where k = 'l1') and action = 'lead.responsavel')::text;
insert into r364 select 'telefone nunca no histórico', (select count(*) from public.ops_lead_events
  where (coalesce(before::text, '') || coalesce(after::text, '') || coalesce(body, '')) ~ '(45999998888|45988887777|ana@sol)')::text;

-- ---------------------------------------------------------------- regras de transição
do $$ begin
  perform public.ops_lead_move((select id from k364 where k = 'l1'), 1, 'negociacao');
  insert into r364 values ('versão velha', 'aceita');
exception when serialization_failure then insert into r364 values ('versão velha', 'recusada');
end $$;
do $$ begin
  perform public.ops_lead_move((select id from k364 where k = 'l1'), 2, 'perdido');
  insert into r364 values ('perder sem motivo', 'aceito');
exception when invalid_parameter_value then insert into r364 values ('perder sem motivo', 'recusado');
end $$;
select public.ops_lead_move((select id from k364 where k = 'l2'), 1, 'perdido', 'valor', 'Achou caro');
reset role;
insert into r364 select 'perdido com motivo', (select stage_id || '|' || loss_reason_id || '|' || (lost_at is not null)::text from public.ops_leads where id = (select id from k364 where k = 'l2'));
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000364aa01","role":"authenticated"}';
select public.ops_lead_stage_save('contrato_assinado', 'Contrato Assinado', '#EC4899', 'aberto', true, false);
select public.ops_lead_stage_save('negociacao', 'Negociação', '#F59E0B', 'aberto', false, true);
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000364aa02","role":"authenticated"}';
do $$ begin
  perform public.ops_lead_move((select id from k364 where k = 'l1'), 2, 'contrato_assinado');
  insert into r364 values ('pular etapa com a regra "só da anterior"', 'aceito');
exception when invalid_parameter_value then insert into r364 values ('pular etapa com a regra "só da anterior"', 'recusado');
end $$;
do $$ begin
  perform public.ops_lead_move((select id from k364 where k = 'l1'), 2, 'negociacao');
  insert into r364 values ('entrar sem próxima ação', 'aceito');
exception when invalid_parameter_value then insert into r364 values ('entrar sem próxima ação', 'recusado');
end $$;
select public.ops_lead_save((select id from k364 where k = 'l1'), 2, jsonb_build_object('company_name', 'Padaria Sol T364', 'contact_name', 'Ana',
  'phone', '45988887777', 'email', 'ana@sol.com', 'segment', 'Padaria', 'origin', 'Instagram', 'state', 'PR', 'potential_value', '1500.50',
  'currency', 'BRL', 'owner_id', '00000000-0000-0000-0000-00000364aa03', 'next_action', 'Ligar',
  'next_action_date', ((now() at time zone 'America/Sao_Paulo')::date - 1)::text));
select public.ops_lead_move((select id from k364 where k = 'l1'), 3, 'negociacao');
insert into r364 select 'atrasado no quadro', (select x ->> 'overdue' from jsonb_array_elements(public.ops_lead_board('{"overdue":true}') -> 'leads') x
  where x ->> 'id' = (select id from k364 where k = 'l1')::text);
select public.ops_lead_note_add((select id from k364 where k = 'l1'), 'reuniao', 'Reunião de apresentação', now());
insert into r364 select 'interação registrada', (select (last_interaction_at is not null)::text from public.ops_leads where id = (select id from k364 where k = 'l1'))
  || '|' || (select kind from public.ops_lead_events where lead_id = (select id from k364 where k = 'l1') and action = 'lead.interacao');

-- ---------------------------------------------------------------- conversão
do $$ begin
  perform public.ops_lead_convert((select id from k364 where k = 'l1'), 4, null, false, null);
  insert into r364 values ('converter antes de Contrato Pago', 'aceito');
exception when invalid_parameter_value then insert into r364 values ('converter antes de Contrato Pago', 'recusado');
end $$;
select public.ops_lead_move((select id from k364 where k = 'l1'), 4, 'contrato_pago');
do $$ begin
  perform public.ops_lead_convert((select id from k364 where k = 'l1'), 5, null, false, null);
  insert into r364 values ('equipe cria cliente novo', 'sim');
exception when insufficient_privilege then insert into r364 values ('equipe cria cliente novo', 'não');
end $$;
do $$ begin
  perform public.ops_lead_convert((select id from k364 where k = 'l1'), 5, '00000000-0000-0000-0000-00000364ac01', true, null);
  insert into r364 values ('iniciar onboarding sem permissão', 'aceito');
exception when insufficient_privilege then insert into r364 values ('iniciar onboarding sem permissão', 'recusado');
end $$;
select public.ops_lead_convert((select id from k364 where k = 'l1'), 5, '00000000-0000-0000-0000-00000364ac01', false, null);
reset role;
insert into r364 select 'vincular a cliente existente', (select (client_id = '00000000-0000-0000-0000-00000364ac01')::text || '|' || (converted_at is not null)::text
  from public.ops_leads where id = (select id from k364 where k = 'l1')) || '|' || (select count(*) from public.clients where name ilike '%T364%')::text
  || '|' || (select count(*) from public.ops_activity where client_id = '00000000-0000-0000-0000-00000364ac01' and action = 'cliente.convertido')::text;
set local role authenticated;
do $$ begin
  perform public.ops_lead_move((select id from k364 where k = 'l1'), 6, 'negociacao');
  insert into r364 values ('convertido volta para negociação', 'aceito');
exception when invalid_parameter_value then insert into r364 values ('convertido volta para negociação', 'recusado');
end $$;

-- Gestor: cria cliente novo (nome livre) e recusa duplicar um existente.
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000364aa03","role":"authenticated"}';
insert into k364 select 'l3', public.ops_lead_save(null, null, '{"company_name":"Mercado Novo T364","contact_name":"Beto","email":"beto@novo.com"}');
insert into k364 select 'l4', public.ops_lead_save(null, null, '{"company_name":"loja existente t364"}');
select public.ops_lead_move((select id from k364 where k = 'l3'), 1, 'contrato_pago');
select public.ops_lead_move((select id from k364 where k = 'l4'), 1, 'contrato_pago');
do $$ begin
  perform public.ops_lead_convert((select id from k364 where k = 'l4'), 2, null, false, null);
  insert into r364 values ('criar cliente que já existe', 'aceito');
exception when invalid_parameter_value then insert into r364 values ('criar cliente que já existe', 'recusado');
end $$;
insert into k364 select 'c3', (public.ops_lead_convert((select id from k364 where k = 'l3'), 2, null, false, null) ->> 'client_id')::uuid;
reset role;
insert into r364 select 'gestor cria cliente novo', (select name || '|' || coalesce(email, '-') || '|' || (created_by = '00000000-0000-0000-0000-00000364aa03')::text
  from public.clients where id = (select id from k364 where k = 'c3'))
  || '|' || (select count(*) from public.user_client_access where client_id = (select id from k364 where k = 'c3') and user_id = '00000000-0000-0000-0000-00000364aa03')::text;
set local role authenticated;

-- Admin: converte e já inicia o onboarding.
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000364aa01","role":"authenticated"}';
insert into k364 select 'l5', public.ops_lead_save(null, null, '{"company_name":"Academia Força T364"}');
select public.ops_lead_move((select id from k364 where k = 'l5'), 1, 'contrato_pago');
create temp table c364 on commit drop as
  select public.ops_lead_convert((select id from k364 where k = 'l5'), 2, null, true, '00000000-0000-0000-0000-00000364aa03') as r;
insert into r364 select 'converter e iniciar onboarding', (select r ->> 'onboarding' || '|' || (r ->> 'created') from c364)
  || '|' || (select o.stage_id || '|' || (o.am_user_id = '00000000-0000-0000-0000-00000364aa03')::text from public.ops_client_ops o
     join public.ops_leads l on l.client_id = o.client_id where l.id = (select id from k364 where k = 'l5'));

-- ---------------------------------------------------------------- configurações
do $$ begin
  perform public.ops_lead_stage_set_active('perdido', false, 'prospeccao');
  insert into r364 values ('desativar Perdido mandando para coluna aberta', 'aceito');
exception when invalid_parameter_value then insert into r364 values ('desativar Perdido mandando para coluna aberta', 'recusado');
end $$;
do $$ begin
  perform public.ops_lead_stage_save('perdido', 'Perdido', '#EF4444', 'aberto', false, false);
  insert into r364 values ('mudar grupo de coluna com leads', 'aceito');
exception when invalid_parameter_value then insert into r364 values ('mudar grupo de coluna com leads', 'recusado');
end $$;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000364aa02","role":"authenticated"}';
do $$ begin
  perform public.ops_loss_reason_save(null, 'Concorrente', true);
  insert into r364 values ('vendedor configura motivos', 'sim');
exception when insufficient_privilege then insert into r364 values ('vendedor configura motivos', 'não');
end $$;

reset role;
set local role anon;
do $$ begin
  perform 1 from public.ops_leads;
  insert into r364 values ('visitante lê leads', 'sim');
exception when insufficient_privilege then insert into r364 values ('visitante lê leads', 'não');
end $$;
reset role;

do $$
declare
  expected jsonb := jsonb_build_object(
    'colunas e motivos iniciais', '11|5|ganho,perdido',
    'sem "Comercial" cria lead', 'não',
    'sem "Comercial" vê o quadro', 'nada|0',
    'lead criado', 'prospeccao|5545999998888|ana@sol.com|PR',
    'e-mail inválido', 'recusado',
    'lead novo direto em Perdido', 'recusado',
    'aviso de duplicado (não impede)', 'mesmo e-mail|mesmo nome',
    'contato parecido cadastra mesmo assim', '2',
    'edição no histórico', 'alterado|Padaria|vazio|1',
    'telefone nunca no histórico', '0',
    'versão velha', 'recusada',
    'perder sem motivo', 'recusado',
    'perdido com motivo', 'perdido|valor|true',
    'pular etapa com a regra "só da anterior"', 'recusado',
    'entrar sem próxima ação', 'recusado',
    'atrasado no quadro', 'true',
    'interação registrada', 'true|reuniao',
    'converter antes de Contrato Pago', 'recusado',
    'equipe cria cliente novo', 'não',
    'iniciar onboarding sem permissão', 'recusado',
    'vincular a cliente existente', 'true|true|1|1',
    'convertido volta para negociação', 'recusado',
    'criar cliente que já existe', 'recusado',
    'gestor cria cliente novo', 'Mercado Novo T364|beto@novo.com|true|1',
    'converter e iniciar onboarding', 'iniciado|true|contrato_pago|true',
    'desativar Perdido mandando para coluna aberta', 'recusado',
    'mudar grupo de coluna com leads', 'recusado',
    'vendedor configura motivos', 'não',
    'visitante lê leads', 'não');
  r record;
begin
  for r in select * from r364 loop
    if expected ->> r.what is distinct from r.v then raise exception 'FALHOU: % = % (esperado %)', r.what, r.v, expected ->> r.what; end if;
  end loop;
  if (select count(*) from r364) <> (select count(*) from jsonb_object_keys(expected)) then
    raise exception 'FALHOU: faltou verificação (%)', (select count(*) from r364);
  end if;
  raise notice 'Etapa 36.4: % verificações OK', (select count(*) from r364);
end $$;

rollback;
