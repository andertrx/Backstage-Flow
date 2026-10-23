-- Excluir cliente + correção do acesso do cliente desativado (23/10/2026).
--
-- 1) Correção: na migração clientes_desativar, renomear private.can_view_client fez as regras de acesso (RLS)
--    continuarem apontando para a versão antiga (o Postgres guarda a função pelo número interno, não pelo nome).
--    Aqui a função original volta ao nome can_view_client e recebe a regra nova; as regras de acesso passam a valer.
-- 2) Excluir cliente (pedido do Ander, opção "a"): só admin, só cliente já desativado, digitando o nome.
--    O cliente some de todas as telas (lista, contas, buscas, totais), mas os dados ficam guardados (excluded_at).
--    Recuperar: limpar excluded_at no banco (pedir ao Claude).

alter table public.clients add column excluded_at timestamptz, add column excluded_by uuid references auth.users(id);
comment on column public.clients.excluded_at is 'Excluído pelo admin: some de todas as telas; os dados ficam guardados. Recuperar = deixar vazio.';

-- ---------------------------------------------------------------- 1) Regra de quem vê o cliente
alter function private.can_view_client(uuid) rename to can_view_client_v2_sem_uso;
revoke all on function private.can_view_client_v2_sem_uso(uuid) from public, anon, authenticated;
alter function private.can_view_client_antes_2026_10_23(uuid) rename to can_view_client;

create or replace function private.can_view_client(target uuid)
returns boolean
language sql
stable security definer
set search_path to ''
as $$
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

create or replace function private.visible_client_ids()
returns setof uuid
language sql
stable security definer
set search_path to ''
as $$
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

-- ---------------------------------------------------------------- 2) Excluir cliente
create function private.client_exclude_impl(p_client_id uuid, p_name text)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v public.clients;
begin
  if private.current_user_role() is distinct from 'admin' then
    raise exception 'Só o administrador pode excluir um cliente.' using errcode = '42501';
  end if;
  select * into v from public.clients where id = p_client_id and excluded_at is null for update;
  if not found then raise exception 'Cliente não encontrado.' using errcode = 'P0002'; end if;
  if v.status <> 'encerrado' then
    raise exception 'Desative o cliente antes de excluir.' using errcode = '22023';
  end if;
  if lower(btrim(coalesce(p_name, ''))) <> lower(btrim(v.name)) then
    raise exception 'O nome digitado não confere com o nome do cliente.' using errcode = '22023';
  end if;
  update public.clients set excluded_at = now(), excluded_by = (select auth.uid()) where id = v.id;
  insert into public.audit_logs (actor_id, action, target_type, target_id, details)
  values ((select auth.uid()), 'client.exclude', 'client', v.id::text,
          jsonb_build_object('cliente', v.name, 'observacao', 'some das telas; dados guardados (excluded_at)'));
end;
$$;
revoke all on function private.client_exclude_impl(uuid, text) from public, anon, authenticated;
grant execute on function private.client_exclude_impl(uuid, text) to authenticated;

create function public.client_exclude(p_client_id uuid, p_name text)
returns void
language sql
set search_path to ''
as $$ select private.client_exclude_impl(p_client_id, p_name) $$;
revoke all on function public.client_exclude(uuid, text) from public, anon;
grant execute on function public.client_exclude(uuid, text) to authenticated;
