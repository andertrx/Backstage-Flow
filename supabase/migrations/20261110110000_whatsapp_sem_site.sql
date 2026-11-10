-- T5.26: WhatsApp do cliente sem site. A conexão de WhatsApp continua presa a um "container" (nada do que já funciona muda),
-- mas agora existe um container técnico do tipo 'whatsapp' (sem domínio, não recebe eventos de site), criado sozinho e escondido
-- das telas de sites. Conexões e conversas atuais não mudam.
alter table public.tracking_containers add column kind text not null default 'site' check (kind in ('site', 'whatsapp'));
comment on column public.tracking_containers.kind is 'T5.26: site = site do cliente (script de tracking); whatsapp = container técnico só para ligar o WhatsApp de um cliente sem site (sem domínio; nunca aparece como site).';

create function private.wa_sem_site_container_impl(p_client uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid;
begin
  if (select private.current_user_role()) not in ('admin', 'gestor') or p_client is null or p_client not in (select private.visible_client_ids()) then
    raise exception 'Só administrador e gestor ligam o WhatsApp de um cliente.' using errcode = '42501';
  end if;
  if not private.client_is_active(p_client) then raise exception 'Cliente desativado.' using errcode = '22023'; end if;
  select id into v_id from public.tracking_containers where client_id = p_client and kind = 'whatsapp' order by created_at limit 1;
  if v_id is null then
    insert into public.tracking_containers (client_id, name, kind, allowed_domains, status, test_mode)
    values (p_client, 'WhatsApp (sem site)', 'whatsapp', '{}', 'ativo', false)
    returning id into v_id;
    insert into public.audit_logs (actor_id, action, target_type, target_id, details)
    values ((select auth.uid()), 'tracking.whatsapp_sem_site', 'client', p_client::text, jsonb_build_object('container', v_id));
  end if;
  return v_id;
end;
$$;
revoke all on function private.wa_sem_site_container_impl(uuid) from public, anon, authenticated;
grant execute on function private.wa_sem_site_container_impl(uuid) to authenticated;
create function public.wa_sem_site_container(p_client uuid)
returns uuid language sql set search_path = '' as $$ select private.wa_sem_site_container_impl(p_client) $$;
revoke all on function public.wa_sem_site_container(uuid) from public, anon;
grant execute on function public.wa_sem_site_container(uuid) to authenticated;
