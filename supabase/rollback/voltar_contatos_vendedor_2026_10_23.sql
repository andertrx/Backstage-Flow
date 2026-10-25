-- Volta da fase "Tracking T3.1 — contatos e papel vendedor" (23/10/2026).
-- Desliga os contatos e o papel vendedor. NADA é apagado: as tabelas de contatos, perfis,
-- etapas e histórico ficam guardadas (só deixam de ser usadas). O valor 'vendedor' do tipo
-- user_role continua existindo (o Postgres não remove valor de enum); troque o papel desses
-- usuários antes, em Configurações → Usuários.

-- 1) Funções de acesso como eram antes (só o papel "equipe" travado)
create or replace function private.visible_client_ids()
returns setof uuid language sql stable security definer set search_path = '' as $$
  select c.id from public.clients c where private.current_user_role() = 'admin' and c.excluded_at is null
  union
  select a.client_id from public.user_client_access a
  join public.clients c on c.id = a.client_id and c.excluded_at is null
  where a.user_id = (select auth.uid()) and private.current_user_role() is not null
    and private.current_user_role() <> 'equipe'
    and (private.current_user_role() <> 'cliente'
         or (c.status <> 'encerrado'
             and exists (select 1 from public.client_portal p where p.client_id = a.client_id and p.login_enabled)))
$$;

create or replace function private.can_view_client(target uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select case
    when exists (select 1 from public.clients c where c.id = target and c.excluded_at is not null) then false
    when private.current_user_role() is null then false
    when private.current_user_role() = 'admin' then true
    when private.current_user_role() = 'equipe' then false
    else exists (
      select 1 from public.user_client_access a
      where a.user_id = (select auth.uid()) and a.client_id = target
        and (private.current_user_role() <> 'cliente'
             or (exists (select 1 from public.client_portal p where p.client_id = target and p.login_enabled)
                 and private.client_is_active(target)))
    )
  end
$$;
-- (ops_member_ok / ops_user_can podem ficar como estão: só acrescentaram o vendedor na trava.)

-- 2) Para de criar contatos e de marcar
drop trigger if exists tracking_leads_contacts on public.tracking_leads;
drop trigger if exists clients_contacts_seed on public.clients;
revoke execute on function public.contacts_clients() from authenticated;
revoke execute on function public.contacts_list(uuid, text, text, uuid, integer) from authenticated;
revoke execute on function public.contact_create(uuid, text, text, text, uuid) from authenticated;
revoke execute on function public.contact_update(bigint, uuid, uuid, numeric, text, text) from authenticated;
revoke execute on function public.contact_archive(bigint) from authenticated;
revoke insert, update on public.tracking_contact_profiles, public.tracking_contact_stages from authenticated;
