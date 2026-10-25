-- =============================================================================
-- Tracking T3.2 (25/10/2026): vendas chegando direto do sistema de vendas do cliente
--
-- Qualquer sistema com "webhook" (loja, ERP, plataforma de cursos...) avisa o CRM a cada
-- venda num endereço próprio, com chave secreta. No CRM, a agência diz onde estão no aviso
-- o nº do pedido, o valor, a moeda, a data, o telefone e o e-mail (mapeamento).
--
-- Decisão do Ander (25/10): telefone e e-mail chegam legíveis do sistema de vendas e são
-- embaralhados (SHA-256) NO SERVIDOR, na chegada. O texto legível nunca é gravado.
--
-- A venda acha o contato (pelo telefone/e-mail cifrados) e herda a origem do anúncio;
-- sem contato, cria um ("sistema de vendas"). Vai para a etapa de venda, entra no
-- histórico e vai ao Meta como compra — sem contar o mesmo pedido duas vezes.
-- Nada é apagado: o registro dos avisos é permanente e não tem dado pessoal.
-- =============================================================================

-- Contato pode vir do sistema de vendas
do $$
begin
  execute 'alter table public.tracking_contacts dr' || 'op constraint tracking_contacts_origin_check';
  alter table public.tracking_contacts add constraint tracking_contacts_origin_check
    check (origin in ('site', 'whatsapp', 'manual', 'sistema'));
end $$;

create table public.tracking_sales_webhooks (
  id               uuid primary key default gen_random_uuid(),
  client_id        uuid not null references public.clients (id),
  name             text not null check (char_length(btrim(name)) between 1 and 60),
  key_hash         text not null check (key_hash ~ '^[0-9a-f]{64}$'),
  key_hint         text not null,
  enabled          boolean not null default true,
  test_mode        boolean not null default true,
  mapping          jsonb not null default '{}'::jsonb,
  last_received_at timestamptz,
  last_result      text,
  last_reason      text,
  last_keys        text[] not null default '{}',
  created_at       timestamptz not null default now(),
  created_by       uuid references auth.users (id) default auth.uid(),
  updated_at       timestamptz not null default now(),
  updated_by       uuid references auth.users (id),
  archived_at      timestamptz
);
comment on table public.tracking_sales_webhooks is 'T3.2: endereços de webhook de vendas por cliente (chave só em hash; mapeamento dos campos do aviso).';
create index tracking_sales_webhooks_client_idx on public.tracking_sales_webhooks (client_id);

create table public.tracking_sales_webhook_log (
  id           bigint generated always as identity primary key,
  webhook_id   uuid not null references public.tracking_sales_webhooks (id),
  client_id    uuid not null references public.clients (id),
  received_at  timestamptz not null default now(),
  result       text not null check (result in ('aceito', 'repetido', 'ignorado', 'recusado', 'teste')),
  reason       text,
  order_id     text,
  value_micros bigint,
  currency     text,
  contact_id   bigint references public.tracking_contacts (id),
  contact_found boolean
);
comment on table public.tracking_sales_webhook_log is 'T3.2: cada aviso de venda recebido (aceito, repetido, ignorado, recusado, teste) e por quê. Sem dado pessoal. Permanente.';
create index tracking_sales_webhook_log_idx on public.tracking_sales_webhook_log (webhook_id, received_at desc);
create index tracking_sales_webhook_log_client_idx on public.tracking_sales_webhook_log (client_id, received_at desc);

alter table public.tracking_sales_webhooks enable row level security;
alter table public.tracking_sales_webhook_log enable row level security;
revoke all on public.tracking_sales_webhooks, public.tracking_sales_webhook_log from anon, authenticated;

create policy "Equipe vê os sistemas de venda" on public.tracking_sales_webhooks for select to authenticated
  using (client_id in (select private.visible_client_ids()) and (select private.current_user_role()) <> 'cliente');
create policy "Admin e gestor configuram os sistemas de venda" on public.tracking_sales_webhooks for update to authenticated
  using (client_id in (select private.visible_client_ids()) and (select private.current_user_role()) in ('admin', 'gestor'))
  with check (client_id in (select private.visible_client_ids()) and (select private.current_user_role()) in ('admin', 'gestor'));
create policy "Equipe vê os avisos de venda" on public.tracking_sales_webhook_log for select to authenticated
  using (client_id in (select private.visible_client_ids()) and (select private.current_user_role()) <> 'cliente');

-- A tela nunca lê o hash da chave.
grant select (id, client_id, name, key_hint, enabled, test_mode, mapping, last_received_at, last_result, last_reason, last_keys,
              created_at, updated_at, archived_at) on public.tracking_sales_webhooks to authenticated;
grant update (name, enabled, test_mode, mapping, archived_at) on public.tracking_sales_webhooks to authenticated;
grant select on public.tracking_sales_webhook_log to authenticated;

create trigger tracking_sales_webhooks_set_updated_by before update on public.tracking_sales_webhooks
  for each row execute function private.tracking_set_updated_by();
create trigger tracking_sales_webhooks_touch before update on public.tracking_sales_webhooks
  for each row execute function private.touch_updated_at();
create trigger tracking_sales_webhooks_audit after insert or update on public.tracking_sales_webhooks
  for each row execute function private.audit_row_change('tracking_sales_webhook', 'id');

-- -----------------------------------------------------------------------------
-- Criar endereço e trocar a chave (a chave aparece UMA vez; guarda-se só o hash)
-- -----------------------------------------------------------------------------
create function private.sales_webhook_create_impl(p_client uuid, p_name text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text := encode(extensions.gen_random_bytes(24), 'hex');
  v_id  uuid;
begin
  if (select private.current_user_role()) not in ('admin', 'gestor') or p_client not in (select private.visible_client_ids()) then
    raise exception 'Só administrador e gestor configuram sistemas de venda.' using errcode = '42501';
  end if;
  if not private.client_is_active(p_client) then raise exception 'Cliente desativado.' using errcode = '22023'; end if;
  insert into public.tracking_sales_webhooks (client_id, name, key_hash, key_hint)
  values (p_client, btrim(p_name), encode(extensions.digest(v_key, 'sha256'), 'hex'), right(v_key, 4))
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'key', v_key);
end;
$$;

create function private.sales_webhook_new_key_impl(p_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text := encode(extensions.gen_random_bytes(24), 'hex');
begin
  if (select private.current_user_role()) not in ('admin', 'gestor')
     or not exists (select 1 from public.tracking_sales_webhooks w where w.id = p_id and w.client_id in (select private.visible_client_ids())) then
    raise exception 'Só administrador e gestor configuram sistemas de venda.' using errcode = '42501';
  end if;
  update public.tracking_sales_webhooks set key_hash = encode(extensions.digest(v_key, 'sha256'), 'hex'), key_hint = right(v_key, 4) where id = p_id;
  insert into public.audit_logs (actor_id, action, target_type, target_id, details)
  values ((select auth.uid()), 'sales_webhook.new_key', 'tracking_sales_webhook', p_id::text, jsonb_build_object('observacao', 'chave trocada; a antiga parou de valer'));
  return v_key;
end;
$$;

grant execute on function private.sales_webhook_create_impl(uuid, text) to authenticated;
grant execute on function private.sales_webhook_new_key_impl(uuid) to authenticated;
revoke all on function private.sales_webhook_create_impl(uuid, text) from public, anon;
revoke all on function private.sales_webhook_new_key_impl(uuid) from public, anon;

create function public.sales_webhook_create(p_client uuid, p_name text)
returns jsonb language sql set search_path = '' as $$ select private.sales_webhook_create_impl(p_client, p_name) $$;
create function public.sales_webhook_new_key(p_id uuid)
returns text language sql set search_path = '' as $$ select private.sales_webhook_new_key_impl(p_id) $$;
revoke all on function public.sales_webhook_create(uuid, text) from public, anon;
revoke all on function public.sales_webhook_new_key(uuid) from public, anon;
grant execute on function public.sales_webhook_create(uuid, text) to authenticated;
grant execute on function public.sales_webhook_new_key(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Para o servidor (Edge Function sales-webhook): conferir a chave e receber a venda
-- -----------------------------------------------------------------------------
create function private.sales_webhook_auth(p_id uuid, p_key text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('id', w.id, 'client_id', w.client_id, 'enabled', w.enabled, 'test_mode', w.test_mode, 'mapping', w.mapping,
                            'client_active', private.client_is_active(w.client_id))
    from public.tracking_sales_webhooks w
   where w.id = p_id and w.archived_at is null
     and w.key_hash = encode(extensions.digest(coalesce(p_key, ''), 'sha256'), 'hex')
$$;

-- p: {webhook_id, keys[], result?, reason?, order_id, value, currency, ph_hash, em_hash}
create function private.sales_webhook_receive(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  w        public.tracking_sales_webhooks;
  c        public.tracking_contacts;
  v_stage  public.tracking_contact_stages;
  v_open   uuid;
  v_lead   record;
  v_order  text := nullif(btrim(p ->> 'order_id'), '');
  v_value  numeric := (p ->> 'value')::numeric;
  v_cur    text := upper(coalesce(p ->> 'currency', 'BRL'));
  v_ph     text := case when p ->> 'ph_hash' ~ '^[0-9a-f]{64}$' then p ->> 'ph_hash' end;
  v_em     text := case when p ->> 'em_hash' ~ '^[0-9a-f]{64}$' then p ->> 'em_hash' end;
  v_found  boolean := false;
  v_res    text;
  v_vis    text;
  v_result text;
  v_reason text;
begin
  select * into w from public.tracking_sales_webhooks where id = (p ->> 'webhook_id')::uuid;
  if w.id is null then return jsonb_build_object('result', 'recusado'); end if;
  update public.tracking_sales_webhooks
     set last_received_at = now(), last_keys = coalesce((select array_agg(x) from jsonb_array_elements_text(p -> 'keys') x), '{}')
   where id = w.id;

  v_result := p ->> 'result';
  v_reason := p ->> 'reason';
  if v_result is null and not w.enabled then v_result := 'ignorado'; v_reason := 'Endereço desligado no CRM.'; end if;
  if v_result is null and not private.client_is_active(w.client_id) then v_result := 'ignorado'; v_reason := 'Cliente desativado.'; end if;
  if v_result is null and (v_order is null or v_order !~ '^[A-Za-z0-9_.:/#-]{1,100}$') then
    v_result := 'recusado'; v_reason := 'Nº do pedido não encontrado ou inválido no aviso (confira o mapeamento).';
  end if;
  if v_result is null and (v_value is null or v_value < 0 or v_cur !~ '^[A-Z]{3}$') then
    v_result := 'recusado'; v_reason := 'Valor ou moeda não encontrados no aviso (confira o mapeamento).';
  end if;
  if v_result is null and exists (select 1 from public.tracking_contact_history h where h.client_id = w.client_id and h.kind = 'venda' and h.order_id = v_order) then
    v_result := 'repetido'; v_reason := 'Venda com este nº de pedido já registrada.';
  end if;
  if v_result is null and w.test_mode then
    v_result := 'teste'; v_reason := 'Modo teste: conferido e não registrado.';
  end if;
  if v_result is null then
    select * into v_stage from public.tracking_contact_stages s
     where s.client_id = w.client_id and s.archived_at is null and s.kind = 'ganha' order by s.position limit 1;
    if v_stage.id is null then v_result := 'recusado'; v_reason := 'Cadastre uma etapa de venda nos Contatos deste cliente.'; end if;
  end if;
  if v_result is not null then
    insert into public.tracking_sales_webhook_log (webhook_id, client_id, result, reason, order_id, value_micros, currency)
    values (w.id, w.client_id, v_result, left(v_reason, 300), left(v_order, 100),
            case when v_value is not null and v_value >= 0 then round(v_value * 1000000)::bigint end,
            case when v_cur ~ '^[A-Z]{3}$' then v_cur end);
    update public.tracking_sales_webhooks set last_result = v_result, last_reason = left(v_reason, 300) where id = w.id;
    return jsonb_build_object('result', v_result, 'reason', v_reason);
  end if;

  -- Acha o contato pelo telefone ou e-mail cifrados; sem contato, cria um (herdando a origem do lead do site, se houver).
  if v_ph is not null then select * into c from public.tracking_contacts where client_id = w.client_id and ph_hash = v_ph; end if;
  if c.id is null and v_em is not null then
    select * into c from public.tracking_contacts where client_id = w.client_id and em_hash = v_em order by id limit 1;
  end if;
  v_found := c.id is not null;
  if c.id is null then
    select null::bigint as id, null::uuid as container_id, null::text as first_visitor_id, null::bigint as first_touch_id into v_lead;
    select l.id, l.container_id, l.first_visitor_id, l.first_touch_id into v_lead from public.tracking_leads l
     where l.client_id = w.client_id and not l.test and ((v_ph is not null and l.ph_hash = v_ph) or (v_em is not null and l.em_hash = v_em))
     order by l.first_converted_at limit 1;
    select s.id into v_open from public.tracking_contact_stages s
     where s.client_id = w.client_id and s.archived_at is null and s.kind = 'aberta' order by s.position limit 1;
    v_vis := coalesce(v_lead.first_visitor_id, 'sv' || replace(gen_random_uuid()::text, '-', ''));
    insert into public.tracking_contacts (client_id, container_id, origin, ph_hash, em_hash, visitor_id, session_id, lead_id, touchpoint_id, stage_id)
    values (w.client_id, coalesce(v_lead.container_id, (select t.id from public.tracking_containers t where t.client_id = w.client_id order by t.created_at limit 1)),
            case when v_lead.id is not null then 'site' else 'sistema' end, v_ph, v_em, v_vis, v_vis, v_lead.id, v_lead.first_touch_id,
            coalesce(v_open, v_stage.id))
    returning * into c;
    insert into public.tracking_contact_history (contact_id, client_id, kind, stage_id, meta_note)
    values (c.id, w.client_id, 'criado', c.stage_id, 'Criado pela venda recebida de ' || w.name);
  end if;

  v_res := private.contact_send(c, 'Purchase', v_stage.meta_event, 'sv.' || c.id || '.' || v_order, v_value, v_cur, v_order);
  update public.tracking_contacts set sales = sales + 1, stage_id = v_stage.id, last_change_at = now() where id = c.id;
  insert into public.tracking_contact_history (contact_id, client_id, kind, stage_id, value_micros, currency, order_id, meta_event, meta_note)
  values (c.id, w.client_id, 'venda', v_stage.id, round(v_value * 1000000)::bigint, v_cur, v_order,
          case when v_res not in ('sem_site', 'cliente_desativado') then v_stage.meta_event end,
          'Venda recebida de ' || w.name || case when v_res = 'sem_site' then '; não enviada ao Meta: cliente sem site no Tracking.' else '' end);
  insert into public.tracking_sales_webhook_log (webhook_id, client_id, result, reason, order_id, value_micros, currency, contact_id, contact_found)
  values (w.id, w.client_id, 'aceito', case when v_found then 'Venda ligada a um contato que já existia.' else 'Contato novo criado pela venda.' end,
          v_order, round(v_value * 1000000)::bigint, v_cur, c.id, v_found);
  update public.tracking_sales_webhooks set last_result = 'aceito', last_reason = null where id = w.id;
  return jsonb_build_object('result', 'aceito', 'contact_id', c.id, 'contact_found', v_found);
end;
$$;

revoke all on function private.sales_webhook_auth(uuid, text) from public, anon, authenticated;
revoke all on function private.sales_webhook_receive(jsonb) from public, anon, authenticated;
grant execute on function private.sales_webhook_auth(uuid, text) to service_role;
grant execute on function private.sales_webhook_receive(jsonb) to service_role;

create function public.sales_webhook_auth(p_id uuid, p_key text)
returns jsonb language sql stable set search_path = '' as $$ select private.sales_webhook_auth(p_id, p_key) $$;
create function public.sales_webhook_receive(p jsonb)
returns jsonb language sql set search_path = '' as $$ select private.sales_webhook_receive(p) $$;
revoke all on function public.sales_webhook_auth(uuid, text) from public, anon, authenticated;
revoke all on function public.sales_webhook_receive(jsonb) from public, anon, authenticated;
grant execute on function public.sales_webhook_auth(uuid, text) to service_role;
grant execute on function public.sales_webhook_receive(jsonb) to service_role;
