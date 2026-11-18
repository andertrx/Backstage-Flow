-- Pixel por CLIENTE + evento "LeadQualificado" (Tracking / Contatos).
--
-- 1) Um pixel por cliente: o evento vai para o pixel do recipiente onde aconteceu; se esse recipiente não tem pixel (ex.: WhatsApp "sem site"),
--    usa o pixel do cliente (o de qualquer recipiente dele que esteja ligado e com token). Assim o WhatsApp de um cliente só-WhatsApp também alimenta o pixel.
-- 2) Lead qualificado: ao mover o contato para uma etapa que tem evento (ex.: "Qualificado" → LeadQualificado) o evento é enviado UMA vez por pessoa.
--    Marcou VENDA (à mão, pela IA confirmada ou por frase do WhatsApp) → também envia o LeadQualificado, uma vez, antes da Compra.
-- 3) A etapa "Qualificado" de todos os clientes passa a ter o evento LeadQualificado (e os clientes novos já nascem assim).

-- ---------------------------------------------------------------------------------------------------------------------------------
-- Dados: etapa "Qualificado" com o evento (só onde ainda não tem nenhum) e clientes novos
-- ---------------------------------------------------------------------------------------------------------------------------------
-- Antes só a etapa de venda podia ter evento. Agora etapas abertas (ex.: Qualificado) também; etapa "perdida" continua sem evento.
alter table public.tracking_contact_stages drop constraint tracking_contact_stages_meta;
alter table public.tracking_contact_stages add constraint tracking_contact_stages_meta check (meta_event is null or kind in ('ganha', 'aberta'));

update public.tracking_contact_stages set meta_event = 'LeadQualificado'
 where kind = 'aberta' and archived_at is null and meta_event is null and name ilike 'qualificad%';

create or replace function private.contacts_seed(p_client uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.tracking_contact_stages where client_id = p_client) then
    insert into public.tracking_contact_stages (client_id, name, position, kind, meta_event) values
      (p_client, 'Novo', 0, 'aberta', null),
      (p_client, 'Qualificado', 1, 'aberta', 'LeadQualificado'),
      (p_client, 'Venda', 2, 'ganha', 'Purchase'),
      (p_client, 'Perdido', 3, 'perdida', null);
  end if;
  if not exists (select 1 from public.tracking_contact_profiles where client_id = p_client) then
    insert into public.tracking_contact_profiles (client_id, name, position, meta_event) values
      (p_client, 'Lojista', 0, 'LeadLojista'),
      (p_client, 'Sacoleiro', 1, null),
      (p_client, 'Cliente final', 2, null),
      (p_client, 'Outro', 3, null);
  end if;
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------------------------
-- Pixel por cliente: o evento usa o pixel do recipiente e, se não houver, o pixel do cliente
-- ---------------------------------------------------------------------------------------------------------------------------------
create or replace function private.tracking_capi_enqueue(p jsonb, p_lead_id bigint)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_event jsonb := p -> 'event';
  v_capi  jsonb := coalesce(p -> 'capi', '{}'::jsonb);
  v_test  boolean := coalesce((p ->> 'test')::boolean, false);
  v_src   text := case when v_capi ->> 'action_source' in ('chat', 'business_messaging') then v_capi ->> 'action_source' else 'website' end;
  v_meta  text := coalesce(v_event -> 'custom_data' ->> 'bf_meta', '');
  v_cont  uuid := (p ->> 'container_id')::uuid;
  d       record;
begin
  if v_meta = 'nao_enviar' then return; end if;
  if v_meta !~ '^[A-Za-z][A-Za-z0-9_]{1,49}$' then v_meta := v_event ->> 'name'; end if;
  select * into d from public.tracking_destinations
   where container_id = v_cont and enabled and has_token and (v_event ->> 'name') = any (send_events);
  if not found then
    -- Um pixel por cliente: sem pixel neste recipiente (ex.: WhatsApp sem site), usa o pixel do cliente.
    select dd.* into d from public.tracking_destinations dd
     where dd.client_id = (select t.client_id from public.tracking_containers t where t.id = v_cont)
       and dd.enabled and dd.has_token and (v_event ->> 'name') = any (dd.send_events)
     order by dd.created_at limit 1;
    if not found then return; end if;
  end if;
  if v_src = 'business_messaging' and (v_capi ->> 'ctwa_clid') is null then v_src := 'chat'; end if;

  insert into public.tracking_capi_queue (destination_id, container_id, client_id, event_id, event_name, occurred_at, visitor_id, lead_id,
                                          page_url, custom_data, user_agent, ip_address, fbp, fbc, test, status, last_error, action_source,
                                          ctwa_clid, waba_id)
  values (d.id, d.container_id, d.client_id, v_event ->> 'event_id', v_meta, (v_event ->> 'occurred_at')::timestamptz,
          p ->> 'visitor_id', p_lead_id, v_event ->> 'page_url',
          (coalesce(v_event -> 'custom_data', '{}'::jsonb) - 'bf_meta' - 'bf_regra')
            || case when v_event ? 'value_micros' then jsonb_build_object('value', trim_scale((v_event ->> 'value_micros')::numeric / 1000000),
                                                                          'currency', v_event ->> 'currency', 'order_id', v_event ->> 'transaction_id')
                    else '{}'::jsonb end,
          left(v_capi ->> 'user_agent', 500), left(v_capi ->> 'ip', 45), left(v_capi ->> 'fbp', 200), left(v_capi ->> 'fbc', 500), v_test,
          case when v_test and d.test_event_code is null then 'descartado' else 'pendente' end,
          case when v_test and d.test_event_code is null then 'Site em modo teste e sem código de teste do Meta: não enviado.' end,
          v_src, left(v_capi ->> 'ctwa_clid', 500), case when v_capi ->> 'waba_id' ~ '^\d{5,30}$' then v_capi ->> 'waba_id' end)
  on conflict (destination_id, event_id) do nothing;
end;
$$;

-- O cliente tem pixel ligado (com token)? A tela usa para avisar quando a venda não vai ao Meta.
create function private.client_has_pixel(p_client uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.tracking_destinations d where d.client_id = p_client and d.enabled and d.has_token)
$$;
revoke all on function private.client_has_pixel(uuid) from public, anon, authenticated;
grant execute on function private.client_has_pixel(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------------------------
-- Evento da etapa (ex.: LeadQualificado), UMA vez por pessoa
-- ---------------------------------------------------------------------------------------------------------------------------------
create function private.contact_send_stage_event(p_contact public.tracking_contacts, p_stage public.tracking_contact_stages)
returns text language plpgsql security definer set search_path = '' as $$
declare v_res text;
begin
  -- Só etapas que não são de venda e têm evento. A venda manda a Compra (Purchase) por outro caminho.
  if p_stage.meta_event is null or p_stage.kind = 'ganha' then return null; end if;
  if exists (select 1 from public.tracking_contacts x where x.id = p_contact.id and p_stage.meta_event = any (x.meta_sent)) then return null; end if;
  v_res := private.contact_send(p_contact, 'Lead', p_stage.meta_event, 'ct.' || p_contact.id || '.etapa.' || p_stage.id, null, null, null);
  if v_res not in ('sem_site', 'cliente_desativado') then
    update public.tracking_contacts set meta_sent = array_append(meta_sent, p_stage.meta_event) where id = p_contact.id;
  end if;
  return v_res;
end;
$$;
revoke all on function private.contact_send_stage_event(public.tracking_contacts, public.tracking_contact_stages) from public, anon, authenticated;

-- A etapa "Qualificado" do cliente (a de evento): marcar venda também qualifica o lead.
create function private.contact_qualified_stage(p_client uuid)
returns public.tracking_contact_stages language sql stable security definer set search_path = '' as $$
  select s from public.tracking_contact_stages s
   where s.client_id = p_client and s.archived_at is null and s.kind = 'aberta' and s.meta_event is not null and s.name ilike 'qualificad%'
   order by s.position limit 1
$$;
revoke all on function private.contact_qualified_stage(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------------------------
-- Marcação manual (Contatos e "Marcar venda" da conversa): etapa com evento + venda qualifica o lead + aviso de "sem pixel"
-- ---------------------------------------------------------------------------------------------------------------------------------
create or replace function private.contact_update_impl(p_id bigint, p_stage uuid, p_profile uuid, p_value numeric, p_currency text, p_order text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  c       public.tracking_contacts;
  v_stage public.tracking_contact_stages;
  v_qual  public.tracking_contact_stages;
  v_prof  public.tracking_contact_profiles;
  v_out   jsonb := '{}'::jsonb;
  v_res   text;
  v_qres  text;
  v_order text;
  v_nova_venda boolean := false;
begin
  select * into c from public.tracking_contacts where id = p_id for update;
  if c.id is null or not private.contacts_can_mark(c.client_id) then
    raise exception 'Contato não encontrado ou sem permissão.' using errcode = '42501';
  end if;
  if c.archived_at is not null then raise exception 'Contato arquivado.' using errcode = '22023'; end if;

  -- Perfil (ex.: Lojista): vai ao Meta uma vez só por pessoa, se o perfil tiver evento.
  if p_profile is not null and p_profile is distinct from c.profile_id then
    select * into v_prof from public.tracking_contact_profiles where id = p_profile and client_id = c.client_id and archived_at is null;
    if v_prof.id is null then raise exception 'Perfil não encontrado.' using errcode = 'P0002'; end if;
    update public.tracking_contacts set profile_id = v_prof.id, last_change_at = now(), last_change_by = (select auth.uid()) where id = c.id;
    v_res := null;
    if v_prof.meta_event is not null and not (v_prof.meta_event = any (c.meta_sent)) then
      v_res := private.contact_send(c, 'Lead', v_prof.meta_event, 'ct.' || c.id || '.perfil.' || v_prof.id, null, null, null);
      if v_res not in ('sem_site', 'cliente_desativado') then
        update public.tracking_contacts set meta_sent = array_append(meta_sent, v_prof.meta_event) where id = c.id;
      end if;
    end if;
    insert into public.tracking_contact_history (contact_id, client_id, by_user, kind, profile_id, meta_event, meta_note)
    values (c.id, c.client_id, (select auth.uid()), 'perfil', v_prof.id,
            case when v_res is not null and v_res not in ('sem_site', 'cliente_desativado') then v_prof.meta_event end,
            case when v_res = 'sem_site' then 'Não enviado ao Meta: cliente sem site no Tracking.'
                 when v_prof.meta_event is not null and v_res is null then 'Já enviado antes ao Meta para esta pessoa.' end);
    v_out := v_out || jsonb_build_object('perfil', v_prof.name, 'perfil_meta', case when v_res is null then null else v_res end);
    select * into c from public.tracking_contacts where id = c.id;
  end if;

  -- Etapa (ex.: Venda): etapa "ganha" exige valor e moeda e registra a compra.
  -- Quem já está na etapa "ganha" e recebe outra venda (com valor) também registra.
  if p_stage is not null then
    v_nova_venda := p_value is not null and exists (select 1 from public.tracking_contact_stages ss where ss.id = p_stage and ss.client_id = c.client_id and ss.kind = 'ganha');
  end if;
  if p_stage is not null and (p_stage is distinct from c.stage_id or v_nova_venda) then
    select * into v_stage from public.tracking_contact_stages where id = p_stage and client_id = c.client_id and archived_at is null;
    if v_stage.id is null then raise exception 'Etapa não encontrada.' using errcode = 'P0002'; end if;
    v_res := null; v_qres := null;
    if v_stage.kind = 'ganha' then
      if p_value is null or p_value < 0 or p_currency !~ '^[A-Z]{3}$' then
        raise exception 'Informe o valor e a moeda da venda.' using errcode = '22023';
      end if;
      if p_order is not null and p_order !~ '^[A-Za-z0-9_.:/#-]{1,100}$' then raise exception 'Nº do pedido inválido.' using errcode = '22023'; end if;
      v_order := coalesce(p_order, 'ct' || c.id || '-' || (c.sales + 1));
      if exists (select 1 from public.tracking_contact_history h where h.client_id = c.client_id and h.kind = 'venda' and h.order_id = v_order) then
        raise exception 'Já existe uma venda com este nº de pedido.' using errcode = '23505';
      end if;
      if exists (select 1 from public.tracking_capi_queue q where q.client_id = c.client_id and q.event_name = 'Purchase' and q.custom_data ->> 'order_id' = v_order) then
        raise exception 'Este nº de pedido já foi enviado ao Meta (marcado em outra tela). Use outro nº.' using errcode = '23505';
      end if;
      -- Marcou venda = lead qualificado: manda o evento (uma vez por pessoa) ANTES da Compra.
      v_qual := private.contact_qualified_stage(c.client_id);
      if v_qual.id is not null then v_qres := private.contact_send_stage_event(c, v_qual); end if;
      v_res := private.contact_send(c, 'Purchase', v_stage.meta_event, 'ct.' || c.id || '.venda.' || v_order, p_value, p_currency, v_order);
      update public.tracking_contacts set sales = sales + 1 where id = c.id;
      insert into public.tracking_contact_history (contact_id, client_id, by_user, kind, stage_id, value_micros, currency, order_id, meta_event, meta_note)
      values (c.id, c.client_id, (select auth.uid()), 'venda', v_stage.id, round(p_value * 1000000)::bigint, p_currency, v_order,
              case when v_res not in ('sem_site', 'cliente_desativado') then v_stage.meta_event end,
              case when v_res = 'sem_site' then 'Venda registrada; não enviada ao Meta: cliente sem site no Tracking.'
                   when v_stage.meta_event is null then 'Venda registrada; esta etapa não envia ao Meta.' end
              || case when v_qres is not null and v_qres not in ('sem_site', 'cliente_desativado') then ' Também enviou "' || v_qual.meta_event || '" (lead qualificado).' else '' end);
    else
      -- Etapa com evento (ex.: Qualificado → LeadQualificado): uma vez por pessoa.
      v_res := private.contact_send_stage_event(c, v_stage);
      insert into public.tracking_contact_history (contact_id, client_id, by_user, kind, stage_id, meta_event, meta_note)
      values (c.id, c.client_id, (select auth.uid()), 'etapa', v_stage.id,
              case when v_res is not null and v_res not in ('sem_site', 'cliente_desativado') then v_stage.meta_event end,
              case when v_res = 'sem_site' then 'Não enviado ao Meta: cliente sem site no Tracking.'
                   when v_stage.meta_event is not null and v_res is null then 'Já enviado antes ao Meta para esta pessoa.' end);
    end if;
    update public.tracking_contacts set stage_id = v_stage.id, last_change_at = now(), last_change_by = (select auth.uid()) where id = c.id;
    v_out := v_out || jsonb_build_object('etapa', v_stage.name, 'venda_meta', v_res, 'qualificado_meta', v_qres);
  end if;
  -- A tela avisa quando o cliente não tem pixel ligado (a venda/lead fica registrada aqui, mas não vai ao Meta).
  return v_out || jsonb_build_object('pixel_ok', private.client_has_pixel(c.client_id));
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------------------------
-- Frases do WhatsApp (atendente): mesma regra (etapa com evento + venda qualifica o lead)
-- ---------------------------------------------------------------------------------------------------------------------------------
create or replace function private.wa_echo(p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  c        public.tracking_whatsapp_connections;
  conv     public.tracking_whatsapp_conversations;
  k        public.tracking_contacts;
  t        public.tracking_wa_triggers;
  v_stage  public.tracking_contact_stages;
  v_qual   public.tracking_contact_stages;
  v_prof   public.tracking_contact_profiles;
  v_open   uuid;
  v_click  bigint;
  v_wa     text := case when p ->> 'wa_hash' ~ '^[0-9a-f]{64}$' then p ->> 'wa_hash' end;
  v_ph     text := case when p ->> 'ph_hash' ~ '^[0-9a-f]{64}$' then p ->> 'ph_hash' end;
  v_key    text := case when p ->> 'message_key' ~ '^[0-9a-f]{16,64}$' then p ->> 'message_key' end;
  v_m      jsonb;
  v_value  numeric;
  v_cur    text;
  v_order  text;
  v_res    text;
  v_qres   text;
  v_note   text;
  v_log    bigint;
  v_out    jsonb := '[]'::jsonb;
  v_vis    text;
  v_sold   boolean := false;
begin
  select * into c from public.tracking_whatsapp_connections where id = (p ->> 'connection_id')::uuid;
  if c.id is null or not c.enabled or not private.client_is_active(c.client_id) then return jsonb_build_object('result', 'desligado'); end if;
  if v_wa is null or v_key is null then return jsonb_build_object('result', 'invalido'); end if;
  v_ph := coalesce(v_ph, v_wa);

  select * into conv from public.tracking_whatsapp_conversations where connection_id = c.id and wa_hash = v_wa;
  select * into k from public.tracking_contacts
   where client_id = c.client_id and (ph_hash in (v_ph, v_wa) or wa_hash = v_wa)
   order by (ph_hash = v_ph) desc, id limit 1 for update;
  if k.id is not null and k.wa_hash is null then update public.tracking_contacts set wa_hash = v_wa where id = k.id; end if;

  for v_m in select * from jsonb_array_elements(coalesce(p -> 'matches', '[]'::jsonb)) loop
    select * into t from public.tracking_wa_triggers
     where id = (v_m ->> 'trigger_id')::uuid and client_id = c.client_id and enabled and archived_at is null;
    if t.id is null then continue; end if;

    insert into public.tracking_wa_trigger_log (client_id, connection_id, trigger_id, contact_id, result, message_key)
    values (c.client_id, c.id, t.id, k.id, 'aplicado', v_key)
    on conflict (connection_id, message_key, trigger_id) do nothing
    returning id into v_log;
    if v_log is null then
      v_out := v_out || jsonb_build_object('trigger_id', t.id, 'result', 'repetido');
      continue;
    end if;

    if k.archived_at is not null then
      update public.tracking_wa_trigger_log set result = 'ignorado', reason = 'Contato arquivado.' where id = v_log;
      v_out := v_out || jsonb_build_object('trigger_id', t.id, 'result', 'ignorado');
      continue;
    end if;

    -- Venda sem valor na mensagem e sem valor padrão: não registra (nada inventado).
    if t.stage_id is not null then
      select * into v_stage from public.tracking_contact_stages where id = t.stage_id;
      if v_stage.kind = 'ganha' and v_sold then
        update public.tracking_wa_trigger_log set result = 'ignorado', reason = 'Já houve uma venda nesta mensagem.' where id = v_log;
        v_out := v_out || jsonb_build_object('trigger_id', t.id, 'result', 'ignorado');
        continue;
      end if;
      if v_stage.kind = 'ganha' then
        v_value := case when (v_m ->> 'value') ~ '^\d{1,10}(\.\d{1,2})?$' then (v_m ->> 'value')::numeric else t.default_value end;
        v_cur := case when (v_m ->> 'currency') ~ '^[A-Z]{3}$' and (v_m ->> 'value') is not null then v_m ->> 'currency' else t.currency end;
        if v_value is null then
          update public.tracking_wa_trigger_log set result = 'sem_valor',
                 reason = 'Frase de venda sem valor na mensagem (ex.: R$ 297) e sem valor padrão: venda não registrada.' where id = v_log;
          v_out := v_out || jsonb_build_object('trigger_id', t.id, 'result', 'sem_valor');
          continue;
        end if;
      end if;
    end if;

    -- Contato do número: o que já existe ou um novo, com a origem da conversa (anúncio, código do site ou direto).
    if k.id is null then
      select s.id into v_open from public.tracking_contact_stages s
       where s.client_id = c.client_id and s.archived_at is null and s.kind = 'aberta' order by s.position limit 1;
      select w.id into v_click from public.tracking_whatsapp_clicks w where w.code = conv.click_code and w.container_id = c.container_id;
      v_vis := coalesce(conv.visitor_id, 'wa' || left(v_wa, 30));
      insert into public.tracking_contacts (client_id, container_id, origin, ph_hash, wa_hash, visitor_id, session_id, wa_click_id, ref_code, touchpoint_id, stage_id)
      values (c.client_id, c.container_id, 'whatsapp', v_ph, v_wa, v_vis, coalesce(conv.session_id, v_vis),
              v_click, conv.click_code, conv.touchpoint_id, v_open)
      returning * into k;
      insert into public.tracking_contact_history (contact_id, client_id, kind, stage_id, meta_note)
      values (k.id, c.client_id, 'criado', k.stage_id, 'Criado pela frase "' || t.phrase || '" no WhatsApp');
      update public.tracking_wa_trigger_log set contact_id = k.id where id = v_log;
    end if;
    v_note := 'Frase "' || t.phrase || '" no WhatsApp';

    if t.profile_id is not null then
      select * into v_prof from public.tracking_contact_profiles where id = t.profile_id;
      if v_prof.id is distinct from k.profile_id then
        v_res := null;
        if v_prof.meta_event is not null and not (v_prof.meta_event = any (k.meta_sent)) then
          v_res := private.contact_send(k, 'Lead', v_prof.meta_event, 'ct.' || k.id || '.perfil.' || v_prof.id, null, null, null);
          if v_res not in ('sem_site', 'cliente_desativado') then
            update public.tracking_contacts set meta_sent = array_append(meta_sent, v_prof.meta_event) where id = k.id;
          end if;
        end if;
        update public.tracking_contacts set profile_id = v_prof.id, last_change_at = now(), last_change_by = null where id = k.id;
        insert into public.tracking_contact_history (contact_id, client_id, kind, profile_id, meta_event, meta_note)
        values (k.id, c.client_id, 'perfil', v_prof.id,
                case when v_res is not null and v_res not in ('sem_site', 'cliente_desativado') then v_prof.meta_event end,
                v_note || case when v_res = 'sem_site' then '; não enviado ao Meta: cliente sem site no Tracking.'
                               when v_prof.meta_event is not null and v_res is null then '; já enviado antes ao Meta para esta pessoa.' else '' end);
      else
        update public.tracking_wa_trigger_log set result = 'ignorado', reason = 'O contato já tinha este perfil.' where id = v_log;
      end if;
    elsif v_stage.kind = 'ganha' then
      v_sold := true;
      v_order := 'wa-' || left(v_key, 24);
      -- Venda = lead qualificado: manda o evento (uma vez por pessoa) ANTES da Compra.
      v_qres := null;
      select * into k from public.tracking_contacts where id = k.id;
      v_qual := private.contact_qualified_stage(c.client_id);
      if v_qual.id is not null then v_qres := private.contact_send_stage_event(k, v_qual); end if;
      v_res := private.contact_send(k, 'Purchase', v_stage.meta_event, 'ct.' || k.id || '.venda.' || v_order, v_value, v_cur, v_order);
      update public.tracking_contacts set sales = sales + 1, stage_id = v_stage.id, last_change_at = now(), last_change_by = null where id = k.id;
      insert into public.tracking_contact_history (contact_id, client_id, kind, stage_id, value_micros, currency, order_id, meta_event, meta_note)
      values (k.id, c.client_id, 'venda', v_stage.id, round(v_value * 1000000)::bigint, v_cur, v_order,
              case when v_res not in ('sem_site', 'cliente_desativado') and v_stage.meta_event is not null then v_stage.meta_event end,
              v_note || case when v_res = 'sem_site' then '; não enviada ao Meta: cliente sem site no Tracking.'
                             when v_stage.meta_event is null then '; esta etapa não envia ao Meta.' else '' end
                     || case when v_qres is not null and v_qres not in ('sem_site', 'cliente_desativado') then ' Também enviou "' || v_qual.meta_event || '" (lead qualificado).' else '' end);
      update public.tracking_wa_trigger_log set value_micros = round(v_value * 1000000)::bigint, currency = v_cur where id = v_log;
      update public.tracking_whatsapp_conversations set status = 'venda', sales = sales + 1, last_marked_at = now(), last_marked_by = null where id = conv.id;
    elsif v_stage.id is distinct from k.stage_id then
      select * into k from public.tracking_contacts where id = k.id;
      v_res := private.contact_send_stage_event(k, v_stage);
      update public.tracking_contacts set stage_id = v_stage.id, last_change_at = now(), last_change_by = null where id = k.id;
      insert into public.tracking_contact_history (contact_id, client_id, kind, stage_id, meta_event, meta_note)
      values (k.id, c.client_id, 'etapa', v_stage.id,
              case when v_res is not null and v_res not in ('sem_site', 'cliente_desativado') then v_stage.meta_event end,
              v_note || case when v_res = 'sem_site' then '; não enviado ao Meta: cliente sem site no Tracking.' else '' end);
    else
      update public.tracking_wa_trigger_log set result = 'ignorado', reason = 'O contato já estava nesta etapa.' where id = v_log;
    end if;

    update public.tracking_whatsapp_conversations set status = 'lead', last_marked_at = now() where id = conv.id and status = 'conversa';
    select * into k from public.tracking_contacts where id = k.id;
    v_out := v_out || jsonb_build_object('trigger_id', t.id, 'result', (select result from public.tracking_wa_trigger_log where id = v_log), 'contact_id', k.id);
  end loop;
  return jsonb_build_object('result', 'ok', 'items', v_out);
end;
$$;
