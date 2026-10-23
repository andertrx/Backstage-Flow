-- =============================================================================
-- Tracking T2 (23/10/2026): regras de eventos sem Tag Manager
--
-- Cada site (container) ganha regras configuradas no CRM:
--   • página  — "endereço contém /obrigado"            → evento (ex.: Lead, Purchase)
--   • clique  — "botão/link/texto"                     → evento (ex.: Schedule, Contact)
--   • formulário — "campo Tipo de cliente = Lojista"   → evento (ex.: Lead)
-- E, por regra, como o evento vai ao Meta: com o mesmo nome, com outro nome
-- (evento personalizado) ou não vai (ex.: compra que a loja já envia).
--
-- As regras são um RASCUNHO; o script do site só usa a última versão PUBLICADA.
-- Cada publicação vira uma versão guardada para sempre (dá para voltar).
-- Nada é apagado: regra tirada da lista é arquivada (archived_at).
-- =============================================================================

alter table public.tracking_containers add column rules_version integer;
comment on column public.tracking_containers.rules_version is 'Versão das regras publicada para o script do site (null = nenhuma).';

create table public.tracking_rules (
  id             uuid primary key default gen_random_uuid(),
  container_id   uuid not null references public.tracking_containers (id),
  client_id      uuid not null references public.clients (id),
  position       integer not null default 0,
  name           text not null check (char_length(btrim(name)) between 1 and 80),
  kind           text not null check (kind in ('pagina', 'clique', 'formulario')),
  match_op       text not null default 'contem' check (match_op in ('contem', 'igual', 'comeca')),
  match_text     text check (char_length(match_text) <= 300),
  click_by       text check (click_by in ('seletor', 'link', 'texto')),
  field_name     text check (char_length(field_name) between 1 and 100),
  field_values   text[] check (cardinality(field_values) between 1 and 20),
  event_name     text not null check (event_name ~ '^[A-Za-z][A-Za-z0-9_]{1,49}$'),
  meta_mode      text not null default 'mesmo' check (meta_mode in ('mesmo', 'personalizado', 'nao_enviar')),
  meta_event     text check (meta_event ~ '^[A-Za-z][A-Za-z0-9_]{1,49}$'),
  value_mode     text not null default 'nenhum' check (value_mode in ('nenhum', 'fixo', 'pagina')),
  value_fixed    numeric(14, 2) check (value_fixed >= 0),
  value_selector text check (char_length(value_selector) between 1 and 200),
  currency       text check (currency ~ '^[A-Z]{3}$'),
  order_param    text check (order_param ~ '^[A-Za-z0-9_-]{1,50}$'),
  enabled        boolean not null default true,
  archived_at    timestamptz,
  created_at     timestamptz not null default now(),
  created_by     uuid references auth.users (id) default auth.uid(),
  updated_at     timestamptz not null default now(),
  updated_by     uuid references auth.users (id),
  constraint tracking_rules_page_text check (kind <> 'pagina' or match_text is not null),
  constraint tracking_rules_click check (kind <> 'clique' or (click_by is not null and match_text is not null)),
  constraint tracking_rules_field check (kind = 'formulario' or (field_name is null and field_values is null)),
  constraint tracking_rules_field_pair check ((field_name is null) = (field_values is null)),
  constraint tracking_rules_meta check (meta_mode <> 'personalizado' or meta_event is not null),
  constraint tracking_rules_value check (
    (value_mode = 'nenhum' or currency is not null)
    and (value_mode <> 'fixo' or value_fixed is not null)
    and (value_mode <> 'pagina' or value_selector is not null)),
  -- Compra sem valor o Meta recusa: regra de compra precisa dizer de onde vem o valor.
  constraint tracking_rules_purchase check (event_name <> 'Purchase' or value_mode <> 'nenhum')
);
comment on table public.tracking_rules is 'Tracking T2: regras de eventos de cada site (rascunho). Nunca apagadas: arquivadas.';
create index tracking_rules_container_idx on public.tracking_rules (container_id, position) where archived_at is null;
create index tracking_rules_client_idx on public.tracking_rules (client_id);

create table public.tracking_rule_versions (
  id            bigint generated always as identity primary key,
  container_id  uuid not null references public.tracking_containers (id),
  client_id     uuid not null references public.clients (id),
  version       integer not null,
  rules         jsonb not null,
  rules_count   integer not null,
  restored_from integer,
  published_at  timestamptz not null default now(),
  published_by  uuid references auth.users (id),
  unique (container_id, version)
);
comment on table public.tracking_rule_versions is 'Tracking T2: cada publicação das regras de um site (permanente; permite voltar versão).';
create index tracking_rule_versions_client_idx on public.tracking_rule_versions (client_id);

-- O cliente da regra é sempre o do site (a tela não escolhe).
create function private.tracking_rules_fill()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  select c.client_id into new.client_id from public.tracking_containers c where c.id = new.container_id;
  if new.client_id is null then raise exception 'Site não encontrado.' using errcode = 'P0002'; end if;
  return new;
end;
$$;
revoke all on function private.tracking_rules_fill() from public, anon, authenticated;
create trigger tracking_rules_fill before insert or update of container_id on public.tracking_rules
  for each row execute function private.tracking_rules_fill();
create trigger tracking_rules_set_updated_by before update on public.tracking_rules
  for each row execute function private.tracking_set_updated_by();
create trigger tracking_rules_touch_updated_at before update on public.tracking_rules
  for each row execute function private.touch_updated_at();
create trigger tracking_rules_audit after insert or update on public.tracking_rules
  for each row execute function private.audit_row_change('tracking_rule', 'id');

alter table public.tracking_rules enable row level security;
alter table public.tracking_rule_versions enable row level security;

create policy "Equipe vê regras dos clientes liberados" on public.tracking_rules for select to authenticated
  using (client_id in (select private.visible_client_ids()) and (select private.current_user_role()) <> 'cliente');
create policy "Admin e gestor criam regras" on public.tracking_rules for insert to authenticated
  with check (client_id in (select private.visible_client_ids()) and (select private.current_user_role()) in ('admin', 'gestor'));
create policy "Admin e gestor editam regras" on public.tracking_rules for update to authenticated
  using (client_id in (select private.visible_client_ids()) and (select private.current_user_role()) in ('admin', 'gestor'))
  with check (client_id in (select private.visible_client_ids()) and (select private.current_user_role()) in ('admin', 'gestor'));
create policy "Equipe vê versões das regras" on public.tracking_rule_versions for select to authenticated
  using (client_id in (select private.visible_client_ids()) and (select private.current_user_role()) <> 'cliente');

grant select, insert, update on public.tracking_rules to authenticated;
grant select on public.tracking_rule_versions to authenticated;

-- -----------------------------------------------------------------------------
-- Publicar: copia as regras ligadas (na ordem) para uma versão nova.
-- -----------------------------------------------------------------------------
create function private.tracking_rules_publish_impl(p_container_id uuid, p_restored_from integer default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_client  uuid;
  v_version integer;
  v_rules   jsonb;
begin
  if (select private.current_user_role()) not in ('admin', 'gestor') then
    raise exception 'Só administrador e gestor publicam regras.' using errcode = '42501';
  end if;
  select c.client_id into v_client from public.tracking_containers c
   where c.id = p_container_id and c.client_id in (select private.visible_client_ids())
   for update;
  if v_client is null then raise exception 'Site não encontrado.' using errcode = 'P0002'; end if;

  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
           'id', r.id, 'name', r.name, 'kind', r.kind, 'match_op', r.match_op, 'match_text', r.match_text,
           'click_by', r.click_by, 'field_name', r.field_name, 'field_values', to_jsonb(r.field_values),
           'event_name', r.event_name, 'meta_mode', r.meta_mode, 'meta_event', r.meta_event,
           'value_mode', r.value_mode, 'value_fixed', r.value_fixed, 'value_selector', r.value_selector,
           'currency', r.currency, 'order_param', r.order_param)) order by r.position, r.created_at), '[]'::jsonb)
    into v_rules
    from public.tracking_rules r
   where r.container_id = p_container_id and r.archived_at is null and r.enabled;

  select coalesce(max(v.version), 0) + 1 into v_version from public.tracking_rule_versions v where v.container_id = p_container_id;
  insert into public.tracking_rule_versions (container_id, client_id, version, rules, rules_count, restored_from, published_by)
  values (p_container_id, v_client, v_version, v_rules, jsonb_array_length(v_rules), p_restored_from, (select auth.uid()));
  update public.tracking_containers set rules_version = v_version where id = p_container_id;

  insert into public.audit_logs (actor_id, action, target_type, target_id, details)
  values ((select auth.uid()), 'tracking.rules_publish', 'tracking_container', p_container_id::text,
          jsonb_build_object('versao', v_version, 'regras', jsonb_array_length(v_rules), 'voltou_da_versao', p_restored_from));
  return v_version;
end;
$$;
revoke all on function private.tracking_rules_publish_impl(uuid, integer) from public, anon, authenticated;

create function public.tracking_rules_publish(p_container_id uuid)
returns integer
language sql
set search_path = ''
as $$ select private.tracking_rules_publish_impl(p_container_id, null) $$;
revoke all on function public.tracking_rules_publish(uuid) from public, anon;
grant execute on function public.tracking_rules_publish(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Voltar versão: arquiva o rascunho atual, recria as regras daquela versão e publica.
-- -----------------------------------------------------------------------------
create function private.tracking_rules_restore_impl(p_container_id uuid, p_version integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rules jsonb;
begin
  if (select private.current_user_role()) not in ('admin', 'gestor') then
    raise exception 'Só administrador e gestor publicam regras.' using errcode = '42501';
  end if;
  select v.rules into v_rules from public.tracking_rule_versions v
   where v.container_id = p_container_id and v.version = p_version
     and v.client_id in (select private.visible_client_ids());
  if v_rules is null then raise exception 'Versão não encontrada.' using errcode = 'P0002'; end if;

  update public.tracking_rules set archived_at = now() where container_id = p_container_id and archived_at is null;
  insert into public.tracking_rules (container_id, client_id, position, name, kind, match_op, match_text, click_by, field_name,
                                     field_values, event_name, meta_mode, meta_event, value_mode, value_fixed, value_selector,
                                     currency, order_param, enabled)
  select p_container_id, null, (x.ord - 1)::integer, x.r ->> 'name', x.r ->> 'kind', x.r ->> 'match_op', x.r ->> 'match_text',
         x.r ->> 'click_by', x.r ->> 'field_name',
         case when x.r ? 'field_values' then array(select jsonb_array_elements_text(x.r -> 'field_values')) end,
         x.r ->> 'event_name', x.r ->> 'meta_mode', x.r ->> 'meta_event', x.r ->> 'value_mode',
         (x.r ->> 'value_fixed')::numeric, x.r ->> 'value_selector', x.r ->> 'currency', x.r ->> 'order_param', true
    from jsonb_array_elements(v_rules) with ordinality as x (r, ord);
  return private.tracking_rules_publish_impl(p_container_id, p_version);
end;
$$;
revoke all on function private.tracking_rules_restore_impl(uuid, integer) from public, anon, authenticated;

create function public.tracking_rules_restore(p_container_id uuid, p_version integer)
returns integer
language sql
set search_path = ''
as $$ select private.tracking_rules_restore_impl(p_container_id, p_version) $$;
revoke all on function public.tracking_rules_restore(uuid, integer) from public, anon;
grant execute on function public.tracking_rules_restore(uuid, integer) to authenticated;

-- -----------------------------------------------------------------------------
-- Para o script do site (via Edge Function track, com a chave pública do site):
-- só a versão publicada, só site ativo de cliente ativo.
-- -----------------------------------------------------------------------------
create function private.tracking_rules_for_key(p_key text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('v', c.rules_version, 'r', v.rules)
    from public.tracking_containers c
    join public.tracking_rule_versions v on v.container_id = c.id and v.version = c.rules_version
   where c.public_key = p_key and c.status = 'ativo' and private.client_is_active(c.client_id)
$$;
revoke all on function private.tracking_rules_for_key(text) from public, anon, authenticated;

create function public.tracking_rules_for_key(p_key text)
returns jsonb
language sql
stable
set search_path = ''
as $$ select private.tracking_rules_for_key(p_key) $$;
revoke all on function public.tracking_rules_for_key(text) from public, anon, authenticated;
grant execute on function public.tracking_rules_for_key(text) to service_role;

-- -----------------------------------------------------------------------------
-- Fila do Meta: a regra pode mandar o evento com outro nome ("bf_meta") ou não mandar.
-- A lista "eventos enviados" do destino continua valendo (pelo nome do evento no CRM).
-- -----------------------------------------------------------------------------
create or replace function private.tracking_capi_enqueue(p jsonb, p_lead_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event jsonb := p -> 'event';
  v_capi  jsonb := coalesce(p -> 'capi', '{}'::jsonb);
  v_test  boolean := coalesce((p ->> 'test')::boolean, false);
  v_src   text := case when v_capi ->> 'action_source' in ('chat', 'business_messaging') then v_capi ->> 'action_source' else 'website' end;
  v_meta  text := coalesce(v_event -> 'custom_data' ->> 'bf_meta', '');
  d       record;
begin
  if v_meta = 'nao_enviar' then return; end if;
  if v_meta !~ '^[A-Za-z][A-Za-z0-9_]{1,49}$' then v_meta := v_event ->> 'name'; end if;
  select * into d from public.tracking_destinations
   where container_id = (p ->> 'container_id')::uuid and enabled and has_token and (v_event ->> 'name') = any (send_events);
  if not found then return; end if;
  if v_src = 'business_messaging' and (v_capi ->> 'ctwa_clid') is null then v_src := 'chat'; end if;

  insert into public.tracking_capi_queue (destination_id, container_id, client_id, event_id, event_name, occurred_at, visitor_id, lead_id,
                                          page_url, custom_data, user_agent, ip_address, fbp, fbc, test, status, last_error, action_source,
                                          ctwa_clid, waba_id)
  values (d.id, d.container_id, d.client_id, v_event ->> 'event_id', v_meta, (v_event ->> 'occurred_at')::timestamptz,
          p ->> 'visitor_id', p_lead_id, v_event ->> 'page_url',
          (coalesce(v_event -> 'custom_data', '{}'::jsonb) - 'bf_meta' - 'bf_regra')
            || case when v_event ? 'value_micros' then jsonb_build_object('value', trim_scale((v_event ->> 'value_micros')::numeric / 1000000),
                                                                          'currency', v_event ->> 'currency', 'order_id', v_event ->> 'transaction_id')
                    else '{}'::jsonb end,
          left(v_capi ->> 'user_agent', 500), left(v_capi ->> 'ip', 45), left(v_capi ->> 'fbp', 200), left(v_capi ->> 'fbc', 500), v_test,
          case when v_test and d.test_event_code is null then 'descartado' else 'pendente' end,
          case when v_test and d.test_event_code is null then 'Site em modo teste e sem código de teste do Meta: não enviado.' end,
          v_src, left(v_capi ->> 'ctwa_clid', 500), case when v_capi ->> 'waba_id' ~ '^\d{5,30}$' then v_capi ->> 'waba_id' end)
  on conflict (destination_id, event_id) do nothing;
end;
$$;
