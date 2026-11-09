-- T5.21 (09/11/2026): só envio automático + aprovação fora do prazo.
-- Pedido do Ander: o envio manual ("Enviar agora") sai; o envio automático continua exigindo a aprovação da semana, mas,
-- se a aprovação não saiu no horário, ela pode ser dada depois (até o fim da semana) sem mudar o dia nem a hora do envio:
-- aprovando fora do prazo, o envio sai logo para quem ainda não recebeu nesta semana.
-- Vale só para os envios AUTOMÁTICOS; os envios feitos pelo Claude (MCP) seguem a regra antiga (aprovar no dia, até o horário).

-- 1) Momento em que o envio é "devido" nesta semana (dia da semana + horário, em Brasília) e quando ele pode começar a sair.
create function private.envio_devido_em(p_dia integer, p_horario time)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select ((date_trunc('week', now() at time zone 'America/Sao_Paulo')::date + ((p_dia + 6) % 7)) + p_horario) at time zone 'America/Sao_Paulo'
$$;

-- Início da janela de envio (3 horas): o horário do envio ou, se a aprovação veio depois, o momento da aprovação. Null se não há aprovação válida.
create function private.envio_inicio_envio(p_envio uuid)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select greatest(private.envio_devido_em(e.dia_semana, e.horario), a.decidido_em)
    from public.ops_envios e
    join public.ops_envio_aprovacoes a on a.envio_id = e.id and a.semana = (private.envio_hoje() ->> 'semana')::date
                                        and a.decisao = 'aprovado' and a.versao_envio = e.versao
   where e.id = p_envio
$$;
revoke all on function private.envio_devido_em(integer, time) from public, anon, authenticated;
revoke all on function private.envio_inicio_envio(uuid) from public, anon, authenticated;

-- 2) Situação do envio: nos automáticos a aprovação vale até o fim da semana.
create or replace function private.envio_situacao(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with h as (select private.envio_hoje() j),
  e as (select * from public.ops_envios where id = p_id),
  au as (select exists (select 1 from public.wa_envio_config k where k.envio_id = p_id and k.automatico) v),
  a as (select x.* from public.ops_envio_aprovacoes x, e, h where x.envio_id = e.id and x.semana = ((select j from h) ->> 'semana')::date),
  dev as (select private.envio_devido_em(e.dia_semana, e.horario) t from e)
  select jsonb_build_object(
    'semana', (select j from h) ->> 'semana',
    'aprovacao', (select jsonb_build_object('decisao', a.decisao, 'versao_envio', a.versao_envio, 'decidido_em', a.decidido_em,
                    'decidido_por_nome', (select full_name from public.profiles where id = a.decidido_por), 'origem', a.origem,
                    'valida', a.decisao = 'aprovado' and a.versao_envio = e.versao) from a, e),
    'automatico', (select v from au),
    -- automático ainda sem decisão e já passou do horário desta semana: dá para aprovar agora (e o envio sai logo)
    'aprovacao_tardia', (select v from au) and e.ativo and e.arquivado_em is null and now() >= (select t from dev)
      and not exists (select 1 from a where (a.decisao = 'aprovado' and a.versao_envio = e.versao) or a.decisao = 'recusado'),
    'situacao_hoje', case
      when not e.ativo or e.arquivado_em is not null then 'nao_hoje'
      when (select v from au) then case
        when exists (select 1 from a where a.decisao = 'aprovado' and a.versao_envio = e.versao) then 'aprovado'
        when exists (select 1 from a where a.decisao = 'recusado') then 'recusado'
        when now() >= (select t from dev) then 'nao_aprovado_a_tempo'
        when e.dia_semana <> ((select j from h) ->> 'dia_semana')::int then 'nao_hoje'
        when ((select j from h) ->> 'hora')::time >= case when e.horario <= time '07:00' then time '00:00' else time '07:00' end then 'aguardando_aprovacao'
        else 'antes_da_janela' end
      when e.dia_semana <> ((select j from h) ->> 'dia_semana')::int then 'nao_hoje'
      when exists (select 1 from a where a.decisao = 'aprovado' and a.versao_envio = e.versao) then 'aprovado'
      when exists (select 1 from a where a.decisao = 'recusado') then 'recusado'
      when ((select j from h) ->> 'hora')::time >= e.horario then 'nao_aprovado_a_tempo'
      when ((select j from h) ->> 'hora')::time >= case when e.horario <= time '07:00' then time '00:00' else time '07:00' end then 'aguardando_aprovacao'
      else 'antes_da_janela' end,
    'pode_enviar_agora', e.ativo and e.arquivado_em is null and e.dia_semana = ((select j from h) ->> 'dia_semana')::int
      and ((select j from h) ->> 'hora')::time >= e.horario
      and exists (select 1 from a where a.decisao = 'aprovado' and a.versao_envio = e.versao)
      -- envio automático sai pelo WhatsApp conectado: o Claude no navegador não recebe como liberado
      and not (select v from au))
  from e
$$;

-- 3) Aprovar/recusar: nos automáticos também depois do horário (até o fim da semana); aprovando, já enfileira o envio.
create or replace function private.ops_envio_decidir_impl(p_id uuid, p_versao integer, p_aprovar boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_e public.ops_envios; v_sit jsonb; v_auto boolean; v_semana date := (private.envio_hoje() ->> 'semana')::date;
begin
  perform private.ops_need('ops.envios');
  select * into v_e from public.ops_envios where id = p_id for update;
  if v_e.id is null then raise exception 'Envio não encontrado.' using errcode = '22023'; end if;
  if v_e.versao <> coalesce(p_versao, -1) then
    raise exception 'O envio foi alterado depois que você abriu. Confira de novo antes de aprovar.' using errcode = '40001';
  end if;
  v_sit := private.envio_situacao(p_id);
  v_auto := coalesce((v_sit ->> 'automatico')::boolean, false);
  if v_sit ->> 'situacao_hoje' not in ('aguardando_aprovacao', 'aprovado', 'recusado')
     and not (v_auto and v_sit ->> 'situacao_hoje' = 'nao_aprovado_a_tempo') then
    raise exception 'Este envio não está esperando aprovação agora (só no dia, até o horário do envio).' using errcode = '22023';
  end if;
  if not v_auto and (private.envio_hoje() ->> 'hora')::time >= v_e.horario then
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
          jsonb_build_object('nome', v_e.nome, 'semana', v_semana, 'versao', v_e.versao,
                             'fora_do_prazo', v_auto and now() >= private.envio_devido_em(v_e.dia_semana, v_e.horario)));
  -- envio automático aprovado: já coloca na fila (o envio sai nos próximos minutos, para quem ainda não recebeu nesta semana)
  if p_aprovar and v_auto then perform private.wa_envios_enfileirar(); end if;
  return private.envio_situacao(p_id);
end;
$$;

-- 4) Pop-up de aprovação: também os automáticos que ficaram sem decisão depois do horário.
create or replace function private.ops_envio_pendentes_impl()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.ops_can('ops.envios') then return '[]'::jsonb; end if;
  return (select coalesce(jsonb_agg(private.envio_json_codigo(e.id, true) order by e.horario, e.nome), '[]')
            from public.ops_envios e
           where e.ativo and e.arquivado_em is null
             and (private.envio_situacao(e.id) ->> 'situacao_hoje' = 'aguardando_aprovacao'
                  or coalesce((private.envio_situacao(e.id) ->> 'aprovacao_tardia')::boolean, false)));
end;
$$;

-- 5) Colocar na fila: janela de 3 horas a partir do horário ou da aprovação tardia; reenvia quem foi pulado por falta de grupo.
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
                and not exists (select 1 from public.ops_envio_execucoes x where x.envio_id = e.id and x.cliente_id = oc.cliente_id
                                   and x.status = 'enviado' and x.executado_em >= (v_hoje ->> 'inicio_semana')::timestamptz)
                -- já tratado nesta semana (fila, enviado, falhou ou pulado por outro motivo); só "sem grupo" tenta de novo quando o grupo for ligado
                and not exists (select 1 from public.wa_disparos d where d.envio_id = e.id and d.cliente_id = oc.cliente_id and d.semana = v_sem
                                   and d.origem = 'automatico'
                                   and (d.status in ('pendente', 'enviando', 'enviado', 'falhou')
                                        or (d.status = 'pulado' and coalesce(d.detalhe, '') not like 'Cliente sem grupo%'))) loop
      if c.grupo_id is null then
        -- sem grupo ligado: registra "pulado" uma vez só por semana (aparece no histórico)
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

-- 6) Próximo disparo (com as marcações @ da T5.20): a janela de 3 horas conta do horário ou da aprovação tardia.
create or replace function private.wa_disparo_proximo()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.wa_disparos;
  e public.ops_envios;
  s public.wa_gateway_settings;
  v_ini timestamptz;
  v_nums text[];
  v_txt text;
begin
  select * into s from public.wa_gateway_settings where id;
  if not s.enabled or s.connection_state <> 'conectado' then return null; end if;
  -- uma mensagem presa em "enviando" por mais de 5 minutos volta para a fila
  update public.wa_disparos set status = 'pendente', atualizado_em = now() where status = 'enviando' and atualizado_em < now() - interval '5 minutes';
  -- limite por dia (Brasília): 60 mensagens
  if (select count(*) from public.wa_disparos x where x.status = 'enviado'
        and x.enviado_em >= (date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo')) >= 60 then return null; end if;
  -- ritmo: no mínimo 45 segundos entre uma mensagem e outra
  if exists (select 1 from public.wa_disparos x where x.status in ('enviando', 'enviado') and coalesce(x.enviado_em, x.atualizado_em) > now() - interval '45 seconds') then return null; end if;
  loop
    select * into d from public.wa_disparos x where x.status = 'pendente' order by x.created_at, x.id for update skip locked limit 1;
    if d.id is null then return null; end if;
    select * into e from public.ops_envios where id = d.envio_id;
    if e.arquivado_em is not null or not e.ativo then
      perform private.wa_disparo_fechar(d.id, 'pulado', 'Envio arquivado ou pausado.'); continue;
    end if;
    if d.origem = 'automatico' then
      if private.envio_situacao(e.id) ->> 'situacao_hoje' <> 'aprovado' then
        perform private.wa_disparo_fechar(d.id, 'pulado', 'A aprovação da semana não vale mais (envio editado ou recusado).'); continue;
      end if;
      v_ini := private.envio_inicio_envio(e.id);
      if v_ini is null or now() >= v_ini + interval '3 hours' then
        perform private.wa_disparo_fechar(d.id, 'pulado', 'Passou do prazo do envio (3 horas depois do horário ou da aprovação).'); continue;
      end if;
    end if;
    update public.wa_disparos set status = 'enviando', tentativas = tentativas + 1, atualizado_em = now() where id = d.id;
    v_nums := private.wa_marcacoes_do_envio(d.envio_id, d.cliente_id);
    v_txt := e.mensagem;
    if cardinality(v_nums) > 0 then
      v_txt := v_txt || E'\n\n' || (select string_agg('@' || x, ' ' order by n) from unnest(v_nums) with ordinality t(x, n));
    end if;
    return jsonb_build_object('id', d.id, 'grupo_id', d.grupo_id, 'mensagem', v_txt, 'mentioned', to_jsonb(v_nums), 'tentativa', d.tentativas + 1);
  end loop;
end;
$$;

-- 7) O envio manual sai: funções "Enviar agora" removidas (o histórico de disparos antigos continua).
drop function public.wa_envio_enviar_agora(uuid, uuid[], boolean);
drop function private.wa_envio_enviar_agora_impl(uuid, uuid[], boolean);
