-- 26/11/2026 (pedido do Ander): apagar o HISTÓRICO de um cliente — só o WhatsApp, só o site, ou os dois. Só administrador, um cliente por vez.
-- Primeiro mostra quanto será apagado (contagem); para apagar, só com a palavra APAGAR; fica registrado em audit_logs.
--
-- O que é APAGADO
--   WhatsApp: texto das mensagens, pessoas (telefone/nome), sugestões da IA e as conversas SEM venda (servidor próprio e API oficial).
--   Site:     eventos, visitas (sessões), visitantes, origens (touchpoints), leads recebidos, cliques no WhatsApp e o registro de envios ao Meta já feitos.
-- O que SEMPRE é MANTIDO (carrega venda, contagem de relatório e o que já foi ao Meta)
--   contatos e suas marcações (perfil, etapa, vendas), compras/vendas registradas, conversas COM venda marcada,
--   a fila de envio ao Meta que ainda está pendente, e toda a configuração (sites, conexões, pixel, regras).
--   Os contatos mantidos perdem só a ligação com a origem apagada (o "de onde veio" detalhado).
-- Não desliga conexão nenhuma (diferente de "Apagar tudo e começar do zero" do WhatsApp). Não há "desfazer".

-- 1) Quanto será apagado / mantido
create function private.tracking_historico_contagem_impl(p_client uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if (select private.current_user_role()) <> 'admin' or p_client is null or not exists (select 1 from public.clients where id = p_client) then
    raise exception 'Só o administrador apaga o histórico do cliente.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'whatsapp', jsonb_build_object(
      'mensagens', (select count(*) from public.tracking_wa_messages where client_id = p_client),
      'pessoas', (select count(*) from public.tracking_wa_people where client_id = p_client),
      'sugestoes', (select count(*) from public.tracking_wa_suggestions where client_id = p_client),
      'conversas_apagar', (select count(*) from public.tracking_whatsapp_conversations where client_id = p_client and coalesce(sales, 0) = 0),
      'conversas_com_venda_mantidas', (select count(*) from public.tracking_whatsapp_conversations where client_id = p_client and coalesce(sales, 0) > 0)),
    'site', jsonb_build_object(
      'eventos', (select count(*) from public.tracking_events where client_id = p_client),
      'visitas', (select count(*) from public.tracking_sessions where client_id = p_client),
      'visitantes', (select count(*) from public.tracking_visitors where client_id = p_client),
      'origens', (select count(*) from public.tracking_touchpoints where client_id = p_client),
      'leads', (select count(*) from public.tracking_leads where client_id = p_client),
      'cliques_whatsapp', (select count(*) from public.tracking_whatsapp_clicks where client_id = p_client),
      'envios_meta_registro', (select count(*) from public.tracking_capi_log where client_id = p_client)
        + (select count(*) from public.tracking_capi_queue where client_id = p_client and status in ('enviado', 'erro', 'descartado')),
      'fila_meta_pendente_mantida', (select count(*) from public.tracking_capi_queue where client_id = p_client and status in ('pendente', 'enviando'))),
    'mantidos', jsonb_build_object(
      'contatos', (select count(*) from public.tracking_contacts where client_id = p_client),
      'vendas_registradas', (select count(*) from public.tracking_purchases where client_id = p_client)));
end;
$$;

-- 2) Apagar (escopo: 'whatsapp' | 'site' | 'ambos'), só com a palavra APAGAR
create function private.tracking_historico_apagar_impl(p_client uuid, p_escopo text, p_confirmar text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_wa boolean; v_site boolean;
  v_m integer := 0; v_p integer := 0; v_s integer := 0; v_conv integer := 0;
  v_ev integer := 0; v_ses integer := 0; v_vis integer := 0; v_tp integer := 0; v_lead integer := 0; v_clk integer := 0; v_capi integer := 0; v_q integer := 0; v_n integer;
  v_out jsonb;
begin
  if (select private.current_user_role()) <> 'admin' or p_client is null or not exists (select 1 from public.clients where id = p_client) then
    raise exception 'Só o administrador apaga o histórico do cliente.' using errcode = '42501';
  end if;
  if p_escopo not in ('whatsapp', 'site', 'ambos') then raise exception 'Escolha o que apagar: WhatsApp, site ou os dois.' using errcode = '22023'; end if;
  if btrim(coalesce(p_confirmar, '')) <> 'APAGAR' then raise exception 'Confirmação inválida: digite APAGAR.' using errcode = '22023'; end if;
  v_wa := p_escopo in ('whatsapp', 'ambos');
  v_site := p_escopo in ('site', 'ambos');

  if v_wa then
    delete from public.tracking_wa_messages where client_id = p_client; get diagnostics v_m = row_count;
    delete from public.tracking_wa_people where client_id = p_client; get diagnostics v_p = row_count;
    delete from public.tracking_wa_suggestions where client_id = p_client; get diagnostics v_s = row_count;
    delete from public.tracking_whatsapp_conversations where client_id = p_client and coalesce(sales, 0) = 0; get diagnostics v_conv = row_count;
  end if;

  if v_site then
    -- 1) o que fica (contatos, compras, conversas com venda) deixa de apontar para o que vai ser apagado
    update public.tracking_contacts set lead_id = null, wa_click_id = null, touchpoint_id = null
     where client_id = p_client and (lead_id is not null or wa_click_id is not null or touchpoint_id is not null);
    update public.tracking_purchases set lead_id = null, first_touch_id = null, last_touch_id = null
     where client_id = p_client and (lead_id is not null or first_touch_id is not null or last_touch_id is not null);
    update public.tracking_whatsapp_conversations set lead_id = null, touchpoint_id = null, click_code = null
     where client_id = p_client and (lead_id is not null or touchpoint_id is not null or click_code is not null);
    -- 2) registro de envios ao Meta já feitos (a fila PENDENTE fica)
    delete from public.tracking_capi_log where client_id = p_client; get diagnostics v_capi = row_count;
    delete from public.tracking_capi_queue where client_id = p_client and status in ('enviado', 'erro', 'descartado'); get diagnostics v_q = row_count;
    v_capi := v_capi + v_q;
    -- 3) eventos (tabela principal e arquivo)
    delete from public.tracking_events where client_id = p_client; get diagnostics v_ev = row_count;
    if to_regclass('history.tracking_events') is not null then
      execute 'delete from history.tracking_events where client_id = $1' using p_client;
    end if;
    -- 4) visitas, cliques, origens, visitantes e leads (nesta ordem, por causa das ligações)
    delete from public.tracking_sessions where client_id = p_client; get diagnostics v_ses = row_count;
    delete from public.tracking_whatsapp_clicks where client_id = p_client; get diagnostics v_clk = row_count;
    update public.tracking_visitors set first_touch_id = null, last_touch_id = null, lead_id = null where client_id = p_client;
    update public.tracking_leads set first_touch_id = null, last_touch_id = null where client_id = p_client;
    delete from public.tracking_touchpoints where client_id = p_client; get diagnostics v_tp = row_count;
    -- visitante que ainda é citado por uma conversa com venda mantida fica (a conversa depende dele)
    delete from public.tracking_visitors v where v.client_id = p_client
       and not exists (select 1 from public.tracking_whatsapp_conversations c where c.container_id = v.container_id and c.visitor_id = v.visitor_id);
    get diagnostics v_vis = row_count;
    -- lead citado por envio pendente ao Meta fica até o envio terminar
    delete from public.tracking_leads l where l.client_id = p_client
       and not exists (select 1 from public.tracking_capi_queue q where q.lead_id = l.id);
    get diagnostics v_lead = row_count;
  end if;

  v_out := jsonb_build_object('escopo', p_escopo,
    'whatsapp', jsonb_build_object('mensagens', v_m, 'pessoas', v_p, 'sugestoes', v_s, 'conversas', v_conv),
    'site', jsonb_build_object('eventos', v_ev, 'visitas', v_ses, 'visitantes', v_vis, 'origens', v_tp, 'leads', v_lead, 'cliques_whatsapp', v_clk, 'envios_meta_registro', v_capi));
  insert into public.audit_logs (actor_id, action, target_type, target_id, details)
  values ((select auth.uid()), 'tracking.historico_apagar', 'client', p_client::text, v_out);
  return v_out;
end;
$$;

revoke all on function private.tracking_historico_contagem_impl(uuid), private.tracking_historico_apagar_impl(uuid, text, text) from public, anon, authenticated;
grant execute on function private.tracking_historico_contagem_impl(uuid), private.tracking_historico_apagar_impl(uuid, text, text) to authenticated;

create function public.tracking_historico_contagem(p_client uuid)
returns jsonb language sql stable set search_path = '' as $$ select private.tracking_historico_contagem_impl(p_client) $$;
create function public.tracking_historico_apagar(p_client uuid, p_escopo text, p_confirmar text)
returns jsonb language sql set search_path = '' as $$ select private.tracking_historico_apagar_impl(p_client, p_escopo, p_confirmar) $$;
revoke all on function public.tracking_historico_contagem(uuid), public.tracking_historico_apagar(uuid, text, text) from public, anon;
grant execute on function public.tracking_historico_contagem(uuid), public.tracking_historico_apagar(uuid, text, text) to authenticated;
