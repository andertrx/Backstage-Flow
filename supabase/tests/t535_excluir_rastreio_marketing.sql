-- Teste T5.35 (etapas 2, 3 e 4): excluir um site, a ficha de rastreio do contato e o caminho
-- até a venda. Roda numa transação que é desfeita no fim ("R: N verificações OK").
-- Regras conferidas:
--   - excluir site: só admin/gestor, exige o nome do site, não exclui o WhatsApp do cliente,
--     pausa o site, guarda o histórico e deixa restaurar;
--   - ficha de rastreio: junta canal, evidência, campanha e conjunto (pelo ID externo) e o método;
--   - caminho até a venda: conta quantas origens a pessoa tocou antes de converter e quantos dias levou.
begin;

do $$
declare
  v_admin uuid; v_comum uuid; v_ok int := 0; n int; t text;
  v_cli    uuid := '00000000-0000-4000-8000-00000000f535';
  v_outro  uuid := '00000000-0000-4000-8000-00000000f536';
  v_site   uuid := '00000000-0000-4000-8000-00000000f537';
  v_wa     uuid := '00000000-0000-4000-8000-00000000f538';
  v_conta  uuid := '00000000-0000-4000-8000-00000000f539';
  v_camp   uuid := '00000000-0000-4000-8000-00000000f53a';
  v_grupo  uuid := '00000000-0000-4000-8000-00000000f53b';
  v_lead bigint; v_contato bigint; v_estagio uuid; v_tp1 bigint; v_tp2 bigint;
begin
  select id into v_admin from public.profiles where role = 'admin' and active limit 1;
  select id into v_comum from public.profiles where role not in ('admin','gestor') and active limit 1;
  if v_admin is null or v_comum is null then raise exception 'FALHOU: faltam usuários de teste no banco'; end if;

  -- Dados de teste (tudo é desfeito no fim).
  insert into public.clients (id, name) values (v_cli, 'Cliente Teste T5.35');
  insert into public.clients (id, name) values (v_outro, 'Outro Teste T5.35');
  insert into public.ad_accounts (id, platform_id, external_id, client_id, name, status)
    values (v_conta, 'meta', 'acct535', v_cli, 'Conta Meta Teste', 'ativa');
  insert into public.tracking_containers (id, client_id, name, kind, allowed_domains, status, test_mode)
    values (v_site, v_cli, 'site-teste-t535.com.br', 'site', array['site-teste-t535.com.br'], 'ativo', false);
  insert into public.tracking_containers (id, client_id, name, kind, allowed_domains, status, test_mode)
    values (v_wa, v_cli, 'WhatsApp Teste T5.35', 'whatsapp', '{}', 'ativo', false);
  insert into public.campaigns (id, ad_account_id, client_id, platform_id, external_id, name, status)
    values (v_camp, v_conta, v_cli, 'meta', '900001', 'Campanha Teste', 'ativa');
  insert into public.ad_groups (id, campaign_id, ad_account_id, client_id, platform_id, external_id, name, status)
    values (v_grupo, v_camp, v_conta, v_cli, 'meta', '900002', 'Conjunto Teste', 'ativa');

  -- ---------------------------------------------------------------- Etapa 2: excluir site
  perform set_config('request.jwt.claims', json_build_object('sub', v_comum, 'role', 'authenticated')::text, true);
  begin perform public.tracking_container_exclude(v_site, 'site-teste-t535.com.br'); raise exception 'FALHOU: usuário sem permissão excluiu site';
  exception when insufficient_privilege then v_ok := v_ok + 1; end;

  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  begin perform public.tracking_container_exclude(v_site, 'nome errado'); raise exception 'FALHOU: aceitou nome que não confere';
  exception when invalid_parameter_value then v_ok := v_ok + 1; end;
  begin perform public.tracking_container_exclude(v_wa, 'WhatsApp Teste T5.35'); raise exception 'FALHOU: excluiu o WhatsApp do cliente';
  exception when invalid_parameter_value then v_ok := v_ok + 1; end;

  -- Admin exclui (o nome confere, sem diferenciar maiúsculas).
  perform public.tracking_container_exclude(v_site, 'SITE-TESTE-T535.COM.BR');
  v_ok := v_ok + 1;
  select count(*) into n from public.tracking_containers where id = v_site and excluded_at is not null and status = 'pausado';
  if n <> 1 then raise exception 'FALHOU: site não ficou excluído e pausado'; end if; v_ok := v_ok + 1;
  select count(*) into n from public.audit_logs where action = 'tracking.container_exclude' and target_id = v_site::text;
  if n <> 1 then raise exception 'FALHOU: exclusão não foi auditada'; end if; v_ok := v_ok + 1;

  -- Restaurar: volta como site ativo.
  perform public.tracking_container_restore(v_site);
  select count(*) into n from public.tracking_containers where id = v_site and excluded_at is null and status = 'ativo';
  if n <> 1 then raise exception 'FALHOU: site não voltou'; end if; v_ok := v_ok + 1;
  select count(*) into n from public.audit_logs where action = 'tracking.container_restore' and target_id = v_site::text;
  if n <> 1 then raise exception 'FALHOU: restauração não foi auditada'; end if; v_ok := v_ok + 1;
  begin perform public.tracking_container_restore(v_site); raise exception 'FALHOU: restaurou site que não estava excluído';
  exception when invalid_parameter_value then v_ok := v_ok + 1; end;

  -- ---------------------------------------------------------------- Etapa 3: ficha de rastreio
  -- O visitante vem antes dos toques: o toque aponta para o visitante (chave estrangeira).
  insert into public.tracking_visitors (container_id, visitor_id, client_id, first_seen_at, last_seen_at)
    values (v_site, 'visitorteste535', v_cli, now() - interval '5 days', now() - interval '3 days');
  insert into public.tracking_touchpoints (container_id, client_id, visitor_id, session_id, origin_event_id, occurred_at, channel, paid, evidence, reason, ad_campaign_id, ad_adset_id)
    values (v_site, v_cli, 'visitorteste535', 'sessao535', 'evt535-1', now() - interval '5 days', 'meta', true, 'confirmada', 'IDs do anúncio do Meta na URL.', '900001', '900002')
    returning id into v_tp1;
  insert into public.tracking_touchpoints (container_id, client_id, visitor_id, session_id, origin_event_id, occurred_at, channel, paid, evidence, reason)
    values (v_site, v_cli, 'visitorteste535', 'sessao535', 'evt535-2', now() - interval '3 days', 'google', null, 'provavel', 'Busca no Google.')
    returning id into v_tp2;
  update public.tracking_visitors set first_touch_id = v_tp1, last_touch_id = v_tp2
   where container_id = v_site and visitor_id = 'visitorteste535';
  insert into public.tracking_leads (container_id, client_id, first_visitor_id, first_touch_id, last_touch_id, first_event_name, first_converted_at, last_converted_at, conversions, purchases)
    values (v_site, v_cli, 'visitorteste535', v_tp1, v_tp2, 'Lead', now() - interval '2 days', now() - interval '2 days', 1, 1)
    returning id into v_lead;
  -- O lead novo vira contato sozinho (gatilho tracking_leads_contacts): não se insere contato aqui.
  select id into v_contato from public.tracking_contacts where lead_id = v_lead;
  if v_contato is null then raise exception 'FALHOU: o lead não virou contato'; end if; v_ok := v_ok + 1;
  -- O visitante passa a pertencer ao lead (é por aí que a jornada conta as origens).
  update public.tracking_visitors set lead_id = v_lead where container_id = v_site and visitor_id = 'visitorteste535';

  select count(*) into n from public.contact_rastreio(v_contato)
    where metodo = 'Clique no site' and canal = 'meta' and evidence = 'confirmada' and pago
      and utm_campaign is null and ad_campaign_id = '900001' and ad_adset_id = '900002'
      and campanha = 'Campanha Teste' and conjunto = 'Conjunto Teste' and plataforma = 'Meta Ads';
  if n <> 1 then raise exception 'FALHOU: a ficha de rastreio não juntou canal, campanha e conjunto'; end if; v_ok := v_ok + 1;
  select count(*) into n from public.contact_rastreio(v_contato) where motivo = 'IDs do anúncio do Meta na URL.';
  if n <> 1 then raise exception 'FALHOU: a ficha não traz o motivo da identificação'; end if; v_ok := v_ok + 1;
  select count(*) into n from public.contact_rastreio(v_contato) where site = 'site-teste-t535.com.br';
  if n <> 1 then raise exception 'FALHOU: a ficha não diz de que site veio'; end if; v_ok := v_ok + 1;

  -- Contato de outro cliente: quem não tem acesso não vê.
  insert into public.tracking_containers (id, client_id, name, kind, allowed_domains, status, test_mode)
    values ('00000000-0000-4000-8000-00000000f53c', v_outro, 'site-outro-t535.com.br', 'site', array['site-outro-t535.com.br'], 'ativo', false);
  insert into public.tracking_visitors (container_id, visitor_id, client_id, first_seen_at, last_seen_at)
    values ('00000000-0000-4000-8000-00000000f53c', 'visitoroutro535', v_outro, now() - interval '80 days', now() - interval '80 days');
  insert into public.tracking_touchpoints (container_id, client_id, visitor_id, session_id, origin_event_id, occurred_at, channel, paid, evidence, reason)
    values ('00000000-0000-4000-8000-00000000f53c', v_outro, 'visitoroutro535', 'sessaooutro535', 'evt535-3', now() - interval '80 days', 'direto', null, 'desconhecida', 'Acesso direto.')
    returning id into v_tp2;
  insert into public.tracking_leads (container_id, client_id, first_visitor_id, first_touch_id, last_touch_id, first_event_name, first_converted_at, last_converted_at, conversions, purchases)
    values ('00000000-0000-4000-8000-00000000f53c', v_outro, 'visitoroutro535', v_tp2, v_tp2, 'Lead', now() - interval '80 days', now() - interval '80 days', 1, 0)
    returning id into v_lead;
  update public.tracking_visitors set lead_id = v_lead where container_id = '00000000-0000-4000-8000-00000000f53c' and visitor_id = 'visitoroutro535';
  select id into v_contato from public.tracking_contacts where lead_id = v_lead;
  if v_contato is null then raise exception 'FALHOU: o lead do outro cliente não virou contato'; end if; v_ok := v_ok + 1;
  perform set_config('request.jwt.claims', json_build_object('sub', v_comum, 'role', 'authenticated')::text, true);
  select count(*) into n from public.contact_rastreio(v_contato);
  if n <> 0 then raise exception 'FALHOU: ficha de rastreio vazou contato de outro cliente'; end if; v_ok := v_ok + 1;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

  -- ---------------------------------------------------------------- Etapa 4: caminho até a venda
  select count(*) into n from public.tracking_journey_summary(now() - interval '30 days', now() + interval '1 day')
    where client_id = v_cli and leads = 1 and purchases = 1 and toques_2_3 = 1 and toques_0 = 0
      and media_toques = 2 and media_dias = 3 and mais_rapido_dias = 3 and origem_paga = 1;
  if n <> 1 then raise exception 'FALHOU: o caminho até a venda não contou 2 toques em 3 dias'; end if; v_ok := v_ok + 1;

  -- Lead de outro cliente não entra na conta do cliente.
  select count(*) into n from public.tracking_journey_summary(now() - interval '30 days', now() + interval '1 day')
    where client_id = v_outro;
  if n <> 0 then raise exception 'FALHOU: o resumo de jornada contou lead de outro cliente'; end if; v_ok := v_ok + 1;

  -- Fora do período: nada.
  select count(*) into n from public.tracking_journey_summary(now() - interval '30 days', now() - interval '10 days')
    where client_id = v_cli;
  if n <> 0 then raise exception 'FALHOU: o resumo de jornada contou lead fora do período'; end if; v_ok := v_ok + 1;

  raise exception 'R: % verificações OK (desfeito)', v_ok;
end $$;
