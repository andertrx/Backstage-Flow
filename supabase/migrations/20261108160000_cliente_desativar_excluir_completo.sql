-- 08/11/2026 — Desativar, reativar e excluir cliente, completo.
-- Aplicada no banco em quatro partes (cliente_quem_pode_desativar_excluir, cliente_desativado_some_da_central,
-- cliente_excluir_abandona_tudo, cliente_is_live_permissao_execucao, cliente_pode_gerenciar_para_a_tela); este arquivo reúne o estado final.
--  * Quem pode: administrador, gestor (dos clientes que vê) e o Account Manager do cliente.
--  * Desativar: o cliente SOME da Central (cartão, tarefas, reuniões, leads), dos envios semanais, dos grupos e do Tracking
--    (a regra de "quem vê" confere se o cliente está vivo; nada é apagado; reativar traz tudo de volta).
--  * Excluir (só depois de desativar, digitando o nome): abandona tudo — contas desvinculadas, tarefas/leads arquivados,
--    reuniões agendadas canceladas, site pausado, destinos/webhooks/WhatsApp desligados, e-mail semanal e login do cliente desligados.
--    O histórico (métricas, vendas, auditoria) fica guardado, só marcado (excluded_at).
-- Volta atrás: supabase/rollback/voltar_cliente_desativar_excluir_2026_11_08.sql

create function private.client_can_manage(p_client uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_client is not null
     and private.current_user_role() is not null
     and private.current_user_role()::text not in ('cliente', 'vendedor')
     and (
       private.current_user_role()::text = 'admin'
       or (private.current_user_role()::text = 'gestor' and p_client in (select private.visible_client_ids()))
       or exists (select 1 from public.ops_client_ops o where o.client_id = p_client and o.am_user_id = (select auth.uid()))
     )
$$;
revoke all on function private.client_can_manage(uuid) from public, anon;
grant execute on function private.client_can_manage(uuid) to authenticated;

create or replace function private.clients_status_guard()
returns trigger language plpgsql security definer set search_path to '' as $function$
begin
  if new.status is distinct from old.status and 'encerrado' in (new.status::text, old.status::text)
     and (select auth.uid()) is not null and not private.client_can_manage(new.id) then
    raise exception 'Só o administrador, o gestor ou o Account Manager do cliente pode desativar ou reativar.' using errcode = '42501';
  end if;
  return new;
end;
$function$;

create function private.client_set_active_impl(p_client_id uuid, p_active boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.client_can_manage(p_client_id) then
    raise exception 'Só o administrador, o gestor ou o Account Manager do cliente pode desativar ou reativar.' using errcode = '42501';
  end if;
  update public.clients set status = case when p_active then 'ativo'::public.client_status else 'encerrado'::public.client_status end
   where id = p_client_id and excluded_at is null;
  if not found then raise exception 'Cliente não encontrado.' using errcode = 'P0002'; end if;
end;
$$;
revoke all on function private.client_set_active_impl(uuid, boolean) from public, anon;
grant execute on function private.client_set_active_impl(uuid, boolean) to authenticated;
create function public.client_set_active(p_client_id uuid, p_active boolean)
returns void language sql set search_path = '' as $$ select private.client_set_active_impl(p_client_id, p_active) $$;
revoke all on function public.client_set_active(uuid, boolean) from public, anon;
grant execute on function public.client_set_active(uuid, boolean) to authenticated;
create function public.client_can_manage(p_client_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$ select private.client_can_manage(p_client_id) $$;
revoke all on function public.client_can_manage(uuid) from public, anon;
grant execute on function public.client_can_manage(uuid) to authenticated;

-- Some da Central, dos envios, dos grupos e do Tracking
create function private.client_is_live(p_client uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_client is null or exists (select 1 from public.clients c where c.id = p_client and c.status <> 'encerrado' and c.excluded_at is null)
$$;
revoke all on function private.client_is_live(uuid) from public, anon;
grant execute on function private.client_is_live(uuid) to authenticated;

create or replace function private.ops_client_visible(p_client uuid)
returns boolean language sql stable security definer set search_path to '' as $$
  select p_client is not null and private.client_is_live(p_client) and (private.ops_can('ops.clients.view') or private.ops_is_am(p_client))
$$;
create or replace function private.ops_meeting_visible(p_meeting uuid)
returns boolean language sql stable security definer set search_path to '' as $$
  select private.ops_can('ops.access') and exists (
    select 1 from public.ops_meetings m
     where m.id = p_meeting
       and (m.client_id is null or private.client_is_live(m.client_id))
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
    when private.is_admin() then exists (select 1 from public.ops_tasks where id = p_task and deleted_at is null
                                         and (client_id is null or private.client_is_live(client_id)))
    when not private.ops_can('ops.access') then false
    else exists (
      select 1 from public.ops_tasks t
       where t.id = p_task and t.deleted_at is null
         and (t.client_id is null or private.client_is_live(t.client_id))
         and (t.created_by = (select auth.uid())
              or t.visibility = 'equipe'
              or exists (select 1 from public.ops_task_people p where p.task_id = t.id and p.user_id = (select auth.uid()))
              or (t.visibility = 'setor' and exists (select 1 from public.ops_member_sectors s
                                                     where s.user_id = (select auth.uid()) and s.sector_id = t.sector_id))
              or (t.visibility <> 'participantes' and t.client_id is not null
                  and exists (select 1 from public.ops_client_ops o where o.client_id = t.client_id and o.am_user_id = (select auth.uid())))))
  end
$$;
alter policy "Comercial vê os leads" on public.ops_leads
  using ((select private.ops_can('ops.commercial')) and (client_id is null or private.client_is_live(client_id)));
alter policy "Envios semanais: quem tem a permissão vê os grupos" on public.ops_envio_clientes
  using ((select private.ops_can('ops.envios')) and private.client_is_live(cliente_id));
alter policy "Envios semanais: quem tem a permissão vê os grupos ligados" on public.wa_grupos
  using ((select private.ops_can('ops.envios')) and private.client_is_live(cliente_id));
alter policy "Equipe vê containers dos clientes liberados" on public.tracking_containers
  using ((client_id in (select private.visible_client_ids())) and ((select private.current_user_role()) <> 'cliente'::user_role) and private.client_is_live(client_id));

-- Excluir: abandona tudo
create or replace function private.client_exclude_impl(p_client_id uuid, p_name text)
returns void language plpgsql security definer set search_path to '' as $function$
declare
  v public.clients;
  n_contas integer; n_tarefas integer; n_leads integer; n_reunioes integer;
begin
  if not private.client_can_manage(p_client_id) then
    raise exception 'Só o administrador, o gestor ou o Account Manager do cliente pode excluir.' using errcode = '42501';
  end if;
  select * into v from public.clients where id = p_client_id and excluded_at is null for update;
  if not found then raise exception 'Cliente não encontrado.' using errcode = 'P0002'; end if;
  if v.status <> 'encerrado' then raise exception 'Desative o cliente antes de excluir.' using errcode = '22023'; end if;
  if lower(btrim(coalesce(p_name, ''))) <> lower(btrim(v.name)) then
    raise exception 'O nome digitado não confere com o nome do cliente.' using errcode = '22023';
  end if;
  update public.clients set excluded_at = now(), excluded_by = (select auth.uid()) where id = v.id;
  update public.ad_accounts set unlinked_at = now() where client_id = v.id and unlinked_at is null;
  get diagnostics n_contas = row_count;
  update public.ops_tasks set archived_at = now() where client_id = v.id and archived_at is null;
  get diagnostics n_tarefas = row_count;
  update public.ops_leads set archived_at = now() where client_id = v.id and archived_at is null;
  get diagnostics n_leads = row_count;
  update public.ops_meetings set status = 'cancelada' where client_id = v.id and status = 'agendada';
  get diagnostics n_reunioes = row_count;
  update public.ops_envio_clientes set ativo = false, removido_em = coalesce(removido_em, now()) where cliente_id = v.id;
  update public.tracking_containers set status = 'pausado' where client_id = v.id;
  update public.tracking_destinations set enabled = false where client_id = v.id;
  update public.tracking_sales_webhooks set enabled = false, archived_at = coalesce(archived_at, now()) where client_id = v.id;
  update public.tracking_whatsapp_connections set enabled = false where client_id = v.id;
  update public.client_report_email set enabled = false where client_id = v.id;
  update public.client_portal set login_enabled = false, link_enabled = false where client_id = v.id;
  insert into public.audit_logs (actor_id, action, target_type, target_id, details)
  values ((select auth.uid()), 'client.exclude', 'client', v.id::text,
          jsonb_build_object('cliente', v.name, 'observacao', 'some das telas e abandona tudo; dados guardados (excluded_at)',
                             'contas_desvinculadas', n_contas, 'tarefas_arquivadas', n_tarefas, 'leads_arquivados', n_leads, 'reunioes_canceladas', n_reunioes));
end;
$function$;
