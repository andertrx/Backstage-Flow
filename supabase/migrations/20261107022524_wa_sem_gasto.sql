-- Etapa 45.2 — aviso "cliente sem gastar" no WhatsApp (grupo do administrador).
-- Só usa o gasto acumulado que a plataforma informou em cada sincronização (account_snapshots). Precisão: a do ritmo da sincronização (~1 h).
-- Vai SÓ para o WhatsApp (fila wa_avisos); não cria alerta na Central de alertas.

alter table public.wa_avisos_config
  add column sem_gasto_inicio  smallint not null default 8  check (sem_gasto_inicio between 0 and 23),
  add column sem_gasto_fim     smallint not null default 22 check (sem_gasto_fim between 1 and 24),
  add column sem_gasto_minutos smallint not null default 60 check (sem_gasto_minutos between 30 and 720);
comment on column public.wa_avisos_config.sem_gasto_minutos is 'Quanto tempo sem o gasto subir para avisar (mínimo 30 min; a leitura real é a da sincronização, cerca de 1 h).';

-- Clientes que NÃO querem esse aviso (por padrão todos os clientes ativos entram)
create table public.wa_sem_gasto_silenciados (
  cliente_id uuid primary key references public.clients (id),
  criado_por uuid references auth.users (id),
  created_at timestamptz not null default now()
);
comment on table public.wa_sem_gasto_silenciados is 'Etapa 45.2: clientes que não geram o aviso "sem gasto" no WhatsApp. Guardada enquanto o cliente estiver silenciado (religar remove a linha; a auditoria registra cada mudança).';
create index wa_sem_gasto_silenciados_criado_por_idx on public.wa_sem_gasto_silenciados (criado_por);
alter table public.wa_sem_gasto_silenciados enable row level security;
revoke all on public.wa_sem_gasto_silenciados from anon, authenticated;
grant select on public.wa_sem_gasto_silenciados to authenticated;
create policy "Só admin vê quem está silenciado no aviso sem gasto" on public.wa_sem_gasto_silenciados for select to authenticated
  using ((select private.current_user_role()) = 'admin');

create function private.wa_sem_gasto_config_save_impl(p_ini integer, p_fim integer, p_minutos integer)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if private.current_user_role() is distinct from 'admin' then
    raise exception 'Só o administrador configura os avisos no WhatsApp.' using errcode = '42501';
  end if;
  if p_ini not between 0 and 23 or p_fim not between 1 and 24 or p_fim <= p_ini or p_minutos not between 30 and 720 then
    raise exception 'Janela ou tempo inválidos (início antes do fim; tempo de 30 minutos a 12 horas).' using errcode = '22023';
  end if;
  update public.wa_avisos_config set sem_gasto_inicio = p_ini, sem_gasto_fim = p_fim, sem_gasto_minutos = p_minutos, updated_by = (select auth.uid()), updated_at = now() where id;
  insert into public.audit_logs (actor_id, action, target_type, target_id, details)
  values ((select auth.uid()), 'wa_avisos.sem_gasto_config', 'wa_avisos', 'config', jsonb_build_object('inicio', p_ini, 'fim', p_fim, 'minutos', p_minutos));
end;
$$;
revoke all on function private.wa_sem_gasto_config_save_impl(integer, integer, integer) from public, anon;
grant execute on function private.wa_sem_gasto_config_save_impl(integer, integer, integer) to authenticated;
create function public.wa_sem_gasto_config_save(p_ini integer, p_fim integer, p_minutos integer)
returns void language sql set search_path = '' as $$ select private.wa_sem_gasto_config_save_impl(p_ini, p_fim, p_minutos) $$;
revoke all on function public.wa_sem_gasto_config_save(integer, integer, integer) from public, anon;
grant execute on function public.wa_sem_gasto_config_save(integer, integer, integer) to authenticated;

create function private.wa_sem_gasto_silenciar_impl(p_cliente uuid, p_silenciar boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if private.current_user_role() is distinct from 'admin' then
    raise exception 'Só o administrador configura os avisos no WhatsApp.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.clients where id = p_cliente) then
    raise exception 'Cliente não encontrado.' using errcode = '22023';
  end if;
  if p_silenciar then
    insert into public.wa_sem_gasto_silenciados (cliente_id, criado_por) values (p_cliente, (select auth.uid())) on conflict do nothing;
  else
    delete from public.wa_sem_gasto_silenciados where cliente_id = p_cliente;
  end if;
  insert into public.audit_logs (actor_id, action, target_type, target_id, details)
  values ((select auth.uid()), 'wa_avisos.sem_gasto_cliente', 'client', p_cliente::text, jsonb_build_object('silenciado', p_silenciar));
end;
$$;
revoke all on function private.wa_sem_gasto_silenciar_impl(uuid, boolean) from public, anon;
grant execute on function private.wa_sem_gasto_silenciar_impl(uuid, boolean) to authenticated;
create function public.wa_sem_gasto_silenciar(p_cliente uuid, p_silenciar boolean)
returns void language sql set search_path = '' as $$ select private.wa_sem_gasto_silenciar_impl(p_cliente, p_silenciar) $$;
revoke all on function public.wa_sem_gasto_silenciar(uuid, boolean) from public, anon;
grant execute on function public.wa_sem_gasto_silenciar(uuid, boolean) to authenticated;

-- "sem_gasto" passa a ser um tipo válido (continua desligado até o administrador escolher)
create or replace function private.wa_avisos_config_save_impl(p_ativo boolean, p_grupo_id text, p_grupo_nome text, p_tipos text[], p_ini integer, p_fim integer, p_repetir integer)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_old public.wa_avisos_config;
  v_validos text[] := array['sem_saldo','saldo_baixo','conta_restrita','conta_desativada','pagamento_pendente','cobranca_problema','sem_forma_pagamento',
                            'sincronizacao_atrasada','erro_api','campanha_sem_entrega','queda_resultados','envio_aprovar','sem_gasto'];
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
    updated_by = (select auth.uid()), updated_at = now()
  where id;
  insert into public.audit_logs (actor_id, action, target_type, target_id, details)
  values ((select auth.uid()), 'wa_avisos.config', 'wa_avisos', 'config', jsonb_build_object('ativo', p_ativo, 'tipos', coalesce(p_tipos, '{}')));
end;
$$;

-- ---------------------------------------------------------------- A regra
-- Conta ativa de cliente ativo, com campanha ativa, dentro da janela (fuso da conta), cuja ÚLTIMA leitura é recente (até 90 min)
-- e cujo gasto acumulado é IGUAL ao de uma leitura de pelo menos "minutos" antes, no mesmo dia e dentro da janela.
-- Não avisa se a conta já tem alerta aberto que explica (sem saldo, restrita, pagamento pendente, desativada) nem se o cliente foi silenciado.
create function private.wa_sem_gasto_gerar()
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
           coalesce(a.timezone, 'America/Sao_Paulo') as tz,
           (now() at time zone coalesce(a.timezone, 'America/Sao_Paulo')) as agora_local
      from public.ad_accounts a
      join public.clients cl on cl.id = a.client_id and cl.status = 'ativo'
      join public.platforms pl on pl.id = a.platform_id
      cross join lateral (select s.captured_at, s.amount_spent_micros from public.account_snapshots s
                           where s.ad_account_id = a.id and s.amount_spent_micros is not null order by s.captured_at desc limit 1) l
      cross join lateral (select s.captured_at, s.amount_spent_micros from public.account_snapshots s
                           where s.ad_account_id = a.id and s.amount_spent_micros is not null
                             and s.captured_at <= l.captured_at - make_interval(mins => c.sem_gasto_minutos - 5)
                             and s.captured_at >= l.captured_at - interval '12 hours'
                           order by s.captured_at desc limit 1) b
     where a.status = 'ativa'
       and l.captured_at > now() - interval '90 minutes'
       and l.amount_spent_micros = b.amount_spent_micros
       and not exists (select 1 from public.wa_sem_gasto_silenciados z where z.cliente_id = cl.id)
       and exists (select 1 from public.campaigns k where k.ad_account_id = a.id and k.status = 'ativa' and coalesce(upper(k.effective_status), 'ACTIVE') = 'ACTIVE')
       and not exists (select 1 from public.alerts x where x.ad_account_id = a.id and x.status <> 'resolvido'
                         and x.type in ('sem_saldo', 'conta_restrita', 'pagamento_pendente', 'conta_desativada'))
  loop
    -- janela do dia (fuso da conta): agora e o começo da leitura-base têm de estar dentro dela, no mesmo dia
    continue when extract(hour from r.agora_local) < c.sem_gasto_inicio or extract(hour from r.agora_local) >= c.sem_gasto_fim;
    continue when (r.base_em at time zone r.tz)::date <> r.agora_local::date;
    continue when extract(hour from (r.base_em at time zone r.tz)) < c.sem_gasto_inicio;
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
revoke all on function private.wa_sem_gasto_gerar() from public, anon, authenticated;

create or replace function private.trigger_wa_send()
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_url text := (select value from private.app_settings where key = 'functions_url');
  v_secret text := (select decrypted_secret from vault.decrypted_secrets where name = 'sync_cron_secret');
begin
  if not coalesce((select s.enabled from public.wa_gateway_settings s where s.id), false) then return; end if;
  perform private.wa_envios_enfileirar();
  begin perform private.wa_avisos_gerar(); exception when others then null; end;   -- um problema nos avisos nunca trava os disparos
  begin perform private.wa_sem_gasto_gerar(); exception when others then null; end;
  if v_url is null or v_secret is null then return; end if;
  if not exists (select 1 from public.wa_disparos d where d.status in ('pendente', 'enviando'))
     and not exists (select 1 from public.wa_avisos a where a.status in ('pendente', 'enviando')) then return; end if;
  perform net.http_post(
    url := v_url || '/wa-send',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret),
    body := jsonb_build_object('action', 'tick'),
    timeout_milliseconds := 60000
  );
end;
$$;
