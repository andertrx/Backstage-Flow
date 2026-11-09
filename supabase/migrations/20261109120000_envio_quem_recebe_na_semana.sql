-- T5.22 Fase 2: "Quem recebe hoje" — escolha, por semana, de quais clientes recebem cada envio. Sem linha = recebe (padrão).
-- A cada semana volta ao padrão (a escolha vale só para a semana em que foi feita).
create table public.ops_envio_semana_clientes (
  id           bigint generated always as identity primary key,
  envio_id     uuid not null references public.ops_envios (id),
  cliente_id   uuid not null references public.clients (id),
  semana       date not null,
  receber      boolean not null,
  escolhido_por uuid references auth.users (id),
  escolhido_em timestamptz not null default now(),
  unique (envio_id, cliente_id, semana)
);
comment on table public.ops_envio_semana_clientes is 'T5.22: quem recebe o envio nesta semana (semana = segunda-feira, Brasília). Só guarda as escolhas que fogem do padrão (padrão = todos os clientes ativos do envio recebem). Quem escolheu e quando. Guardada sem prazo.';
create index ops_envio_semana_clientes_semana_idx on public.ops_envio_semana_clientes (semana desc);
create index ops_envio_semana_clientes_cliente_idx on public.ops_envio_semana_clientes (cliente_id);
create index ops_envio_semana_clientes_user_idx on public.ops_envio_semana_clientes (escolhido_por);
alter table public.ops_envio_semana_clientes enable row level security;
revoke all on table public.ops_envio_semana_clientes from anon, authenticated;
grant select on table public.ops_envio_semana_clientes to authenticated;
create policy "Envios semanais: quem tem a permissão vê quem recebe" on public.ops_envio_semana_clientes for select to authenticated
  using ((select private.ops_can('ops.envios')));

create function private.ops_envio_semana_set_impl(p_envio uuid, p_clientes jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_e public.ops_envios; v_semana date := (private.envio_hoje() ->> 'semana')::date; x jsonb; v_cli uuid; v_rec boolean; d record; v_n integer := 0;
begin
  perform private.ops_need('ops.envios');
  select * into v_e from public.ops_envios where id = p_envio;
  if v_e.id is null then raise exception 'Envio não encontrado.' using errcode = '22023'; end if;
  if p_clientes is null or jsonb_typeof(p_clientes) <> 'array' or jsonb_array_length(p_clientes) > 500 then
    raise exception 'Lista de clientes inválida.' using errcode = '22023';
  end if;
  for x in select * from jsonb_array_elements(p_clientes) loop
    v_cli := (x ->> 'cliente_id')::uuid; v_rec := coalesce((x ->> 'receber')::boolean, true);
    if not exists (select 1 from public.ops_envio_clientes c where c.envio_id = p_envio and c.cliente_id = v_cli and c.removido_em is null) then
      raise exception 'Este cliente não faz parte deste envio.' using errcode = '22023';
    end if;
    if v_rec then
      delete from public.ops_envio_semana_clientes where envio_id = p_envio and cliente_id = v_cli and semana = v_semana;
    else
      insert into public.ops_envio_semana_clientes (envio_id, cliente_id, semana, receber, escolhido_por)
      values (p_envio, v_cli, v_semana, false, (select auth.uid()))
      on conflict (envio_id, cliente_id, semana) do update set receber = false, escolhido_por = excluded.escolhido_por, escolhido_em = now();
      -- o que ainda estava na fila para este cliente não sai
      for d in select id from public.wa_disparos where envio_id = p_envio and cliente_id = v_cli and semana = v_semana and origem = 'automatico' and status = 'pendente' loop
        perform private.wa_disparo_fechar(d.id, 'pulado', 'Desmarcado para esta semana.');
        v_n := v_n + 1;
      end loop;
    end if;
  end loop;
  insert into public.audit_logs (actor_id, action, target_type, target_id, details)
  values ((select auth.uid()), 'ops.envio.quem_recebe', 'ops_envio', p_envio::text, jsonb_build_object('semana', v_semana, 'clientes', jsonb_array_length(p_clientes), 'tirados_da_fila', v_n));
  return private.envio_json_codigo(p_envio, false);
end;
$$;
revoke all on function private.ops_envio_semana_set_impl(uuid, jsonb) from public, anon, authenticated;
grant execute on function private.ops_envio_semana_set_impl(uuid, jsonb) to authenticated;
create function public.ops_envio_semana_set(p_envio uuid, p_clientes jsonb)
returns jsonb language sql set search_path = '' as $$ select private.ops_envio_semana_set_impl(p_envio, p_clientes) $$;
revoke all on function public.ops_envio_semana_set(uuid, jsonb) from public, anon;
grant execute on function public.ops_envio_semana_set(uuid, jsonb) to authenticated;

-- O envio mostra, por cliente, se recebe nesta semana.
create or replace function private.envio_json(p_id uuid, p_so_ativos boolean)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
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
        'recebe_hoje', coalesce((select s.receber from public.ops_envio_semana_clientes s
                                  where s.envio_id = e.id and s.cliente_id = c.cliente_id and s.semana = ((select j from h) ->> 'semana')::date), true),
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

-- A fila automática pula quem foi desmarcado nesta semana (e volta a enfileirar se for marcado de novo).
create or replace function private.wa_envios_enfileirar()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  e record;
  c record;
  v_hoje jsonb := private.envio_hoje();
  v_sem date := (v_hoje ->> 'semana')::date;
  v_ini timestamptz;
  v_n integer := 0;
  v_rows integer;
begin
  if not coalesce((select s.enabled from public.wa_gateway_settings s where s.id), false) then return 0; end if;
  for e in select x.* from public.ops_envios x join public.wa_envio_config k on k.envio_id = x.id and k.automatico
            where x.ativo and x.arquivado_em is null
              and private.envio_situacao(x.id) ->> 'situacao_hoje' = 'aprovado' loop
    v_ini := private.envio_inicio_envio(e.id);
    continue when v_ini is null or now() < v_ini or now() >= v_ini + interval '3 hours';
    for c in select oc.cliente_id, g.grupo_id
               from public.ops_envio_clientes oc
               join public.clients cl on cl.id = oc.cliente_id and cl.excluded_at is null and private.client_is_active(cl.id)
               left join public.wa_grupos g on g.cliente_id = oc.cliente_id and g.desvinculado_em is null
              where oc.envio_id = e.id and oc.ativo and oc.removido_em is null
                and not exists (select 1 from public.ops_envio_semana_clientes s where s.envio_id = e.id and s.cliente_id = oc.cliente_id
                                   and s.semana = v_sem and not s.receber)
                and not exists (select 1 from public.ops_envio_execucoes x where x.envio_id = e.id and x.cliente_id = oc.cliente_id
                                   and x.status = 'enviado' and x.executado_em >= (v_hoje ->> 'inicio_semana')::timestamptz)
                and not exists (select 1 from public.wa_disparos d where d.envio_id = e.id and d.cliente_id = oc.cliente_id and d.semana = v_sem
                                   and d.origem = 'automatico'
                                   and (d.status in ('pendente', 'enviando', 'enviado', 'falhou')
                                        or (d.status = 'pulado' and coalesce(d.detalhe, '') not like 'Cliente sem grupo%'
                                            and coalesce(d.detalhe, '') not like 'Desmarcado%'))) loop
      if c.grupo_id is null then
        if not exists (select 1 from public.wa_disparos d where d.envio_id = e.id and d.cliente_id = c.cliente_id and d.semana = v_sem
                          and d.origem = 'automatico' and d.status = 'pulado' and d.detalhe like 'Cliente sem grupo%') then
          insert into public.wa_disparos (envio_id, cliente_id, grupo_id, semana, origem, status, versao_envio, detalhe)
          values (e.id, c.cliente_id, '000000@g.us', v_sem, 'automatico', 'pulado', e.versao, 'Cliente sem grupo do WhatsApp ligado.');
          insert into public.ops_envio_execucoes (envio_id, cliente_id, status, detalhe, origem)
          values (e.id, c.cliente_id, 'pulado', 'Cliente sem grupo do WhatsApp ligado.', 'whatsapp');
        end if;
      else
        insert into public.wa_disparos (envio_id, cliente_id, grupo_id, semana, origem, versao_envio)
        values (e.id, c.cliente_id, c.grupo_id, v_sem, 'automatico', e.versao) on conflict do nothing;
        get diagnostics v_rows = row_count;
        v_n := v_n + v_rows;
      end if;
    end loop;
  end loop;
  return v_n;
end;
$$;
