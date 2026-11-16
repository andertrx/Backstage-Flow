-- T5.38 (acesso do Account Manager) — o AM não vê a página do Tracking, mas pode conectar o WhatsApp dos clientes dele.
-- Esta função diz se a pessoa logada pode conectar o WhatsApp do cliente (administrador, gestor com acesso ou AM do cliente) e devolve
-- só as conexões do cliente pelo servidor não oficial, sem chave, sem token e sem telefone além do número do próprio WhatsApp do cliente.
create function private.wa_instance_minha_conexao_impl(p_client uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_user uuid := (select auth.uid());
  v_role text;
  v_pode boolean := false;
begin
  if v_user is null or p_client is null then return jsonb_build_object('pode', false, 'conexoes', '[]'::jsonb); end if;
  select role::text into v_role from public.profiles where id = v_user and active;
  if v_role = 'admin' then v_pode := true;
  elsif v_role = 'gestor' then v_pode := exists (select 1 from public.user_client_access a where a.user_id = v_user and a.client_id = p_client);
  end if;
  if not v_pode and v_role is not null then
    v_pode := exists (select 1 from public.ops_client_ops o where o.client_id = p_client and o.am_user_id = v_user);
  end if;
  if not v_pode or not private.client_is_active(p_client) then return jsonb_build_object('pode', false, 'conexoes', '[]'::jsonb); end if;
  return jsonb_build_object('pode', true, 'conexoes', (
    select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'display_phone', c.display_phone, 'phone_number_id', c.phone_number_id,
             'instance_name', c.instance_name, 'gateway_state', c.gateway_state, 'enabled', c.enabled, 'last_webhook_at', c.last_webhook_at)
             order by c.created_at), '[]'::jsonb)
      from public.tracking_whatsapp_connections c where c.client_id = p_client and c.mode = 'nao_oficial'));
end;
$$;
revoke all on function private.wa_instance_minha_conexao_impl(uuid) from public, anon;
grant execute on function private.wa_instance_minha_conexao_impl(uuid) to authenticated;

create function public.wa_instance_minha_conexao(p_client uuid)
returns jsonb language sql stable set search_path = '' as $$ select private.wa_instance_minha_conexao_impl(p_client) $$;
revoke all on function public.wa_instance_minha_conexao(uuid) from public, anon;
grant execute on function public.wa_instance_minha_conexao(uuid) to authenticated;
