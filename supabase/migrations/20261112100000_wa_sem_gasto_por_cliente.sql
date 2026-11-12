-- T5.34 (12/11/2026): o aviso "cliente sem gastar" passa a ter período MÍNIMO de 6 horas e a poder ser
-- diferente em cada cliente. Pedido do Ander: 6 horas no mínimo e a escolha por conta.
--
-- O que muda na regra:
--   - o período geral vai de 30–720 min para 360–720 min (6 a 12 horas);
--   - cada cliente pode ter o seu (6 a 12 h); sem escolha, vale o período geral;
--   - a comparação deixa de exigir que a leitura "de referência" seja do mesmo dia: o que conta agora é
--     literalmente "esta conta não gasta há N horas" (a janela de horário continua valendo).
--
-- Nada é apagado: a configuração antiga continua no histórico de auditoria e os clientes silenciados
-- continuam silenciados.

-- 1) O período geral: de 6 a 12 horas (tira a trava de 30 minutos)
do $$
declare r record;
begin
  for r in
    select conname from pg_constraint
     where conrelid = 'public.wa_avisos_config'::regclass
       and contype = 'c'
       and pg_get_constraintdef(oid) like '%sem_gasto_minutos%'
  loop
    execute format('alter table public.wa_avisos_config drop constraint %I', r.conname);
  end loop;
end $$;
alter table public.wa_avisos_config
  add constraint wa_avisos_config_sem_gasto_minutos_check check (sem_gasto_minutos between 360 and 720);
alter table public.wa_avisos_config alter column sem_gasto_minutos set default 360;
comment on column public.wa_avisos_config.sem_gasto_minutos is 'Quanto tempo sem o gasto subir para avisar (6 a 12 horas). A leitura real é a da sincronização, cerca de 1 h. Cliente com período próprio usa o dele.';
update public.wa_avisos_config set sem_gasto_minutos = 360 where sem_gasto_minutos < 360;

-- 2) O período por cliente
create table public.wa_sem_gasto_minutos_clientes (
  cliente_id uuid primary key references public.clients (id) on delete cascade,
  minutos    smallint not null check (minutos between 360 and 720),
  updated_by uuid references auth.users (id),
  updated_at timestamptz not null default now()
);
comment on table public.wa_sem_gasto_minutos_clientes is 'T5.34: período do aviso "sem gastar" de cada cliente (6 a 12 horas). Cliente sem linha usa o período geral. Guardado enquanto o cliente existir.';
create index wa_sem_gasto_minutos_clientes_updated_by_idx on public.wa_sem_gasto_minutos_clientes (updated_by);
alter table public.wa_sem_gasto_minutos_clientes enable row level security;
revoke all on public.wa_sem_gasto_minutos_clientes from anon, authenticated;
grant select on public.wa_sem_gasto_minutos_clientes to authenticated;
create policy "Só admin vê o período do aviso sem gastar por cliente" on public.wa_sem_gasto_minutos_clientes for select to authenticated
  using ((select private.current_user_role()) = 'admin');

-- 3) Salvar o período de um cliente (null = usar o período geral)
create function private.wa_sem_gasto_minutos_save_impl(p_cliente uuid, p_minutos integer)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if private.current_user_role() is distinct from 'admin' then
    raise exception 'Só o administrador configura os avisos no WhatsApp.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.clients where id = p_cliente) then
    raise exception 'Cliente não encontrado.' using errcode = '22023';
  end if;
  if p_minutos is not null and p_minutos not between 360 and 720 then
    raise exception 'O período do aviso sem gastar é de 6 a 12 horas.' using errcode = '22023';
  end if;
  if p_minutos is null then
    delete from public.wa_sem_gasto_minutos_clientes where cliente_id = p_cliente;
  else
    insert into public.wa_sem_gasto_minutos_clientes (cliente_id, minutos, updated_by)
    values (p_cliente, p_minutos, (select auth.uid()))
    on conflict (cliente_id) do update
      set minutos = excluded.minutos, updated_by = excluded.updated_by, updated_at = now();
  end if;
  insert into public.audit_logs (actor_id, action, target_type, target_id, details)
  values ((select auth.uid()), 'wa_avisos.sem_gasto_minutos', 'client', p_cliente::text, jsonb_build_object('minutos', p_minutos));
end;
$$;
revoke all on function private.wa_sem_gasto_minutos_save_impl(uuid, integer) from public, anon;
grant execute on function private.wa_sem_gasto_minutos_save_impl(uuid, integer) to authenticated;
create function public.wa_sem_gasto_minutos_save(p_cliente uuid, p_minutos integer)
returns void language sql set search_path = '' as $$ select private.wa_sem_gasto_minutos_save_impl(p_cliente, p_minutos) $$;
revoke all on function public.wa_sem_gasto_minutos_save(uuid, integer) from public, anon;
grant execute on function public.wa_sem_gasto_minutos_save(uuid, integer) to authenticated;

-- 4) O período geral agora só aceita de 6 a 12 horas
create or replace function private.wa_sem_gasto_config_save_impl(p_ini integer, p_fim integer, p_minutos integer)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if private.current_user_role() is distinct from 'admin' then
    raise exception 'Só o administrador configura os avisos no WhatsApp.' using errcode = '42501';
  end if;
  if p_ini not between 0 and 23 or p_fim not between 1 and 24 or p_fim <= p_ini or p_minutos not between 360 and 720 then
    raise exception 'Janela ou tempo inválidos (início antes do fim; tempo de 6 a 12 horas).' using errcode = '22023';
  end if;
  update public.wa_avisos_config set sem_gasto_inicio = p_ini, sem_gasto_fim = p_fim, sem_gasto_minutos = p_minutos, updated_by = (select auth.uid()), updated_at = now() where id;
  insert into public.audit_logs (actor_id, action, target_type, target_id, details)
  values ((select auth.uid()), 'wa_avisos.sem_gasto_config', 'wa_avisos', 'config', jsonb_build_object('inicio', p_ini, 'fim', p_fim, 'minutos', p_minutos));
end;
$$;

-- 5) O canal não pode depender do momento em que foi ligado.
-- Antes, os avisos só saíam para o que tinha sido criado DEPOIS de "ativo_desde": quem ligava o canal
-- nunca recebia os alertas que já estavam abertos nem as notificações do sino do mesmo dia.
-- Agora:
--   - alerta aberto avisa (e volta a lembrar a cada "repetir_horas") enquanto continuar aberto;
--   - notificação do sino avisa as das últimas 12 horas — a chave é única, então nunca repete a mesma.
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
     where a.status = 'aberto' and a.type = any (c.tipos)
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

-- 6) A regra do "sem gastar": o período vem do cliente (ou do geral) e a comparação não exige mais o mesmo dia.
create or replace function private.wa_sem_gasto_gerar()
returns integer language plpgsql security definer set search_path = '' as $$
declare
  c public.wa_avisos_config;
  r record;
  v_n integer := 0;
  v_id bigint;
begin
  select * into c from public.wa_avisos_config where id;
  if not c.ativo or c.grupo_id is null or not ('sem_gasto' = any (c.tipos)) then return 0; end if;
  for r in
    select a.id as conta, cl.id as cliente, cl.name as cliente_nome, pl.name as plataforma,
           l.captured_at as lida_em, b.captured_at as base_em,
           coalesce(mc.minutos, c.sem_gasto_minutos) as minutos,
           coalesce(a.timezone, 'America/Sao_Paulo') as tz,
           (now() at time zone coalesce(a.timezone, 'America/Sao_Paulo')) as agora_local
      from public.ad_accounts a
      join public.clients cl on cl.id = a.client_id and cl.status = 'ativo'
      join public.platforms pl on pl.id = a.platform_id
      left join public.wa_sem_gasto_minutos_clientes mc on mc.cliente_id = cl.id
      cross join lateral (select s.captured_at, s.amount_spent_micros from public.account_snapshots s
                           where s.ad_account_id = a.id and s.amount_spent_micros is not null order by s.captured_at desc limit 1) l
      cross join lateral (select s.captured_at, s.amount_spent_micros from public.account_snapshots s
                           where s.ad_account_id = a.id and s.amount_spent_micros is not null
                             and s.captured_at <= l.captured_at - make_interval(mins => coalesce(mc.minutos, c.sem_gasto_minutos) - 5)
                             and s.captured_at >= l.captured_at - interval '14 hours'
                           order by s.captured_at desc limit 1) b
     where a.status = 'ativa'
       and l.captured_at > now() - interval '90 minutes'
       and l.amount_spent_micros = b.amount_spent_micros
       and not exists (select 1 from public.wa_sem_gasto_silenciados z where z.cliente_id = cl.id)
       and exists (select 1 from public.campaigns k where k.ad_account_id = a.id and k.status = 'ativa' and coalesce(upper(k.effective_status), 'ACTIVE') = 'ACTIVE')
       and not exists (select 1 from public.alerts x where x.ad_account_id = a.id and x.status <> 'resolvido'
                         and x.type in ('sem_saldo', 'conta_restrita', 'pagamento_pendente', 'conta_desativada'))
  loop
    -- janela do dia (fuso da conta): só avisa dentro dela
    continue when extract(hour from r.agora_local) < c.sem_gasto_inicio or extract(hour from r.agora_local) >= c.sem_gasto_fim;
    v_id := null;
    insert into public.wa_avisos (chave, tipo, cliente_id, texto)
    values ('semgasto:' || r.conta || ':' || r.agora_local::date || ':' || floor(extract(hour from r.agora_local) / c.repetir_horas)::int,
            'sem_gasto', r.cliente,
            '⏸️ ' || r.cliente_nome || ' (' || r.plataforma || '): sem gasto desde as ' || to_char(r.base_em at time zone r.tz, 'HH24:MI')
              || ' (última leitura às ' || to_char(r.lida_em at time zone r.tz, 'HH24:MI') || '), com campanha ativa.')
    on conflict (chave) do nothing returning id into v_id;
    if v_id is not null then v_n := v_n + 1; end if;
  end loop;
  return v_n;
end;
$$;
