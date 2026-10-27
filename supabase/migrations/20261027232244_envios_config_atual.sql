-- Etapa 41.4 — Envios semanais: o envio usa SEMPRE a configuração atual de "Grupos e @ dos clientes".
-- No envio só se liga/desliga cada cliente; o grupo e os @ se editam em "Grupos e @" (ops_envio_padroes).
-- Cliente sem grupo salvo (caso antigo) continua usando o que está no próprio envio. Nada é apagado.

-- Envio completo (tela e MCP): grupo e @ lidos do padrão do cliente quando existe.
create or replace function private.envio_json(p_id uuid, p_so_ativos boolean)
returns jsonb language sql stable security definer set search_path = '' as $$
  with h as (select private.envio_hoje() j)
  select jsonb_build_object(
    'id', e.id, 'nome', e.nome, 'mensagem', e.mensagem, 'dia_semana', e.dia_semana, 'horario', to_char(e.horario, 'HH24:MI'),
    'ativo', e.ativo, 'arquivado_em', e.arquivado_em, 'versao', e.versao, 'created_at', e.created_at, 'updated_at', e.updated_at,
    'criado_por_nome', pc.full_name, 'atualizado_por_nome', pu.full_name,
    'toca_hoje', e.dia_semana = ((select j from h) ->> 'dia_semana')::int,
    'clientes', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', c.id, 'cliente_id', c.cliente_id, 'cliente_nome', cl.name, 'nome_grupo', coalesce(p.nome_grupo, c.nome_grupo),
        'tem_padrao', p.cliente_id is not null,
        'contatos_marcar', to_jsonb(array(select x from unnest(coalesce(p.contatos_marcar, c.contatos_marcar)) with ordinality t(x, n)
                                           where not (x = any (coalesce(p.contatos_desligados, c.contatos_desligados))) order by n)),
        'contatos', (select coalesce(jsonb_agg(jsonb_build_object('nome', x, 'ativo', not (x = any (coalesce(p.contatos_desligados, c.contatos_desligados)))) order by n), '[]')
                       from unnest(coalesce(p.contatos_marcar, c.contatos_marcar)) with ordinality t(x, n)),
        'ativo', c.ativo, 'observacao', c.observacao,
        'ultima_execucao', (select jsonb_build_object('executado_em', x.executado_em, 'status', x.status, 'detalhe', x.detalhe)
                              from public.ops_envio_execucoes x where x.envio_id = e.id and x.cliente_id = c.cliente_id
                             order by x.executado_em desc, x.id desc limit 1),
        'ja_enviado_nesta_semana', exists (select 1 from public.ops_envio_execucoes x where x.envio_id = e.id and x.cliente_id = c.cliente_id
                                             and x.status = 'enviado' and x.executado_em >= ((select j from h) ->> 'inicio_semana')::timestamptz))
        order by cl.name), '[]')
       from public.ops_envio_clientes c join public.clients cl on cl.id = c.cliente_id
       left join public.ops_envio_padroes p on p.cliente_id = c.cliente_id
      where c.envio_id = e.id and c.removido_em is null and cl.excluded_at is null and (not p_so_ativos or c.ativo)))
    || private.envio_situacao(e.id)
  from public.ops_envios e
  left join public.profiles pc on pc.id = e.criado_por
  left join public.profiles pu on pu.id = e.atualizado_por
  where e.id = p_id
$$;

-- Salvar: cliente com grupo salvo usa o padrão; o pedido só decide quem está ligado.
create or replace function private.ops_envio_save_impl(p_id uuid, p_versao integer, p jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := p_id;
  v_old public.ops_envios;
  v_nome text := btrim(coalesce(p ->> 'nome', ''));
  v_msg text := btrim(coalesce(p ->> 'mensagem', ''));
  v_dia int;
  v_hora time;
  c jsonb;
  v_cli uuid;
  v_nomes text[];
  v_nome_c text;
  v_vistos uuid[] := '{}';
  v_ativos int := 0;
  v_off text[];
  v_grupo text;
  v_pd public.ops_envio_padroes;
begin
  perform private.ops_need('ops.envios');
  if char_length(v_nome) < 2 then raise exception 'Dê um nome ao envio (mínimo 2 letras).' using errcode = '22023'; end if;
  if char_length(v_nome) > 120 then raise exception 'Nome longo demais (máximo 120 letras).' using errcode = '22023'; end if;
  if v_msg = '' then raise exception 'Escreva a mensagem.' using errcode = '22023'; end if;
  if char_length(v_msg) > 5000 then raise exception 'Mensagem longa demais (máximo 5.000 letras).' using errcode = '22023'; end if;
  begin
    v_dia := (p ->> 'dia_semana')::int;
    v_hora := (p ->> 'horario')::time;
  exception when others then
    raise exception 'Escolha o dia da semana e o horário.' using errcode = '22023';
  end;
  if v_dia is null or v_dia not between 0 and 6 or v_hora is null then raise exception 'Escolha o dia da semana e o horário.' using errcode = '22023'; end if;
  if jsonb_typeof(p -> 'clientes') is distinct from 'array' then raise exception 'Escolha pelo menos um cliente.' using errcode = '22023'; end if;

  -- Validar os clientes antes de gravar
  for c in select * from jsonb_array_elements(p -> 'clientes') loop
    begin
      v_cli := (c ->> 'cliente_id')::uuid;
    exception when others then
      raise exception 'Cliente inválido.' using errcode = '22023';
    end;
    if v_cli is null or not exists (select 1 from public.clients where id = v_cli and excluded_at is null) then
      raise exception 'Cliente não encontrado.' using errcode = '22023';
    end if;
    if v_cli = any (v_vistos) then raise exception 'Um cliente aparece duas vezes no envio.' using errcode = '22023'; end if;
    v_vistos := v_vistos || v_cli;
    -- 41.4: cliente com grupo salvo em "Grupos e @" usa sempre essa configuração (o que vier no pedido é ignorado)
    if exists (select 1 from public.ops_envio_padroes where cliente_id = v_cli) then
      if coalesce((c ->> 'ativo')::boolean, true) then v_ativos := v_ativos + 1; end if;
      continue;
    end if;
    if btrim(coalesce(c ->> 'nome_grupo', '')) = '' then
      raise exception 'Informe o nome do grupo de "%".', (select name from public.clients where id = v_cli) using errcode = '22023';
    end if;
    if char_length(btrim(c ->> 'nome_grupo')) > 200 then raise exception 'Nome do grupo longo demais (máximo 200 letras).' using errcode = '22023'; end if;
    if jsonb_typeof(coalesce(c -> 'contatos_marcar', '[]')) <> 'array' then raise exception 'Lista de quem marcar inválida.' using errcode = '22023'; end if;
    v_nomes := array(select btrim(x) from jsonb_array_elements_text(coalesce(c -> 'contatos_marcar', '[]')) with ordinality t(x, n)
                      where btrim(x) <> '' order by n);
    if cardinality(v_nomes) > 20 then raise exception 'No máximo 20 pessoas para marcar por grupo.' using errcode = '22023'; end if;
    foreach v_nome_c in array v_nomes loop
      if char_length(v_nome_c) > 80 then raise exception 'Nome para marcar longo demais (máximo 80 letras).' using errcode = '22023'; end if;
      if char_length(regexp_replace(v_nome_c, '[^0-9]', '', 'g')) >= 8 then
        raise exception 'Em "Quem marcar" use só o nome como aparece no grupo, não o telefone.' using errcode = '22023';
      end if;
    end loop;
    if char_length(coalesce(c ->> 'observacao', '')) > 500 then raise exception 'Observação longa demais (máximo 500 letras).' using errcode = '22023'; end if;
    if coalesce((c ->> 'ativo')::boolean, true) then v_ativos := v_ativos + 1; end if;
  end loop;
  if v_ativos = 0 then raise exception 'Deixe pelo menos um cliente ativo no envio.' using errcode = '22023'; end if;

  if p_id is null then
    insert into public.ops_envios (nome, mensagem, dia_semana, horario, ativo, criado_por, atualizado_por)
    values (v_nome, v_msg, v_dia, v_hora, coalesce((p ->> 'ativo')::boolean, true), (select auth.uid()), (select auth.uid()))
    returning id into v_id;
  else
    select * into v_old from public.ops_envios where id = p_id for update;
    if v_old.id is null then raise exception 'Envio não encontrado.' using errcode = '22023'; end if;
    if v_old.arquivado_em is not null then raise exception 'Envio arquivado: desarquive para editar.' using errcode = '22023'; end if;
    if v_old.versao <> coalesce(p_versao, -1) then
      raise exception 'Alguém alterou este envio antes de você. Recarregue para ver a versão atual.' using errcode = '40001';
    end if;
    update public.ops_envios set nome = v_nome, mensagem = v_msg, dia_semana = v_dia, horario = v_hora,
           ativo = coalesce((p ->> 'ativo')::boolean, ativo), versao = versao + 1, atualizado_por = (select auth.uid()), updated_at = now()
     where id = p_id;
    -- Quem saiu da lista: marcado, nunca apagado
    update public.ops_envio_clientes set removido_em = now(), ativo = false, updated_at = now()
     where envio_id = p_id and removido_em is null and not (cliente_id = any (v_vistos));
  end if;

  for c in select * from jsonb_array_elements(p -> 'clientes') loop
    v_cli := (c ->> 'cliente_id')::uuid;
    select * into v_pd from public.ops_envio_padroes where cliente_id = v_cli;
    if v_pd.cliente_id is not null then
      v_grupo := v_pd.nome_grupo; v_nomes := v_pd.contatos_marcar; v_off := v_pd.contatos_desligados;
    else
      v_grupo := btrim(c ->> 'nome_grupo');
      v_nomes := array(select btrim(x) from jsonb_array_elements_text(coalesce(c -> 'contatos_marcar', '[]')) with ordinality t(x, n)
                        where btrim(x) <> '' order by n);
      v_off := private.envio_desligados(v_nomes, c -> 'contatos_desligados');
    end if;
    insert into public.ops_envio_clientes (envio_id, cliente_id, nome_grupo, contatos_marcar, contatos_desligados, ativo, observacao)
    values (v_id, v_cli, v_grupo, v_nomes, v_off, coalesce((c ->> 'ativo')::boolean, true),
            case when c ? 'observacao' then nullif(btrim(c ->> 'observacao'), '') end)
    on conflict (envio_id, cliente_id) do update
       set nome_grupo = excluded.nome_grupo, contatos_marcar = excluded.contatos_marcar, contatos_desligados = excluded.contatos_desligados,
           ativo = excluded.ativo, observacao = case when c ? 'observacao' then excluded.observacao else public.ops_envio_clientes.observacao end,
           removido_em = null, updated_at = now();
    -- Cliente sem grupo salvo: o que veio no envio vira o padrão dele
    if v_pd.cliente_id is null then perform private.envio_padrao_gravar(v_cli, v_grupo, v_nomes, v_off, 'envio'); end if;
  end loop;

  insert into public.audit_logs (actor_id, action, target_type, target_id, details)
  values ((select auth.uid()), case when p_id is null then 'ops.envio.create' else 'ops.envio.update' end, 'ops_envio', v_id::text,
          jsonb_build_object('nome', v_nome, 'dia_semana', v_dia, 'horario', to_char(v_hora, 'HH24:MI'),
                             'clientes', cardinality(v_vistos), 'clientes_ativos', v_ativos));
  return v_id;
end;
$$;
