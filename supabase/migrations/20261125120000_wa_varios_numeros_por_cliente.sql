-- 25/11/2026 (pedido do Ander): um cliente pode ter VÁRIOS números de WhatsApp pelo servidor próprio (QR Code), cada um com as suas conversas.
-- Cada número já tinha a sua instância no servidor (bf-...) e as pessoas das conversas já são guardadas por conexão;
-- o que faltava era um lugar para o 2º número: a conexão fica presa a um "recipiente" (container) e cada recipiente tem uma conexão só.
-- Aqui: uma função cria mais um recipiente técnico (tipo 'whatsapp') para o cliente. Nada do que existe muda; nada é apagado.
-- E o aviso de "caiu/voltou" passa a dizer o final do número (com dois números, dá para saber qual caiu).

create function private.wa_novo_numero_container_impl(p_client uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid; v_n integer;
begin
  if (select private.current_user_role()) not in ('admin', 'gestor') or p_client is null or p_client not in (select private.visible_client_ids()) then
    raise exception 'Só administrador e gestor ligam o WhatsApp de um cliente.' using errcode = '42501';
  end if;
  if not private.client_is_active(p_client) then raise exception 'Cliente desativado.' using errcode = '22023'; end if;
  -- recipiente técnico do cliente ainda sem número (ex.: criado e abandonado): reaproveita em vez de criar outro
  select t.id into v_id from public.tracking_containers t
   where t.client_id = p_client and t.kind = 'whatsapp'
     and not exists (select 1 from public.tracking_whatsapp_connections w where w.container_id = t.id)
   order by t.created_at limit 1;
  if v_id is not null then return v_id; end if;
  select count(*) into v_n from public.tracking_containers where client_id = p_client and kind = 'whatsapp';
  if v_n >= 10 then raise exception 'Limite de 10 números de WhatsApp por cliente.' using errcode = '22023'; end if;
  insert into public.tracking_containers (client_id, name, kind, allowed_domains, status, test_mode)
  values (p_client, 'WhatsApp (número ' || (v_n + 1) || ')', 'whatsapp', '{}', 'ativo', false)
  returning id into v_id;
  insert into public.audit_logs (actor_id, action, target_type, target_id, details)
  values ((select auth.uid()), 'tracking.whatsapp_novo_numero', 'client', p_client::text, jsonb_build_object('container', v_id));
  return v_id;
end;
$$;
revoke all on function private.wa_novo_numero_container_impl(uuid) from public, anon, authenticated;
grant execute on function private.wa_novo_numero_container_impl(uuid) to authenticated;
create function public.wa_novo_numero_container(p_client uuid)
returns uuid language sql set search_path = '' as $$ select private.wa_novo_numero_container_impl(p_client) $$;
revoke all on function public.wa_novo_numero_container(uuid) from public, anon;
grant execute on function public.wa_novo_numero_container(uuid) to authenticated;

-- Aviso do sino com o final do número (o número da empresa do cliente, não de quem conversa).
create or replace function private.wa_client_health_apply_impl(p_connection uuid, p_state text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  c public.tracking_whatsapp_connections;
  v_min integer; v_name text; v_key text; u record; v_result text := 'ok';
begin
  if p_state not in ('conectado', 'desconectado', 'aguardando_leitura', 'erro', 'desconhecido') then raise exception 'Estado inválido.' using errcode = '22023'; end if;
  select * into c from public.tracking_whatsapp_connections where id = p_connection for update;
  if c.id is null or c.mode <> 'nao_oficial' or not c.enabled then return 'ignorado'; end if;

  update public.tracking_whatsapp_connections
     set gateway_state = p_state, gateway_state_at = now(),
         health_since = case when (c.gateway_state = 'conectado') is distinct from (p_state = 'conectado') or c.health_since is null then now() else c.health_since end
   where id = c.id;
  select * into c from public.tracking_whatsapp_connections where id = p_connection;
  select name into v_name from public.clients where id = c.client_id;
  v_min := floor(extract(epoch from (now() - coalesce(c.health_since, now()))) / 60);

  if p_state <> 'conectado' and v_min >= 10 and (not c.health_alert_sent or coalesce(c.health_alert_at, '-infinity') < now() - interval '24 hours') then
    v_key := 'wa.cliente.caiu.' || c.id || '.' || extract(epoch from now())::bigint;
    for u in
      select p.id from public.profiles p where p.active and (
        p.role = 'admin'
        or exists (select 1 from public.ops_client_ops o where o.client_id = c.client_id and o.am_user_id = p.id))
    loop
      perform private.ops_notify(u.id, 'whatsapp.caiu', 'WhatsApp de ' || coalesce(v_name, 'um cliente') || coalesce(' (final ' || right(c.display_phone, 4) || ')', '') || ' sem conexão',
        'Há ' || v_min || ' min desconectado. Enquanto isso, as mensagens e vendas desse cliente não chegam ao CRM. Reconecte por QR Code em Tracking.',
        '/tracking?cliente=' || c.client_id, v_key);
    end loop;
    update public.tracking_whatsapp_connections set health_alert_sent = true, health_alert_at = now() where id = c.id;
    v_result := 'avisou_caiu';
  elsif p_state = 'conectado' and c.health_alert_sent then
    v_key := 'wa.cliente.voltou.' || c.id || '.' || extract(epoch from now())::bigint;
    for u in
      select p.id from public.profiles p where p.active and (
        p.role = 'admin'
        or exists (select 1 from public.ops_client_ops o where o.client_id = c.client_id and o.am_user_id = p.id))
    loop
      perform private.ops_notify(u.id, 'whatsapp.voltou', 'WhatsApp de ' || coalesce(v_name, 'um cliente') || coalesce(' (final ' || right(c.display_phone, 4) || ')', '') || ' voltou',
        'A conexão voltou e as mensagens estão chegando de novo.', '/tracking?cliente=' || c.client_id, v_key);
    end loop;
    update public.tracking_whatsapp_connections set health_alert_sent = false where id = c.id;
    v_result := 'avisou_voltou';
  end if;
  return v_result;
end;
$$;

-- Conversas: de qual número do cliente é cada pessoa (para o filtro "Número" quando o cliente tem mais de um).
-- Mesma regra de leitura das conversas (admin, gestor e Account Manager do cliente). Só ids: nada pessoal sai daqui.
create function private.wa_people_connections_impl(p_client uuid)
returns table (person_id bigint, connection_id uuid)
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_client is null or not private.wa_messages_can_read(p_client) then return; end if;
  return query select p.id, p.connection_id from public.tracking_wa_people p where p.client_id = p_client;
end;
$$;
revoke all on function private.wa_people_connections_impl(uuid) from public, anon;
grant execute on function private.wa_people_connections_impl(uuid) to authenticated;
create function public.wa_people_connections(p_client uuid)
returns table (person_id bigint, connection_id uuid)
language sql stable set search_path = '' as $$ select * from private.wa_people_connections_impl(p_client) $$;
revoke all on function public.wa_people_connections(uuid) from public, anon;
grant execute on function public.wa_people_connections(uuid) to authenticated;
