-- =============================================================================
-- REMOÇÃO da Central de Operações (Etapa 36: 36.1).
--
-- Apaga setores, equipe da Central e permissões da Central, e volta as regras
-- de clientes dos módulos de anúncios como eram antes (sem o papel "equipe").
-- NÃO mexe em clientes, usuários, métricas, campanhas nem anúncios.
-- Só rodar com decisão explícita, no SQL Editor. Depois: reverter o commit da
-- Etapa 36 no GitHub e publicar de novo a Edge Function "admin-users".
--
-- O papel "equipe" continua existindo no banco (o Postgres não remove valor de
-- tipo sem recriar a tabela de perfis): antes de rodar, troque o papel das
-- pessoas "Equipe" em Configurações → Usuários.
-- =============================================================================
begin;

do $$ begin
  if exists (select 1 from public.profiles where role = 'equipe') then
    raise exception 'Ainda há usuários com papel Equipe. Troque o papel deles antes de remover a Central.';
  end if;
end $$;

drop function if exists public.ops_team();
drop function if exists private.ops_team_impl();
drop function if exists public.ops_my_permissions();
drop function if exists private.ops_my_permissions_impl();
drop function if exists public.ops_member_save(uuid, uuid, uuid[], text, boolean, boolean, text[]);
drop function if exists private.ops_member_save_impl(uuid, uuid, uuid[], text, boolean, boolean, text[]);
drop function if exists public.ops_sector_set_status(uuid, text, uuid);
drop function if exists private.ops_sector_set_status_impl(uuid, text, uuid);
drop function if exists public.ops_sector_reorder(uuid[]);
drop function if exists private.ops_sector_reorder_impl(uuid[]);
drop function if exists public.ops_sector_save(uuid, text, text);
drop function if exists private.ops_sector_save_impl(uuid, text, text);
drop function if exists private.ops_require_admin();
drop table if exists public.ops_member_permissions;
drop table if exists public.ops_member_sectors;
drop table if exists public.ops_members;
drop table if exists public.ops_sectors;
drop function if exists private.ops_can(text);

-- Regras de clientes como na Etapa 19.2
create or replace function private.visible_client_ids()
returns setof uuid language sql stable security definer set search_path = '' as $$
  select c.id from public.clients c where private.current_user_role() = 'admin'
  union
  select a.client_id from public.user_client_access a
  where a.user_id = (select auth.uid()) and private.current_user_role() is not null
    and (private.current_user_role() <> 'cliente'
         or exists (select 1 from public.client_portal p where p.client_id = a.client_id and p.login_enabled))
$$;
create or replace function private.can_view_client(target uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select case
    when private.current_user_role() is null then false
    when private.current_user_role() = 'admin' then true
    else exists (
      select 1 from public.user_client_access a
      where a.user_id = (select auth.uid()) and a.client_id = target
        and (private.current_user_role() <> 'cliente'
             or exists (select 1 from public.client_portal p where p.client_id = target and p.login_enabled))
    )
  end
$$;

commit;
