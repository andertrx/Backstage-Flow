-- =============================================================================
-- Tracking T5.2b (08/11/2026): LEAD por webhook (formulário de outro sistema, como o Responde App)
--
-- Reaproveita os endereços de webhook da T3.2 (chave só em hash, mapeamento, modo teste, registro dos avisos).
-- Cada endereço agora tem uma FINALIDADE: 'venda' (como sempre) ou 'lead'. O endereço de lead aponta para um
-- SITE (container) do cliente: o lead entra pela mesma entrada de eventos do script (tracking_ingest), então a
-- origem (campanha, anúncio, fbclid) e o envio do Lead ao Meta seguem as mesmas regras do site.
-- Telefone, e-mail e nome chegam legíveis e são cifrados (SHA-256) no servidor, na chegada; o corpo do aviso
-- nunca é guardado. Nada é apagado: o registro dos avisos é permanente e não tem dado pessoal.
-- =============================================================================

alter table public.tracking_sales_webhooks
  add column purpose text not null default 'venda' check (purpose in ('venda', 'lead')),
  add column container_id uuid references public.tracking_containers (id);
alter table public.tracking_sales_webhooks
  add constraint tracking_sales_webhooks_lead_site check (purpose <> 'lead' or container_id is not null);
comment on column public.tracking_sales_webhooks.purpose is 'T5.2b: venda (padrão) ou lead (formulário de outro sistema).';
comment on column public.tracking_sales_webhooks.container_id is 'T5.2b: site do cliente que recebe os leads deste endereço (só finalidade lead).';

-- A tela lê as colunas novas; continua sem ler o hash da chave.
grant select (purpose, container_id) on public.tracking_sales_webhooks to authenticated;

-- Criar endereço de lead (a chave aparece UMA vez; guarda-se só o hash)
create function private.lead_webhook_create_impl(p_client uuid, p_name text, p_container uuid)
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
    raise exception 'Só administrador e gestor configuram o recebimento de leads.' using errcode = '42501';
  end if;
  if not private.client_is_active(p_client) then raise exception 'Cliente desativado.' using errcode = '22023'; end if;
  if not exists (select 1 from public.tracking_containers t where t.id = p_container and t.client_id = p_client) then
    raise exception 'Escolha um site deste cliente no Tracking.' using errcode = '22023';
  end if;
  insert into public.tracking_sales_webhooks (client_id, name, key_hash, key_hint, purpose, container_id)
  values (p_client, btrim(p_name), encode(extensions.digest(v_key, 'sha256'), 'hex'), right(v_key, 4), 'lead', p_container)
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'key', v_key);
end;
$$;
grant execute on function private.lead_webhook_create_impl(uuid, text, uuid) to authenticated;
revoke all on function private.lead_webhook_create_impl(uuid, text, uuid) from public, anon;

create function public.lead_webhook_create(p_client uuid, p_name text, p_container uuid)
returns jsonb language sql set search_path = '' as $$ select private.lead_webhook_create_impl(p_client, p_name, p_container) $$;
revoke all on function public.lead_webhook_create(uuid, text, uuid) from public, anon;
grant execute on function public.lead_webhook_create(uuid, text, uuid) to authenticated;

-- Conferência da chave: agora diz também a finalidade e o site (a assinatura continua a mesma).
create or replace function private.sales_webhook_auth(p_id uuid, p_key text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('id', w.id, 'client_id', w.client_id, 'enabled', w.enabled, 'test_mode', w.test_mode, 'mapping', w.mapping,
                            'client_active', private.client_is_active(w.client_id), 'purpose', w.purpose, 'container_id', w.container_id,
                            'container', (select jsonb_build_object('id', t.id, 'client_id', t.client_id, 'allowed_domains', t.allowed_domains,
                                                                    'status', t.status, 'test_mode', t.test_mode, 'consent_mode', t.consent_mode)
                                            from public.tracking_containers t where t.id = w.container_id))
    from public.tracking_sales_webhooks w
   where w.id = p_id and w.archived_at is null
     and w.key_hash = encode(extensions.digest(coalesce(p_key, ''), 'sha256'), 'hex')
$$;

-- Registro de um aviso de lead: p = {webhook_id, keys[], result, reason}. Sem dado pessoal.
create function private.lead_webhook_log(p jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  w public.tracking_sales_webhooks;
  v_result text := p ->> 'result';
  v_reason text := left(p ->> 'reason', 300);
begin
  select * into w from public.tracking_sales_webhooks where id = (p ->> 'webhook_id')::uuid and purpose = 'lead';
  if w.id is null then return; end if;
  if v_result not in ('aceito', 'repetido', 'ignorado', 'recusado', 'teste') then v_result := 'recusado'; end if;
  update public.tracking_sales_webhooks
     set last_received_at = now(), last_result = v_result, last_reason = v_reason,
         last_keys = coalesce((select array_agg(x) from jsonb_array_elements_text(p -> 'keys') x), '{}')
   where id = w.id;
  insert into public.tracking_sales_webhook_log (webhook_id, client_id, result, reason)
  values (w.id, w.client_id, v_result, v_reason);
end;
$$;
revoke all on function private.lead_webhook_log(jsonb) from public, anon, authenticated;
grant execute on function private.lead_webhook_log(jsonb) to service_role;
create function public.lead_webhook_log(p jsonb)
returns void language sql set search_path = '' as $$ select private.lead_webhook_log(p) $$;
revoke all on function public.lead_webhook_log(jsonb) from public, anon, authenticated;
grant execute on function public.lead_webhook_log(jsonb) to service_role;
