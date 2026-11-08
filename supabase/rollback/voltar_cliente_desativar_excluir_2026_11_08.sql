-- Volta ao comportamento de antes (08/11/2026): desativar/reativar/excluir só pelo administrador e sem esconder a Central.
-- Rode tudo de uma vez. Dados escondidos reaparecem; o que a exclusão já arquivou/desligou NÃO volta sozinho.

-- 1) Quem pode
create or replace function private.clients_status_guard()
returns trigger language plpgsql security definer set search_path to '' as $$
begin
  if new.status is distinct from old.status and 'encerrado' in (new.status::text, old.status::text)
     and (select auth.uid()) is not null and private.current_user_role() is distinct from 'admin' then
    raise exception 'Só o administrador pode desativar ou reativar um cliente.' using errcode = '42501';
  end if;
  return new;
end; $$;

create or replace function private.client_exclude_impl(p_client_id uuid, p_name text)
returns void language plpgsql security definer set search_path to '' as $$
declare v public.clients;
begin
  if private.current_user_role() is distinct from 'admin' then
    raise exception 'Só o administrador pode excluir um cliente.' using errcode = '42501';
  end if;
  select * into v from public.clients where id = p_client_id and excluded_at is null for update;
  if not found then raise exception 'Cliente não encontrado.' using errcode = 'P0002'; end if;
  if v.status <> 'encerrado' then raise exception 'Desative o cliente antes de excluir.' using errcode = '22023'; end if;
  if lower(btrim(coalesce(p_name, ''))) <> lower(btrim(v.name)) then
    raise exception 'O nome digitado não confere com o nome do cliente.' using errcode = '22023';
  end if;
  update public.clients set excluded_at = now(), excluded_by = (select auth.uid()) where id = v.id;
  insert into public.audit_logs (actor_id, action, target_type, target_id, details)
  values ((select auth.uid()), 'client.exclude', 'client', v.id::text, jsonb_build_object('cliente', v.name, 'observacao', 'some das telas; dados guardados (excluded_at)'));
end; $$;
drop function if exists public.client_set_active(uuid, boolean);
drop function if exists private.client_set_active_impl(uuid, boolean);

-- 2) Central e Tracking voltam a mostrar clientes desativados
create or replace function private.ops_client_visible(p_client uuid)
returns boolean language sql stable security definer set search_path to '' as $$
  select p_client is not null and (private.ops_can('ops.clients.view') or private.ops_is_am(p_client))
$$;
create or replace function private.ops_meeting_visible(p_meeting uuid)
returns boolean language sql stable security definer set search_path to '' as $$
  select private.ops_can('ops.access') and exists (
    select 1 from public.ops_meetings m
     where m.id = p_meeting
       and (private.ops_can('ops.meetings.manage')
            or m.organizer_id = (select auth.uid())
            or exists (select 1 from public.ops_meeting_people p where p.meeting_id = m.id and p.user_id = (select auth.uid()))
            or (m.sector_id is not null and exists (select 1 from public.ops_member_sectors s
                                                     where s.user_id = (select auth.uid()) and s.sector_id = m.sector_id))
            or (m.client_id is not null and private.ops_client_visible(m.client_id))))
$$;
create or replace function private.ops_task_visible(p_task uuid)
returns boolean language sql stable security definer set search_path to '' as $$
  select case
    when private.is_admin() then exists (select 1 from public.ops_tasks where id = p_task and deleted_at is null)
    when not private.ops_can('ops.access') then false
    else exists (
      select 1 from public.ops_tasks t
       where t.id = p_task and t.deleted_at is null
         and (t.created_by = (select auth.uid())
              or t.visibility = 'equipe'
              or exists (select 1 from public.ops_task_people p where p.task_id = t.id and p.user_id = (select auth.uid()))
              or (t.visibility = 'setor' and exists (select 1 from public.ops_member_sectors s
                                                     where s.user_id = (select auth.uid()) and s.sector_id = t.sector_id))
              or (t.visibility <> 'participantes' and t.client_id is not null
                  and exists (select 1 from public.ops_client_ops o where o.client_id = t.client_id and o.am_user_id = (select auth.uid())))))
  end
$$;
alter policy "Comercial vê os leads" on public.ops_leads using ((select private.ops_can('ops.commercial')));
alter policy "Envios semanais: quem tem a permissão vê os grupos" on public.ops_envio_clientes using ((select private.ops_can('ops.envios')));
alter policy "Envios semanais: quem tem a permissão vê os grupos ligados" on public.wa_grupos using ((select private.ops_can('ops.envios')));
alter policy "Equipe vê containers dos clientes liberados" on public.tracking_containers
  using ((client_id in (select private.visible_client_ids())) and ((select private.current_user_role()) <> 'cliente'::user_role));
drop function if exists private.client_is_live(uuid);
drop function if exists private.client_can_manage(uuid);
