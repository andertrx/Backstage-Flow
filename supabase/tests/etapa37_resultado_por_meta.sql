-- =============================================================================
-- Testes da correção de 05/10/2026 — Monitoramento: o "resultado" segue a META DE OTIMIZAÇÃO do conjunto
-- (igual ao Gerenciador do Meta), não só o objetivo da campanha.
-- Rodar inteiro no SQL Editor. Transação desfeita no final: nada fica gravado.
-- Períodos fixos: atual 21–27/09/2026, anterior 14–20/09/2026.
-- =============================================================================
begin;

insert into auth.users (id, instance_id, aud, role, email) values
  ('00000000-0000-0000-0000-0000037baa01', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@t37b.local');
update public.profiles set active = true, role = 'admin', full_name = 'Admin T37B' where id = '00000000-0000-0000-0000-0000037baa01';

insert into public.clients (id, name) values ('00000000-0000-0000-0000-0000037bcc01', 'Cliente T37B');
insert into public.ad_accounts (id, platform_id, external_id, client_id, name, currency, timezone) values
  ('00000000-0000-0000-0000-0000037bac01', 'meta', 't37b', '00000000-0000-0000-0000-0000037bcc01', 'Conta T37B', 'BRL', 'America/Sao_Paulo');
insert into public.sync_state (ad_account_id, status, history_from, history_to, last_success_at) values
  ('00000000-0000-0000-0000-0000037bac01', 'sucesso', '2026-01-01', '2026-09-30', now());

-- E: Engajamento com conjunto otimizado para Conversas (caso Shineray).
-- S: Vendas com um conjunto de Conversas e outro de Conversões (mistura).
-- L: Leads sem meta informada (vale o objetivo).  T: Tráfego otimizado para visita ao perfil (não guardamos).
insert into public.campaigns (id, ad_account_id, client_id, platform_id, external_id, name, objective, status) values
  ('00000000-0000-0000-0000-0000037bca01', '00000000-0000-0000-0000-0000037bac01', '00000000-0000-0000-0000-0000037bcc01', 'meta', 'e', 'Engajamento WhatsApp', 'OUTCOME_ENGAGEMENT', 'ativa'),
  ('00000000-0000-0000-0000-0000037bca02', '00000000-0000-0000-0000-0000037bac01', '00000000-0000-0000-0000-0000037bcc01', 'meta', 's', 'Vendas mista', 'OUTCOME_SALES', 'ativa'),
  ('00000000-0000-0000-0000-0000037bca03', '00000000-0000-0000-0000-0000037bac01', '00000000-0000-0000-0000-0000037bcc01', 'meta', 'l', 'Leads', 'OUTCOME_LEADS', 'ativa'),
  ('00000000-0000-0000-0000-0000037bca04', '00000000-0000-0000-0000-0000037bac01', '00000000-0000-0000-0000-0000037bcc01', 'meta', 't', 'Perfil', 'OUTCOME_TRAFFIC', 'ativa');
insert into public.ad_groups (id, campaign_id, ad_account_id, client_id, platform_id, external_id, name, optimization_goal, status) values
  ('00000000-0000-0000-0000-0000037bab01', '00000000-0000-0000-0000-0000037bca01', '00000000-0000-0000-0000-0000037bac01', '00000000-0000-0000-0000-0000037bcc01', 'meta', 'ge', 'Conversas', 'CONVERSATIONS', 'ativa'),
  ('00000000-0000-0000-0000-0000037bab02', '00000000-0000-0000-0000-0000037bca02', '00000000-0000-0000-0000-0000037bac01', '00000000-0000-0000-0000-0000037bcc01', 'meta', 'gs1', 'Vendas WhatsApp', 'CONVERSATIONS', 'ativa'),
  ('00000000-0000-0000-0000-0000037bab03', '00000000-0000-0000-0000-0000037bca02', '00000000-0000-0000-0000-0000037bac01', '00000000-0000-0000-0000-0000037bcc01', 'meta', 'gs2', 'Vendas site', 'OFFSITE_CONVERSIONS', 'ativa'),
  ('00000000-0000-0000-0000-0000037bab04', '00000000-0000-0000-0000-0000037bca03', '00000000-0000-0000-0000-0000037bac01', '00000000-0000-0000-0000-0000037bcc01', 'meta', 'gl', 'Leads', null, 'ativa'),
  ('00000000-0000-0000-0000-0000037bab05', '00000000-0000-0000-0000-0000037bca04', '00000000-0000-0000-0000-0000037bac01', '00000000-0000-0000-0000-0000037bcc01', 'meta', 'gt', 'Perfil', 'PROFILE_VISIT', 'ativa');
insert into public.ads (id, ad_group_id, campaign_id, ad_account_id, client_id, platform_id, external_id, name, status) values
  ('00000000-0000-0000-0000-0000037bad01', '00000000-0000-0000-0000-0000037bab01', '00000000-0000-0000-0000-0000037bca01', '00000000-0000-0000-0000-0000037bac01', '00000000-0000-0000-0000-0000037bcc01', 'meta', 'ae', 'Anúncio conversas', 'ativa'),
  ('00000000-0000-0000-0000-0000037bad02', '00000000-0000-0000-0000-0000037bab03', '00000000-0000-0000-0000-0000037bca02', '00000000-0000-0000-0000-0000037bac01', '00000000-0000-0000-0000-0000037bcc01', 'meta', 'as', 'Anúncio site', 'ativa');

insert into public.metrics_daily (date, ad_account_id, level, entity_external_id, client_id, platform_id, campaign_id, ad_group_id, ad_id, currency, spend_micros, impressions, clicks, leads, messages, conversions, hash, superseded)
select v.date::date, '00000000-0000-0000-0000-0000037bac01', v.level::public.entity_level, v.ext, '00000000-0000-0000-0000-0000037bcc01', 'meta',
       v.camp::uuid, v.grp::uuid, v.ad::uuid, 'BRL', v.spend, 1000, 20, v.leads, v.msgs, v.conv, 'h', false
from (values
  ('2026-09-22', 'ad', 'ae', '00000000-0000-0000-0000-0000037bca01', '00000000-0000-0000-0000-0000037bab01', '00000000-0000-0000-0000-0000037bad01', 10000000::bigint, 0::numeric, 1::numeric, 0::numeric),
  ('2026-09-23', 'ad', 'ae', '00000000-0000-0000-0000-0000037bca01', '00000000-0000-0000-0000-0000037bab01', '00000000-0000-0000-0000-0000037bad01', 10000000, 0, 1, 0),
  ('2026-09-22', 'campaign', 'e', '00000000-0000-0000-0000-0000037bca01', null, null, 20000000, 0, 2, 0),
  ('2026-09-23', 'campaign', 'e', '00000000-0000-0000-0000-0000037bca01', null, null, 0, 0, 0, 0),
  ('2026-09-22', 'ad', 'as', '00000000-0000-0000-0000-0000037bca02', '00000000-0000-0000-0000-0000037bab03', '00000000-0000-0000-0000-0000037bad02', 30000000, 0, 4, 1),
  ('2026-09-15', 'ad', 'as', '00000000-0000-0000-0000-0000037bca02', '00000000-0000-0000-0000-0000037bab03', '00000000-0000-0000-0000-0000037bad02', 30000000, 0, 0, 2)
) as v(date, level, ext, camp, grp, ad, spend, leads, msgs, conv);

create temp table r37b (what text, v text) on commit drop;
grant all on r37b to authenticated;

-- 1. Tradução da meta (sem banco).
insert into r37b select 'metas', concat_ws(',',
  private.monitor_result_kind(private.monitor_goal_objective('OUTCOME_ENGAGEMENT', 'CONVERSATIONS')),
  private.monitor_result_kind(private.monitor_goal_objective('OUTCOME_SALES', 'CONVERSATIONS')),
  private.monitor_result_kind(private.monitor_goal_objective('OUTCOME_SALES', 'OFFSITE_CONVERSIONS')),
  private.monitor_result_kind(private.monitor_goal_objective('OUTCOME_LEADS', 'OFFSITE_CONVERSIONS')),
  private.monitor_result_kind(private.monitor_goal_objective('OUTCOME_TRAFFIC', 'LINK_CLICKS')),
  private.monitor_result_kind(private.monitor_goal_objective('OUTCOME_TRAFFIC', 'PROFILE_VISIT')),
  private.monitor_result_kind(private.monitor_goal_objective('OUTCOME_AWARENESS', 'THRUPLAY')),
  private.monitor_result_kind(private.monitor_goal_objective('OUTCOME_LEADS', null)),
  private.monitor_result_kind(private.monitor_goal_objective('OUTCOME_SALES', 'AUTOMATIC_OBJECTIVE')));

-- 2. Campanhas: tipo do conjunto quando todos levam ao mesmo resultado; mistura = soma.
insert into r37b select 'campanhas', concat_ws(',',
  private.monitor_result_kind_for('00000000-0000-0000-0000-0000037bca01', null),
  private.monitor_result_kind_for('00000000-0000-0000-0000-0000037bca02', null),
  private.monitor_result_kind_for('00000000-0000-0000-0000-0000037bca03', null),
  private.monitor_result_kind_for('00000000-0000-0000-0000-0000037bca04', null));
-- 3. Conjuntos da campanha mista: cada um com o seu.
insert into r37b select 'conjuntos mista', concat_ws(',',
  private.monitor_result_kind_for('00000000-0000-0000-0000-0000037bca02', '00000000-0000-0000-0000-0000037bab02'),
  private.monitor_result_kind_for('00000000-0000-0000-0000-0000037bca02', '00000000-0000-0000-0000-0000037bab03'));
-- 4. Conjunto de conversas pausado: a campanha mista passa a ser medida só pelo conjunto ativo (compras).
update public.ad_groups set status = 'pausada' where id = '00000000-0000-0000-0000-0000037bab02';
insert into r37b select 'mista sem o pausado', private.monitor_result_kind_for('00000000-0000-0000-0000-0000037bca02', null);
update public.ad_groups set status = 'ativa' where id = '00000000-0000-0000-0000-0000037bab02';

-- 5. Valor do período usado no acompanhamento do alerta: anúncio de conversas = 2 conversas.
insert into r37b select 'valor do período', private.monitor_period_value('ad', '00000000-0000-0000-0000-0000037bca01', '00000000-0000-0000-0000-0000037bad01', 'results', '2026-09-21', '2026-09-27')::int::text;

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000037baa01","role":"authenticated"}';

-- 6. Tela: o anúncio de conversas vem com o objetivo efetivo MESSAGES (a tela mostra "conversas iniciadas" = 2).
insert into r37b select 'tela anúncio conversas', concat_ws('|', objective, cur_messages::int)
  from public.monitor_compare('ad', '2026-09-21', '2026-09-27', '2026-09-14', '2026-09-20', '00000000-0000-0000-0000-0000037bcc01')
 where name = 'Anúncio conversas';
-- 7. Tela: anúncio de site da campanha mista = compras; a campanha mista = soma ('' = mistura).
insert into r37b select 'tela anúncio site', concat_ws('|', objective, cur_conversions::int, prev_conversions::int)
  from public.monitor_compare('ad', '2026-09-21', '2026-09-27', '2026-09-14', '2026-09-20', '00000000-0000-0000-0000-0000037bcc01')
 where name = 'Anúncio site';
insert into r37b select 'tela campanha engajamento', objective
  from public.monitor_compare('campaign', '2026-09-21', '2026-09-27', '2026-09-14', '2026-09-20', '00000000-0000-0000-0000-0000037bcc01')
 where name = 'Engajamento WhatsApp';
-- 8. O filtro de objetivo continua pelo objetivo da campanha (Engajamento), não pela meta.
insert into r37b select 'filtro engajamento', count(*)::text
  from public.monitor_compare('ad', '2026-09-21', '2026-09-27', '2026-09-14', '2026-09-20', '00000000-0000-0000-0000-0000037bcc01', null, null, null, 500, array['engajamento']);

reset role;

do $$
declare
  expected jsonb := jsonb_build_object(
    'metas', 'messages,messages,conversions,leads,link_clicks,none,none,leads,conversions',
    'campanhas', 'messages,mixed,leads,none',
    'conjuntos mista', 'messages,conversions',
    'mista sem o pausado', 'conversions',
    'valor do período', '2',
    'tela anúncio conversas', 'MESSAGES|2',
    'tela anúncio site', 'OUTCOME_SALES|1|2',
    'tela campanha engajamento', 'MESSAGES',
    'filtro engajamento', '1');
  r record;
begin
  for r in select * from r37b loop
    if expected ->> r.what is distinct from r.v then raise exception 'FALHOU: % = % (esperado %)', r.what, r.v, expected ->> r.what; end if;
  end loop;
  if (select count(*) from r37b) <> (select count(*) from jsonb_object_keys(expected)) then
    raise exception 'FALHOU: faltou verificação (%)', (select count(*) from r37b);
  end if;
  raise notice 'Resultado pela meta: % verificações OK', (select count(*) from r37b);
end $$;

rollback;
