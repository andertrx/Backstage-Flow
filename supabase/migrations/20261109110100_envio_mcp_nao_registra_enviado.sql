-- T5.22: o Claude/MCP não envia nem registra "enviado" (quem envia é o CRM pela fila automática). Pode registrar falhou/pulado.
create or replace function private.ops_envio_execucao_add_impl(p_envio uuid, p_cliente uuid, p_status text, p_detalhe text, p_executado_em timestamp with time zone)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare v_id bigint; v_e public.ops_envios;
begin
  perform private.ops_need('ops.envios');
  select * into v_e from public.ops_envios where id = p_envio;
  if v_e.id is null then raise exception 'Envio não encontrado.' using errcode = '22023'; end if;
  if v_e.arquivado_em is not null then raise exception 'Envio arquivado: não recebe execuções.' using errcode = '22023'; end if;
  if not exists (select 1 from public.ops_envio_clientes c where c.envio_id = p_envio and c.cliente_id = p_cliente and c.removido_em is null) then
    raise exception 'Este cliente não faz parte deste envio.' using errcode = '22023';
  end if;
  if p_status is null or p_status not in ('enviado', 'falhou', 'pulado') then
    raise exception 'Status inválido: use enviado, falhou ou pulado.' using errcode = '22023';
  end if;
  if p_status = 'enviado' and private.request_from_mcp() then
    raise exception 'O envio é feito pelo CRM (WhatsApp conectado): o Claude não envia nem registra envio.' using errcode = '22023';
  end if;
  if char_length(coalesce(p_detalhe, '')) > 1000 then raise exception 'Detalhe longo demais (máximo 1.000 letras).' using errcode = '22023'; end if;
  if p_executado_em is not null and p_executado_em > now() + interval '10 minutes' then
    raise exception 'A data da execução não pode ser no futuro.' using errcode = '22023';
  end if;
  insert into public.ops_envio_execucoes (envio_id, cliente_id, executado_em, status, detalhe, registrado_por, origem)
  values (p_envio, p_cliente, coalesce(p_executado_em, now()), p_status, nullif(btrim(p_detalhe), ''), (select auth.uid()),
          case when private.request_from_mcp() then 'mcp' else 'manual' end)
  returning id into v_id;
  return v_id;
end;
$$;
