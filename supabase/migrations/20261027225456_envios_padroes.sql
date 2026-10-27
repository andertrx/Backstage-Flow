-- Etapa 41.3 — Envios semanais: grupo e @ padrão de cada cliente, com ligar/desligar por pessoa.
-- Cada cliente guarda o nome do grupo e quem marcar (na ordem). Todo envio novo já vem com eles.
-- Cada @ pode ser desligado: o nome fica guardado, mas a pessoa não é marcada (o MCP e o pop-up só veem os ligados).
-- Salvar um envio atualiza o padrão do cliente; salvar o padrão vale também para os envios (não arquivados) em que o cliente está.
-- Só nomes, nunca telefone. Nada é apagado.

-- -----------------------------------------------------------------------------
-- Quem está desligado em cada grupo do envio
-- -----------------------------------------------------------------------------
alter table public.ops_envio_clientes add column contatos_desligados text[] not null default '{}'
  check (cardinality(contatos_desligados) <= 20);
comment on column public.ops_envio_clientes.contatos_desligados is 'Etapa 41.3: nomes de contatos_marcar que estão desligados (guardados, mas não marcados).';

-- -----------------------------------------------------------------------------
-- Padrão de cada cliente
-- -----------------------------------------------------------------------------
create table public.ops_envio_padroes (
  cliente_id          uuid primary key references public.clients (id),
  nome_grupo          text not null check (char_length(btrim(nome_grupo)) between 1 and 200),
  contatos_marcar     text[] not null default '{}' check (cardinality(contatos_marcar) <= 20),
  contatos_desligados text[] not null default '{}' check (cardinality(contatos_desligados) <= 20),
  atualizado_por      uuid,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
comment on table public.ops_envio_padroes is 'Etapa 41.3: grupo de WhatsApp e quem marcar (na ordem) de cada cliente, para preencher os envios. contatos_desligados = guardados, mas não marcados. Só nomes. Uma linha por cliente, atualizada (mudanças no audit_logs).';

alter table public.ops_envio_padroes enable row level security;
revoke all on table public.ops_envio_padroes from anon, authenticated;
grant select on table public.ops_envio_padroes to authenticated;
create policy "Envios semanais: quem tem a permissão vê os padrões dos clientes" on public.ops_envio_padroes for select to authenticated
  using ((select private.ops_can('ops.envios')));

-- Começa com o que já está salvo nos envios (o mais recente de cada cliente).
insert into public.ops_envio_padroes (cliente_id, nome_grupo, contatos_marcar, contatos_desligados, atualizado_por)
select distinct on (c.cliente_id) c.cliente_id, c.nome_grupo, c.contatos_marcar, c.contatos_desligados, e.atualizado_por
  from public.ops_envio_clientes c join public.ops_envios e on e.id = c.envio_id
 where c.removido_em is null and e.arquivado_em is null
 order by c.cliente_id, c.updated_at desc
on conflict (cliente_id) do nothing;

-- -----------------------------------------------------------------------------
-- Regras compartilhadas
-- -----------------------------------------------------------------------------
-- Desligados válidos: só nomes que estão na lista, na ordem da lista.
create function private.envio_desligados(p_nomes text[], p_off jsonb)
returns text[] language sql immutable set search_path = '' as $$
  select coalesce(array(select x from unnest(p_nomes) with ordinality t(x, n)
                         where jsonb_typeof(p_off) = 'array' and exists (select 1 from jsonb_array_elements_text(p_off) o where btrim(o) = x)
                         order by n), '{}')
$$;
revoke all on function private.envio_desligados(text[], jsonb) from public, anon, authenticated;

-- Grava o padrão do cliente (e registra no audit_logs quando muda). Só quantidades no registro.
create function private.envio_padrao_gravar(p_cli uuid, p_grupo text, p_nomes text[], p_off text[], p_origem text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_old public.ops_envio_padroes;
begin
  select * into v_old from public.ops_envio_padroes where cliente_id = p_cli for update;
  if v_old.cliente_id is not null and v_old.nome_grupo = p_grupo and v_old.contatos_marcar = p_nomes and v_old.contatos_desligados = p_off then
    return false;
  end if;
  insert into public.ops_envio_padroes (cliente_id, nome_grupo, contatos_marcar, contatos_desligados, atualizado_por)
  values (p_cli, p_grupo, p_nomes, p_off, (select auth.uid()))
  on conflict (cliente_id) do update set nome_grupo = excluded.nome_grupo, contatos_marcar = excluded.contatos_marcar,
     contatos_desligados = excluded.contatos_desligados, atualizado_por = excluded.atualizado_por, updated_at = now();
  insert into public.audit_logs (actor_id, action, target_type, target_id, details)
  values ((select auth.uid()), 'ops.envio.padrao', 'client', p_cli::text,
          jsonb_build_object('origem', p_origem, 'grupo_mudou', v_old.cliente_id is null or v_old.nome_grupo <> p_grupo,
                             'contatos', cardinality(p_nomes), 'desligados', cardinality(p_off)));
  return true;
end;
$$;
revoke all on function private.envio_padrao_gravar(uuid, text, text[], text[], text) from public, anon, authenticated;

-- Envio completo (tela e MCP): contatos_marcar passa a trazer só os LIGADOS, na ordem; "contatos" traz todos com ligado/desligado.
create or replace function private.envio_json(p_id uuid, p_so_ativos boolean)
returns jsonb language sql stable security definer set search_path = '' as $$
  with h as (select private.envio_hoje() j)
  select jsonb_build_object(
    'id', e.id, 'nome', e.nome, 'mensagem', e.mensagem, 'dia_semana', e.dia_semana, 'horario', to_char(e.horario, 'HH24:MI'),
    'ativo', e.ativo, 'arquivado_em', e.arquivado_em, 'versao', e.versao, 'created_at', e.created_at, 'updated_at', e.updated_at,
    'criado_por_nome', pc.full_name, 'atualizado_por_nome', pu.full_name,
    'toca_hoje', e.dia_semana = ((select j from h) ->> 'dia_semana')::int,
    'clientes', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', c.id, 'cliente_id', c.cliente_id, 'cliente_nome', cl.name, 'nome_grupo', c.nome_grupo,
        'contatos_marcar', to_jsonb(array(select x from unnest(c.contatos_marcar) with ordinality t(x, n) where not (x = any (c.contatos_desligados)) order by n)),
        'contatos', (select coalesce(jsonb_agg(jsonb_build_object('nome', x, 'ativo', not (x = any (c.contatos_desligados))) order by n), '[]')
                       from unnest(c.contatos_marcar) with ordinality t(x, n)),
        'ativo', c.ativo, 'observacao', c.observacao,
        'ultima_execucao', (select jsonb_build_object('executado_em', x.executado_em, 'status', x.status, 'detalhe', x.detalhe)
                              from public.ops_envio_execucoes x where x.envio_id = e.id and x.cliente_id = c.cliente_id
                             order by x.executado_em desc, x.id desc limit 1),
        'ja_enviado_nesta_semana', exists (select 1 from public.ops_envio_execucoes x where x.envio_id = e.id and x.cliente_id = c.cliente_id
                                             and x.status = 'enviado' and x.executado_em >= ((select j from h) ->> 'inicio_semana')::timestamptz))
        order by cl.name), '[]')
       from public.ops_envio_clientes c join public.clients cl on cl.id = c.cliente_id
      where c.envio_id = e.id and c.removido_em is null and cl.excluded_at is null and (not p_so_ativos or c.ativo)))
    || private.envio_situacao(e.id)
  from public.ops_envios e
  left join public.profiles pc on pc.id = e.criado_por
  left join public.profiles pu on pu.id = e.atualizado_por
  where e.id = p_id
$$;


-- Salvar o envio: o mesmo da 41.1 + desligados + atualiza o padrão do cliente.
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
    v_nomes := array(select btrim(x) from jsonb_array_elements_text(coalesce(c -> 'contatos_marcar', '[]')) with ordinality t(x, n)
                      where btrim(x) <> '' order by n);
    v_off := private.envio_desligados(v_nomes, c -> 'contatos_desligados');
    insert into public.ops_envio_clientes (envio_id, cliente_id, nome_grupo, contatos_marcar, contatos_desligados, ativo, observacao)
    values (v_id, v_cli, btrim(c ->> 'nome_grupo'), v_nomes, v_off, coalesce((c ->> 'ativo')::boolean, true), nullif(btrim(c ->> 'observacao'), ''))
    on conflict (envio_id, cliente_id) do update
       set nome_grupo = excluded.nome_grupo, contatos_marcar = excluded.contatos_marcar, contatos_desligados = excluded.contatos_desligados,
           ativo = excluded.ativo, observacao = excluded.observacao, removido_em = null, updated_at = now();
    -- 41.3: o grupo e os @ salvos aqui viram o padrão do cliente (o próximo envio já vem com eles)
    perform private.envio_padrao_gravar(v_cli, btrim(c ->> 'nome_grupo'), v_nomes, v_off, 'envio');
  end loop;

  insert into public.audit_logs (actor_id, action, target_type, target_id, details)
  values ((select auth.uid()), case when p_id is null then 'ops.envio.create' else 'ops.envio.update' end, 'ops_envio', v_id::text,
          jsonb_build_object('nome', v_nome, 'dia_semana', v_dia, 'horario', to_char(v_hora, 'HH24:MI'),
                             'clientes', cardinality(v_vistos), 'clientes_ativos', v_ativos));
  return v_id;
end;
$$;


-- -----------------------------------------------------------------------------
-- Padrões: listar e salvar
-- -----------------------------------------------------------------------------
create function private.ops_envio_padroes_impl()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.ops_need('ops.envios');
  return (select coalesce(jsonb_agg(jsonb_build_object(
      'cliente_id', p.cliente_id, 'cliente_nome', cl.name, 'nome_grupo', p.nome_grupo,
      'contatos', (select coalesce(jsonb_agg(jsonb_build_object('nome', x, 'ativo', not (x = any (p.contatos_desligados))) order by n), '[]')
                     from unnest(p.contatos_marcar) with ordinality t(x, n)),
      'updated_at', p.updated_at, 'atualizado_por_nome', pr.full_name,
      'envios', (select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'nome', e.nome) order by e.nome), '[]')
                   from public.ops_envio_clientes c join public.ops_envios e on e.id = c.envio_id
                  where c.cliente_id = p.cliente_id and c.removido_em is null and e.arquivado_em is null))
      order by cl.name), '[]')
    from public.ops_envio_padroes p
    join public.clients cl on cl.id = p.cliente_id and cl.excluded_at is null
    left join public.profiles pr on pr.id = p.atualizado_por);
end;
$$;

-- p: {nome_grupo, contatos_marcar[] (todos, na ordem), contatos_desligados[]}. Vale também para os envios não arquivados com este cliente
-- (versão nova: se já estava aprovado hoje, pede aprovação de novo).
create function private.ops_envio_padrao_save_impl(p_cliente uuid, p jsonb)
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
  update public.ops_envios set versao = versao + 1, atualizado_por = (select auth.uid()), updated_at = now() where id = any (v_envios);

  return jsonb_build_object('envios_atualizados', cardinality(v_envios));
end;
$$;

revoke all on function private.ops_envio_padroes_impl(), private.ops_envio_padrao_save_impl(uuid, jsonb) from public, anon;
grant execute on function private.ops_envio_padroes_impl(), private.ops_envio_padrao_save_impl(uuid, jsonb) to authenticated;

create function public.ops_envio_padroes()
returns jsonb language sql set search_path = '' as $$ select private.ops_envio_padroes_impl() $$;
create function public.ops_envio_padrao_save(p_cliente uuid, p jsonb)
returns jsonb language sql set search_path = '' as $$ select private.ops_envio_padrao_save_impl(p_cliente, p) $$;
revoke all on function public.ops_envio_padroes(), public.ops_envio_padrao_save(uuid, jsonb) from public, anon;
grant execute on function public.ops_envio_padroes(), public.ops_envio_padrao_save(uuid, jsonb) to authenticated;
