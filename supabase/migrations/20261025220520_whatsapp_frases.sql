-- Tracking T4.1 (25/10/2026): marcação pelo WhatsApp com FRASES, como no Tintim.
-- O atendente manda no chat uma frase combinada (ex.: "Parabéns pela sua compra de R$ 297") e o CRM
-- marca o contato daquele número (perfil ou etapa; venda com o valor lido da própria mensagem) e avisa o Meta.
-- O texto da mensagem é lido só na memória do servidor (Edge Function whatsapp-webhook); NADA do texto é guardado.
-- Aqui ficam só as frases (configuração da agência) e o registro de cada frase aplicada (sem dado pessoal).

-- Número como o WhatsApp manda (no Brasil, às vezes sem o 9): liga o contato à conversa. Só o servidor lê (sem permissão de coluna).
alter table public.tracking_contacts add column wa_hash text check (wa_hash ~ '^[0-9a-f]{64}$');
create index tracking_contacts_wa_idx on public.tracking_contacts (client_id, wa_hash) where wa_hash is not null;

create table public.tracking_wa_triggers (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references public.clients (id),
  phrase        text not null check (char_length(btrim(phrase)) between 3 and 120),
  stage_id      uuid references public.tracking_contact_stages (id),
  profile_id    uuid references public.tracking_contact_profiles (id),
  default_value numeric check (default_value is null or (default_value >= 0 and default_value <= 1000000000)),
  currency      text not null default 'BRL' check (currency ~ '^[A-Z]{3}$'),
  position      integer not null default 0,
  enabled       boolean not null default true,
  archived_at   timestamptz,
  created_at    timestamptz not null default now(),
  created_by    uuid references auth.users (id) default auth.uid(),
  updated_at    timestamptz not null default now(),
  updated_by    uuid references auth.users (id),
  check ((stage_id is null) <> (profile_id is null))
);
comment on table public.tracking_wa_triggers is 'T4.1: frases do WhatsApp por cliente. Frase enviada pelo atendente → perfil ou etapa do contato (venda lê o valor da mensagem).';
create unique index tracking_wa_triggers_phrase_idx on public.tracking_wa_triggers (client_id, lower(btrim(phrase))) where archived_at is null;
create index tracking_wa_triggers_client_idx on public.tracking_wa_triggers (client_id, position);

create table public.tracking_wa_trigger_log (
  id            bigint generated always as identity primary key,
  client_id     uuid not null references public.clients (id),
  connection_id uuid not null references public.tracking_whatsapp_connections (id),
  trigger_id    uuid not null references public.tracking_wa_triggers (id),
  contact_id    bigint references public.tracking_contacts (id),
  at            timestamptz not null default now(),
  result        text not null check (result in ('aplicado', 'repetido', 'sem_valor', 'ignorado')),
  reason        text check (char_length(reason) <= 300),
  value_micros  bigint,
  currency      text,
  message_key   text not null check (message_key ~ '^[0-9a-f]{16,64}$'),
  unique (connection_id, message_key, trigger_id)
);
comment on table public.tracking_wa_trigger_log is 'T4.1: cada frase do WhatsApp reconhecida e o que aconteceu. Sem texto da mensagem nem telefone. Permanente.';
create index tracking_wa_trigger_log_client_idx on public.tracking_wa_trigger_log (client_id, at desc);

alter table public.tracking_wa_triggers enable row level security;
alter table public.tracking_wa_trigger_log enable row level security;
revoke all on public.tracking_wa_triggers, public.tracking_wa_trigger_log from anon, authenticated;

create policy "Quem acompanha o cliente vê as frases" on public.tracking_wa_triggers for select to authenticated
  using (client_id in (select private.contacts_client_ids()));
create policy "Admin e gestor criam as frases" on public.tracking_wa_triggers for insert to authenticated
  with check (client_id in (select private.contacts_client_ids()) and (select private.current_user_role()) in ('admin', 'gestor'));
create policy "Admin e gestor editam as frases" on public.tracking_wa_triggers for update to authenticated
  using (client_id in (select private.contacts_client_ids()) and (select private.current_user_role()) in ('admin', 'gestor'))
  with check (client_id in (select private.contacts_client_ids()) and (select private.current_user_role()) in ('admin', 'gestor'));
create policy "Quem acompanha o cliente vê as frases aplicadas" on public.tracking_wa_trigger_log for select to authenticated
  using (client_id in (select private.contacts_client_ids()) and (select private.current_user_role()) <> 'vendedor');

grant select (id, client_id, phrase, stage_id, profile_id, default_value, currency, position, enabled, archived_at, created_at, updated_at)
  on public.tracking_wa_triggers to authenticated;
grant insert (client_id, phrase, stage_id, profile_id, default_value, currency, position) on public.tracking_wa_triggers to authenticated;
grant update (phrase, stage_id, profile_id, default_value, currency, position, enabled, archived_at) on public.tracking_wa_triggers to authenticated;
grant select on public.tracking_wa_trigger_log to authenticated;

create trigger tracking_wa_triggers_set_updated_by before update on public.tracking_wa_triggers
  for each row execute function private.tracking_set_updated_by();
create trigger tracking_wa_triggers_touch before update on public.tracking_wa_triggers
  for each row execute function private.touch_updated_at();
create trigger tracking_wa_triggers_audit after insert or update on public.tracking_wa_triggers
  for each row execute function private.audit_row_change('tracking_wa_trigger', 'id');

-- Etapa e perfil precisam ser do mesmo cliente da frase.
create function private.tracking_wa_triggers_check()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.stage_id is not null and not exists (select 1 from public.tracking_contact_stages s where s.id = new.stage_id and s.client_id = new.client_id) then
    raise exception 'Etapa de outro cliente.' using errcode = '22023';
  end if;
  if new.profile_id is not null and not exists (select 1 from public.tracking_contact_profiles f where f.id = new.profile_id and f.client_id = new.client_id) then
    raise exception 'Perfil de outro cliente.' using errcode = '22023';
  end if;
  new.phrase := btrim(regexp_replace(new.phrase, '\s+', ' ', 'g'));
  return new;
end;
$$;
create trigger tracking_wa_triggers_check before insert or update on public.tracking_wa_triggers
  for each row execute function private.tracking_wa_triggers_check();

-- Frases ativas do cliente de uma conexão (para o servidor comparar na memória). Só o servidor chama.
create function private.wa_triggers_for(p_connection uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', t.id, 'phrase', t.phrase,
           'kind', case when t.profile_id is not null then 'perfil' when s.kind = 'ganha' then 'venda' else 'etapa' end,
           'currency', t.currency) order by t.position, t.created_at), '[]'::jsonb)
    from public.tracking_whatsapp_connections c
    join public.tracking_wa_triggers t on t.client_id = c.client_id and t.enabled and t.archived_at is null
    left join public.tracking_contact_stages s on s.id = t.stage_id
   where c.id = p_connection and c.enabled and private.client_is_active(c.client_id)
     and (t.stage_id is null or s.archived_at is null)
     and (t.profile_id is null or exists (select 1 from public.tracking_contact_profiles f where f.id = t.profile_id and f.archived_at is null))
$$;

-- Frase reconhecida numa mensagem do atendente.
-- p: {connection_id, wa_hash (número como o WhatsApp manda), ph_hash (número normalizado), message_key, matches: [{trigger_id, value?, currency?}]}
create function private.wa_echo(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  c        public.tracking_whatsapp_connections;
  conv     public.tracking_whatsapp_conversations;
  k        public.tracking_contacts;
  t        public.tracking_wa_triggers;
  v_stage  public.tracking_contact_stages;
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
      v_res := private.contact_send(k, 'Purchase', v_stage.meta_event, 'ct.' || k.id || '.venda.' || v_order, v_value, v_cur, v_order);
      update public.tracking_contacts set sales = sales + 1, stage_id = v_stage.id, last_change_at = now(), last_change_by = null where id = k.id;
      insert into public.tracking_contact_history (contact_id, client_id, kind, stage_id, value_micros, currency, order_id, meta_event, meta_note)
      values (k.id, c.client_id, 'venda', v_stage.id, round(v_value * 1000000)::bigint, v_cur, v_order,
              case when v_res not in ('sem_site', 'cliente_desativado') and v_stage.meta_event is not null then v_stage.meta_event end,
              v_note || case when v_res = 'sem_site' then '; não enviada ao Meta: cliente sem site no Tracking.'
                             when v_stage.meta_event is null then '; esta etapa não envia ao Meta.' else '' end);
      update public.tracking_wa_trigger_log set value_micros = round(v_value * 1000000)::bigint, currency = v_cur where id = v_log;
      update public.tracking_whatsapp_conversations set status = 'venda', sales = sales + 1, last_marked_at = now(), last_marked_by = null where id = conv.id;
    elsif v_stage.id is distinct from k.stage_id then
      update public.tracking_contacts set stage_id = v_stage.id, last_change_at = now(), last_change_by = null where id = k.id;
      insert into public.tracking_contact_history (contact_id, client_id, kind, stage_id, meta_note) values (k.id, c.client_id, 'etapa', v_stage.id, v_note);
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

-- Envio ao Meta de um contato que veio de anúncio de WhatsApp: usa o ctwa_clid da conversa (business_messaging),
-- para o Meta ligar a venda ao anúncio. Vale também para a marcação feita na tela (T3.1).
create or replace function private.contact_send(p_contact public.tracking_contacts, p_name text, p_meta text, p_event_id text, p_value numeric, p_currency text, p_order text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_test boolean;
  v_url  text;
  v_res  jsonb;
  v_wa   record;
begin
  if p_contact.container_id is null then return 'sem_site'; end if;
  select t.test_mode, 'https://' || coalesce(t.allowed_domains[1], 'site') || '/' into v_test, v_url
    from public.tracking_containers t where t.id = p_contact.container_id;
  select w.ctwa_clid, c.waba_id into v_wa
    from public.tracking_whatsapp_conversations w join public.tracking_whatsapp_connections c on c.id = w.connection_id
   where w.client_id = p_contact.client_id and w.wa_hash in (p_contact.ph_hash, p_contact.wa_hash) and w.ctwa_clid is not null
   order by w.last_message_at desc limit 1;
  v_res := private.tracking_ingest(jsonb_build_object(
    'container_id', p_contact.container_id, 'client_id', p_contact.client_id,
    'visitor_id', p_contact.visitor_id, 'session_id', p_contact.session_id, 'test', v_test,
    'device_type', 'desconhecido', 'consent_status', 'nao_exigido', 'consent_version', null,
    'user', nullif(jsonb_strip_nulls(jsonb_build_object('ph', p_contact.ph_hash, 'em', p_contact.em_hash)), '{}'::jsonb),
    'capi', jsonb_strip_nulls(jsonb_build_object('user_agent', null, 'ip', null, 'fbp', p_contact.fbp, 'fbc', p_contact.fbc,
                               'action_source', case when v_wa.ctwa_clid is not null then 'business_messaging'
                                                     when p_contact.origin = 'site' then 'website' else 'chat' end,
                               'ctwa_clid', v_wa.ctwa_clid, 'waba_id', v_wa.waba_id)),
    'event', jsonb_strip_nulls(jsonb_build_object(
      'event_id', left(p_event_id, 80), 'name', p_name, 'occurred_at', now(), 'page_url', v_url, 'page_path', '/', 'referrer_host', null,
      'custom_data', jsonb_build_object('canal', 'crm', 'bf_meta', coalesce(p_meta, 'nao_enviar'), 'contato', p_contact.id),
      'value_micros', case when p_value is not null then round(p_value * 1000000)::bigint end,
      'currency', p_currency, 'transaction_id', p_order)),
    'touch', null));
  return coalesce(v_res ->> 'status', 'ok');
end;
$$;

revoke all on function private.wa_triggers_for(uuid) from public, anon, authenticated;
revoke all on function private.wa_echo(jsonb) from public, anon, authenticated;
revoke all on function private.tracking_wa_triggers_check() from public, anon, authenticated;
grant execute on function private.wa_triggers_for(uuid) to service_role;
grant execute on function private.wa_echo(jsonb) to service_role;

create function public.wa_triggers_for(p_connection uuid)
returns jsonb language sql stable set search_path = '' as $$ select private.wa_triggers_for(p_connection) $$;
create function public.wa_echo(p jsonb)
returns jsonb language sql set search_path = '' as $$ select private.wa_echo(p) $$;
revoke all on function public.wa_triggers_for(uuid) from public, anon, authenticated;
revoke all on function public.wa_echo(jsonb) from public, anon, authenticated;
grant execute on function public.wa_triggers_for(uuid) to service_role;
grant execute on function public.wa_echo(jsonb) to service_role;
