-- T5.25: botão "Reenviar" no cartão do envio: abre a aprovação direto (sem trocar o horário), aprova a semana e já enfileira
-- os clientes escolhidos (quem já recebeu só entra se for escolhido de propósito). Sem tabela nova.
create function private.ops_envio_reenvio_impl(p_id uuid, p_versao integer, p_clientes uuid[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_e public.ops_envios; v_uid uuid := (select auth.uid()); v_sem date := (private.envio_hoje() ->> 'semana')::date;
  c record; d record; v_n integer := 0; v_sem_grupo integer := 0; v_rows integer;
begin
  perform private.ops_need('ops.envios');
  select * into v_e from public.ops_envios where id = p_id for update;
  if v_e.id is null or v_e.arquivado_em is not null or not v_e.ativo then raise exception 'Envio não encontrado, pausado ou arquivado.' using errcode = '22023'; end if;
  if v_e.versao <> coalesce(p_versao, -1) then
    raise exception 'O envio foi alterado depois que você abriu. Confira de novo antes de aprovar.' using errcode = '40001';
  end if;
  if not exists (select 1 from public.wa_envio_config k where k.envio_id = p_id and k.automatico) then
    raise exception 'Este envio não é automático.' using errcode = '22023';
  end if;
  if not coalesce((select s.enabled and s.connection_state = 'conectado' from public.wa_gateway_settings s where s.id), false) then
    raise exception 'O WhatsApp não está conectado.' using errcode = '22023';
  end if;
  if p_clientes is null or cardinality(p_clientes) = 0 then raise exception 'Escolha pelo menos um cliente.' using errcode = '22023'; end if;
  if exists (select 1 from unnest(p_clientes) x where not exists (
       select 1 from public.ops_envio_clientes oc where oc.envio_id = p_id and oc.cliente_id = x and oc.ativo and oc.removido_em is null)) then
    raise exception 'Cliente que não faz parte deste envio.' using errcode = '22023';
  end if;

  -- aprova a semana (na versão que a pessoa viu)
  insert into public.ops_envio_aprovacoes (envio_id, semana, decisao, versao_envio, decidido_por, origem)
  values (p_id, v_sem, 'aprovado', v_e.versao, v_uid, 'manual')
  on conflict (envio_id, semana) do update
     set decisao = 'aprovado', versao_envio = excluded.versao_envio, decidido_por = excluded.decidido_por, decidido_em = now(), origem = 'manual';

  for c in select oc.cliente_id, g.grupo_id
             from public.ops_envio_clientes oc
             join public.clients cl on cl.id = oc.cliente_id and cl.excluded_at is null and private.client_is_active(cl.id)
             left join public.wa_grupos g on g.cliente_id = oc.cliente_id and g.desvinculado_em is null
            where oc.envio_id = p_id and oc.ativo and oc.removido_em is null loop
    -- quem foi escolhido recebe; quem não foi fica de fora desta semana (a fila automática também respeita)
    insert into public.ops_envio_semana_clientes (envio_id, cliente_id, semana, receber, escolhido_por)
    values (p_id, c.cliente_id, v_sem, c.cliente_id = any (p_clientes), v_uid)
    on conflict (envio_id, cliente_id, semana) do update set receber = excluded.receber, escolhido_por = excluded.escolhido_por, escolhido_em = now();
    if c.cliente_id = any (p_clientes) then
      if c.grupo_id is null then v_sem_grupo := v_sem_grupo + 1; continue; end if;
      if exists (select 1 from public.wa_disparos x where x.envio_id = p_id and x.cliente_id = c.cliente_id and x.status in ('pendente', 'enviando')) then continue; end if;
      insert into public.wa_disparos (envio_id, cliente_id, grupo_id, semana, origem, versao_envio, criado_por)
      values (p_id, c.cliente_id, c.grupo_id, v_sem, 'manual', v_e.versao, v_uid) on conflict do nothing;
      get diagnostics v_rows = row_count;
      v_n := v_n + v_rows;
    else
      for d in select id from public.wa_disparos where envio_id = p_id and cliente_id = c.cliente_id and semana = v_sem and status = 'pendente' loop
        perform private.wa_disparo_fechar(d.id, 'pulado', 'Desmarcado para esta semana.');
      end loop;
    end if;
  end loop;

  insert into public.audit_logs (actor_id, action, target_type, target_id, details)
  values (v_uid, 'ops.envio.reenviar_agora', 'ops_envio', p_id::text,
          jsonb_build_object('nome', v_e.nome, 'semana', v_sem, 'versao', v_e.versao, 'escolhidos', cardinality(p_clientes), 'na_fila', v_n, 'sem_grupo', v_sem_grupo));
  return jsonb_build_object('na_fila', v_n, 'sem_grupo', v_sem_grupo);
end;
$$;
revoke all on function private.ops_envio_reenvio_impl(uuid, integer, uuid[]) from public, anon, authenticated;
grant execute on function private.ops_envio_reenvio_impl(uuid, integer, uuid[]) to authenticated;
create function public.ops_envio_reenviar_agora(p_id uuid, p_versao integer, p_clientes uuid[])
returns jsonb language sql set search_path = '' as $$ select private.ops_envio_reenvio_impl(p_id, p_versao, p_clientes) $$;
revoke all on function public.ops_envio_reenviar_agora(uuid, integer, uuid[]) from public, anon;
grant execute on function public.ops_envio_reenviar_agora(uuid, integer, uuid[]) to authenticated;
