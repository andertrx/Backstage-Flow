-- Etapa 45.1 — avisos no WhatsApp (grupo só do administrador): configuração, fila (outbox) e envio agrupado.
-- Os avisos já existentes (sino/e-mail) continuam como estão; isto só ACRESCENTA o canal WhatsApp.

-- ---------------------------------------------------------------- Configuração (uma linha)
create table public.wa_avisos_config (
  id              boolean primary key default true check (id),
  ativo           boolean not null default false,
  ativo_desde     timestamptz,
  grupo_id        text check (grupo_id is null or grupo_id ~ '^[0-9A-Za-z._-]{5,60}@g\.us$'),
  grupo_nome      text check (char_length(grupo_nome) <= 200),
  tipos           text[] not null default array['sem_saldo','saldo_baixo','conta_restrita','pagamento_pendente','erro_api','envio_aprovar'],
  silencio_inicio smallint not null default 22 check (silencio_inicio between 0 and 23),
  silencio_fim    smallint not null default 7 check (silencio_fim between 0 and 23),
  repetir_horas   smallint not null default 12 check (repetir_horas between 1 and 168),
  updated_by      uuid references auth.users (id),
  updated_at      timestamptz not null default now()
);
comment on table public.wa_avisos_config is 'Etapa 45.1: para onde e quais avisos vão pelo WhatsApp (uma linha só). Guardada permanentemente.';
create index wa_avisos_config_updated_by_idx on public.wa_avisos_config (updated_by);
insert into public.wa_avisos_config (id) values (true);
alter table public.wa_avisos_config enable row level security;
revoke all on public.wa_avisos_config from anon, authenticated;
grant select on public.wa_avisos_config to authenticated;
create policy "Só admin vê a configuração dos avisos no WhatsApp" on public.wa_avisos_config for select to authenticated
  using ((select private.current_user_role()) = 'admin');

-- ---------------------------------------------------------------- Fila de avisos
create table public.wa_avisos (
  id          bigint generated always as identity primary key,
  chave       text not null unique,
  tipo        text not null,
  cliente_id  uuid references public.clients (id),
  texto       text not null check (char_length(texto) <= 600),
  status      text not null default 'pendente' check (status in ('pendente', 'enviando', 'enviado', 'falhou', 'pulado')),
  detalhe     text check (char_length(detalhe) <= 300),
  created_at  timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  enviado_em  timestamptz
);
comment on table public.wa_avisos is 'Etapa 45.1: fila de avisos para o grupo do WhatsApp do administrador. Só texto curto do aviso (sem telefone nem conversa). Guardada permanentemente (histórico; nada é apagado sozinho).';
create index wa_avisos_fila_idx on public.wa_avisos (created_at, id) where status in ('pendente', 'enviando');
create index wa_avisos_cliente_idx on public.wa_avisos (cliente_id);
create index wa_avisos_criado_idx on public.wa_avisos (created_at desc);
alter table public.wa_avisos enable row level security;
revoke all on public.wa_avisos from anon, authenticated;
grant select on public.wa_avisos to authenticated;
create policy "Só admin vê a fila de avisos no WhatsApp" on public.wa_avisos for select to authenticated
  using ((select private.current_user_role()) = 'admin');

-- ---------------------------------------------------------------- Salvar configuração (só administrador)
create function private.wa_avisos_config_save_impl(p_ativo boolean, p_grupo_id text, p_grupo_nome text, p_tipos text[], p_ini integer, p_fim integer, p_repetir integer)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_old public.wa_avisos_config;
  v_validos text[] := array['sem_saldo','saldo_baixo','conta_restrita','conta_desativada','pagamento_pendente','cobranca_problema','sem_forma_pagamento',
                            'sincronizacao_atrasada','erro_api','campanha_sem_entrega','queda_resultados','envio_aprovar'];
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
revoke all on function private.wa_avisos_config_save_impl(boolean, text, text, text[], integer, integer, integer) from public, anon;
grant execute on function private.wa_avisos_config_save_impl(boolean, text, text, text[], integer, integer, integer) to authenticated;
create function public.wa_avisos_config_save(p_ativo boolean, p_grupo_id text, p_grupo_nome text, p_tipos text[], p_ini integer, p_fim integer, p_repetir integer)
returns void language sql set search_path = '' as $$ select private.wa_avisos_config_save_impl(p_ativo, p_grupo_id, p_grupo_nome, p_tipos, p_ini, p_fim, p_repetir) $$;
revoke all on function public.wa_avisos_config_save(boolean, text, text, text[], integer, integer, integer) from public, anon;
grant execute on function public.wa_avisos_config_save(boolean, text, text, text[], integer, integer, integer) to authenticated;

-- ---------------------------------------------------------------- Gerar avisos a partir do que já existe (alertas abertos e envio sem aprovação)
create function private.wa_avisos_gerar()
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
  return v_n;
end;
$$;
revoke all on function private.wa_avisos_gerar() from public, anon, authenticated;

-- ---------------------------------------------------------------- Servidor: pegar o lote de avisos (uma mensagem só) e anotar o resultado
create function private.wa_aviso_proximo()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  c public.wa_avisos_config;
  s public.wa_gateway_settings;
  v_h integer := extract(hour from now() at time zone 'America/Sao_Paulo')::int;
  v_ids bigint[];
  v_txt text;
begin
  select * into s from public.wa_gateway_settings where id;
  select * into c from public.wa_avisos_config where id;
  if not s.enabled or s.connection_state <> 'conectado' or not c.ativo or c.grupo_id is null then return null; end if;
  -- avisos velhos (mais de 24 h) não valem mais
  update public.wa_avisos set status = 'pulado', detalhe = 'Passou de 24 horas sem poder enviar.' where status = 'pendente' and created_at < now() - interval '24 hours';
  update public.wa_avisos set status = 'pendente', atualizado_em = now() where status = 'enviando' and atualizado_em < now() - interval '10 minutes';
  -- horário de silêncio (Brasília): guarda e manda depois
  if (c.silencio_inicio <= c.silencio_fim and v_h >= c.silencio_inicio and v_h < c.silencio_fim)
     or (c.silencio_inicio > c.silencio_fim and (v_h >= c.silencio_inicio or v_h < c.silencio_fim)) then return null; end if;
  -- no máximo 1 mensagem de aviso a cada 2 minutos e 40 por dia
  if exists (select 1 from public.wa_avisos x where x.status = 'enviado' and x.enviado_em > now() - interval '2 minutes') then return null; end if;
  if (select count(distinct x.enviado_em) from public.wa_avisos x where x.status = 'enviado'
        and x.enviado_em >= (date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo')) >= 40 then return null; end if;
  select array_agg(id order by id), string_agg(texto, E'\n\n' order by id) into v_ids, v_txt
    from (select id, texto from public.wa_avisos where status = 'pendente' order by id limit 10) q;
  if v_ids is null then return null; end if;
  update public.wa_avisos set status = 'enviando', atualizado_em = now() where id = any (v_ids);
  return jsonb_build_object('ids', to_jsonb(v_ids), 'grupo_id', c.grupo_id, 'mensagem', left(v_txt, 3900));
end;
$$;
revoke all on function private.wa_aviso_proximo() from public, anon, authenticated;
grant execute on function private.wa_aviso_proximo() to service_role;

create function private.wa_aviso_resultado(p_ids bigint[], p_ok boolean, p_detalhe text, p_retry boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_ok then
    update public.wa_avisos set status = 'enviado', enviado_em = now(), detalhe = null where id = any (p_ids) and status = 'enviando';
  elsif p_retry then
    update public.wa_avisos set status = 'pendente', detalhe = left(p_detalhe, 300) where id = any (p_ids) and status = 'enviando'
      and created_at > now() - interval '3 hours';
    update public.wa_avisos set status = 'falhou', detalhe = left(p_detalhe, 300) where id = any (p_ids) and status = 'enviando';
  else
    update public.wa_avisos set status = 'falhou', detalhe = coalesce(nullif(left(p_detalhe, 300), ''), 'Não foi possível enviar.') where id = any (p_ids) and status = 'enviando';
  end if;
end;
$$;
revoke all on function private.wa_aviso_resultado(bigint[], boolean, text, boolean) from public, anon, authenticated;
grant execute on function private.wa_aviso_resultado(bigint[], boolean, text, boolean) to service_role;

create function public.wa_aviso_proximo() returns jsonb language sql set search_path = '' as $$ select private.wa_aviso_proximo() $$;
create function public.wa_aviso_resultado(p_ids bigint[], p_ok boolean, p_detalhe text default null, p_retry boolean default false)
returns void language sql set search_path = '' as $$ select private.wa_aviso_resultado(p_ids, p_ok, p_detalhe, p_retry) $$;
revoke all on function public.wa_aviso_proximo() from public, anon, authenticated;
revoke all on function public.wa_aviso_resultado(bigint[], boolean, text, boolean) from public, anon, authenticated;
grant execute on function public.wa_aviso_proximo() to service_role;
grant execute on function public.wa_aviso_resultado(bigint[], boolean, text, boolean) to service_role;

-- ---------------------------------------------------------------- Agendador: o mesmo de a cada minuto também gera avisos e chama o servidor se houver fila
create or replace function private.trigger_wa_send()
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_url text := (select value from private.app_settings where key = 'functions_url');
  v_secret text := (select decrypted_secret from vault.decrypted_secrets where name = 'sync_cron_secret');
begin
  if not coalesce((select s.enabled from public.wa_gateway_settings s where s.id), false) then return; end if;
  perform private.wa_envios_enfileirar();
  begin perform private.wa_avisos_gerar(); exception when others then null; end;  -- um problema nos avisos nunca trava os disparos
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
