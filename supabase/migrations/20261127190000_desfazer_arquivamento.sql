-- 27/11/2026 (pendência da Etapa 54.1): "Desfazer" ao arquivar contato, rascunho de campanha e regra de monitoramento.
-- Nada é apagado: desarquivar só limpa a data de arquivamento. As regras de permissão são as mesmas de arquivar.
-- O histórico do contato ganha o tipo 'desarquivado' (o histórico antigo continua intacto).

alter table public.tracking_contact_history drop constraint tracking_contact_history_kind_check;
alter table public.tracking_contact_history add constraint tracking_contact_history_kind_check
  check (kind in ('criado', 'etapa', 'perfil', 'venda', 'arquivado', 'desarquivado'));

create function private.contact_unarchive_impl(p_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_client uuid;
begin
  select client_id into v_client from public.tracking_contacts where id = p_id;
  if v_client is null or not private.contacts_can_mark(v_client) or (select private.current_user_role()) = 'vendedor' then
    raise exception 'Só a equipe da agência desarquiva contatos.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.tracking_contacts where id = p_id and archived_at is not null) then
    raise exception 'Este contato não está arquivado.' using errcode = '22023';
  end if;
  update public.tracking_contacts set archived_at = null, last_change_at = now(), last_change_by = (select auth.uid()) where id = p_id;
  insert into public.tracking_contact_history (contact_id, client_id, by_user, kind) values (p_id, v_client, (select auth.uid()), 'desarquivado');
end;
$$;
revoke all on function private.contact_unarchive_impl(bigint) from public, anon;
grant execute on function private.contact_unarchive_impl(bigint) to authenticated;
create function public.contact_unarchive(p_id bigint)
returns void language sql set search_path = '' as $$ select private.contact_unarchive_impl(p_id) $$;
revoke all on function public.contact_unarchive(bigint) from public, anon;
grant execute on function public.contact_unarchive(bigint) to authenticated;

create function private.builder_draft_unarchive_impl(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare d public.builder_drafts;
begin
  if not private.builder_can('edit') then raise exception 'Você não tem permissão para desarquivar rascunhos.' using errcode = '42501'; end if;
  select * into d from public.builder_drafts where id = p_id and archived_at is not null for update;
  if d.id is null then raise exception 'Rascunho não encontrado ou já está ativo.' using errcode = '22023'; end if;
  if not private.can_edit_client(d.client_id) then raise exception 'Você não tem acesso a este cliente.' using errcode = '42501'; end if;
  update public.builder_drafts set archived_at = null, updated_by = (select auth.uid()), updated_at = now() where id = d.id;
  insert into public.audit_logs (actor_id, action, target_type, target_id, details)
  values ((select auth.uid()), 'builder.rascunho.desarquivar', 'builder_draft', d.id::text, jsonb_build_object('name', d.name));
end;
$$;
revoke all on function private.builder_draft_unarchive_impl(uuid) from public, anon;
grant execute on function private.builder_draft_unarchive_impl(uuid) to authenticated;
create function public.builder_draft_unarchive(p_id uuid)
returns void language sql set search_path = '' as $$ select private.builder_draft_unarchive_impl(p_id) $$;
revoke all on function public.builder_draft_unarchive(uuid) from public, anon;
grant execute on function public.builder_draft_unarchive(uuid) to authenticated;

create function private.monitor_rule_unarchive_impl(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v public.monitor_rules;
begin
  if not private.monitor_can('rules') then
    raise exception 'Sem permissão para gerenciar as regras do monitoramento' using errcode = '42501';
  end if;
  select * into v from public.monitor_rules r where r.id = p_id for update;
  if not found or (v.client_id is not null and not private.can_view_client(v.client_id)) then
    raise exception 'Regra não encontrada' using errcode = '22023';
  end if;
  if v.archived_at is null then
    raise exception 'Esta regra já está ativa. Atualize a página.' using errcode = '22023';
  end if;
  begin
    update public.monitor_rules set archived_at = null, archived_by = null where id = p_id;
  exception when unique_violation then
    raise exception 'Já existe outra regra igual no lugar desta. Não dá para desfazer.' using errcode = '22023';
  end;
end;
$$;
revoke all on function private.monitor_rule_unarchive_impl(uuid) from public, anon;
grant execute on function private.monitor_rule_unarchive_impl(uuid) to authenticated;
create function public.monitor_rule_unarchive(p_id uuid)
returns void language sql set search_path = '' as $$ select private.monitor_rule_unarchive_impl(p_id) $$;
revoke all on function public.monitor_rule_unarchive(uuid) from public, anon;
grant execute on function public.monitor_rule_unarchive(uuid) to authenticated;
