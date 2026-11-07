-- Etapa 44.3 (07/11/2026) — disparos pelo WhatsApp conectado (API não oficial), sem marcar pessoas (@).
-- Duas formas, as duas com a trava geral (wa_gateway_settings.enabled) e com o ritmo de 1 mensagem por minuto:
--   AUTOMÁTICO: o envio marcado como "automático" sai sozinho, no horário, só se a aprovação da semana vale
--               (até 3 horas depois do horário); manda para o grupo ligado de cada cliente que ainda não recebeu na semana.
--   MANUAL: "Enviar agora" para os clientes que você escolher (a escolha é a sua confirmação; fica registrada).
-- Cada resultado entra no histórico que já existe (ops_envio_execucoes) com origem "whatsapp".
-- Trava contra envio duplo: envio automático deixa de aparecer como "liberado" para o Claude no navegador
-- e o Claude não consegue registrar "enviado" nele.

-- ---------------------------------------------------------------- Histórico aceita a origem "whatsapp"
alter table public.ops_envio_execucoes drop constraint ops_envio_execucoes_origem_check;
alter table public.ops_envio_execucoes add constraint ops_envio_execucoes_origem_check check (origem in ('manual', 'mcp', 'whatsapp'));

-- ---------------------------------------------------------------- Quais envios saem sozinhos
create table public.wa_envio_config (
  envio_id    uuid primary key references public.ops_envios (id),
  automatico  boolean not null default false,
  updated_by  uuid references auth.users (id),
  updated_at  timestamptz not null default now()
);
comment on table public.wa_envio_config is 'Etapa 44.3: por envio, se ele sai sozinho pelo WhatsApp conectado (automatico). Sem linha = não (segue pelo Claude no navegador).';
create index wa_envio_config_updated_by_idx on public.wa_envio_config (updated_by);
alter table public.wa_envio_config enable row level security;
revoke all on public.wa_envio_config from anon, authenticated;
grant select on public.wa_envio_config to authenticated;
create policy "Envios semanais: quem tem a permissão vê" on public.wa_envio_config for select to authenticated
  using ((select private.ops_can('ops.envios')));

-- ---------------------------------------------------------------- Cada mensagem a enviar (fila e resultado)
create table public.wa_disparos (
  id             bigint generated always as identity primary key,
  envio_id       uuid not null references public.ops_envios (id),
  cliente_id     uuid not null references public.clients (id),
  grupo_id       text not null check (grupo_id ~ '^[0-9A-Za-z._-]{5,60}@g\.us$'),
  semana         date not null,
  origem         text not null check (origem in ('automatico', 'manual')),
  status         text not null default 'pendente' check (status in ('pendente', 'enviando', 'enviado', 'falhou', 'pulado')),
  tentativas     integer not null default 0,
  versao_envio   integer not null,
  detalhe        text check (char_length(detalhe) <= 300),
  criado_por     uuid references auth.users (id),
  created_at     timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),
  enviado_em     timestamptz
);
comment on table public.wa_disparos is 'Etapa 44.3: cada mensagem de envio semanal a mandar pelo WhatsApp conectado (fila e resultado). Guarda só ids e status; o texto da mensagem fica no envio. Permanente.';
create unique index wa_disparos_ativo_uk on public.wa_disparos (envio_id, cliente_id) where status in ('pendente', 'enviando');
create index wa_disparos_fila_idx on public.wa_disparos (created_at, id) where status = 'pendente';
create index wa_disparos_semana_idx on public.wa_disparos (semana desc, envio_id);
create index wa_disparos_cliente_idx on public.wa_disparos (cliente_id);
create index wa_disparos_criado_por_idx on public.wa_disparos (criado_por);
alter table public.wa_disparos enable row level security;
revoke all on public.wa_disparos from anon, authenticated;
grant select on public.wa_disparos to authenticated;
create policy "Envios semanais: quem tem a permissão vê os disparos" on public.wa_disparos for select to authenticated
  using ((select private.ops_can('ops.envios')));

-- ---------------------------------------------------------------- Trava contra envio duplo (mesma função, só o "pode enviar agora" muda)
create or replace function private.envio_situacao(p_id uuid)
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
      and exists (select 1 from a where a.decisao = 'aprovado' and a.versao_envio = e.versao)
      -- envio automático sai pelo WhatsApp conectado: o Claude no navegador não recebe como liberado
      and not exists (select 1 from public.wa_envio_config k where k.envio_id = e.id and k.automatico))
  from e
$$;

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
  if p_status = 'enviado' and private.request_from_mcp()
     and exists (select 1 from public.wa_envio_config k where k.envio_id = p_envio and k.automatico) then
    raise exception 'Este envio é enviado sozinho pelo WhatsApp conectado: não envie pelo navegador.' using errcode = '22023';
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

-- ---------------------------------------------------------------- Ligar/desligar o modo automático de um envio
create function private.wa_envio_set_automatico_impl(p_envio uuid, p_on boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.ops_need('ops.envios');
  if not exists (select 1 from public.ops_envios e where e.id = p_envio and e.arquivado_em is null) then
    raise exception 'Envio não encontrado ou arquivado.' using errcode = '22023';
  end if;
  insert into public.wa_envio_config (envio_id, automatico, updated_by) values (p_envio, coalesce(p_on, false), (select auth.uid()))
  on conflict (envio_id) do update set automatico = excluded.automatico, updated_by = excluded.updated_by, updated_at = now();
  insert into public.audit_logs (actor_id, action, target_type, target_id, details)
  values ((select auth.uid()), 'wa_envio.automatico', 'ops_envio', p_envio::text, jsonb_build_object('automatico', coalesce(p_on, false)));
end;
$$;
revoke all on function private.wa_envio_set_automatico_impl(uuid, boolean) from public, anon;
grant execute on function private.wa_envio_set_automatico_impl(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------- Fechar um disparo (e registrar no histórico de envios)
create function private.wa_disparo_fechar(p_id bigint, p_status text, p_detalhe text)
returns void language plpgsql security definer set search_path = '' as $$
declare d public.wa_disparos;
begin
  select * into d from public.wa_disparos where id = p_id for update;
  if d.id is null then return; end if;
  update public.wa_disparos
     set status = p_status, detalhe = left(p_detalhe, 300), atualizado_em = now(),
         enviado_em = case when p_status = 'enviado' then now() else enviado_em end
   where id = p_id;
  insert into public.ops_envio_execucoes (envio_id, cliente_id, status, detalhe, registrado_por, origem)
  values (d.envio_id, d.cliente_id, p_status, left(p_detalhe, 1000), d.criado_por, 'whatsapp');
end;
$$;
revoke all on function private.wa_disparo_fechar(bigint, text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------- Automático: enfileirar o que está no horário e aprovado (agendador)
create function private.wa_envios_enfileirar()
returns integer language plpgsql security definer set search_path = '' as $$
declare
  e record;
  c record;
  v_hoje jsonb := private.envio_hoje();
  v_sem date := (v_hoje ->> 'semana')::date;
  v_min integer := split_part(v_hoje ->> 'hora', ':', 1)::int * 60 + split_part(v_hoje ->> 'hora', ':', 2)::int;
  v_h integer;
  v_n integer := 0;
  v_rows integer;
begin
  if not coalesce((select s.enabled from public.wa_gateway_settings s where s.id), false) then return 0; end if;
  for e in select x.* from public.ops_envios x join public.wa_envio_config k on k.envio_id = x.id and k.automatico
            where x.ativo and x.arquivado_em is null and x.dia_semana = (v_hoje ->> 'dia_semana')::int
              and private.envio_situacao(x.id) ->> 'situacao_hoje' = 'aprovado' loop
    v_h := extract(hour from e.horario)::int * 60 + extract(minute from e.horario)::int;
    continue when v_min < v_h or v_min >= v_h + 180;   -- do horário até 3 horas depois
    for c in select oc.cliente_id, g.grupo_id
               from public.ops_envio_clientes oc
               join public.clients cl on cl.id = oc.cliente_id and cl.excluded_at is null and private.client_is_active(cl.id)
               left join public.wa_grupos g on g.cliente_id = oc.cliente_id and g.desvinculado_em is null
              where oc.envio_id = e.id and oc.ativo and oc.removido_em is null
                and not exists (select 1 from public.ops_envio_execucoes x where x.envio_id = e.id and x.cliente_id = oc.cliente_id
                                   and x.status = 'enviado' and x.executado_em >= (v_hoje ->> 'inicio_semana')::timestamptz)
                and not exists (select 1 from public.wa_disparos d where d.envio_id = e.id and d.cliente_id = oc.cliente_id and d.semana = v_sem
                                   and d.origem = 'automatico') loop
      if c.grupo_id is null then
        -- sem grupo ligado: registra "pulado" uma vez só (aparece no histórico)
        insert into public.wa_disparos (envio_id, cliente_id, grupo_id, semana, origem, status, versao_envio, detalhe)
        select e.id, c.cliente_id, '000000@g.us', v_sem, 'automatico', 'pulado', e.versao, 'Cliente sem grupo do WhatsApp ligado.'
        on conflict do nothing;
        insert into public.ops_envio_execucoes (envio_id, cliente_id, status, detalhe, origem)
        values (e.id, c.cliente_id, 'pulado', 'Cliente sem grupo do WhatsApp ligado.', 'whatsapp');
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
revoke all on function private.wa_envios_enfileirar() from public, anon, authenticated;

-- ---------------------------------------------------------------- Manual: "Enviar agora" para os clientes escolhidos
create function private.wa_envio_enviar_agora_impl(p_envio uuid, p_clientes uuid[], p_reenviar boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  e public.ops_envios;
  v_hoje jsonb := private.envio_hoje();
  v_sem date := (v_hoje ->> 'semana')::date;
  cid uuid;
  v_nome text;
  v_grupo text;
  v_ok integer := 0;
  v_puladas jsonb := '[]'::jsonb;
begin
  perform private.ops_need('ops.envios');
  if not coalesce((select s.enabled from public.wa_gateway_settings s where s.id), false) then
    raise exception 'Os envios automáticos estão desligados. Ligue em Configurações → Integrações (com o WhatsApp conectado).' using errcode = '22023';
  end if;
  select * into e from public.ops_envios where id = p_envio and arquivado_em is null;
  if e.id is null then raise exception 'Envio não encontrado ou arquivado.' using errcode = '22023'; end if;
  if cardinality(coalesce(p_clientes, '{}')) = 0 then raise exception 'Escolha ao menos um cliente.' using errcode = '22023'; end if;
  foreach cid in array p_clientes loop
    select cl.name into v_nome from public.clients cl where cl.id = cid;
    if not exists (select 1 from public.ops_envio_clientes oc where oc.envio_id = p_envio and oc.cliente_id = cid and oc.ativo and oc.removido_em is null) then
      v_puladas := v_puladas || jsonb_build_object('cliente_id', cid, 'nome', v_nome, 'motivo', 'Cliente não está ativo neste envio.');
      continue;
    end if;
    select g.grupo_id into v_grupo from public.wa_grupos g where g.cliente_id = cid and g.desvinculado_em is null;
    if v_grupo is null then
      v_puladas := v_puladas || jsonb_build_object('cliente_id', cid, 'nome', v_nome, 'motivo', 'Sem grupo do WhatsApp ligado.');
      continue;
    end if;
    if not p_reenviar and exists (select 1 from public.ops_envio_execucoes x where x.envio_id = p_envio and x.cliente_id = cid and x.status = 'enviado'
                                     and x.executado_em >= (v_hoje ->> 'inicio_semana')::timestamptz) then
      v_puladas := v_puladas || jsonb_build_object('cliente_id', cid, 'nome', v_nome, 'motivo', 'Já recebeu nesta semana.');
      continue;
    end if;
    if exists (select 1 from public.wa_disparos d where d.envio_id = p_envio and d.cliente_id = cid and d.status in ('pendente', 'enviando')) then
      v_puladas := v_puladas || jsonb_build_object('cliente_id', cid, 'nome', v_nome, 'motivo', 'Já está na fila.');
      continue;
    end if;
    insert into public.wa_disparos (envio_id, cliente_id, grupo_id, semana, origem, versao_envio, criado_por)
    values (p_envio, cid, v_grupo, v_sem, 'manual', e.versao, (select auth.uid()));
    v_ok := v_ok + 1;
  end loop;
  insert into public.audit_logs (actor_id, action, target_type, target_id, details)
  values ((select auth.uid()), 'wa_envio.enviar_agora', 'ops_envio', p_envio::text, jsonb_build_object('enfileirados', v_ok, 'pulados', jsonb_array_length(v_puladas), 'reenviar', coalesce(p_reenviar, false)));
  return jsonb_build_object('enfileirados', v_ok, 'pulados', v_puladas);
end;
$$;
revoke all on function private.wa_envio_enviar_agora_impl(uuid, uuid[], boolean) from public, anon;
grant execute on function private.wa_envio_enviar_agora_impl(uuid, uuid[], boolean) to authenticated;

-- ---------------------------------------------------------------- Servidor: pegar o próximo da fila (um por vez, com ritmo e limites) e anotar o resultado
create function private.wa_disparo_proximo()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  d public.wa_disparos;
  e public.ops_envios;
  s public.wa_gateway_settings;
  v_hoje jsonb := private.envio_hoje();
  v_min integer := split_part(v_hoje ->> 'hora', ':', 1)::int * 60 + split_part(v_hoje ->> 'hora', ':', 2)::int;
  v_h integer;
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
        perform private.wa_disparo_fechar(d.id, 'pulado', 'A aprovação da semana não vale mais (envio editado, recusado ou outro dia).'); continue;
      end if;
      v_h := extract(hour from e.horario)::int * 60 + extract(minute from e.horario)::int;
      if v_min >= v_h + 180 then
        perform private.wa_disparo_fechar(d.id, 'pulado', 'Passou do prazo do envio (3 horas depois do horário).'); continue;
      end if;
    end if;
    update public.wa_disparos set status = 'enviando', tentativas = tentativas + 1, atualizado_em = now() where id = d.id;
    return jsonb_build_object('id', d.id, 'grupo_id', d.grupo_id, 'mensagem', e.mensagem, 'tentativa', d.tentativas + 1);
  end loop;
end;
$$;
revoke all on function private.wa_disparo_proximo() from public, anon, authenticated;
grant execute on function private.wa_disparo_proximo() to service_role;

create function private.wa_disparo_resultado(p_id bigint, p_ok boolean, p_detalhe text, p_retry boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare t integer;
begin
  select tentativas into t from public.wa_disparos where id = p_id and status = 'enviando';
  if t is null then return; end if;
  if p_ok then
    perform private.wa_disparo_fechar(p_id, 'enviado', 'Enviado pelo WhatsApp conectado.');
  elsif p_retry and t < 2 then
    update public.wa_disparos set status = 'pendente', detalhe = left(p_detalhe, 300), atualizado_em = now() where id = p_id;
  else
    perform private.wa_disparo_fechar(p_id, 'falhou', coalesce(nullif(left(p_detalhe, 300), ''), 'Não foi possível enviar.'));
  end if;
end;
$$;
revoke all on function private.wa_disparo_resultado(bigint, boolean, text, boolean) from public, anon, authenticated;
grant execute on function private.wa_disparo_resultado(bigint, boolean, text, boolean) to service_role;

-- ---------------------------------------------------------------- Funções públicas finas
create function public.wa_envio_set_automatico(p_envio uuid, p_on boolean)
returns void language sql set search_path = '' as $$ select private.wa_envio_set_automatico_impl(p_envio, p_on) $$;
create function public.wa_envio_enviar_agora(p_envio uuid, p_clientes uuid[], p_reenviar boolean default false)
returns jsonb language sql set search_path = '' as $$ select private.wa_envio_enviar_agora_impl(p_envio, p_clientes, p_reenviar) $$;
create function public.wa_disparo_proximo()
returns jsonb language sql set search_path = '' as $$ select private.wa_disparo_proximo() $$;
create function public.wa_disparo_resultado(p_id bigint, p_ok boolean, p_detalhe text default null, p_retry boolean default false)
returns void language sql set search_path = '' as $$ select private.wa_disparo_resultado(p_id, p_ok, p_detalhe, p_retry) $$;
revoke all on function public.wa_envio_set_automatico(uuid, boolean) from public, anon;
revoke all on function public.wa_envio_enviar_agora(uuid, uuid[], boolean) from public, anon;
revoke all on function public.wa_disparo_proximo() from public, anon, authenticated;
revoke all on function public.wa_disparo_resultado(bigint, boolean, text, boolean) from public, anon, authenticated;
grant execute on function public.wa_envio_set_automatico(uuid, boolean) to authenticated;
grant execute on function public.wa_envio_enviar_agora(uuid, uuid[], boolean) to authenticated;
grant execute on function public.wa_disparo_proximo() to service_role;
grant execute on function public.wa_disparo_resultado(bigint, boolean, text, boolean) to service_role;

-- ---------------------------------------------------------------- Agendador: a cada minuto enfileira o que está no horário e chama o servidor se houver fila
create function private.trigger_wa_send()
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_url text := (select value from private.app_settings where key = 'functions_url');
  v_secret text := (select decrypted_secret from vault.decrypted_secrets where name = 'sync_cron_secret');
begin
  if not coalesce((select s.enabled from public.wa_gateway_settings s where s.id), false) then return; end if;
  perform private.wa_envios_enfileirar();
  if v_url is null or v_secret is null then return; end if;
  if not exists (select 1 from public.wa_disparos d where d.status in ('pendente', 'enviando')) then return; end if;
  perform net.http_post(
    url := v_url || '/wa-send',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret),
    body := jsonb_build_object('action', 'tick'),
    timeout_milliseconds := 60000
  );
end;
$$;
revoke all on function private.trigger_wa_send() from public, anon, authenticated;
select cron.schedule('wa-send', '* * * * *', $cron$select private.trigger_wa_send()$cron$);
