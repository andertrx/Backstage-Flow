-- Avisos no WhatsApp POR SETOR: o administrador coloca um grupo para cada setor e escolhe os avisos de cada um.
--  • Todo setor: tarefas do setor (nova, prazo amanhã, atrasada, concluída).
--  • Gestão de Tráfego: também os alertas das contas e os casos críticos de campanhas (só ela vê essas opções).
--  • Account Manager: também o onboarding dos clientes (só ela vê essas opções).
--  • Comercial: também os leads (só ela vê essas opções).
-- O grupo de avisos que já existe (o do administrador) continua igual. Só o administrador configura.

alter table public.wa_avisos add column grupo_id text check (grupo_id is null or grupo_id ~ '^[0-9A-Za-z._-]{5,60}@g\.us$');
comment on column public.wa_avisos.grupo_id is 'Grupo de destino do aviso. Nulo = o grupo de avisos principal do administrador.';

create table public.wa_avisos_setores (
  setor_id    uuid primary key references public.ops_sectors (id),
  ativo       boolean not null default false,
  grupo_id    text check (grupo_id is null or grupo_id ~ '^[0-9A-Za-z._-]{5,60}@g\.us$'),
  grupo_nome  text check (char_length(grupo_nome) <= 200),
  tipos       text[] not null default '{}',
  ativo_desde timestamptz,
  updated_by  uuid references auth.users (id),
  updated_at  timestamptz not null default now()
);
comment on table public.wa_avisos_setores is 'Avisos no WhatsApp por setor: grupo e tipos de aviso de cada setor (uma linha por setor). Guardada permanentemente; só o administrador vê e muda.';
comment on column public.wa_avisos_setores.ativo_desde is 'Só avisa o que acontecer depois deste momento (liga, ou acrescenta um tipo novo).';
create index wa_avisos_setores_updated_by_idx on public.wa_avisos_setores (updated_by);
alter table public.wa_avisos_setores enable row level security;
revoke all on public.wa_avisos_setores from anon, authenticated;
grant select on public.wa_avisos_setores to authenticated;
create policy "Só admin vê os avisos por setor" on public.wa_avisos_setores for select to authenticated
  using ((select private.current_user_role()) = 'admin');

-- Quais tipos cada setor pode ter (as opções específicas só existem para o setor certo).
create function private.wa_setor_tipos_validos(p_nome text)
returns text[] language sql immutable set search_path = '' as $$
  select array['st:tarefa.nova', 'st:tarefa.prazo', 'st:tarefa.atrasada', 'st:tarefa.concluida']
    || case lower(btrim(coalesce(p_nome, '')))
         when 'gestão de tráfego' then array['sem_saldo', 'saldo_baixo', 'conta_restrita', 'conta_desativada', 'pagamento_pendente', 'cobranca_problema',
                                             'sem_forma_pagamento', 'sincronizacao_atrasada', 'erro_api', 'campanha_sem_entrega', 'queda_resultados', 'campanha_critica']
         when 'account manager' then array['am:cliente.fluxo', 'am:cliente.etapa', 'am:cliente.reuniao']
         when 'comercial' then array['com:lead.novo', 'com:lead.ganho', 'com:lead.perdido']
         else '{}'::text[]
       end
$$;
revoke all on function private.wa_setor_tipos_validos(text) from public, anon, authenticated;

create function private.wa_avisos_setor_save_impl(p_setor uuid, p_ativo boolean, p_grupo_id text, p_grupo_nome text, p_tipos text[])
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_nome text;
  v_old public.wa_avisos_setores;
  v_tipos text[] := coalesce(p_tipos, '{}');
begin
  if private.current_user_role() is distinct from 'admin' then
    raise exception 'Só o administrador configura os avisos por setor.' using errcode = '42501';
  end if;
  select name into v_nome from public.ops_sectors where id = p_setor and status = 'ativo';
  if v_nome is null then raise exception 'Escolha um setor ativo.' using errcode = '22023'; end if;
  if p_grupo_id is not null and p_grupo_id !~ '^[0-9A-Za-z._-]{5,60}@g\.us$' then
    raise exception 'Grupo inválido. Escolha o grupo na lista do WhatsApp.' using errcode = '22023';
  end if;
  if p_ativo and p_grupo_id is null then
    raise exception 'Escolha o grupo do setor antes de ligar.' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(v_tipos) t where t <> all (private.wa_setor_tipos_validos(v_nome))) then
    raise exception 'Este setor não tem esse tipo de aviso.' using errcode = '22023';
  end if;
  select * into v_old from public.wa_avisos_setores where setor_id = p_setor;
  insert into public.wa_avisos_setores as s (setor_id, ativo, grupo_id, grupo_nome, tipos, ativo_desde, updated_by, updated_at)
  values (p_setor, p_ativo, p_grupo_id, left(p_grupo_nome, 200), v_tipos, case when p_ativo then now() end, (select auth.uid()), now())
  on conflict (setor_id) do update set
    ativo = excluded.ativo, grupo_id = excluded.grupo_id, grupo_nome = excluded.grupo_nome, tipos = excluded.tipos,
    ativo_desde = case
      when not excluded.ativo then null
      when not coalesce(v_old.ativo, false) or v_old.ativo_desde is null then now()
      when exists (select 1 from unnest(excluded.tipos) t where t <> all (v_old.tipos)) then now()   -- tipo novo: só vale daqui para a frente
      else v_old.ativo_desde end,
    updated_by = excluded.updated_by, updated_at = excluded.updated_at;
  insert into public.audit_logs (actor_id, action, target_type, target_id, details)
  values ((select auth.uid()), 'wa_avisos.setor', 'wa_avisos_setor', p_setor::text, jsonb_build_object('setor', v_nome, 'ativo', p_ativo, 'tipos', v_tipos));
end;
$$;
revoke all on function private.wa_avisos_setor_save_impl(uuid, boolean, text, text, text[]) from public, anon;
grant execute on function private.wa_avisos_setor_save_impl(uuid, boolean, text, text, text[]) to authenticated;
create function public.wa_avisos_setor_save(p_setor uuid, p_ativo boolean, p_grupo_id text, p_grupo_nome text, p_tipos text[])
returns void language sql set search_path = '' as $$ select private.wa_avisos_setor_save_impl(p_setor, p_ativo, p_grupo_id, p_grupo_nome, p_tipos) $$;
revoke all on function public.wa_avisos_setor_save(uuid, boolean, text, text, text[]) from public, anon;
grant execute on function public.wa_avisos_setor_save(uuid, boolean, text, text, text[]) to authenticated;

-- Gera os avisos dos setores (chamada no fim de wa_avisos_gerar). Cada aviso nasce com o grupo do setor.
create function private.wa_avisos_gerar_setores()
returns integer language plpgsql security definer set search_path = '' as $$
declare
  c public.wa_avisos_config;
  s record;
  r record;
  v_n integer := 0;
  v_id bigint;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  select * into c from public.wa_avisos_config where id;
  for s in
    select ws.*, sc.name as setor_nome
      from public.wa_avisos_setores ws join public.ops_sectors sc on sc.id = ws.setor_id and sc.status = 'ativo'
     where ws.ativo and ws.grupo_id is not null and ws.ativo_desde is not null
  loop
    -- tarefas do setor
    if 'st:tarefa.nova' = any (s.tipos) then
      for r in
        select t.id, t.number, t.title, cl.name as cliente from public.ops_tasks t left join public.clients cl on cl.id = t.client_id
         where t.sector_id = s.setor_id and t.archived_at is null and t.deleted_at is null and t.parent_id is null
           and t.created_at >= s.ativo_desde and t.created_at > now() - interval '12 hours'
      loop
        v_id := null;
        insert into public.wa_avisos (chave, tipo, texto, grupo_id)
        values ('st:nova:' || r.id || ':' || s.setor_id, 'st:tarefa.nova',
                '🆕 Tarefa nova #' || r.number || ': ' || left(r.title, 200) || coalesce(' (' || left(r.cliente, 80) || ')', ''), s.grupo_id)
        on conflict (chave) do nothing returning id into v_id;
        if v_id is not null then v_n := v_n + 1; end if;
      end loop;
    end if;
    if 'st:tarefa.prazo' = any (s.tipos) then
      for r in
        select t.id, t.number, t.title, t.due_date from public.ops_tasks t join public.ops_statuses st on st.id = t.status_id
         where t.sector_id = s.setor_id and t.archived_at is null and t.deleted_at is null and st.category not in ('concluido', 'cancelado')
           and t.due_date = v_hoje + 1
      loop
        v_id := null;
        insert into public.wa_avisos (chave, tipo, texto, grupo_id)
        values ('st:prazo:' || r.id || ':' || r.due_date || ':' || s.setor_id, 'st:tarefa.prazo', '⏰ Prazo amanhã: #' || r.number || ' ' || left(r.title, 200), s.grupo_id)
        on conflict (chave) do nothing returning id into v_id;
        if v_id is not null then v_n := v_n + 1; end if;
      end loop;
    end if;
    if 'st:tarefa.atrasada' = any (s.tipos) then
      for r in
        select t.id, t.number, t.title, t.due_date from public.ops_tasks t join public.ops_statuses st on st.id = t.status_id
         where t.sector_id = s.setor_id and t.archived_at is null and t.deleted_at is null and st.category not in ('concluido', 'cancelado')
           and t.due_date < v_hoje and t.due_date >= (s.ativo_desde at time zone 'America/Sao_Paulo')::date - 1
      loop
        v_id := null;
        insert into public.wa_avisos (chave, tipo, texto, grupo_id)
        values ('st:atrasada:' || r.id || ':' || r.due_date || ':' || s.setor_id, 'st:tarefa.atrasada',
                '🚨 Atrasada desde ' || to_char(r.due_date, 'DD/MM') || ': #' || r.number || ' ' || left(r.title, 200), s.grupo_id)
        on conflict (chave) do nothing returning id into v_id;
        if v_id is not null then v_n := v_n + 1; end if;
      end loop;
    end if;
    if 'st:tarefa.concluida' = any (s.tipos) then
      for r in
        select t.id, t.number, t.title, t.completed_at from public.ops_tasks t join public.ops_statuses st on st.id = t.status_id
         where t.sector_id = s.setor_id and t.archived_at is null and t.deleted_at is null and st.category = 'concluido'
           and t.completed_at >= s.ativo_desde and t.completed_at > now() - interval '12 hours'
      loop
        v_id := null;
        insert into public.wa_avisos (chave, tipo, texto, grupo_id)
        values ('st:concluida:' || r.id || ':' || to_char(r.completed_at, 'YYYYMMDDHH24MISS') || ':' || s.setor_id, 'st:tarefa.concluida',
                '✅ Concluída: #' || r.number || ' ' || left(r.title, 200), s.grupo_id)
        on conflict (chave) do nothing returning id into v_id;
        if v_id is not null then v_n := v_n + 1; end if;
      end loop;
    end if;

    -- Gestão de Tráfego: alertas das contas e casos críticos de campanhas
    if exists (select 1 from unnest(s.tipos) t where t not like 'st:%' and t not like 'am:%' and t not like 'com:%' and t <> 'campanha_critica') then
      for r in
        select a.id, a.type, a.client_id, a.description, cl.name as cliente, pl.name as plataforma,
               floor(extract(epoch from (now() - a.first_seen_at)) / 3600 / coalesce(c.repetir_horas, 12))::int as rodada
          from public.alerts a
          join public.clients cl on cl.id = a.client_id and cl.status = 'ativo'
          left join public.platforms pl on pl.id = a.platform_id
         where a.status = 'aberto' and a.type = any (s.tipos) and a.first_seen_at >= s.ativo_desde
      loop
        v_id := null;
        insert into public.wa_avisos (chave, tipo, cliente_id, texto, grupo_id)
        values ('alerta:' || r.id || ':' || r.rodada || ':' || s.setor_id, r.type, r.client_id,
                case when r.rodada > 0 then '🔁 ' else '⚠️ ' end || r.cliente || coalesce(' (' || r.plataforma || ')', '') || ': ' || r.description, s.grupo_id)
        on conflict (chave) do nothing returning id into v_id;
        if v_id is not null then v_n := v_n + 1; end if;
      end loop;
    end if;
    if 'campanha_critica' = any (s.tipos) then
      for r in
        select m.id, m.client_id, m.explanation, cl.name as cliente, k.name as campanha,
               floor(extract(epoch from (now() - m.first_detected_at)) / 3600 / coalesce(c.repetir_horas, 12))::int as rodada
          from public.monitor_alerts m
          join public.clients cl on cl.id = m.client_id and cl.status = 'ativo'
          left join public.campaigns k on k.id = m.campaign_id
         where m.level = 'campaign' and m.severity = 'critico' and m.status not in ('resolvido', 'ignorado') and m.first_detected_at >= s.ativo_desde
      loop
        v_id := null;
        insert into public.wa_avisos (chave, tipo, cliente_id, texto, grupo_id)
        values ('campcrit:' || r.id || ':' || r.rodada || ':' || s.setor_id, 'campanha_critica', r.client_id,
                case when r.rodada > 0 then '🔁 ' else '🚨 ' end || r.cliente || coalesce(' · ' || left(r.campanha, 120), '') || ': ' || left(r.explanation, 330), s.grupo_id)
        on conflict (chave) do nothing returning id into v_id;
        if v_id is not null then v_n := v_n + 1; end if;
      end loop;
    end if;

    -- Account Manager: onboarding dos clientes
    if exists (select 1 from unnest(s.tipos) t where t like 'am:%') then
      for r in
        select a.id, a.action, a.client_id, a.after, cl.name as cliente, cs.name as etapa
          from public.ops_activity a
          join public.clients cl on cl.id = a.client_id
          left join public.ops_client_stages cs on cs.id = a.after ->> 'etapa'
         where a.created_at >= s.ativo_desde and a.created_at > now() - interval '12 hours'
           and ((a.action = 'cliente.fluxo_iniciado' and 'am:cliente.fluxo' = any (s.tipos))
             or (a.action = 'cliente.etapa' and 'am:cliente.etapa' = any (s.tipos))
             or (a.action = 'cliente.reuniao_vinculada' and 'am:cliente.reuniao' = any (s.tipos)))
      loop
        v_id := null;
        insert into public.wa_avisos (chave, tipo, cliente_id, texto, grupo_id)
        values ('am:' || r.id || ':' || s.setor_id,
                case r.action when 'cliente.fluxo_iniciado' then 'am:cliente.fluxo' when 'cliente.etapa' then 'am:cliente.etapa' else 'am:cliente.reuniao' end,
                r.client_id,
                case r.action when 'cliente.fluxo_iniciado' then '🚀 ' || left(r.cliente, 100) || ' entrou no fluxo do onboarding' || coalesce(' (' || r.etapa || ')', '')
                              when 'cliente.etapa' then '➡️ ' || left(r.cliente, 100) || ' mudou para: ' || coalesce(r.etapa, 'nova etapa')
                              else '📅 Reunião de onboarding marcada: ' || left(r.cliente, 100) end, s.grupo_id)
        on conflict (chave) do nothing returning id into v_id;
        if v_id is not null then v_n := v_n + 1; end if;
      end loop;
    end if;

    -- Comercial: leads (só o nome da empresa; contato nunca vai para o WhatsApp)
    if exists (select 1 from unnest(s.tipos) t where t like 'com:%') then
      for r in
        select l.id, l.number, l.company_name, l.created_at, l.stage_since, l.lost_at, st.category
          from public.ops_leads l join public.ops_lead_stages st on st.id = l.stage_id
         where l.deleted_at is null and l.archived_at is null
           and ((l.created_at >= s.ativo_desde and l.created_at > now() - interval '12 hours' and 'com:lead.novo' = any (s.tipos))
             or (st.category = 'ganho' and l.stage_since >= s.ativo_desde and l.stage_since > now() - interval '12 hours' and 'com:lead.ganho' = any (s.tipos))
             or (st.category = 'perdido' and coalesce(l.lost_at, l.stage_since) >= s.ativo_desde and coalesce(l.lost_at, l.stage_since) > now() - interval '12 hours' and 'com:lead.perdido' = any (s.tipos)))
      loop
        if 'com:lead.novo' = any (s.tipos) and r.created_at >= s.ativo_desde and r.created_at > now() - interval '12 hours' then
          v_id := null;
          insert into public.wa_avisos (chave, tipo, texto, grupo_id)
          values ('com:novo:' || r.id || ':' || s.setor_id, 'com:lead.novo', '🆕 Lead novo #' || r.number || ': ' || left(r.company_name, 120), s.grupo_id)
          on conflict (chave) do nothing returning id into v_id;
          if v_id is not null then v_n := v_n + 1; end if;
        end if;
        if r.category = 'ganho' and 'com:lead.ganho' = any (s.tipos) then
          v_id := null;
          insert into public.wa_avisos (chave, tipo, texto, grupo_id)
          values ('com:ganho:' || r.id || ':' || s.setor_id, 'com:lead.ganho', '🏆 Lead ganho #' || r.number || ': ' || left(r.company_name, 120), s.grupo_id)
          on conflict (chave) do nothing returning id into v_id;
          if v_id is not null then v_n := v_n + 1; end if;
        end if;
        if r.category = 'perdido' and 'com:lead.perdido' = any (s.tipos) then
          v_id := null;
          insert into public.wa_avisos (chave, tipo, texto, grupo_id)
          values ('com:perdido:' || r.id || ':' || s.setor_id, 'com:lead.perdido', '❌ Lead perdido #' || r.number || ': ' || left(r.company_name, 120), s.grupo_id)
          on conflict (chave) do nothing returning id into v_id;
          if v_id is not null then v_n := v_n + 1; end if;
        end if;
      end loop;
    end if;
  end loop;
  return v_n;
end;
$$;
revoke all on function private.wa_avisos_gerar_setores() from public, anon, authenticated;

-- O gerador passa a incluir os setores; o envio passa a olhar o grupo de cada aviso.
create or replace function private.wa_avisos_gerar()
returns integer language plpgsql security definer set search_path = '' as $$
declare
  c public.wa_avisos_config;
  r record;
  v_n integer := 0;
  v_id bigint;
begin
  select * into c from public.wa_avisos_config where id;
  -- avisos dos setores (cada um com o seu grupo) valem mesmo que o grupo principal esteja desligado
  v_n := private.wa_avisos_gerar_setores();
  if not c.ativo or c.grupo_id is null then return v_n; end if;
  -- alertas abertos (não "vistos" nem resolvidos) de clientes ativos; 1 aviso por alerta e um lembrete a cada "repetir_horas" se continuar aberto
  for r in
    select a.id, a.type, a.client_id, a.description, a.first_seen_at, cl.name as cliente, pl.name as plataforma,
           floor(extract(epoch from (now() - a.first_seen_at)) / 3600 / c.repetir_horas)::int as rodada
      from public.alerts a
      join public.clients cl on cl.id = a.client_id and cl.status = 'ativo'
      left join public.platforms pl on pl.id = a.platform_id
     where a.status = 'aberto' and a.type = any (c.tipos)
  loop
    v_id := null;
    insert into public.wa_avisos (chave, tipo, cliente_id, texto)
    values ('alerta:' || r.id || ':' || r.rodada, r.type, r.client_id,
            case when r.rodada > 0 then '🔁 ' else '⚠️ ' end || r.cliente || coalesce(' (' || r.plataforma || ')', '') || ': ' || r.description)
    on conflict (chave) do nothing returning id into v_id;
    if v_id is not null then v_n := v_n + 1; end if;
  end loop;
  -- casos críticos de CAMPANHAS (Monitoramento de Desempenho): só campanha, só crítico, só os detectados depois de ligar a opção;
  -- um aviso por caso e um lembrete a cada "repetir_horas" enquanto estiver aberto (não resolvido nem ignorado)
  if 'campanha_critica' = any (c.tipos) and c.campanha_critica_desde is not null then
    for r in
      select m.id, m.client_id, m.explanation, cl.name as cliente, k.name as campanha,
             floor(extract(epoch from (now() - m.first_detected_at)) / 3600 / c.repetir_horas)::int as rodada
        from public.monitor_alerts m
        join public.clients cl on cl.id = m.client_id and cl.status = 'ativo'
        left join public.campaigns k on k.id = m.campaign_id
       where m.level = 'campaign' and m.severity = 'critico' and m.status not in ('resolvido', 'ignorado')
         and m.first_detected_at >= c.campanha_critica_desde
    loop
      v_id := null;
      insert into public.wa_avisos (chave, tipo, cliente_id, texto)
      values ('campcrit:' || r.id || ':' || r.rodada, 'campanha_critica', r.client_id,
              case when r.rodada > 0 then '🔁 ' else '🚨 ' end || r.cliente || coalesce(' · ' || left(r.campanha, 120), '') || ': ' || left(r.explanation, 330))
      on conflict (chave) do nothing returning id into v_id;
      if v_id is not null then v_n := v_n + 1; end if;
    end loop;
  end if;
  -- envio esperando aprovação: só a "última chamada" (10 min antes do horário)
  if 'envio_aprovar' = any (c.tipos) then
    for r in
      select a.id, e.codigo, e.nome, e.horario
        from public.ops_envio_avisos a join public.ops_envios e on e.id = a.envio_id
       where a.momento = 'fim' and a.created_at >= c.ativo_desde and a.created_at > now() - interval '3 hours'
       group by a.id, e.codigo, e.nome, e.horario
    loop
      v_id := null;
      insert into public.wa_avisos (chave, tipo, texto)
      values ('envio:' || r.id, 'envio_aprovar', '📨 Última chamada: aprove o envio ' || r.codigo || ' · ' || r.nome || ' até ' || to_char(r.horario, 'HH24:MI') || ' ou ele não sai.')
      on conflict (chave) do nothing returning id into v_id;
      if v_id is not null then v_n := v_n + 1; end if;
    end loop;
  end if;
  -- notificações do sino (tarefas, reuniões, clientes, leads) do administrador que configurou: só as dos tipos escolhidos e novas
  if c.notif_usuario_id is not null and exists (select 1 from unnest(c.tipos) t where t like 'n:%') then
    for r in
      select n.id, n.kind, n.title, n.body
        from public.ops_notifications n
       where n.user_id = c.notif_usuario_id and ('n:' || n.kind) = any (c.tipos)
         and n.created_at > now() - interval '12 hours'
    loop
      v_id := null;
      insert into public.wa_avisos (chave, tipo, texto)
      values ('notif:' || r.id, 'n:' || r.kind,
              case r.kind when 'tarefa.atribuida' then '📌 ' when 'tarefa.mencao' then '💬 ' when 'tarefa.comentario' then '💬 ' when 'tarefa.concluida' then '✅ '
                          when 'tarefa.prazo' then '⏰ ' when 'tarefa.atrasada' then '🚨 ' when 'cliente.am' then '👤 ' when 'lead.responsavel' then '👤 ' else '📅 ' end
              || left(r.title, 200) || coalesce(' — ' || left(r.body, 250), ''))
      on conflict (chave) do nothing returning id into v_id;
      if v_id is not null then v_n := v_n + 1; end if;
    end loop;
  end if;
  return v_n;
end;
$$;

-- Envio por grupo: cada mensagem vai para UM grupo (o do setor ou o principal), com as regras de antes (silêncio, 1 a cada 2 min e 40 por dia, por grupo).
create or replace function private.wa_aviso_proximo()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  c public.wa_avisos_config;
  s public.wa_gateway_settings;
  v_h integer := extract(hour from now() at time zone 'America/Sao_Paulo')::int;
  v_grupo text;
  v_ids bigint[];
  v_txt text;
begin
  select * into s from public.wa_gateway_settings where id;
  select * into c from public.wa_avisos_config where id;
  if not s.enabled or s.connection_state <> 'conectado' then return null; end if;
  -- avisos velhos (mais de 24 h) não valem mais
  update public.wa_avisos set status = 'pulado', detalhe = 'Passou de 24 horas sem poder enviar.' where status = 'pendente' and created_at < now() - interval '24 hours';
  update public.wa_avisos set status = 'pendente', atualizado_em = now() where status = 'enviando' and atualizado_em < now() - interval '10 minutes';
  -- horário de silêncio (Brasília): guarda e manda depois
  if (c.silencio_inicio <= c.silencio_fim and v_h >= c.silencio_inicio and v_h < c.silencio_fim)
     or (c.silencio_inicio > c.silencio_fim and (v_h >= c.silencio_inicio or v_h < c.silencio_fim)) then return null; end if;
  -- grupo da vez: o do aviso mais antigo que pode sair (o principal só sai com ele ligado e com grupo escolhido)
  select g.grupo into v_grupo from (
    select coalesce(a.grupo_id, case when c.ativo then c.grupo_id end) as grupo, a.id
      from public.wa_avisos a where a.status = 'pendente'
  ) g
  where g.grupo is not null
    and not exists (select 1 from public.wa_avisos x where x.status = 'enviado' and x.enviado_em > now() - interval '2 minutes'
                      and coalesce(x.grupo_id, c.grupo_id) = g.grupo)
    and (select count(distinct x.enviado_em) from public.wa_avisos x where x.status = 'enviado' and coalesce(x.grupo_id, c.grupo_id) = g.grupo
           and x.enviado_em >= (date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo')) < 40
  order by g.id limit 1;
  if v_grupo is null then return null; end if;
  select array_agg(id order by id), string_agg(texto, E'\n\n' order by id) into v_ids, v_txt
    from (select id, texto from public.wa_avisos where status = 'pendente' and coalesce(grupo_id, c.grupo_id) = v_grupo order by id limit 10) q;
  if v_ids is null then return null; end if;
  update public.wa_avisos set status = 'enviando', atualizado_em = now() where id = any (v_ids);
  return jsonb_build_object('ids', to_jsonb(v_ids), 'grupo_id', v_grupo, 'mensagem', left(v_txt, 3900));
end;
$$;
