-- =============================================================================
-- Teste — Inteligência de Resultados, apresentação por perfil (21/10/2026):
-- leads e mensagens do Meta em cada criativo; sem dado da plataforma = null ("—").
-- Transação desfeita no final.
-- =============================================================================
begin;
insert into auth.users (id, instance_id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000397a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@t397.local');
update public.profiles set active = true, role = 'admin' where id = '00000000-0000-0000-0000-0000000397a1';
insert into public.clients (id, name) values ('00000000-0000-0000-0000-0000000397c1', 'Cliente T397');
insert into public.ad_accounts (id, platform_id, external_id, client_id, name, currency, timezone) values
  ('00000000-0000-0000-0000-0000000397ac', 'meta', 't397a', '00000000-0000-0000-0000-0000000397c1', 'Conta T397', 'BRL', 'America/Sao_Paulo');
insert into public.campaigns (id, ad_account_id, client_id, platform_id, external_id, name) values
  ('00000000-0000-0000-0000-000000397ca1', '00000000-0000-0000-0000-0000000397ac', '00000000-0000-0000-0000-0000000397c1', 'meta', '9397001', 'Atacado');
insert into public.ad_groups (id, campaign_id, ad_account_id, client_id, platform_id, external_id, name) values
  ('00000000-0000-0000-0000-000000397ab1', '00000000-0000-0000-0000-000000397ca1', '00000000-0000-0000-0000-0000000397ac', '00000000-0000-0000-0000-0000000397c1', 'meta', '9397011', 'Lojistas');
insert into public.ads (id, ad_group_id, campaign_id, ad_account_id, client_id, platform_id, external_id, name) values
  ('00000000-0000-0000-0000-000000397ad1', '00000000-0000-0000-0000-000000397ab1', '00000000-0000-0000-0000-000000397ca1', '00000000-0000-0000-0000-0000000397ac', '00000000-0000-0000-0000-0000000397c1', 'meta', '9397021', 'Video A'),
  ('00000000-0000-0000-0000-000000397ad2', '00000000-0000-0000-0000-000000397ab1', '00000000-0000-0000-0000-000000397ca1', '00000000-0000-0000-0000-0000000397ac', '00000000-0000-0000-0000-0000000397c1', 'meta', '9397022', 'Video B');
insert into public.metrics_daily (date, ad_account_id, level, entity_external_id, client_id, platform_id, campaign_id, ad_group_id, ad_id, currency, spend_micros, leads, messages, hash, superseded) values
  ('2026-10-10', '00000000-0000-0000-0000-0000000397ac', 'ad', '9397021', '00000000-0000-0000-0000-0000000397c1', 'meta', '00000000-0000-0000-0000-000000397ca1', '00000000-0000-0000-0000-000000397ab1', '00000000-0000-0000-0000-000000397ad1', 'BRL', 10000000, 4, 7, 'h', false),
  ('2026-10-11', '00000000-0000-0000-0000-0000000397ac', 'ad', '9397021', '00000000-0000-0000-0000-0000000397c1', 'meta', '00000000-0000-0000-0000-000000397ca1', '00000000-0000-0000-0000-000000397ab1', '00000000-0000-0000-0000-000000397ad1', 'BRL', 10000000, 1, 2, 'h', false);
insert into public.ri_sources (id, client_id, spreadsheet_id, sheet_name, mapping, profile_rules)
values ('00000000-0000-0000-0000-0000000397f1', '00000000-0000-0000-0000-0000000397c1', '1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789', 'Leads', '{"profile":"SQL"}', '{"lojista":"lojista"}');
select public.ri_read_store('00000000-0000-0000-0000-0000000397f1', 'manual',
  '[{"n":2,"k":"L2","h":"a","d":"2026-10-10","p":"lojista","aid":"9397021"},{"n":3,"k":"L3","h":"b","d":"2026-10-10","p":"lojista","aid":"9397022"}]', '{}');
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000397a1","role":"authenticated"}';
do $$
declare
  v text := (select string_agg(concat_ws(':', i ->> 'name', i ->> 'lojista', coalesce(i ->> 'leads', 'null'), coalesce(i ->> 'messages', 'null')), ' / ' order by i ->> 'name')
             from jsonb_array_elements(public.ri_results('00000000-0000-0000-0000-0000000397c1', '2026-10-01', '2026-10-31', 'ad') -> 'items') i);
begin
  if v is distinct from 'Video A:1:5.0000:9.0000 / Video B:1:null:null' then raise exception 'FALHOU: %', v; end if;
  raise notice 'Apresentação por perfil: leads e mensagens por criativo OK';
end $$;
rollback;
