-- =============================================================================
-- Tracking T5.7 (08/11/2026): Conversas do WhatsApp "na palma da mão" (estilo Tintim)
--
-- DECISÃO DO ANDER (08/11/2026): quando a IA sugerir uma venda, ele precisa CONFERIR a conversa dentro do CRM (o celular do
-- cliente está em outro lugar). Por isso o texto das conversas passa a ser guardado SEM apagar sozinho, e o telefone completo
-- é guardado. Isso muda a regra do T5.6 (buffer de 2 dias) e a regra antiga "o texto do WhatsApp nunca é guardado".
-- Travas que continuam: opção desligada por padrão em cada site, só admin/gestor/Account Manager leem, grupos nunca entram,
-- nunca vai para log/histórico/relatório/MCP, e agora há o AVISO/ACEITE de quem liga a guarda (registrado no histórico).
-- Nada é apagado sozinho: só o administrador apaga uma conversa (ou todas) pelo botão.
-- =============================================================================

-- 1) Sem prazo: o texto deixa de vencer. (O apagamento diário só olha expires_at preenchido; fica sem uso.)
alter table public.tracking_wa_messages alter column expires_at drop not null;
update public.tracking_wa_messages set expires_at = null where expires_at is not null;
comment on table public.tracking_wa_messages is 'T5.7: texto das conversas individuais de WhatsApp (só em sites com a opção ligada e o aviso aceito). Guardado SEM prazo: só o administrador apaga. Só admin, gestor e o Account Manager do cliente leem.';

-- 2) Aviso/aceite de quem liga a guarda das conversas
alter table public.tracking_whatsapp_connections
  add column store_ack_at timestamptz,
  add column store_ack_by uuid references auth.users (id) on delete set null;
create index tracking_whatsapp_connections_store_ack_by_idx on public.tracking_whatsapp_connections (store_ack_by);
grant select (store_ack_at) on public.tracking_whatsapp_connections to authenticated;
comment on column public.tracking_whatsapp_connections.store_ack_at is 'T5.7: quando admin/gestor confirmou que as pessoas são avisadas de que a conversa é registrada (política de privacidade).';
-- Quem já tinha a guarda ligada (buffer de 2 dias) precisa confirmar o aviso de novo: sem aceite, nada novo é guardado.

-- 3) Uma linha por pessoa que conversa (nome, telefone completo, última mensagem) para a lista de conversas
create table public.tracking_wa_people (
  id             bigint generated always as identity primary key,
  client_id      uuid not null references public.clients (id),
  connection_id  uuid not null references public.tracking_whatsapp_connections (id),
  wa_hash        text not null check (wa_hash ~ '^[0-9a-f]{64}$'),
  phone          text check (phone ~ '^[0-9]{8,15}$'),
  push_name      text check (char_length(push_name) <= 80),
  first_at       timestamptz not null,
  last_at        timestamptz not null,
  last_direction text check (last_direction in ('recebida', 'enviada')),
  last_preview   text check (char_length(last_preview) <= 140),
  messages       integer not null default 0,
  created_at     timestamptz not null default now(),
  unique (connection_id, wa_hash)
);
comment on table public.tracking_wa_people is 'T5.7: quem conversa pelo WhatsApp de um site (telefone completo, dado pessoal). Só admin, gestor e o Account Manager do cliente leem.';
create index tracking_wa_people_client_idx on public.tracking_wa_people (client_id, last_at desc);
alter table public.tracking_wa_people enable row level security;
revoke all on public.tracking_wa_people from anon, authenticated;
grant select on public.tracking_wa_people to authenticated;
create policy "Admin, gestor e Account Manager leem as pessoas das conversas" on public.tracking_wa_people for select to authenticated
  using ((select private.wa_messages_can_read(client_id)));

-- Quem já tem texto guardado entra na lista (o telefone completo só passa a existir daqui para a frente)
insert into public.tracking_wa_people (client_id, connection_id, wa_hash, push_name, first_at, last_at, last_direction, last_preview, messages)
select m.client_id, m.connection_id, m.wa_hash, max(m.push_name), min(m.at), max(m.at),
       (array_agg(m.direction order by m.at desc))[1], left((array_agg(m.body order by m.at desc))[1], 140), count(*)
  from public.tracking_wa_messages m
 group by m.client_id, m.connection_id, m.wa_hash;

-- 4) Guardar uma mensagem (servidor wa-inbound): sem prazo, com o telefone completo, e só com o aviso aceito.
create or replace function private.wa_message_store(p jsonb)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  c       public.tracking_whatsapp_connections;
  v_wa    text := p ->> 'wa_hash';
  v_key   text := p ->> 'message_key';
  v_body  text := left(btrim(coalesce(p ->> 'body', '')), 4000);
  v_dir   text := p ->> 'direction';
  v_at    timestamptz := coalesce((p ->> 'at')::timestamptz, now());
  v_name  text := nullif(left(btrim(coalesce(p ->> 'push_name', '')), 80), '');
  v_phone text := case when p ->> 'phone' ~ '^[0-9]{8,15}$' then p ->> 'phone' end;
  v_id    bigint;
begin
  select * into c from public.tracking_whatsapp_connections where id = (p ->> 'connection_id')::uuid;
  if c.id is null or not c.enabled or not c.store_messages or c.store_ack_at is null or not private.client_is_active(c.client_id) then return 'desligado'; end if;
  if v_wa is null or v_wa !~ '^[0-9a-f]{64}$' or v_key is null or v_key !~ '^[0-9a-f]{16,64}$' or v_dir not in ('recebida', 'enviada') or v_body = '' then return 'invalido'; end if;
  if v_at < now() - interval '3 days' or v_at > now() + interval '1 hour' then v_at := now(); end if;

  insert into public.tracking_wa_messages (client_id, connection_id, wa_hash, direction, message_key, at, body, push_name, phone_tail, expires_at)
  values (c.client_id, c.id, v_wa, v_dir, v_key, v_at, v_body, v_name,
          case when v_phone is not null then right(v_phone, 4) when p ->> 'phone_tail' ~ '^\d{2,4}$' then p ->> 'phone_tail' end,
          null)
  on conflict (connection_id, message_key) do nothing
  returning id into v_id;
  if v_id is null then return 'repetida'; end if;

  insert into public.tracking_wa_people as w (client_id, connection_id, wa_hash, phone, push_name, first_at, last_at, last_direction, last_preview, messages)
  values (c.client_id, c.id, v_wa, v_phone, case when v_dir = 'recebida' then v_name end, v_at, v_at, v_dir, left(v_body, 140), 1)
  on conflict (connection_id, wa_hash) do update
     set messages       = w.messages + 1,
         phone          = coalesce(w.phone, excluded.phone),
         push_name      = coalesce(excluded.push_name, w.push_name),
         first_at       = least(w.first_at, excluded.first_at),
         last_direction = case when excluded.last_at >= w.last_at then excluded.last_direction else w.last_direction end,
         last_preview   = case when excluded.last_at >= w.last_at then excluded.last_preview else w.last_preview end,
         last_at        = greatest(w.last_at, excluded.last_at);
  return 'guardada';
end;
$$;
revoke all on function private.wa_message_store(jsonb) from public, anon, authenticated;
grant execute on function private.wa_message_store(jsonb) to service_role;

-- 5) Ligar/desligar a guarda das conversas. Ligar exige confirmar o aviso (p_ack). Desligar NÃO apaga nada.
drop function public.wa_unofficial_set_store(uuid, boolean);
drop function private.wa_unofficial_set_store_impl(uuid, boolean);
create function private.wa_unofficial_set_store_impl(p_id uuid, p_on boolean, p_ack boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare c public.tracking_whatsapp_connections;
begin
  select * into c from public.tracking_whatsapp_connections where id = p_id and mode = 'nao_oficial';
  if (select private.current_user_role()) not in ('admin', 'gestor') or c.id is null or c.client_id not in (select private.visible_client_ids()) then
    raise exception 'Só administrador e gestor ligam ou desligam a guarda das conversas.' using errcode = '42501';
  end if;
  if p_on and c.store_ack_at is null and not coalesce(p_ack, false) then
    raise exception 'Confirme o aviso: as pessoas precisam ser informadas de que a conversa é registrada.' using errcode = '22023';
  end if;
  update public.tracking_whatsapp_connections
     set store_messages = p_on,
         store_ack_at = case when p_on and store_ack_at is null then now() else store_ack_at end,
         store_ack_by = case when p_on and store_ack_at is null then (select auth.uid()) else store_ack_by end
   where id = p_id;
  insert into public.audit_logs (actor_id, action, target_type, target_id, details)
  values ((select auth.uid()), 'wa_messages.store', 'tracking_whatsapp_connection', p_id::text,
          jsonb_build_object('guardar', p_on, 'aviso_confirmado', c.store_ack_at is not null or coalesce(p_ack, false)));
end;
$$;
revoke all on function private.wa_unofficial_set_store_impl(uuid, boolean, boolean) from public, anon;
grant execute on function private.wa_unofficial_set_store_impl(uuid, boolean, boolean) to authenticated;
create function public.wa_unofficial_set_store(p_id uuid, p_on boolean, p_ack boolean default false)
returns void language sql set search_path = '' as $$ select private.wa_unofficial_set_store_impl(p_id, p_on, p_ack) $$;
revoke all on function public.wa_unofficial_set_store(uuid, boolean, boolean) from public, anon;
grant execute on function public.wa_unofficial_set_store(uuid, boolean, boolean) to authenticated;

-- 6) Lista de conversas de um cliente (a tela "Conversas do WhatsApp")
create function private.wa_conversations_list_impl(p_client uuid, p_search text, p_limit integer, p_before timestamptz)
returns table (person_id bigint, push_name text, phone text, phone_tail text, last_at timestamptz, last_direction text, last_preview text,
               messages integer, origin text, from_ad boolean, ad_id text, contact_id bigint, contact_sales integer,
               suggestion_id uuid, suggestion_reason text, suggestion_confidence text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_q text := nullif(btrim(coalesce(p_search, '')), ''); v_digits text;
begin
  if not private.wa_messages_can_read(p_client) then
    raise exception 'Sem permissão para ver as conversas deste cliente.' using errcode = '42501';
  end if;
  v_digits := regexp_replace(coalesce(v_q, ''), '\D', '', 'g');
  return query
  select p.id, p.push_name, p.phone,
         (select m.phone_tail from public.tracking_wa_messages m where m.connection_id = p.connection_id and m.wa_hash = p.wa_hash and m.phone_tail is not null limit 1),
         p.last_at, p.last_direction, p.last_preview, p.messages,
         coalesce(w.origin, 'desconhecida'), (w.ctwa_clid is not null), w.ad_id,
         k.id, k.sales,
         s.id, s.reason, s.confidence
    from public.tracking_wa_people p
    left join public.tracking_whatsapp_conversations w on w.connection_id = p.connection_id and w.wa_hash = p.wa_hash
    left join lateral (select kk.id, kk.sales from public.tracking_contacts kk
                        where kk.client_id = p.client_id and kk.ph_hash = p.wa_hash and kk.archived_at is null order by kk.id limit 1) k on true
    left join lateral (select ss.id, ss.reason, ss.confidence from public.tracking_wa_suggestions ss
                        where ss.client_id = p.client_id and ss.wa_hash = p.wa_hash and ss.status = 'pendente' order by ss.day desc limit 1) s on true
   where p.client_id = p_client
     and (p_before is null or p.last_at < p_before)
     and (v_q is null or p.push_name ilike '%' || replace(replace(v_q, '%', ''), '_', '') || '%'
          or (length(v_digits) >= 3 and p.phone like '%' || v_digits || '%'))
   order by p.last_at desc
   limit greatest(1, least(coalesce(p_limit, 50), 100));
end;
$$;
revoke all on function private.wa_conversations_list_impl(uuid, text, integer, timestamptz) from public, anon;
grant execute on function private.wa_conversations_list_impl(uuid, text, integer, timestamptz) to authenticated;
create function public.wa_conversations_list(p_client uuid, p_search text default null, p_limit integer default 50, p_before timestamptz default null)
returns table (person_id bigint, push_name text, phone text, phone_tail text, last_at timestamptz, last_direction text, last_preview text,
               messages integer, origin text, from_ad boolean, ad_id text, contact_id bigint, contact_sales integer,
               suggestion_id uuid, suggestion_reason text, suggestion_confidence text)
language sql stable set search_path = '' as $$ select * from private.wa_conversations_list_impl(p_client, p_search, p_limit, p_before) $$;
revoke all on function public.wa_conversations_list(uuid, text, integer, timestamptz) from public, anon;
grant execute on function public.wa_conversations_list(uuid, text, integer, timestamptz) to authenticated;

-- 7) Mensagens de uma conversa (as mais novas primeiro; a tela pede mais antigas com p_before)
create function private.wa_conversation_messages_impl(p_person bigint, p_before timestamptz, p_limit integer)
returns table (id bigint, direction text, at timestamptz, body text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare w public.tracking_wa_people;
begin
  select * into w from public.tracking_wa_people where tracking_wa_people.id = p_person;
  if w.id is null or not private.wa_messages_can_read(w.client_id) then
    raise exception 'Conversa não encontrada ou sem permissão.' using errcode = '42501';
  end if;
  return query
  select m.id, m.direction, m.at, m.body
    from public.tracking_wa_messages m
   where m.connection_id = w.connection_id and m.wa_hash = w.wa_hash and (p_before is null or m.at < p_before)
   order by m.at desc, m.id desc
   limit greatest(1, least(coalesce(p_limit, 60), 200));
end;
$$;
revoke all on function private.wa_conversation_messages_impl(bigint, timestamptz, integer) from public, anon;
grant execute on function private.wa_conversation_messages_impl(bigint, timestamptz, integer) to authenticated;
create function public.wa_conversation_messages(p_person bigint, p_before timestamptz default null, p_limit integer default 60)
returns table (id bigint, direction text, at timestamptz, body text)
language sql stable set search_path = '' as $$ select * from private.wa_conversation_messages_impl(p_person, p_before, p_limit) $$;
revoke all on function public.wa_conversation_messages(bigint, timestamptz, integer) from public, anon;
grant execute on function public.wa_conversation_messages(bigint, timestamptz, integer) to authenticated;

-- 8) Apagar uma conversa (só administrador). Fica no histórico de mudanças (sem o texto).
create function private.wa_conversation_delete_impl(p_person bigint)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare w public.tracking_wa_people; v_n integer;
begin
  if (select private.current_user_role()) <> 'admin' then
    raise exception 'Só o administrador apaga uma conversa.' using errcode = '42501';
  end if;
  select * into w from public.tracking_wa_people where id = p_person;
  if w.id is null then raise exception 'Conversa não encontrada.' using errcode = 'P0002'; end if;
  delete from public.tracking_wa_messages where connection_id = w.connection_id and wa_hash = w.wa_hash;
  get diagnostics v_n = row_count;
  delete from public.tracking_wa_people where id = p_person;
  insert into public.audit_logs (actor_id, action, target_type, target_id, details)
  values ((select auth.uid()), 'wa_conversation.delete', 'tracking_wa_people', p_person::text, jsonb_build_object('mensagens_apagadas', v_n, 'client_id', w.client_id));
  return v_n;
end;
$$;
revoke all on function private.wa_conversation_delete_impl(bigint) from public, anon;
grant execute on function private.wa_conversation_delete_impl(bigint) to authenticated;
create function public.wa_conversation_delete(p_person bigint)
returns integer language sql set search_path = '' as $$ select private.wa_conversation_delete_impl(p_person) $$;
revoke all on function public.wa_conversation_delete(bigint) from public, anon;
grant execute on function public.wa_conversation_delete(bigint) to authenticated;

-- 9) "Apagar tudo de um site" (que já existia) também limpa a lista de pessoas.
create or replace function private.wa_messages_delete_all_impl(p_connection uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare v_n integer;
begin
  if (select private.current_user_role()) <> 'admin' then
    raise exception 'Só o administrador apaga as conversas guardadas.' using errcode = '42501';
  end if;
  delete from public.tracking_wa_messages where connection_id = p_connection;
  get diagnostics v_n = row_count;
  delete from public.tracking_wa_people where connection_id = p_connection;
  insert into public.audit_logs (actor_id, action, target_type, target_id, details)
  values ((select auth.uid()), 'wa_messages.delete_all', 'tracking_whatsapp_connection', p_connection::text, jsonb_build_object('apagadas', v_n));
  return v_n;
end;
$$;

-- 10) (parte 4) A lista acha o contato também pelo telefone normalizado, e "Marcar venda" cria o contato se ainda não existir.
-- Hash do telefone normalizado (BR de 12 dígitos sem o 9 ganha o 9), igual ao resto do sistema; sem telefone, usa o hash que o WhatsApp mandou.
create function private.wa_phone_ph_hash(p_phone text, p_wa_hash text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when p_phone is null then p_wa_hash
              else encode(extensions.digest(
                     case when length(p_phone) = 12 and p_phone like '55%' and substr(p_phone, 5, 1) between '6' and '9'
                          then substr(p_phone, 1, 4) || '9' || substr(p_phone, 5) else p_phone end, 'sha256'), 'hex') end
$$;
revoke all on function private.wa_phone_ph_hash(text, text) from public, anon;
grant execute on function private.wa_phone_ph_hash(text, text) to authenticated;

create or replace function private.wa_conversations_list_impl(p_client uuid, p_search text, p_limit integer, p_before timestamptz)
returns table (person_id bigint, push_name text, phone text, phone_tail text, last_at timestamptz, last_direction text, last_preview text,
               messages integer, origin text, from_ad boolean, ad_id text, contact_id bigint, contact_sales integer,
               suggestion_id uuid, suggestion_reason text, suggestion_confidence text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_q text := nullif(btrim(coalesce(p_search, '')), ''); v_digits text;
begin
  if not private.wa_messages_can_read(p_client) then
    raise exception 'Sem permissão para ver as conversas deste cliente.' using errcode = '42501';
  end if;
  v_digits := regexp_replace(coalesce(v_q, ''), '\D', '', 'g');
  return query
  select p.id, p.push_name, p.phone,
         (select m.phone_tail from public.tracking_wa_messages m where m.connection_id = p.connection_id and m.wa_hash = p.wa_hash and m.phone_tail is not null limit 1),
         p.last_at, p.last_direction, p.last_preview, p.messages,
         coalesce(w.origin, 'desconhecida'), (w.ctwa_clid is not null), w.ad_id,
         k.id, k.sales,
         s.id, s.reason, s.confidence
    from public.tracking_wa_people p
    left join public.tracking_whatsapp_conversations w on w.connection_id = p.connection_id and w.wa_hash = p.wa_hash
    left join lateral (select kk.id, kk.sales from public.tracking_contacts kk
                        where kk.client_id = p.client_id and kk.archived_at is null and (kk.wa_hash = p.wa_hash or kk.ph_hash in (p.wa_hash, private.wa_phone_ph_hash(p.phone, p.wa_hash)))
                        order by kk.id limit 1) k on true
    left join lateral (select ss.id, ss.reason, ss.confidence from public.tracking_wa_suggestions ss
                        where ss.client_id = p.client_id and ss.wa_hash = p.wa_hash and ss.status = 'pendente' order by ss.day desc limit 1) s on true
   where p.client_id = p_client
     and (p_before is null or p.last_at < p_before)
     and (v_q is null or p.push_name ilike '%' || replace(replace(v_q, '%', ''), '_', '') || '%'
          or (length(v_digits) >= 3 and p.phone like '%' || v_digits || '%'))
   order by p.last_at desc
   limit greatest(1, least(coalesce(p_limit, 50), 100));
end;
$$;

-- Contato da pessoa da conversa (cria se não existir, com a origem da conversa). Quem pode marcar vendas em Contatos.
create function private.wa_person_contact_impl(p_person bigint)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  w      public.tracking_wa_people;
  c      public.tracking_whatsapp_connections;
  conv   public.tracking_whatsapp_conversations;
  k      public.tracking_contacts;
  v_open uuid; v_click bigint; v_vis text; v_ph text;
begin
  select * into w from public.tracking_wa_people where id = p_person;
  if w.id is null or not private.wa_messages_can_read(w.client_id) or not private.contacts_can_mark(w.client_id) then
    raise exception 'Só quem marca vendas em Contatos pode marcar a venda desta conversa.' using errcode = '42501';
  end if;
  v_ph := private.wa_phone_ph_hash(w.phone, w.wa_hash);
  select * into k from public.tracking_contacts t
   where t.client_id = w.client_id and t.archived_at is null and (t.wa_hash = w.wa_hash or t.ph_hash in (w.wa_hash, v_ph)) order by t.id limit 1;
  if k.id is not null then return k.id; end if;
  select * into c from public.tracking_whatsapp_connections where id = w.connection_id;
  select * into conv from public.tracking_whatsapp_conversations where connection_id = w.connection_id and wa_hash = w.wa_hash;
  select s.id into v_open from public.tracking_contact_stages s
   where s.client_id = w.client_id and s.archived_at is null and s.kind = 'aberta' order by s.position limit 1;
  if v_open is null then raise exception 'Cadastre as etapas dos contatos deste cliente antes (Contatos → Etapas).' using errcode = '22023'; end if;
  select cl.id into v_click from public.tracking_whatsapp_clicks cl where cl.code = conv.click_code and cl.container_id = c.container_id;
  v_vis := coalesce(conv.visitor_id, 'wa' || left(w.wa_hash, 30));
  insert into public.tracking_contacts (client_id, container_id, origin, ph_hash, wa_hash, visitor_id, session_id, wa_click_id, ref_code, touchpoint_id, stage_id)
  values (w.client_id, c.container_id, 'whatsapp', v_ph, w.wa_hash, v_vis, coalesce(conv.session_id, v_vis), v_click, conv.click_code, conv.touchpoint_id, v_open)
  returning * into k;
  insert into public.tracking_contact_history (contact_id, client_id, by_user, kind, stage_id, meta_note)
  values (k.id, w.client_id, (select auth.uid()), 'criado', v_open, 'Criado pela caixa de conversas do WhatsApp');
  return k.id;
end;
$$;
revoke all on function private.wa_person_contact_impl(bigint) from public, anon;
grant execute on function private.wa_person_contact_impl(bigint) to authenticated;
create function public.wa_person_contact(p_person bigint)
returns bigint language sql set search_path = '' as $$ select private.wa_person_contact_impl(p_person) $$;
revoke all on function public.wa_person_contact(bigint) from public, anon;
grant execute on function public.wa_person_contact(bigint) to authenticated;

-- 11) (parte 5, T5.8) Histórico antigo do aparelho: aceita data antiga e guarda em lotes. Só para a caixa de conversas.
create or replace function private.wa_message_store(p jsonb)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  c       public.tracking_whatsapp_connections;
  v_wa    text := p ->> 'wa_hash';
  v_key   text := p ->> 'message_key';
  v_body  text := left(btrim(coalesce(p ->> 'body', '')), 4000);
  v_dir   text := p ->> 'direction';
  v_hist  boolean := coalesce((p ->> 'history')::boolean, false);
  v_min   timestamptz;
  v_at    timestamptz := coalesce((p ->> 'at')::timestamptz, now());
  v_name  text := nullif(left(btrim(coalesce(p ->> 'push_name', '')), 80), '');
  v_phone text := case when p ->> 'phone' ~ '^[0-9]{8,15}$' then p ->> 'phone' end;
  v_id    bigint;
begin
  select * into c from public.tracking_whatsapp_connections where id = (p ->> 'connection_id')::uuid;
  if c.id is null or not c.enabled or not c.store_messages or c.store_ack_at is null or not private.client_is_active(c.client_id) then return 'desligado'; end if;
  if v_wa is null or v_wa !~ '^[0-9a-f]{64}$' or v_key is null or v_key !~ '^[0-9a-f]{16,64}$' or v_dir not in ('recebida', 'enviada') or v_body = '' then return 'invalido'; end if;
  v_min := now() - (case when v_hist then interval '10 years' else interval '3 days' end);
  if v_at > now() + interval '1 hour' or v_at < v_min then v_at := now(); end if;

  insert into public.tracking_wa_messages (client_id, connection_id, wa_hash, direction, message_key, at, body, push_name, phone_tail, expires_at)
  values (c.client_id, c.id, v_wa, v_dir, v_key, v_at, v_body, v_name,
          case when v_phone is not null then right(v_phone, 4) when p ->> 'phone_tail' ~ '^\d{2,4}$' then p ->> 'phone_tail' end,
          null)
  on conflict (connection_id, message_key) do nothing
  returning id into v_id;
  if v_id is null then return 'repetida'; end if;

  insert into public.tracking_wa_people as w (client_id, connection_id, wa_hash, phone, push_name, first_at, last_at, last_direction, last_preview, messages)
  values (c.client_id, c.id, v_wa, v_phone, case when v_dir = 'recebida' then v_name end, v_at, v_at, v_dir, left(v_body, 140), 1)
  on conflict (connection_id, wa_hash) do update
     set messages       = w.messages + 1,
         phone          = coalesce(w.phone, excluded.phone),
         push_name      = coalesce(excluded.push_name, w.push_name),
         first_at       = least(w.first_at, excluded.first_at),
         last_direction = case when excluded.last_at >= w.last_at then excluded.last_direction else w.last_direction end,
         last_preview   = case when excluded.last_at >= w.last_at then excluded.last_preview else w.last_preview end,
         last_at        = greatest(w.last_at, excluded.last_at);
  return 'guardada';
end;
$$;
revoke all on function private.wa_message_store(jsonb) from public, anon, authenticated;
grant execute on function private.wa_message_store(jsonb) to service_role;

-- Lote do histórico (só o servidor chama): devolve quantas mensagens novas entraram.
create function public.wa_messages_store_many(p_connection uuid, p_items jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare v_item jsonb; v_n integer := 0;
begin
  if jsonb_typeof(p_items) <> 'array' then return 0; end if;
  for v_item in select * from jsonb_array_elements(p_items) limit 200 loop
    if private.wa_message_store((v_item - 'connection_id') || jsonb_build_object('connection_id', p_connection, 'history', true)) = 'guardada' then v_n := v_n + 1; end if;
  end loop;
  return v_n;
end;
$$;
revoke all on function public.wa_messages_store_many(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.wa_messages_store_many(uuid, jsonb) to service_role;

-- 12) (parte 6) Quantas vendas já estão marcadas para a pessoa (Contatos ou Tracking → WhatsApp), para avisar antes de marcar de novo.
create function private.wa_person_sales_impl(p_person bigint)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare w public.tracking_wa_people; v_conv integer; v_contact integer;
begin
  select * into w from public.tracking_wa_people where id = p_person;
  if w.id is null or not private.wa_messages_can_read(w.client_id) then
    raise exception 'Conversa não encontrada ou sem permissão.' using errcode = '42501';
  end if;
  select coalesce(max(c.sales), 0) into v_conv from public.tracking_whatsapp_conversations c where c.connection_id = w.connection_id and c.wa_hash = w.wa_hash;
  select coalesce(max(k.sales), 0) into v_contact from public.tracking_contacts k
   where k.client_id = w.client_id and k.archived_at is null and (k.wa_hash = w.wa_hash or k.ph_hash in (w.wa_hash, private.wa_phone_ph_hash(w.phone, w.wa_hash)));
  return greatest(v_conv, v_contact);
end;
$$;
revoke all on function private.wa_person_sales_impl(bigint) from public, anon;
grant execute on function private.wa_person_sales_impl(bigint) to authenticated;
create function public.wa_person_sales(p_person bigint)
returns integer language sql stable set search_path = '' as $$ select private.wa_person_sales_impl(p_person) $$;
revoke all on function public.wa_person_sales(bigint) from public, anon;
grant execute on function public.wa_person_sales(bigint) to authenticated;
