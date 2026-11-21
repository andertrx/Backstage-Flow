-- T5.38 Fase C (21/11/2026): conferência automática do WhatsApp (QR Code) de CADA CLIENTE, a cada 5 minutos.
-- Antes, o estado "conectado / desconectado" só mudava quando alguém abria a tela. Se o WhatsApp de um cliente caísse de madrugada,
-- ninguém sabia e as mensagens (contatos, vendas) deixavam de chegar ao CRM.
-- Agora uma função confere cada conexão ligada (servidor não oficial) e, se ficar fora por 10 minutos, avisa no sino:
-- administradores, gestores com acesso ao cliente e o Account Manager do cliente. Quando volta, sai um aviso de "voltou".
-- Um aviso por queda (repete só depois de 6 horas fora). Nada de telefone ou conversa é lido ou guardado: só o estado.
-- Quem não tem a Central de Operações (sino) não recebe o aviso no sino, mas vê o estado vermelho na lista de clientes.

-- 1) Controle dos avisos, por conexão
alter table public.tracking_whatsapp_connections
  add column health_since       timestamptz,
  add column health_alert_sent  boolean not null default false,
  add column health_alert_at    timestamptz;
comment on column public.tracking_whatsapp_connections.health_since is 'T5.38 fase C: desde quando a conexão está no estado atual (conectada ou não).';
comment on column public.tracking_whatsapp_connections.health_alert_sent is 'T5.38 fase C: já avisou que esta conexão caiu (zera quando volta).';

-- 2) O aviso do sino pode levar ao Tracking (antes só a /operacoes/)
do $$
declare v text;
begin
  select conname into v from pg_constraint
   where conrelid = 'public.ops_notifications'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%link%';
  if v is not null then execute 'alter table public.ops_notifications drop constraint ' || quote_ident(v); end if;
end $$;
alter table public.ops_notifications add constraint ops_notifications_link_check check (link ~ '^/(operacoes|tracking)');

-- 3) Quais conexões conferir: ligadas, do servidor próprio e com instância criada
create function private.wa_client_health_list_impl()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'instance', c.instance_name) order by c.id), '[]'::jsonb)
    from public.tracking_whatsapp_connections c
   where c.mode = 'nao_oficial' and c.enabled and c.instance_name is not null and private.client_is_active(c.client_id)
$$;

-- 4) Anota o estado visto e decide os avisos
create function private.wa_client_health_apply_impl(p_connection uuid, p_state text)
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

  if p_state <> 'conectado' and v_min >= 10 and (not c.health_alert_sent or coalesce(c.health_alert_at, '-infinity') < now() - interval '6 hours') then
    v_key := 'wa.cliente.caiu.' || c.id || '.' || extract(epoch from now())::bigint;
    for u in
      select p.id from public.profiles p where p.active and (
        p.role = 'admin'
        or (p.role = 'gestor' and exists (select 1 from public.user_client_access a where a.user_id = p.id and a.client_id = c.client_id))
        or exists (select 1 from public.ops_client_ops o where o.client_id = c.client_id and o.am_user_id = p.id))
    loop
      perform private.ops_notify(u.id, 'whatsapp.caiu', 'WhatsApp de ' || coalesce(v_name, 'um cliente') || ' sem conexão',
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
        or (p.role = 'gestor' and exists (select 1 from public.user_client_access a where a.user_id = p.id and a.client_id = c.client_id))
        or exists (select 1 from public.ops_client_ops o where o.client_id = c.client_id and o.am_user_id = p.id))
    loop
      perform private.ops_notify(u.id, 'whatsapp.voltou', 'WhatsApp de ' || coalesce(v_name, 'um cliente') || ' voltou',
        'A conexão voltou e as mensagens estão chegando de novo.', '/tracking?cliente=' || c.client_id, v_key);
    end loop;
    update public.tracking_whatsapp_connections set health_alert_sent = false where id = c.id;
    v_result := 'avisou_voltou';
  end if;
  return v_result;
end;
$$;

revoke all on function private.wa_client_health_list_impl(), private.wa_client_health_apply_impl(uuid, text) from public, anon, authenticated;
grant execute on function private.wa_client_health_list_impl(), private.wa_client_health_apply_impl(uuid, text) to service_role;
create function public.wa_client_health_list() returns jsonb language sql stable set search_path = '' as $$ select private.wa_client_health_list_impl() $$;
create function public.wa_client_health_apply(p_connection uuid, p_state text) returns text language sql set search_path = '' as $$ select private.wa_client_health_apply_impl(p_connection, p_state) $$;
revoke all on function public.wa_client_health_list(), public.wa_client_health_apply(uuid, text) from public, anon, authenticated;
grant execute on function public.wa_client_health_list(), public.wa_client_health_apply(uuid, text) to service_role;

-- 5) Agendador: a cada 5 minutos chama a função (só se houver conexão para conferir)
create function private.trigger_wa_health_clientes()
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_url text := (select value from private.app_settings where key = 'functions_url');
  v_secret text := (select decrypted_secret from vault.decrypted_secrets where name = 'sync_cron_secret');
begin
  if v_url is null or v_secret is null then return; end if;
  if jsonb_array_length(private.wa_client_health_list_impl()) = 0 then return; end if;
  perform net.http_post(
    url := v_url || '/wa-health',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret),
    body := jsonb_build_object('action', 'tick'),
    timeout_milliseconds := 60000
  );
end;
$$;
revoke all on function private.trigger_wa_health_clientes() from public, anon, authenticated;
select cron.schedule('wa-health-clientes', '*/5 * * * *', $cron$select private.trigger_wa_health_clientes()$cron$);
