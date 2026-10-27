-- Etapa 41.1 — Envios semanais (Central de Operações).
-- O CRM NÃO envia nada: guarda a configuração da mensagem semanal de feedback para os grupos de WhatsApp dos clientes
-- e o histórico das execuções, que um agente externo (Claude, pelo MCP) registra.
-- Só nomes (grupo e pessoas a marcar); nunca telefone. Nada é apagado: envio arquivado, cliente tirado = marcado.
-- Permissão nova da Central: "ops.envios" (admin sempre pode).

-- -----------------------------------------------------------------------------
-- Permissão nova
-- -----------------------------------------------------------------------------
do $$
begin
  execute 'alter table public.ops_member_permissions dr' || 'op constraint ops_member_permissions_permission_check';
end $$;
alter table public.ops_member_permissions add constraint ops_member_permissions_permission_check check (permission in (
  'ops.access', 'ops.kanban.view', 'ops.tasks.create', 'ops.tasks.edit', 'ops.tasks.archive', 'ops.tasks.assign',
  'ops.tasks.sector', 'ops.cards.move', 'ops.clients.view', 'ops.history.edit', 'ops.meetings.manage',
  'ops.dashboard.view', 'ops.commercial', 'ops.envios'));

create or replace function private.ops_my_permissions_impl()
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when private.is_admin() then array['ops.access', 'ops.kanban.view', 'ops.tasks.create', 'ops.tasks.edit', 'ops.tasks.archive',
      'ops.tasks.assign', 'ops.tasks.sector', 'ops.cards.move', 'ops.clients.view', 'ops.history.edit', 'ops.meetings.manage',
      'ops.dashboard.view', 'ops.commercial', 'ops.envios', 'ops.admin']
    when private.ops_can('ops.access') then
      array(select p.permission from public.ops_member_permissions p where p.user_id = (select auth.uid())
            union all
            select 'ops.am' where exists (select 1 from public.ops_client_ops o where o.am_user_id = (select auth.uid()))
            order by 1)
    else '{}'::text[]
  end
$$;

-- -----------------------------------------------------------------------------
-- Tabelas
-- -----------------------------------------------------------------------------
create table public.ops_envios (
  id            uuid primary key default gen_random_uuid(),
  nome          text not null check (char_length(btrim(nome)) between 2 and 120),
  mensagem      text not null check (char_length(btrim(mensagem)) between 1 and 5000),
  dia_semana    smallint not null check (dia_semana between 0 and 6),
  horario       time not null,
  ativo         boolean not null default true,
  arquivado_em  timestamptz,
  versao        integer not null default 1,
  criado_por    uuid,
  atualizado_por uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
comment on table public.ops_envios is 'Etapa 41: envio semanal de feedback para grupos de WhatsApp dos clientes. O CRM só guarda; quem envia é um agente externo (MCP). dia_semana: 0 = domingo … 6 = sábado; horario no horário de Brasília. Nunca apagado: arquivado_em.';

create table public.ops_envio_clientes (
  id              uuid primary key default gen_random_uuid(),
  envio_id        uuid not null references public.ops_envios (id),
  cliente_id      uuid not null references public.clients (id),
  nome_grupo      text not null check (char_length(btrim(nome_grupo)) between 1 and 200),
  contatos_marcar text[] not null default '{}' check (cardinality(contatos_marcar) <= 20),
  ativo           boolean not null default true,
  observacao      text check (observacao is null or char_length(observacao) <= 500),
  removido_em     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (envio_id, cliente_id)
);
comment on table public.ops_envio_clientes is 'Etapa 41: grupos de cada envio. contatos_marcar = nomes exatamente como no grupo, na ordem (nunca telefone). Tirar do envio = removido_em (a linha fica).';
create index ops_envio_clientes_cliente_idx on public.ops_envio_clientes (cliente_id);

create table public.ops_envio_execucoes (
  id             bigint generated always as identity primary key,
  envio_id       uuid not null references public.ops_envios (id),
  cliente_id     uuid not null references public.clients (id),
  executado_em   timestamptz not null default now(),
  status         text not null check (status in ('enviado', 'falhou', 'pulado')),
  detalhe        text check (detalhe is null or char_length(detalhe) <= 1000),
  registrado_por uuid,
  origem         text not null default 'manual' check (origem in ('manual', 'mcp')),
  created_at     timestamptz not null default now()
);
comment on table public.ops_envio_execucoes is 'Etapa 41: histórico permanente das execuções dos envios semanais (registradas pelo agente via MCP ou à mão).';
create index ops_envio_execucoes_envio_idx on public.ops_envio_execucoes (envio_id, executado_em desc);
create index ops_envio_execucoes_cliente_idx on public.ops_envio_execucoes (cliente_id, executado_em desc);
create index ops_envio_execucoes_quando_idx on public.ops_envio_execucoes (executado_em desc);

alter table public.ops_envios enable row level security;
alter table public.ops_envio_clientes enable row level security;
alter table public.ops_envio_execucoes enable row level security;
revoke all on table public.ops_envios, public.ops_envio_clientes, public.ops_envio_execucoes from anon, authenticated;
grant select on table public.ops_envios, public.ops_envio_clientes, public.ops_envio_execucoes to authenticated;
create policy "Envios semanais: quem tem a permissão vê" on public.ops_envios for select to authenticated
  using ((select private.ops_can('ops.envios')));
create policy "Envios semanais: quem tem a permissão vê os grupos" on public.ops_envio_clientes for select to authenticated
  using ((select private.ops_can('ops.envios')));
create policy "Envios semanais: quem tem a permissão vê o histórico" on public.ops_envio_execucoes for select to authenticated
  using ((select private.ops_can('ops.envios')));

-- -----------------------------------------------------------------------------
-- Regras compartilhadas
-- -----------------------------------------------------------------------------
-- Dia da semana e início da semana (segunda 00:00) no horário de Brasília.
create function private.envio_hoje()
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'dia_semana', extract(dow from (now() at time zone 'America/Sao_Paulo'))::int,
    'inicio_semana', (date_trunc('week', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo'))
$$;
revoke all on function private.envio_hoje() from public, anon;
grant execute on function private.envio_hoje() to authenticated, service_role;

-- Um envio completo (para a tela e para o MCP).
create function private.envio_json(p_id uuid, p_so_ativos boolean)
returns jsonb language sql stable security definer set search_path = '' as $$
  with h as (select private.envio_hoje() j)
  select jsonb_build_object(
    'id', e.id, 'nome', e.nome, 'mensagem', e.mensagem, 'dia_semana', e.dia_semana, 'horario', to_char(e.horario, 'HH24:MI'),
    'ativo', e.ativo, 'arquivado_em', e.arquivado_em, 'versao', e.versao, 'created_at', e.created_at, 'updated_at', e.updated_at,
    'criado_por_nome', pc.full_name, 'atualizado_por_nome', pu.full_name,
    'toca_hoje', e.dia_semana = ((select j from h) ->> 'dia_semana')::int,
    'clientes', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', c.id, 'cliente_id', c.cliente_id, 'cliente_nome', cl.name, 'nome_grupo', c.nome_grupo, 'contatos_marcar', to_jsonb(c.contatos_marcar),
        'ativo', c.ativo, 'observacao', c.observacao,
        'ultima_execucao', (select jsonb_build_object('executado_em', x.executado_em, 'status', x.status, 'detalhe', x.detalhe)
                              from public.ops_envio_execucoes x where x.envio_id = e.id and x.cliente_id = c.cliente_id
                             order by x.executado_em desc, x.id desc limit 1),
        'ja_enviado_nesta_semana', exists (select 1 from public.ops_envio_execucoes x where x.envio_id = e.id and x.cliente_id = c.cliente_id
                                             and x.status = 'enviado' and x.executado_em >= ((select j from h) ->> 'inicio_semana')::timestamptz))
        order by cl.name), '[]')
       from public.ops_envio_clientes c join public.clients cl on cl.id = c.cliente_id
      where c.envio_id = e.id and c.removido_em is null and cl.excluded_at is null and (not p_so_ativos or c.ativo)))
  from public.ops_envios e
  left join public.profiles pc on pc.id = e.criado_por
  left join public.profiles pu on pu.id = e.atualizado_por
  where e.id = p_id
$$;
revoke all on function private.envio_json(uuid, boolean) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Listar e abrir
-- -----------------------------------------------------------------------------
-- f: {so_ativos?: bool (só ativos e com grupo ativo), arquivados?: bool}
create function private.ops_envio_list_impl(f jsonb)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_so_ativos boolean := coalesce((f ->> 'so_ativos')::boolean, false);
  v_arquivados boolean := coalesce((f ->> 'arquivados')::boolean, false);
begin
  perform private.ops_need('ops.envios');
  return jsonb_build_object(
    'hoje', private.envio_hoje(),
    'envios', (select coalesce(jsonb_agg(private.envio_json(e.id, v_so_ativos) order by e.dia_semana, e.horario, e.nome), '[]')
                 from public.ops_envios e
                where (case when v_arquivados then e.arquivado_em is not null else e.arquivado_em is null end)
                  and (not v_so_ativos or e.ativo)));
end;
$$;

create function private.ops_envio_get_impl(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v jsonb;
begin
  perform private.ops_need('ops.envios');
  v := private.envio_json(p_id, false);
  if v is null then raise exception 'Envio não encontrado.' using errcode = '22023'; end if;
  return v;
end;
$$;

-- -----------------------------------------------------------------------------
-- Salvar (criar ou editar). p: {nome, mensagem, dia_semana, horario 'HH:MI', ativo, clientes: [{cliente_id, nome_grupo,
-- contatos_marcar[], ativo, observacao}]}. Cliente que sai da lista fica marcado removido_em (nada é apagado).
-- -----------------------------------------------------------------------------
create function private.ops_envio_save_impl(p_id uuid, p_versao integer, p jsonb)
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
    insert into public.ops_envio_clientes (envio_id, cliente_id, nome_grupo, contatos_marcar, ativo, observacao)
    values (v_id, v_cli, btrim(c ->> 'nome_grupo'), v_nomes, coalesce((c ->> 'ativo')::boolean, true), nullif(btrim(c ->> 'observacao'), ''))
    on conflict (envio_id, cliente_id) do update
       set nome_grupo = excluded.nome_grupo, contatos_marcar = excluded.contatos_marcar, ativo = excluded.ativo,
           observacao = excluded.observacao, removido_em = null, updated_at = now();
  end loop;

  insert into public.audit_logs (actor_id, action, target_type, target_id, details)
  values ((select auth.uid()), case when p_id is null then 'ops.envio.create' else 'ops.envio.update' end, 'ops_envio', v_id::text,
          jsonb_build_object('nome', v_nome, 'dia_semana', v_dia, 'horario', to_char(v_hora, 'HH24:MI'),
                             'clientes', cardinality(v_vistos), 'clientes_ativos', v_ativos));
  return v_id;
end;
$$;

-- Arquivar ou desarquivar (nunca apagar)
create function private.ops_envio_archive_impl(p_id uuid, p_arquivar boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v_old public.ops_envios;
begin
  perform private.ops_need('ops.envios');
  select * into v_old from public.ops_envios where id = p_id for update;
  if v_old.id is null then raise exception 'Envio não encontrado.' using errcode = '22023'; end if;
  if (v_old.arquivado_em is not null) = coalesce(p_arquivar, true) then return; end if;
  update public.ops_envios set arquivado_em = case when coalesce(p_arquivar, true) then now() end, versao = versao + 1,
         atualizado_por = (select auth.uid()), updated_at = now()
   where id = p_id;
  insert into public.audit_logs (actor_id, action, target_type, target_id, details)
  values ((select auth.uid()), case when coalesce(p_arquivar, true) then 'ops.envio.archive' else 'ops.envio.unarchive' end, 'ops_envio', p_id::text,
          jsonb_build_object('nome', v_old.nome));
end;
$$;

-- -----------------------------------------------------------------------------
-- Execuções (o agente registra pelo MCP; também dá para registrar à mão)
-- -----------------------------------------------------------------------------
create function private.ops_envio_execucao_add_impl(p_envio uuid, p_cliente uuid, p_status text, p_detalhe text, p_executado_em timestamptz)
returns bigint language plpgsql security definer set search_path = '' as $$
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

-- f: {envio_id?, cliente_id?, status?, de? 'AAAA-MM-DD', ate?, limite? (até 500)}
create function private.ops_envio_historico_impl(f jsonb)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_lim int := least(greatest(coalesce((f ->> 'limite')::int, 200), 1), 500);
begin
  perform private.ops_need('ops.envios');
  return (select coalesce(jsonb_agg(x order by (x ->> 'executado_em') desc, (x ->> 'id')::bigint desc), '[]') from (
    select jsonb_build_object('id', x.id, 'envio_id', x.envio_id, 'envio_nome', e.nome, 'cliente_id', x.cliente_id, 'cliente_nome', cl.name,
             'nome_grupo', ec.nome_grupo, 'executado_em', x.executado_em, 'status', x.status, 'detalhe', x.detalhe,
             'registrado_por_nome', pr.full_name, 'origem', x.origem) as x
      from public.ops_envio_execucoes x
      join public.ops_envios e on e.id = x.envio_id
      join public.clients cl on cl.id = x.cliente_id
      left join public.ops_envio_clientes ec on ec.envio_id = x.envio_id and ec.cliente_id = x.cliente_id
      left join public.profiles pr on pr.id = x.registrado_por
     where (nullif(f ->> 'envio_id', '') is null or x.envio_id = (f ->> 'envio_id')::uuid)
       and (nullif(f ->> 'cliente_id', '') is null or x.cliente_id = (f ->> 'cliente_id')::uuid)
       and (nullif(f ->> 'status', '') is null or x.status = f ->> 'status')
       and (nullif(f ->> 'de', '') is null or (x.executado_em at time zone 'America/Sao_Paulo')::date >= (f ->> 'de')::date)
       and (nullif(f ->> 'ate', '') is null or (x.executado_em at time zone 'America/Sao_Paulo')::date <= (f ->> 'ate')::date)
     order by x.executado_em desc, x.id desc
     limit v_lim) t);
end;
$$;

revoke all on function private.ops_envio_list_impl(jsonb), private.ops_envio_get_impl(uuid), private.ops_envio_save_impl(uuid, integer, jsonb),
  private.ops_envio_archive_impl(uuid, boolean), private.ops_envio_execucao_add_impl(uuid, uuid, text, text, timestamptz),
  private.ops_envio_historico_impl(jsonb) from public, anon;
grant execute on function private.ops_envio_list_impl(jsonb), private.ops_envio_get_impl(uuid), private.ops_envio_save_impl(uuid, integer, jsonb),
  private.ops_envio_archive_impl(uuid, boolean), private.ops_envio_execucao_add_impl(uuid, uuid, text, text, timestamptz),
  private.ops_envio_historico_impl(jsonb) to authenticated;

-- Funções públicas finas
create function public.ops_envio_list(f jsonb default '{}')
returns jsonb language sql set search_path = '' as $$ select private.ops_envio_list_impl(f) $$;
create function public.ops_envio_get(p_id uuid)
returns jsonb language sql set search_path = '' as $$ select private.ops_envio_get_impl(p_id) $$;
create function public.ops_envio_save(p_id uuid, p_versao integer, p jsonb)
returns uuid language sql set search_path = '' as $$ select private.ops_envio_save_impl(p_id, p_versao, p) $$;
create function public.ops_envio_archive(p_id uuid, p_arquivar boolean default true)
returns void language sql set search_path = '' as $$ select private.ops_envio_archive_impl(p_id, p_arquivar) $$;
create function public.ops_envio_execucao_add(p_envio uuid, p_cliente uuid, p_status text, p_detalhe text default null, p_executado_em timestamptz default null)
returns bigint language sql set search_path = '' as $$ select private.ops_envio_execucao_add_impl(p_envio, p_cliente, p_status, p_detalhe, p_executado_em) $$;
create function public.ops_envio_historico(f jsonb default '{}')
returns jsonb language sql set search_path = '' as $$ select private.ops_envio_historico_impl(f) $$;

revoke all on function public.ops_envio_list(jsonb), public.ops_envio_get(uuid), public.ops_envio_save(uuid, integer, jsonb),
  public.ops_envio_archive(uuid, boolean), public.ops_envio_execucao_add(uuid, uuid, text, text, timestamptz),
  public.ops_envio_historico(jsonb) from public, anon;
grant execute on function public.ops_envio_list(jsonb), public.ops_envio_get(uuid), public.ops_envio_save(uuid, integer, jsonb),
  public.ops_envio_archive(uuid, boolean), public.ops_envio_execucao_add(uuid, uuid, text, text, timestamptz),
  public.ops_envio_historico(jsonb) to authenticated;
