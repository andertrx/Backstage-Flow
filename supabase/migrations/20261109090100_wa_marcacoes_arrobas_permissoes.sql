-- T5.20 (correção): a função interna precisa ser liberada ao usuário logado (padrão do projeto) e o registro de auditoria usa target_type 'client'.
grant execute on function private.wa_marcacao_salvar_impl(uuid, text, text) to authenticated;
grant execute on function private.wa_marcacao_remover_impl(uuid, text) to authenticated;

create or replace function private.wa_marcacao_salvar_impl(p_cliente uuid, p_nome text, p_numero text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_dig text := regexp_replace(coalesce(p_numero, ''), '\D', '', 'g');
  v_nome text := btrim(coalesce(p_nome, ''));
begin
  if not exists (select 1 from public.profiles p where p.id = v_uid and p.role = 'admin' and p.active) then
    raise exception 'Só o administrador liga pessoas aos números do WhatsApp.' using errcode = '42501';
  end if;
  if length(v_dig) in (10, 11) then v_dig := '55' || v_dig; end if;
  if v_dig !~ '^[0-9]{12,15}$' then raise exception 'Número inválido.' using errcode = '22023'; end if;
  if v_nome = '' then raise exception 'Informe quem marcar.' using errcode = '22023'; end if;
  if not exists (select 1 from public.ops_envio_padroes p where p.cliente_id = p_cliente and v_nome = any (p.contatos_marcar)) then
    raise exception 'Essa pessoa não está na lista de marcações do cliente.' using errcode = '22023';
  end if;
  insert into public.wa_marcacoes (cliente_id, nome, numero, created_by) values (p_cliente, v_nome, v_dig, v_uid)
  on conflict (cliente_id, nome) do update set numero = excluded.numero, updated_at = now();
  insert into public.audit_logs (actor_id, action, target_type, target_id, details)
  values (v_uid, 'wa_marcacao.salvar', 'client', p_cliente::text, jsonb_build_object('pessoa', v_nome));
end;
$$;

create or replace function private.wa_marcacao_remover_impl(p_cliente uuid, p_nome text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if not exists (select 1 from public.profiles p where p.id = v_uid and p.role = 'admin' and p.active) then
    raise exception 'Só o administrador desliga pessoas dos números do WhatsApp.' using errcode = '42501';
  end if;
  delete from public.wa_marcacoes where cliente_id = p_cliente and nome = btrim(coalesce(p_nome, ''));
  insert into public.audit_logs (actor_id, action, target_type, target_id, details)
  values (v_uid, 'wa_marcacao.remover', 'client', p_cliente::text, jsonb_build_object('pessoa', btrim(coalesce(p_nome, ''))));
end;
$$;
