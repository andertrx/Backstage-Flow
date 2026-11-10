-- T5.23: (1) período do histórico ao ligar o WhatsApp de um cliente; (2) limpar os dados de conversa de um cliente (só administrador).
-- A limpeza apaga texto, telefone, nome e sugestões; MANTÉM as conversas (só código de telefone cifrado), vendas marcadas e contagens.

alter table public.tracking_whatsapp_connections add column history_days integer default 30
  check (history_days is null or history_days between 0 and 365);
comment on column public.tracking_whatsapp_connections.history_days is 'T5.23: quantos dias do histórico antigo do aparelho entram ao guardar as conversas (0 = não importar histórico; vazio = tudo). Vale para as mensagens que chegarem depois.';
-- Quem já estava ligado antes desta mudança continua como era (sem limite); o padrão de 30 dias vale só para conexões novas.
update public.tracking_whatsapp_connections set history_days = null;

-- Histórico fora do período escolhido não é guardado.
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
  if v_hist and c.history_days is not null and v_at < now() - make_interval(days => c.history_days) then return 'fora_do_periodo'; end if;
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

create function private.wa_unofficial_set_history_impl(p_id uuid, p_days integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare c public.tracking_whatsapp_connections;
begin
  select * into c from public.tracking_whatsapp_connections where id = p_id and mode = 'nao_oficial';
  if (select private.current_user_role()) not in ('admin', 'gestor') or c.id is null or c.client_id not in (select private.visible_client_ids()) then
    raise exception 'Só administrador e gestor mudam o período do histórico.' using errcode = '42501';
  end if;
  if p_days is not null and p_days not in (0, 30, 60, 90, 180, 365) then raise exception 'Período inválido.' using errcode = '22023'; end if;
  update public.tracking_whatsapp_connections set history_days = p_days where id = p_id;
  insert into public.audit_logs (actor_id, action, target_type, target_id, details)
  values ((select auth.uid()), 'wa_messages.history_days', 'tracking_whatsapp_connection', p_id::text, jsonb_build_object('dias', p_days));
end;
$$;

-- Quanto será apagado (passo 1 da confirmação). Só administrador.
create function private.wa_unofficial_limpar_contagem_impl(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare c public.tracking_whatsapp_connections;
begin
  select * into c from public.tracking_whatsapp_connections where id = p_id and mode = 'nao_oficial';
  if (select private.current_user_role()) <> 'admin' or c.id is null then
    raise exception 'Só o administrador limpa os dados de conversa.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'mensagens', (select count(*) from public.tracking_wa_messages where client_id = c.client_id),
    'pessoas', (select count(*) from public.tracking_wa_people where client_id = c.client_id),
    'sugestoes', (select count(*) from public.tracking_wa_suggestions where client_id = c.client_id),
    'conversas_mantidas', (select count(*) from public.tracking_whatsapp_conversations where client_id = c.client_id));
end;
$$;

-- Limpeza (passo 2): só com a palavra APAGAR. Mantém conversas, vendas marcadas e contagens; apaga texto, telefone, nome e sugestões.
create function private.wa_unofficial_limpar_impl(p_id uuid, p_confirmar text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare c public.tracking_whatsapp_connections; v_m integer; v_p integer; v_s integer;
begin
  select * into c from public.tracking_whatsapp_connections where id = p_id and mode = 'nao_oficial';
  if (select private.current_user_role()) <> 'admin' or c.id is null then
    raise exception 'Só o administrador limpa os dados de conversa.' using errcode = '42501';
  end if;
  if btrim(coalesce(p_confirmar, '')) <> 'APAGAR' then raise exception 'Confirmação inválida: digite APAGAR.' using errcode = '22023'; end if;
  delete from public.tracking_wa_messages where client_id = c.client_id; get diagnostics v_m = row_count;
  delete from public.tracking_wa_people where client_id = c.client_id; get diagnostics v_p = row_count;
  delete from public.tracking_wa_suggestions where client_id = c.client_id; get diagnostics v_s = row_count;
  insert into public.audit_logs (actor_id, action, target_type, target_id, details)
  values ((select auth.uid()), 'wa_messages.limpar', 'client', c.client_id::text, jsonb_build_object('conexao', p_id, 'mensagens', v_m, 'pessoas', v_p, 'sugestoes', v_s));
  return jsonb_build_object('mensagens', v_m, 'pessoas', v_p, 'sugestoes', v_s);
end;
$$;

revoke all on function private.wa_unofficial_set_history_impl(uuid, integer), private.wa_unofficial_limpar_contagem_impl(uuid), private.wa_unofficial_limpar_impl(uuid, text) from public, anon, authenticated;
grant execute on function private.wa_unofficial_set_history_impl(uuid, integer), private.wa_unofficial_limpar_contagem_impl(uuid), private.wa_unofficial_limpar_impl(uuid, text) to authenticated;

create function public.wa_unofficial_set_history(p_id uuid, p_days integer)
returns void language sql set search_path = '' as $$ select private.wa_unofficial_set_history_impl(p_id, p_days) $$;
create function public.wa_unofficial_limpar_contagem(p_id uuid)
returns jsonb language sql stable set search_path = '' as $$ select private.wa_unofficial_limpar_contagem_impl(p_id) $$;
create function public.wa_unofficial_limpar(p_id uuid, p_confirmar text)
returns jsonb language sql set search_path = '' as $$ select private.wa_unofficial_limpar_impl(p_id, p_confirmar) $$;
revoke all on function public.wa_unofficial_set_history(uuid, integer), public.wa_unofficial_limpar_contagem(uuid), public.wa_unofficial_limpar(uuid, text) from public, anon;
grant execute on function public.wa_unofficial_set_history(uuid, integer), public.wa_unofficial_limpar_contagem(uuid), public.wa_unofficial_limpar(uuid, text) to authenticated;

-- A coluna nova precisa de leitura para a tela (a tabela usa permissão por coluna).
grant select (history_days) on public.tracking_whatsapp_connections to authenticated;
