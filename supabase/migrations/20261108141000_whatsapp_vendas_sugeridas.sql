-- Tracking T5.6b (08/11/2026): Vendas sugeridas pela IA. Aplicada no banco em quatro partes (vendas_sugeridas_1_tabelas, _2_funcoes, _3_agendador, _4_regra_da_chave); este arquivo reúne tudo no estado final.
-- Tracking T5.6b (08/11/2026) parte 1: tabelas das "Vendas sugeridas" pela IA e configuração da IA.
create table public.tracking_wa_suggestions (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references public.clients (id) on delete cascade,
  connection_id uuid references public.tracking_whatsapp_connections (id) on delete set null,
  contact_id    bigint references public.tracking_contacts (id) on delete set null,
  wa_hash       text not null check (wa_hash ~ '^[0-9a-f]{64}$'),
  push_name     text check (char_length(push_name) <= 80),
  phone_tail    text check (phone_tail ~ '^[0-9]{2,4}$'),
  day           date not null,
  reason        text not null check (char_length(reason) between 1 and 300),
  confidence    text not null default 'media' check (confidence in ('alta', 'media', 'baixa')),
  status        text not null default 'pendente' check (status in ('pendente', 'confirmada', 'descartada')),
  decided_by    uuid references auth.users (id) on delete set null,
  decided_at    timestamptz,
  expires_at    timestamptz,
  created_at    timestamptz not null default now(),
  unique (client_id, wa_hash, day)
);
comment on table public.tracking_wa_suggestions is 'T5.6b: sugestões da IA ("acho que houve venda nesta conversa"). Sem texto da conversa. Ficam até o Ander decidir; 30 dias depois da decisão são apagadas sozinhas.';
create index tracking_wa_suggestions_status_idx on public.tracking_wa_suggestions (client_id, status, created_at desc);
create index tracking_wa_suggestions_expires_idx on public.tracking_wa_suggestions (expires_at) where expires_at is not null;
create index tracking_wa_suggestions_contact_idx on public.tracking_wa_suggestions (contact_id);
create index tracking_wa_suggestions_connection_idx on public.tracking_wa_suggestions (connection_id);
create index tracking_wa_suggestions_decided_by_idx on public.tracking_wa_suggestions (decided_by);
alter table public.tracking_wa_suggestions enable row level security;
revoke all on public.tracking_wa_suggestions from anon, authenticated;
grant select on public.tracking_wa_suggestions to authenticated;
create policy "Admin, gestor e Account Manager leem as sugestões" on public.tracking_wa_suggestions for select to authenticated
  using ((select private.wa_messages_can_read(client_id)));

create table public.wa_ai_settings (
  id              boolean primary key default true check (id),
  enabled         boolean not null default false,
  has_key         boolean not null default false,
  key_updated_at  timestamptz,
  model           text not null default 'claude-sonnet-5-5' check (char_length(model) between 3 and 80),
  last_run_at     timestamptz,
  last_run_ok     boolean,
  last_run_count  integer,
  last_run_error  text check (char_length(last_run_error) <= 500),
  updated_at      timestamptz not null default now(),
  updated_by      uuid references auth.users (id) on delete set null
);
comment on table public.wa_ai_settings is 'T5.6b: configuração da IA que sugere vendas (1 linha). A chave da Anthropic fica no Vault (anthropic_api_key).';
create index wa_ai_settings_updated_by_idx on public.wa_ai_settings (updated_by);
insert into public.wa_ai_settings (id) values (true) on conflict do nothing;
alter table public.wa_ai_settings enable row level security;
revoke all on public.wa_ai_settings from anon, authenticated;
grant select on public.wa_ai_settings to authenticated;
create policy "Só admin vê a configuração da IA" on public.wa_ai_settings for select to authenticated
  using ((select private.current_user_role()) = 'admin');

-- Parte 2: chave da IA (só admin), lote do dia para a IA, sugestões, decisão
create function public.wa_ai_save(p_api_key text default null, p_enabled boolean default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_secret uuid;
begin
  if private.current_user_role() is distinct from 'admin' then
    raise exception 'Só o administrador configura a IA.' using errcode = '42501';
  end if;
  if p_api_key is not null and p_api_key !~ '^sk-ant-[A-Za-z0-9_-]{20,255}$' then
    raise exception 'A chave da Anthropic começa com "sk-ant-". Confira e cole de novo.' using errcode = '22023';
  end if;
  if p_api_key is not null then
    select id into v_secret from vault.secrets where name = 'anthropic_api_key';
    if v_secret is null then perform vault.create_secret(p_api_key, 'anthropic_api_key', 'Chave da Anthropic (IA que sugere vendas)');
    else perform vault.update_secret(v_secret, p_api_key); end if;
    update public.wa_ai_settings set has_key = true, key_updated_at = now() where id;
  end if;
  if p_enabled is not null then
    if p_enabled and not (select has_key from public.wa_ai_settings where id) then
      raise exception 'Cole a chave da Anthropic antes de ligar a IA.' using errcode = '22023';
    end if;
    update public.wa_ai_settings set enabled = p_enabled where id;
  end if;
  update public.wa_ai_settings set updated_at = now(), updated_by = (select auth.uid()) where id;
  insert into public.audit_logs (actor_id, action, target_type, target_id, details)
  values ((select auth.uid()), 'wa_ai.update', 'wa_ai_settings', 'ia', jsonb_build_object('nova_chave', p_api_key is not null, 'ligada', p_enabled));
  return (select jsonb_build_object('enabled', enabled, 'has_key', has_key) from public.wa_ai_settings where id);
end $$;
revoke all on function public.wa_ai_save(text, boolean) from public, anon;
grant execute on function public.wa_ai_save(text, boolean) to authenticated;

create function public.wa_ai_remove_key()
returns void language plpgsql security definer set search_path = '' as $$
begin
  if private.current_user_role() is distinct from 'admin' then
    raise exception 'Só o administrador configura a IA.' using errcode = '42501';
  end if;
  perform vault.update_secret(id, 'removida') from vault.secrets where name = 'anthropic_api_key';
  update public.wa_ai_settings set has_key = false, enabled = false, key_updated_at = now(), updated_at = now(), updated_by = (select auth.uid()) where id;
  insert into public.audit_logs (actor_id, action, target_type, target_id, details)
  values ((select auth.uid()), 'wa_ai.remove_key', 'wa_ai_settings', 'ia', '{}'::jsonb);
end $$;
revoke all on function public.wa_ai_remove_key() from public, anon;
grant execute on function public.wa_ai_remove_key() to authenticated;

create function public.wa_ai_key_get()
returns text language sql stable security definer set search_path = '' as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'anthropic_api_key' and decrypted_secret like 'sk-ant-%'
$$;
revoke all on function public.wa_ai_key_get() from public, anon, authenticated;
grant execute on function public.wa_ai_key_get() to service_role;

create function public.wa_ai_batch(p_hours integer default 24)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(x), '[]'::jsonb) from (
    select m.client_id, m.connection_id, m.wa_hash, max(m.push_name) as push_name, max(m.phone_tail) as phone_tail,
           jsonb_agg(jsonb_build_object('d', m.direction, 'at', m.at, 'b', m.body) order by m.at) as messages
      from public.tracking_wa_messages m
      join public.tracking_whatsapp_connections c on c.id = m.connection_id and c.enabled and c.store_messages
     where m.at > now() - make_interval(hours => least(greatest(p_hours, 1), 72))
       and private.client_is_active(m.client_id)
       and not exists (
         select 1 from public.tracking_contacts k
           join public.tracking_contact_history h on h.contact_id = k.id and h.kind = 'venda' and h.at > now() - interval '2 days'
          where k.client_id = m.client_id and k.ph_hash = m.wa_hash)
     group by m.client_id, m.connection_id, m.wa_hash
     order by max(m.at) desc limit 200
  ) x
$$;
revoke all on function public.wa_ai_batch(integer) from public, anon, authenticated;
grant execute on function public.wa_ai_batch(integer) to service_role;

create function public.wa_suggestion_add(p jsonb)
returns text language plpgsql security definer set search_path = '' as $$
declare
  c public.tracking_whatsapp_connections;
  v_hash text := p ->> 'wa_hash';
  v_reason text := left(btrim(coalesce(p ->> 'reason', '')), 300);
  v_conf text := coalesce(p ->> 'confidence', 'media');
  v_contact bigint; v_id uuid;
begin
  select * into c from public.tracking_whatsapp_connections where id = (p ->> 'connection_id')::uuid;
  if c.id is null or v_hash !~ '^[0-9a-f]{64}$' or v_reason = '' or v_conf not in ('alta', 'media', 'baixa') then return 'invalido'; end if;
  select id into v_contact from public.tracking_contacts where client_id = c.client_id and ph_hash = v_hash limit 1;
  insert into public.tracking_wa_suggestions (client_id, connection_id, contact_id, wa_hash, push_name, phone_tail, day, reason, confidence)
  values (c.client_id, c.id, v_contact, v_hash, left(nullif(btrim(coalesce(p ->> 'push_name', '')), ''), 80),
          case when p ->> 'phone_tail' ~ '^[0-9]{2,4}$' then p ->> 'phone_tail' end,
          coalesce((p ->> 'day')::date, (now() at time zone 'America/Sao_Paulo')::date), v_reason, v_conf)
  on conflict (client_id, wa_hash, day) do nothing
  returning id into v_id;
  return case when v_id is null then 'repetida' else 'criada' end;
end $$;
revoke all on function public.wa_suggestion_add(jsonb) from public, anon, authenticated;
grant execute on function public.wa_suggestion_add(jsonb) to service_role;

create function public.wa_ai_report(p jsonb)
returns void language sql security definer set search_path = '' as $$
  update public.wa_ai_settings set last_run_at = now(), last_run_ok = coalesce((p ->> 'ok')::boolean, false),
         last_run_count = (p ->> 'count')::integer, last_run_error = left(p ->> 'error', 500) where id
$$;
revoke all on function public.wa_ai_report(jsonb) from public, anon, authenticated;
grant execute on function public.wa_ai_report(jsonb) to service_role;

create function public.wa_suggestion_decide(p_id uuid, p_status text)
returns void language plpgsql security definer set search_path = '' as $$
declare s public.tracking_wa_suggestions;
begin
  if p_status not in ('confirmada', 'descartada', 'pendente') then raise exception 'Situação inválida.' using errcode = '22023'; end if;
  select * into s from public.tracking_wa_suggestions where id = p_id;
  if s.id is null or not private.wa_messages_can_read(s.client_id) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  update public.tracking_wa_suggestions
     set status = p_status,
         decided_by = case when p_status = 'pendente' then null else (select auth.uid()) end,
         decided_at = case when p_status = 'pendente' then null else now() end,
         expires_at = case when p_status = 'pendente' then null else now() + interval '30 days' end
   where id = p_id;
  insert into public.audit_logs (actor_id, action, target_type, target_id, details)
  values ((select auth.uid()), 'wa_suggestion.decide', 'tracking_wa_suggestions', p_id::text, jsonb_build_object('status', p_status));
end $$;
revoke all on function public.wa_suggestion_decide(uuid, text) from public, anon;
grant execute on function public.wa_suggestion_decide(uuid, text) to authenticated;

-- Parte 3: limpeza e agendador (todo dia 03h07 de Brasília)
create function private.wa_suggestions_purge()
returns integer language plpgsql security definer set search_path = '' as $$
declare v_n integer;
begin
  delete from public.tracking_wa_suggestions where expires_at is not null and expires_at < now();
  get diagnostics v_n = row_count;
  if v_n > 0 then
    insert into public.audit_logs (actor_id, action, target_type, target_id, details)
    values (null, 'wa_suggestions.purge', 'tracking_wa_suggestions', 'prazo', jsonb_build_object('apagadas', v_n));
  end if;
  return v_n;
end $$;
revoke all on function private.wa_suggestions_purge() from public, anon, authenticated;

create function private.trigger_wa_ai()
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_url text := (select value from private.app_settings where key = 'functions_url');
  v_secret text := (select decrypted_secret from vault.decrypted_secrets where name = 'sync_cron_secret');
begin
  perform private.wa_suggestions_purge();
  if not coalesce((select s.enabled and s.has_key from public.wa_ai_settings s where s.id), false) then return; end if;
  if v_url is null or v_secret is null then return; end if;
  perform net.http_post(
    url := v_url || '/wa-ai',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret),
    body := jsonb_build_object('action', 'run'),
    timeout_milliseconds := 120000
  );
end $$;
revoke all on function private.trigger_wa_ai() from public, anon, authenticated;
select cron.schedule('wa-ai', '7 6 * * *', $cron$select private.trigger_wa_ai()$cron$);
