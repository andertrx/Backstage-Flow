-- T5.35 (etapa 2): excluir um site só — e desfazer.
--
-- O que "excluir" quer dizer aqui (e o que NÃO quer):
--   - o site sai da lista e dos totais do Tracking;
--   - o script do site passa a ser recusado (a Edge Function `track` só aceita container "ativo");
--   - o WhatsApp ligado ao cliente continua funcionando (o número é do cliente, não do site);
--   - NADA é apagado: eventos, origens, leads e conversas continuam guardados;
--   - dá para restaurar o site a qualquer momento.
-- É o mesmo desenho do cliente excluído (clients.excluded_at + client_exclude), aplicado ao site.

alter table public.tracking_containers add column excluded_at timestamptz;
alter table public.tracking_containers add column excluded_by uuid references auth.users (id) on delete set null;
comment on column public.tracking_containers.excluded_at is
  'T5.35: site excluído — some das listas e dos totais e o script para de enviar eventos. O histórico fica guardado e dá para restaurar.';

-- -----------------------------------------------------------------------------
-- Excluir
-- -----------------------------------------------------------------------------
create function private.tracking_container_exclude_impl(p_container uuid, p_confirmar text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  k public.tracking_containers;
begin
  if (select private.current_user_role()) not in ('admin', 'gestor') then
    raise exception 'Só administrador e gestor excluem um site.' using errcode = '42501';
  end if;
  if p_container is null then raise exception 'Site não encontrado.' using errcode = 'P0002'; end if;

  select * into k from public.tracking_containers where id = p_container for update;
  if k.id is null then raise exception 'Site não encontrado.' using errcode = 'P0002'; end if;
  if k.excluded_at is not null then raise exception 'Este site já está excluído.' using errcode = '22023'; end if;
  if k.kind = 'whatsapp' then
    raise exception 'Este é o WhatsApp do cliente, não um site. Ele não é excluído por aqui.' using errcode = '22023';
  end if;
  -- Confirmação com o nome do site: protege contra exclusão por engano.
  if lower(btrim(coalesce(p_confirmar, ''))) <> lower(btrim(k.name)) then
    raise exception 'O nome digitado não confere com o nome do site.' using errcode = '22023';
  end if;

  update public.tracking_containers
     set excluded_at = now(), excluded_by = (select auth.uid()), status = 'pausado'
   where id = k.id;

  insert into public.audit_logs (actor_id, action, target_type, target_id, details)
  values ((select auth.uid()), 'tracking.container_exclude', 'tracking_container', k.id::text,
          jsonb_build_object('name', k.name, 'client_id', k.client_id));
end;
$$;
revoke all on function private.tracking_container_exclude_impl(uuid, text) from public, anon, authenticated;
grant execute on function private.tracking_container_exclude_impl(uuid, text) to authenticated;

create function public.tracking_container_exclude(p_container uuid, p_confirmar text)
returns void language sql set search_path = '' as $$ select private.tracking_container_exclude_impl(p_container, p_confirmar) $$;
revoke all on function public.tracking_container_exclude(uuid, text) from public, anon;
grant execute on function public.tracking_container_exclude(uuid, text) to authenticated;

-- -----------------------------------------------------------------------------
-- Restaurar
-- -----------------------------------------------------------------------------
create function private.tracking_container_restore_impl(p_container uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  k public.tracking_containers;
begin
  if (select private.current_user_role()) not in ('admin', 'gestor') then
    raise exception 'Só administrador e gestor restauram um site.' using errcode = '42501';
  end if;
  if p_container is null then raise exception 'Site não encontrado.' using errcode = 'P0002'; end if;

  select * into k from public.tracking_containers where id = p_container for update;
  if k.id is null then raise exception 'Site não encontrado.' using errcode = 'P0002'; end if;
  if k.excluded_at is null then raise exception 'Este site não está excluído.' using errcode = '22023'; end if;

  update public.tracking_containers
     set excluded_at = null, excluded_by = null, status = 'ativo'
   where id = k.id;

  insert into public.audit_logs (actor_id, action, target_type, target_id, details)
  values ((select auth.uid()), 'tracking.container_restore', 'tracking_container', k.id::text,
          jsonb_build_object('name', k.name, 'client_id', k.client_id));
end;
$$;
revoke all on function private.tracking_container_restore_impl(uuid) from public, anon, authenticated;
grant execute on function private.tracking_container_restore_impl(uuid) to authenticated;

create function public.tracking_container_restore(p_container uuid)
returns void language sql set search_path = '' as $$ select private.tracking_container_restore_impl(p_container) $$;
revoke all on function public.tracking_container_restore(uuid) from public, anon;
grant execute on function public.tracking_container_restore(uuid) to authenticated;

comment on function public.tracking_container_exclude(uuid, text) is
  'T5.35: exclui um site (some da lista, o script para, o histórico fica). Exige digitar o nome do site.';
comment on function public.tracking_container_restore(uuid) is
  'T5.35: devolve um site excluído para a lista e reativa o script.';
