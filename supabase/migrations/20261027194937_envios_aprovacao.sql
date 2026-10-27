-- Etapa 41.2 — Envios semanais: aprovação semanal antes do envio.
-- No dia do envio, das 7h até o horário (Brasília), o CRM pede a aprovação ("Você analisou a mensagem e os grupos?").
-- O MCP só libera para o agente os envios APROVADOS naquela semana, na versão aprovada (editou depois? precisa aprovar de novo).
-- Sem aprovação até o horário: o envio da semana não sai e fica registrado "sem resposta". Nada é apagado.

create table public.ops_envio_aprovacoes (
  id            bigint generated always as identity primary key,
  envio_id      uuid not null references public.ops_envios (id),
  semana        date not null,
  decisao       text not null check (decisao in ('aprovado', 'recusado', 'sem_resposta')),
  versao_envio  integer not null,
  decidido_por  uuid,
  decidido_em   timestamptz not null default now(),
  origem        text not null default 'manual' check (origem in ('manual', 'mcp', 'sistema')),
  unique (envio_id, semana)
);
comment on table public.ops_envio_aprovacoes is 'Etapa 41.2: decisão semanal de cada envio (semana = segunda-feira, Brasília). aprovado/recusado pela pessoa; sem_resposta fechado pelo sistema após o horário. Permanente.';
create index ops_envio_aprovacoes_semana_idx on public.ops_envio_aprovacoes (semana desc);

alter table public.ops_envio_aprovacoes enable row level security;
revoke all on table public.ops_envio_aprovacoes from anon, authenticated;
grant select on table public.ops_envio_aprovacoes to authenticated;
create policy "Envios semanais: quem tem a permissão vê as aprovações" on public.ops_envio_aprovacoes for select to authenticated
  using ((select private.ops_can('ops.envios')));

-- Agora em Brasília: dia da semana, hora, data e segunda-feira da semana.
create or replace function private.envio_hoje()
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'dia_semana', extract(dow from (now() at time zone 'America/Sao_Paulo'))::int,
    'inicio_semana', (date_trunc('week', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo'),
    'semana', (date_trunc('week', now() at time zone 'America/Sao_Paulo'))::date,
    'data', (now() at time zone 'America/Sao_Paulo')::date,
    'hora', to_char(now() at time zone 'America/Sao_Paulo', 'HH24:MI'))
$$;

-- Situação do envio hoje:
--   nao_hoje | antes_da_janela | aguardando_aprovacao (das 7h ao horário; envio até 7h: desde 0h) | aprovado | recusado | nao_aprovado_a_tempo
create function private.envio_situacao(p_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  with h as (select private.envio_hoje() j),
  e as (select * from public.ops_envios where id = p_id),
  a as (select x.* from public.ops_envio_aprovacoes x, e, h where x.envio_id = e.id and x.semana = ((select j from h) ->> 'semana')::date)
  select jsonb_build_object(
    'semana', (select j from h) ->> 'semana',
    'aprovacao', (select jsonb_build_object('decisao', a.decisao, 'versao_envio', a.versao_envio, 'decidido_em', a.decidido_em,
                    'decidido_por_nome', (select full_name from public.profiles where id = a.decidido_por), 'origem', a.origem,
                    'valida', a.decisao = 'aprovado' and a.versao_envio = e.versao) from a, e),
    'situacao_hoje', case
      when not e.ativo or e.arquivado_em is not null or e.dia_semana <> ((select j from h) ->> 'dia_semana')::int then 'nao_hoje'
      when exists (select 1 from a where a.decisao = 'aprovado' and a.versao_envio = e.versao) then 'aprovado'
      when exists (select 1 from a where a.decisao = 'recusado') then 'recusado'
      when ((select j from h) ->> 'hora')::time >= e.horario then 'nao_aprovado_a_tempo'
      when ((select j from h) ->> 'hora')::time >= case when e.horario <= time '07:00' then time '00:00' else time '07:00' end then 'aguardando_aprovacao'
      else 'antes_da_janela' end,
    'pode_enviar_agora', e.ativo and e.arquivado_em is null and e.dia_semana = ((select j from h) ->> 'dia_semana')::int
      and ((select j from h) ->> 'hora')::time >= e.horario
      and exists (select 1 from a where a.decisao = 'aprovado' and a.versao_envio = e.versao))
  from e
$$;
revoke all on function private.envio_situacao(uuid) from public, anon, authenticated;

-- Envio completo (tela e MCP): o mesmo de antes + semana/aprovação/situação.
create or replace function private.envio_json(p_id uuid, p_so_ativos boolean)
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
    || private.envio_situacao(e.id)
  from public.ops_envios e
  left join public.profiles pc on pc.id = e.criado_por
  left join public.profiles pu on pu.id = e.atualizado_por
  where e.id = p_id
$$;

-- Pop-up: envios de hoje esperando a aprovação de quem tem a permissão (das 7h até o horário).
create function private.ops_envio_pendentes_impl()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.ops_can('ops.envios') then return '[]'::jsonb; end if;
  return (select coalesce(jsonb_agg(private.envio_json(e.id, true) order by e.horario, e.nome), '[]')
            from public.ops_envios e
           where e.ativo and e.arquivado_em is null
             and private.envio_situacao(e.id) ->> 'situacao_hoje' = 'aguardando_aprovacao');
end;
$$;

-- Aprovar ou recusar o envio de hoje, na versão que a pessoa viu (editou no meio? recarregar).
create function private.ops_envio_decidir_impl(p_id uuid, p_versao integer, p_aprovar boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_e public.ops_envios; v_sit jsonb; v_semana date := (private.envio_hoje() ->> 'semana')::date;
begin
  perform private.ops_need('ops.envios');
  select * into v_e from public.ops_envios where id = p_id for update;
  if v_e.id is null then raise exception 'Envio não encontrado.' using errcode = '22023'; end if;
  if v_e.versao <> coalesce(p_versao, -1) then
    raise exception 'O envio foi alterado depois que você abriu. Confira de novo antes de aprovar.' using errcode = '40001';
  end if;
  v_sit := private.envio_situacao(p_id);
  if v_sit ->> 'situacao_hoje' not in ('aguardando_aprovacao', 'aprovado', 'recusado') then
    raise exception 'Este envio não está esperando aprovação agora (só no dia, até o horário do envio).' using errcode = '22023';
  end if;
  if (private.envio_hoje() ->> 'hora')::time >= v_e.horario then
    raise exception 'Passou do horário do envio: a decisão desta semana já foi fechada.' using errcode = '22023';
  end if;
  insert into public.ops_envio_aprovacoes (envio_id, semana, decisao, versao_envio, decidido_por, origem)
  values (p_id, v_semana, case when p_aprovar then 'aprovado' else 'recusado' end, v_e.versao, (select auth.uid()),
          case when private.request_from_mcp() then 'mcp' else 'manual' end)
  on conflict (envio_id, semana) do update
     set decisao = excluded.decisao, versao_envio = excluded.versao_envio, decidido_por = excluded.decidido_por,
         decidido_em = now(), origem = excluded.origem;
  insert into public.audit_logs (actor_id, action, target_type, target_id, details)
  values ((select auth.uid()), case when p_aprovar then 'ops.envio.approve' else 'ops.envio.reject' end, 'ops_envio', p_id::text,
          jsonb_build_object('nome', v_e.nome, 'semana', v_semana, 'versao', v_e.versao));
  return private.envio_situacao(p_id);
end;
$$;

-- Histórico das decisões semanais
create function private.ops_envio_aprovacoes_impl(f jsonb)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.ops_need('ops.envios');
  return (select coalesce(jsonb_agg(x order by (x ->> 'semana') desc, (x ->> 'id')::bigint desc), '[]') from (
    select jsonb_build_object('id', a.id, 'envio_id', a.envio_id, 'envio_nome', e.nome, 'semana', a.semana, 'decisao', a.decisao,
             'versao_envio', a.versao_envio, 'decidido_em', a.decidido_em, 'decidido_por_nome', p.full_name, 'origem', a.origem) as x
      from public.ops_envio_aprovacoes a
      join public.ops_envios e on e.id = a.envio_id
      left join public.profiles p on p.id = a.decidido_por
     where (nullif(f ->> 'envio_id', '') is null or a.envio_id = (f ->> 'envio_id')::uuid)
     order by a.semana desc, a.id desc
     limit 200) t);
end;
$$;

-- Fecha a semana sem resposta (roda a cada 15 minutos): passou do horário e ninguém decidiu.
create function private.envio_fechar_sem_resposta()
returns integer language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  insert into public.ops_envio_aprovacoes (envio_id, semana, decisao, versao_envio, origem)
  select e.id, (private.envio_hoje() ->> 'semana')::date, 'sem_resposta', e.versao, 'sistema'
    from public.ops_envios e
   where private.envio_situacao(e.id) ->> 'situacao_hoje' = 'nao_aprovado_a_tempo'
     and not exists (select 1 from public.ops_envio_aprovacoes a where a.envio_id = e.id and a.semana = (private.envio_hoje() ->> 'semana')::date)
  on conflict (envio_id, semana) do nothing;
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function private.envio_fechar_sem_resposta() from public, anon, authenticated;
select cron.schedule('envios-sem-resposta', '*/15 * * * *', $cron$select private.envio_fechar_sem_resposta()$cron$);

-- "Enviado" registrado pelo agente (MCP) só vale com a aprovação desta semana, na versão aprovada.
create or replace function private.ops_envio_execucao_add_impl(p_envio uuid, p_cliente uuid, p_status text, p_detalhe text, p_executado_em timestamptz)
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
  if p_status = 'enviado' and private.request_from_mcp()
     and not coalesce((private.envio_situacao(p_envio) -> 'aprovacao' ->> 'valida')::boolean, false) then
    raise exception 'Este envio não foi aprovado nesta semana: não envie.' using errcode = '22023';
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

revoke all on function private.ops_envio_pendentes_impl(), private.ops_envio_decidir_impl(uuid, integer, boolean), private.ops_envio_aprovacoes_impl(jsonb)
  from public, anon;
grant execute on function private.ops_envio_pendentes_impl(), private.ops_envio_decidir_impl(uuid, integer, boolean), private.ops_envio_aprovacoes_impl(jsonb)
  to authenticated;

create function public.ops_envio_pendentes()
returns jsonb language sql set search_path = '' as $$ select private.ops_envio_pendentes_impl() $$;
create function public.ops_envio_decidir(p_id uuid, p_versao integer, p_aprovar boolean)
returns jsonb language sql set search_path = '' as $$ select private.ops_envio_decidir_impl(p_id, p_versao, p_aprovar) $$;
create function public.ops_envio_aprovacoes(f jsonb default '{}')
returns jsonb language sql set search_path = '' as $$ select private.ops_envio_aprovacoes_impl(f) $$;
revoke all on function public.ops_envio_pendentes(), public.ops_envio_decidir(uuid, integer, boolean), public.ops_envio_aprovacoes(jsonb) from public, anon;
grant execute on function public.ops_envio_pendentes(), public.ops_envio_decidir(uuid, integer, boolean), public.ops_envio_aprovacoes(jsonb) to authenticated;
