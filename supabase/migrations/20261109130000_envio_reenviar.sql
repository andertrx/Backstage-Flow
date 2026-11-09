-- T5.22 Fase 3: reenviar um envio já aprovado na semana — só para quem não recebeu (padrão) ou para todos (com confirmação na tela).
-- Entra na mesma fila do envio automático (um por vez, 45 s entre mensagens, 60 por dia). Exige a aprovação da semana válida.
create function private.wa_envio_reenviar_impl(p_envio uuid, p_modo text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_e public.ops_envios; v_hoje jsonb := private.envio_hoje(); v_sem date := (v_hoje ->> 'semana')::date;
  v_uid uuid := (select auth.uid()); c record; v_n integer := 0; v_sem_grupo integer := 0; v_rows integer;
begin
  perform private.ops_need('ops.envios');
  if p_modo not in ('faltantes', 'todos') then raise exception 'Modo de reenvio inválido.' using errcode = '22023'; end if;
  select * into v_e from public.ops_envios where id = p_envio;
  if v_e.id is null or v_e.arquivado_em is not null or not v_e.ativo then raise exception 'Envio não encontrado, pausado ou arquivado.' using errcode = '22023'; end if;
  if not exists (select 1 from public.wa_envio_config k where k.envio_id = p_envio and k.automatico) then
    raise exception 'Este envio não é automático.' using errcode = '22023';
  end if;
  if private.envio_situacao(p_envio) ->> 'situacao_hoje' <> 'aprovado' then
    raise exception 'Aprove o envio desta semana antes de reenviar.' using errcode = '22023';
  end if;
  if not coalesce((select s.enabled and s.connection_state = 'conectado' from public.wa_gateway_settings s where s.id), false) then
    raise exception 'O WhatsApp não está conectado.' using errcode = '22023';
  end if;
  for c in select oc.cliente_id, g.grupo_id
             from public.ops_envio_clientes oc
             join public.clients cl on cl.id = oc.cliente_id and cl.excluded_at is null and private.client_is_active(cl.id)
             left join public.wa_grupos g on g.cliente_id = oc.cliente_id and g.desvinculado_em is null
            where oc.envio_id = p_envio and oc.ativo and oc.removido_em is null
              and not exists (select 1 from public.ops_envio_semana_clientes s where s.envio_id = p_envio and s.cliente_id = oc.cliente_id and s.semana = v_sem and not s.receber)
              and not exists (select 1 from public.wa_disparos d where d.envio_id = p_envio and d.cliente_id = oc.cliente_id and d.status in ('pendente', 'enviando'))
              and (p_modo = 'todos' or not exists (select 1 from public.ops_envio_execucoes x where x.envio_id = p_envio and x.cliente_id = oc.cliente_id
                                                      and x.status = 'enviado' and x.executado_em >= (v_hoje ->> 'inicio_semana')::timestamptz)) loop
    if c.grupo_id is null then v_sem_grupo := v_sem_grupo + 1; continue; end if;
    insert into public.wa_disparos (envio_id, cliente_id, grupo_id, semana, origem, versao_envio, criado_por)
    values (p_envio, c.cliente_id, c.grupo_id, v_sem, 'manual', v_e.versao, v_uid) on conflict do nothing;
    get diagnostics v_rows = row_count;
    v_n := v_n + v_rows;
  end loop;
  insert into public.audit_logs (actor_id, action, target_type, target_id, details)
  values (v_uid, 'ops.envio.reenviar', 'ops_envio', p_envio::text, jsonb_build_object('modo', p_modo, 'semana', v_sem, 'na_fila', v_n, 'sem_grupo', v_sem_grupo));
  return jsonb_build_object('na_fila', v_n, 'sem_grupo', v_sem_grupo);
end;
$$;
revoke all on function private.wa_envio_reenviar_impl(uuid, text) from public, anon, authenticated;
grant execute on function private.wa_envio_reenviar_impl(uuid, text) to authenticated;
create function public.wa_envio_reenviar(p_envio uuid, p_modo text)
returns jsonb language sql set search_path = '' as $$ select private.wa_envio_reenviar_impl(p_envio, p_modo) $$;
revoke all on function public.wa_envio_reenviar(uuid, text) from public, anon;
grant execute on function public.wa_envio_reenviar(uuid, text) to authenticated;
