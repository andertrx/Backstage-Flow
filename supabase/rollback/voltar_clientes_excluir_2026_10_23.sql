-- Ponto de volta (23/10/2026): desfaz a migração clientes_excluir.
-- Volta can_view_client e visible_client_ids ao que eram antes, tira a função de excluir e
-- devolve os clientes excluídos (limpa excluded_at). Não apaga dados.
-- ATENÇÃO: depois disto, as regras de acesso voltam a NÃO bloquear o login de cliente desativado
-- (era o defeito corrigido por esta migração).
begin;
update public.clients set excluded_at = null, excluded_by = null where excluded_at is not null;
create or replace function private.can_view_client(target uuid)
returns boolean language sql stable security definer set search_path to '' as $$
  select case
    when private.current_user_role() is null then false
    when private.current_user_role() = 'admin' then true
    when private.current_user_role() = 'equipe' then false
    else exists (
      select 1 from public.user_client_access a
      where a.user_id = (select auth.uid()) and a.client_id = target
        and (private.current_user_role() <> 'cliente'
             or exists (select 1 from public.client_portal p where p.client_id = target and p.login_enabled))
    )
  end
$$;
create or replace function private.visible_client_ids()
returns setof uuid language sql stable security definer set search_path to '' as $$
  select c.id from public.clients c where private.current_user_role() = 'admin'
  union
  select a.client_id from public.user_client_access a
  where a.user_id = (select auth.uid()) and private.current_user_role() is not null
    and private.current_user_role() <> 'equipe'
    and (private.current_user_role() <> 'cliente'
         or exists (select 1 from public.client_portal p where p.client_id = a.client_id and p.login_enabled))
$$;
drop function if exists public.client_exclude(uuid, text);
drop function if exists private.client_exclude_impl(uuid, text);
commit;
