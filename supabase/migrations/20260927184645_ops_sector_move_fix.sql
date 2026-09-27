-- Etapa 36.1 (correção): ao desativar um setor, quem o tinha como PRINCIPAL e já
-- tinha o destino como secundário passa a ter o destino como principal, sem
-- violar "um setor principal por pessoa" (tira as linhas antigas antes).
create or replace function private.ops_sector_set_status_impl(p_id uuid, p_status text, p_move_to uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_before text;
  v_people integer;
  v_users uuid[];
  v_primary boolean[];
begin
  perform private.ops_require_admin();
  select status into v_before from public.ops_sectors where id = p_id;
  if v_before is null then raise exception 'Setor não encontrado.' using errcode = '22023'; end if;
  if p_status not in ('ativo', 'inativo', 'arquivado') then raise exception 'Situação inválida.' using errcode = '22023'; end if;
  select count(*), array_agg(user_id), array_agg(is_primary) into v_people, v_users, v_primary
    from public.ops_member_sectors where sector_id = p_id;
  if p_status <> 'ativo' and v_people > 0 then
    if p_move_to is null then
      raise exception 'Este setor tem % pessoa(s). Escolha para qual setor elas vão antes de desativar.', v_people using errcode = '22023';
    end if;
    if p_move_to = p_id or not exists (select 1 from public.ops_sectors where id = p_move_to and status = 'ativo') then
      raise exception 'Escolha um setor de destino ativo e diferente deste.' using errcode = '22023';
    end if;
    delete from public.ops_member_sectors where sector_id = p_id;
    insert into public.ops_member_sectors as d (user_id, sector_id, is_primary)
    select u, p_move_to, pr from unnest(v_users, v_primary) as t(u, pr)
    on conflict (user_id, sector_id) do update set is_primary = d.is_primary or excluded.is_primary;
  end if;
  update public.ops_sectors set status = p_status, updated_by = (select auth.uid()) where id = p_id;
  insert into public.audit_logs (actor_id, action, target_type, target_id, details)
  values ((select auth.uid()), 'ops.sector.status', 'ops_sector', p_id::text,
          jsonb_build_object('antes', v_before, 'depois', p_status, 'pessoas_movidas', case when p_status <> 'ativo' then v_people else 0 end,
                             'destino', p_move_to));
end;
$$;
