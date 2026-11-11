-- T5.31: avisos no WhatsApp (grupo só do administrador) passam a poder levar também as notificações do sino da Central
-- (tarefas, reuniões, clientes e leads), além dos alertas de conta que já iam. Cada tipo é uma opção que se liga ou desliga.
-- As notificações enviadas são as do próprio administrador que salvou a configuração (as dele no sino).

alter table public.wa_avisos_config add column notif_usuario_id uuid references auth.users (id) on delete set null;
create index wa_avisos_config_notif_usuario_idx on public.wa_avisos_config (notif_usuario_id);
comment on column public.wa_avisos_config.notif_usuario_id is 'T5.31: de quem são as notificações do sino que vão para o grupo (quem salvou a configuração com algum tipo "n:...").';

create or replace function private.wa_avisos_config_save_impl(p_ativo boolean, p_grupo_id text, p_grupo_nome text, p_tipos text[], p_ini integer, p_fim integer, p_repetir integer)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_old public.wa_avisos_config;
  v_validos text[] := array['sem_saldo','saldo_baixo','conta_restrita','conta_desativada','pagamento_pendente','cobranca_problema','sem_forma_pagamento',
                            'sincronizacao_atrasada','erro_api','campanha_sem_entrega','queda_resultados','envio_aprovar','sem_gasto',
                            'n:tarefa.atribuida','n:tarefa.mencao','n:tarefa.comentario','n:tarefa.concluida','n:tarefa.prazo','n:tarefa.atrasada',
                            'n:reuniao.convite','n:reuniao.hoje','n:reuniao.item','n:cliente.reuniao','n:cliente.am','n:lead.responsavel'];
begin
  if private.current_user_role() is distinct from 'admin' then
    raise exception 'Só o administrador configura os avisos no WhatsApp.' using errcode = '42501';
  end if;
  if p_grupo_id is not null and p_grupo_id !~ '^[0-9A-Za-z._-]{5,60}@g\.us$' then
    raise exception 'Grupo inválido. Escolha o grupo na lista do WhatsApp.' using errcode = '22023';
  end if;
  if p_ativo and p_grupo_id is null then
    raise exception 'Escolha o grupo de avisos antes de ligar.' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(coalesce(p_tipos, '{}')) t where t <> all (v_validos)) then
    raise exception 'Tipo de aviso inválido.' using errcode = '22023';
  end if;
  if p_ini not between 0 and 23 or p_fim not between 0 and 23 or p_repetir not between 1 and 168 then
    raise exception 'Horário de silêncio ou intervalo inválido.' using errcode = '22023';
  end if;
  select * into v_old from public.wa_avisos_config where id;
  update public.wa_avisos_config set
    ativo = p_ativo, grupo_id = p_grupo_id, grupo_nome = left(p_grupo_nome, 200), tipos = coalesce(p_tipos, '{}'),
    silencio_inicio = p_ini, silencio_fim = p_fim, repetir_horas = p_repetir,
    ativo_desde = case when p_ativo and not v_old.ativo then now() when not p_ativo then null else v_old.ativo_desde end,
    notif_usuario_id = case when exists (select 1 from unnest(coalesce(p_tipos, '{}')) t where t like 'n:%') then (select auth.uid()) else null end,
    updated_by = (select auth.uid()), updated_at = now()
  where id;
  insert into public.audit_logs (actor_id, action, target_type, target_id, details)
  values ((select auth.uid()), 'wa_avisos.config', 'wa_avisos', 'config', jsonb_build_object('ativo', p_ativo, 'tipos', coalesce(p_tipos, '{}')));
end;
$$;

create or replace function private.wa_avisos_gerar()
returns integer language plpgsql security definer set search_path = '' as $$
declare
  c public.wa_avisos_config;
  r record;
  v_n integer := 0;
  v_id bigint;
begin
  select * into c from public.wa_avisos_config where id;
  if not c.ativo or c.grupo_id is null then return 0; end if;
  -- alertas abertos (não "vistos" nem resolvidos) de clientes ativos; 1 aviso por alerta e um lembrete a cada "repetir_horas" se continuar aberto
  for r in
    select a.id, a.type, a.client_id, a.description, a.first_seen_at, cl.name as cliente, pl.name as plataforma,
           floor(extract(epoch from (now() - a.first_seen_at)) / 3600 / c.repetir_horas)::int as rodada
      from public.alerts a
      join public.clients cl on cl.id = a.client_id and cl.status = 'ativo'
      left join public.platforms pl on pl.id = a.platform_id
     where a.status = 'aberto' and a.type = any (c.tipos) and a.first_seen_at >= c.ativo_desde
  loop
    v_id := null;
    insert into public.wa_avisos (chave, tipo, cliente_id, texto)
    values ('alerta:' || r.id || ':' || r.rodada, r.type, r.client_id,
            case when r.rodada > 0 then '🔁 ' else '⚠️ ' end || r.cliente || coalesce(' (' || r.plataforma || ')', '') || ': ' || r.description)
    on conflict (chave) do nothing returning id into v_id;
    if v_id is not null then v_n := v_n + 1; end if;
  end loop;
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
         and n.created_at >= c.ativo_desde and n.created_at > now() - interval '12 hours'
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
