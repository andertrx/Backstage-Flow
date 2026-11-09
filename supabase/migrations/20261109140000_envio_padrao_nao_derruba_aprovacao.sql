-- Mudar só o grupo ou as pessoas a marcar de um cliente NÃO derruba mais a aprovação da semana: a mensagem, o dia e o horário não mudaram.
-- (O grupo que recebe é o ligado ao WhatsApp e quem é marcado vem de wa_marcacoes, lidos na hora do envio.)
create or replace function private.ops_envio_padrao_save_impl(p_cliente uuid, p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_grupo text := btrim(coalesce(p ->> 'nome_grupo', ''));
  v_nomes text[];
  v_off text[];
  v_nome_c text;
  v_envios uuid[];
begin
  perform private.ops_need('ops.envios');
  if p_cliente is null or not exists (select 1 from public.clients where id = p_cliente and excluded_at is null) then
    raise exception 'Cliente não encontrado.' using errcode = '22023';
  end if;
  if v_grupo = '' then raise exception 'Informe o nome do grupo.' using errcode = '22023'; end if;
  if char_length(v_grupo) > 200 then raise exception 'Nome do grupo longo demais (máximo 200 letras).' using errcode = '22023'; end if;
  if jsonb_typeof(coalesce(p -> 'contatos_marcar', '[]')) <> 'array' then raise exception 'Lista de quem marcar inválida.' using errcode = '22023'; end if;
  v_nomes := array(select btrim(x) from jsonb_array_elements_text(coalesce(p -> 'contatos_marcar', '[]')) with ordinality t(x, n)
                    where btrim(x) <> '' order by n);
  if cardinality(v_nomes) > 20 then raise exception 'No máximo 20 pessoas para marcar por grupo.' using errcode = '22023'; end if;
  foreach v_nome_c in array v_nomes loop
    if char_length(v_nome_c) > 80 then raise exception 'Nome para marcar longo demais (máximo 80 letras).' using errcode = '22023'; end if;
    if char_length(regexp_replace(v_nome_c, '[^0-9]', '', 'g')) >= 8 then
      raise exception 'Em "Quem marcar" use só o nome como aparece no grupo, não o telefone.' using errcode = '22023';
    end if;
  end loop;
  v_off := private.envio_desligados(v_nomes, p -> 'contatos_desligados');

  perform private.envio_padrao_gravar(p_cliente, v_grupo, v_nomes, v_off, 'padrao');

  -- Levar para os envios em que o cliente está (só onde mudou)
  with mudou as (
    update public.ops_envio_clientes c set nome_grupo = v_grupo, contatos_marcar = v_nomes, contatos_desligados = v_off, updated_at = now()
      from public.ops_envios e
     where e.id = c.envio_id and e.arquivado_em is null and c.cliente_id = p_cliente and c.removido_em is null
       and (c.nome_grupo, c.contatos_marcar, c.contatos_desligados) is distinct from (v_grupo, v_nomes, v_off)
    returning c.envio_id)
  select coalesce(array_agg(distinct envio_id), '{}') into v_envios from mudou;

  return jsonb_build_object('envios_atualizados', cardinality(v_envios));
end;
$$;

