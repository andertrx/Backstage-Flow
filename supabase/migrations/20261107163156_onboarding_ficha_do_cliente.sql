-- Etapa 51.1 — Ficha do cliente no Onboarding (pedido do Ander, 07/11/2026):
--   dados do cliente (vindos do Comercial ou digitados), resumo do que veio do Comercial, registro rápido de contatos
--   do onboarding (como no Comercial, 48.1), campo de Observações e cadastro de cliente novo direto no onboarding.
-- Decisões do Ander: o resumo do Comercial aparece para todos que veem o cliente no Onboarding; cadastrar cliente novo
-- direto no onboarding = administrador, gestor ou Account Manager.
-- Telefone, e-mail e CNPJ do cliente saem só por ops_client_data_get (o site), nunca pela ficha geral (que o MCP lê).

-- ---------------------------------------------------------------- Contatos do onboarding
create table public.ops_client_onb_contacts (
  id          bigint generated always as identity primary key,
  client_id   uuid not null references public.clients (id),
  kind        text not null check (kind in ('contato', 'nao_atendeu', 'reagendado', 'reuniao', 'observacao')),
  body        text not null check (char_length(btrim(body)) between 3 and 5000),
  happened_at timestamptz not null default now(),
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  removed_at  timestamptz,
  removed_by  uuid references auth.users (id) on delete set null
);
comment on table public.ops_client_onb_contacts is
  'Etapa 51.1: registro rápido de contatos do onboarding do cliente (ex.: "liguei, não atendeu, remarquei"). Permanente: retirar só marca removed_at.';
create index ops_client_onb_contacts_client_idx on public.ops_client_onb_contacts (client_id, happened_at desc);
create index ops_client_onb_contacts_created_by_idx on public.ops_client_onb_contacts (created_by);
create index ops_client_onb_contacts_removed_by_idx on public.ops_client_onb_contacts (removed_by);
alter table public.ops_client_onb_contacts enable row level security;
revoke all on table public.ops_client_onb_contacts from anon, authenticated;
grant select on table public.ops_client_onb_contacts to authenticated;
create policy "Vê os contatos do onboarding de quem pode ver o cliente" on public.ops_client_onb_contacts for select to authenticated
  using (removed_at is null and (select private.ops_client_visible(client_id)));

-- ---------------------------------------------------------------- Observações do onboarding
alter table public.ops_client_ops
  add column onboarding_notes text check (onboarding_notes is null or char_length(onboarding_notes) <= 10000),
  add column onboarding_notes_at timestamptz,
  add column onboarding_notes_by uuid references auth.users (id) on delete set null;
comment on column public.ops_client_ops.onboarding_notes is 'Etapa 51.1: observações do onboarding do cliente (texto livre). Cada alteração fica em ops_activity (cliente.observacoes).';
create index ops_client_ops_onboarding_notes_by_idx on public.ops_client_ops (onboarding_notes_by);

-- ---------------------------------------------------------------- Quem pode
-- Account Manager: é AM de algum cliente ou está no setor "Account Manager".
create function private.ops_is_account_manager()
returns boolean language sql stable security definer set search_path = '' as $$
  select private.ops_can('ops.access') and (
    exists (select 1 from public.ops_client_ops o where o.am_user_id = (select auth.uid()))
    or exists (select 1 from public.ops_member_sectors ms join public.ops_sectors s on s.id = ms.sector_id
                where ms.user_id = (select auth.uid()) and lower(btrim(s.name)) = 'account manager'))
$$;
revoke all on function private.ops_is_account_manager() from public, anon, authenticated;

create function private.ops_can_create_client()
returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_admin()
      or (private.current_user_role() = 'gestor' and private.ops_can('ops.access'))
      or private.ops_is_account_manager()
$$;
revoke all on function private.ops_can_create_client() from public, anon, authenticated;

create function private.ops_can_edit_client_data(p_client uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.ops_client_visible(p_client) and (
    private.is_admin() or private.current_user_role() = 'gestor' or private.ops_is_am(p_client) or private.ops_can_manage_clients())
$$;
revoke all on function private.ops_can_edit_client_data(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------- Dados do cliente: limpeza e conferência
create function private.ops_client_data_clean(p jsonb, p_except uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_name text := btrim(coalesce(p ->> 'name', ''));
  v_company text := nullif(btrim(coalesce(p ->> 'company', '')), '');
  -- mesma regra de packages/shared/src/clients/cnpj.ts (aceita o CNPJ alfanumérico de 2026)
  v_cnpj text := nullif(upper(regexp_replace(coalesce(p ->> 'cnpj', ''), '[^0-9A-Za-z]', '', 'g')), '');
  v_owner text := nullif(btrim(coalesce(p ->> 'owner_name', '')), '');
  -- mesma regra de packages/shared/src/clients/phone.ts: só números; DDD + número (10 ou 11 dígitos) ganha o 55 do Brasil
  v_phone_raw text := btrim(coalesce(p ->> 'phone', ''));
  v_phone text := nullif(regexp_replace(coalesce(p ->> 'phone', ''), '\D', '', 'g'), '');
  v_email text := nullif(lower(btrim(coalesce(p ->> 'email', ''))), '');
  v_dup text;
begin
  if char_length(v_name) not between 2 and 120 then raise exception 'Escreva o nome do cliente (2 a 120 letras).' using errcode = '22023'; end if;
  if v_company is not null and char_length(v_company) > 160 then raise exception 'Empresa: no máximo 160 letras.' using errcode = '22023'; end if;
  if v_cnpj is not null and not private.is_valid_cnpj(v_cnpj) then raise exception 'CNPJ inválido. Confira os 14 caracteres.' using errcode = '22023'; end if;
  if v_owner is not null and char_length(v_owner) > 120 then raise exception 'Responsável: no máximo 120 letras.' using errcode = '22023'; end if;
  if v_phone is not null and left(v_phone_raw, 1) <> '+' and char_length(v_phone) in (10, 11) then v_phone := '55' || v_phone; end if;
  if v_phone is not null and v_phone !~ '^[0-9]{10,15}$' then raise exception 'Telefone: use DDD e número (10 a 15 dígitos).' using errcode = '22023'; end if;
  if v_email is not null and (char_length(v_email) > 254 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') then
    raise exception 'E-mail inválido.' using errcode = '22023';
  end if;
  select c.name into v_dup from public.clients c
   where c.id is distinct from p_except and c.excluded_at is null
     and ((v_cnpj is not null and c.cnpj = v_cnpj) or private.ops_norm_name(c.name) = private.ops_norm_name(v_name))
   limit 1;
  if v_dup is not null then
    raise exception 'Já existe o cliente "%" com este nome ou CNPJ. Use o cliente que já existe.', v_dup using errcode = '22023';
  end if;
  return jsonb_build_object('name', v_name, 'company', v_company, 'cnpj', v_cnpj, 'owner_name', v_owner, 'phone', v_phone, 'email', v_email);
end;
$$;
revoke all on function private.ops_client_data_clean(jsonb, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------- Dados do cliente: ler (só o site) e salvar
create function private.ops_client_data_get_impl(p_client uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select case when not private.ops_client_visible(p_client) then null else (
    select jsonb_build_object('id', c.id, 'name', c.name, 'company', c.company, 'cnpj', c.cnpj, 'owner_name', c.owner_name,
                              'phone', c.phone, 'email', c.email, 'created_at', c.created_at,
                              'can_edit', private.ops_can_edit_client_data(p_client))
      from public.clients c where c.id = p_client and c.excluded_at is null) end
$$;
revoke all on function private.ops_client_data_get_impl(uuid) from public, anon;
grant execute on function private.ops_client_data_get_impl(uuid) to authenticated;
create function public.ops_client_data_get(p_client uuid)
returns jsonb language sql stable set search_path = '' as $$ select private.ops_client_data_get_impl(p_client) $$;
revoke all on function public.ops_client_data_get(uuid) from public, anon;
grant execute on function public.ops_client_data_get(uuid) to authenticated;

create function private.ops_client_data_save_impl(p_client uuid, p jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v jsonb;
  c record;
  v_changed text[] := '{}';
begin
  if not private.ops_can_edit_client_data(p_client) then
    raise exception 'Você não tem permissão para editar os dados deste cliente.' using errcode = '42501';
  end if;
  select * into c from public.clients where id = p_client and excluded_at is null;
  if c.id is null then raise exception 'Cliente não encontrado.' using errcode = '22023'; end if;
  v := private.ops_client_data_clean(p, p_client);
  if c.name is distinct from v ->> 'name' then v_changed := array_append(v_changed, 'nome'); end if;
  if c.company is distinct from v ->> 'company' then v_changed := array_append(v_changed, 'empresa'); end if;
  if c.cnpj is distinct from v ->> 'cnpj' then v_changed := array_append(v_changed, 'CNPJ'); end if;
  if c.owner_name is distinct from v ->> 'owner_name' then v_changed := array_append(v_changed, 'responsável'); end if;
  if c.phone is distinct from v ->> 'phone' then v_changed := array_append(v_changed, 'telefone'); end if;
  if c.email is distinct from v ->> 'email' then v_changed := array_append(v_changed, 'e-mail'); end if;
  if cardinality(v_changed) = 0 then return; end if;
  update public.clients set name = v ->> 'name', company = v ->> 'company', cnpj = v ->> 'cnpj', owner_name = v ->> 'owner_name',
                            phone = v ->> 'phone', email = v ->> 'email'
   where id = p_client;
  -- só os nomes dos campos (nunca os valores) vão para o histórico
  perform private.ops_log(null, p_client, 'cliente.dados', null, jsonb_build_object('campos', to_jsonb(v_changed)));
end;
$$;
revoke all on function private.ops_client_data_save_impl(uuid, jsonb) from public, anon;
grant execute on function private.ops_client_data_save_impl(uuid, jsonb) to authenticated;
create function public.ops_client_data_save(p_client uuid, p jsonb)
returns void language sql set search_path = '' as $$ select private.ops_client_data_save_impl(p_client, p) $$;
revoke all on function public.ops_client_data_save(uuid, jsonb) from public, anon;
grant execute on function public.ops_client_data_save(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------- Cliente novo direto no onboarding
create function private.ops_client_create_start_impl(p jsonb, p_stage text, p_am uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v jsonb;
  v_client uuid;
  v_stage text := coalesce(nullif(p_stage, ''), (select id from public.ops_client_stages where active order by position limit 1));
  v_am uuid := p_am;
begin
  if not private.ops_can_create_client() then
    raise exception 'Cadastrar cliente novo no onboarding é para administrador, gestor ou Account Manager.' using errcode = '42501';
  end if;
  v := private.ops_client_data_clean(p, null);
  if not exists (select 1 from public.ops_client_stages where id = v_stage and active) then
    raise exception 'Escolha uma etapa ativa.' using errcode = '22023';
  end if;
  -- quem não gerencia clientes vira o Account Manager do cliente que cadastrou (para continuar vendo o cliente)
  if not private.ops_can_manage_clients() then v_am := (select auth.uid()); end if;
  if v_am is not null and not private.ops_member_ok(v_am) then
    raise exception 'O Account Manager precisa estar ativo na Central.' using errcode = '22023';
  end if;
  insert into public.clients (name, company, cnpj, owner_name, phone, email, notes, status)
  values (v ->> 'name', v ->> 'company', v ->> 'cnpj', v ->> 'owner_name', v ->> 'phone', v ->> 'email', 'Cadastrado direto no onboarding.', 'ativo')
  returning id into v_client;
  insert into public.ops_client_ops (client_id, stage_id, am_user_id, created_by, updated_by)
  values (v_client, v_stage, v_am, (select auth.uid()), (select auth.uid()));
  perform private.ops_log(null, v_client, 'cliente.fluxo_iniciado', null,
    jsonb_build_object('etapa', v_stage, 'am', v_am, 'cadastro', 'direto no onboarding (sem Comercial)'));
  return v_client;
end;
$$;
revoke all on function private.ops_client_create_start_impl(jsonb, text, uuid) from public, anon;
grant execute on function private.ops_client_create_start_impl(jsonb, text, uuid) to authenticated;
create function public.ops_client_create_start(p jsonb, p_stage text default null, p_am uuid default null)
returns uuid language sql set search_path = '' as $$ select private.ops_client_create_start_impl(p, p_stage, p_am) $$;
revoke all on function public.ops_client_create_start(jsonb, text, uuid) from public, anon;
grant execute on function public.ops_client_create_start(jsonb, text, uuid) to authenticated;

-- ---------------------------------------------------------------- Registrar / retirar contato do onboarding
create function private.ops_client_onb_contact_add_impl(p_client uuid, p_kind text, p_body text, p_happened_at timestamptz)
returns bigint language plpgsql security definer set search_path = '' as $$
declare v_id bigint;
begin
  if not exists (select 1 from public.ops_client_ops where client_id = p_client) or not private.ops_client_visible(p_client) then
    raise exception 'Este cliente não está no onboarding.' using errcode = '22023';
  end if;
  if not (private.ops_can_move_client(p_client) or private.ops_can('ops.history.edit')) then
    raise exception 'Você não tem permissão para registrar contatos deste cliente.' using errcode = '42501';
  end if;
  if p_kind is null or p_kind not in ('contato', 'nao_atendeu', 'reagendado', 'reuniao', 'observacao') then
    raise exception 'Escolha o tipo do registro.' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_body, ''))) < 3 then raise exception 'Escreva o que aconteceu (mínimo 3 letras).' using errcode = '22023'; end if;
  if char_length(p_body) > 5000 then raise exception 'Texto longo demais (máximo 5.000 letras).' using errcode = '22023'; end if;
  if p_happened_at > now() + interval '1 day' then raise exception 'A data do contato não pode ser no futuro.' using errcode = '22023'; end if;
  insert into public.ops_client_onb_contacts (client_id, kind, body, happened_at, created_by)
  values (p_client, p_kind, btrim(p_body), coalesce(p_happened_at, now()), (select auth.uid()))
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function private.ops_client_onb_contact_add_impl(uuid, text, text, timestamptz) from public, anon;
grant execute on function private.ops_client_onb_contact_add_impl(uuid, text, text, timestamptz) to authenticated;
create function public.ops_client_onb_contact_add(p_client uuid, p_kind text, p_body text, p_happened_at timestamptz default null)
returns bigint language sql set search_path = '' as $$ select private.ops_client_onb_contact_add_impl(p_client, p_kind, p_body, p_happened_at) $$;
revoke all on function public.ops_client_onb_contact_add(uuid, text, text, timestamptz) from public, anon;
grant execute on function public.ops_client_onb_contact_add(uuid, text, text, timestamptz) to authenticated;

create function private.ops_client_onb_contact_remove_impl(p_id bigint)
returns void language plpgsql security definer set search_path = '' as $$
declare v record;
begin
  select * into v from public.ops_client_onb_contacts where id = p_id and removed_at is null;
  if v.id is null or not private.ops_client_visible(v.client_id) then raise exception 'Registro não encontrado.' using errcode = '22023'; end if;
  if v.created_by is distinct from (select auth.uid()) and not private.is_admin() then
    raise exception 'Só quem registrou (ou um administrador) pode retirar este contato.' using errcode = '42501';
  end if;
  update public.ops_client_onb_contacts set removed_at = now(), removed_by = (select auth.uid()) where id = p_id;
end;
$$;
revoke all on function private.ops_client_onb_contact_remove_impl(bigint) from public, anon;
grant execute on function private.ops_client_onb_contact_remove_impl(bigint) to authenticated;
create function public.ops_client_onb_contact_remove(p_id bigint)
returns void language sql set search_path = '' as $$ select private.ops_client_onb_contact_remove_impl(p_id) $$;
revoke all on function public.ops_client_onb_contact_remove(bigint) from public, anon;
grant execute on function public.ops_client_onb_contact_remove(bigint) to authenticated;

-- ---------------------------------------------------------------- Observações: salvar
create function private.ops_client_onb_notes_save_impl(p_client uuid, p_version integer, p_notes text)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_o record;
  v_new text := nullif(btrim(coalesce(p_notes, '')), '');
begin
  select * into v_o from public.ops_client_ops where client_id = p_client;
  if v_o.client_id is null or not private.ops_client_visible(p_client) then
    raise exception 'Este cliente não está no onboarding.' using errcode = '22023';
  end if;
  if not private.ops_can_move_client(p_client) then
    raise exception 'Você não tem permissão para editar as observações deste cliente.' using errcode = '42501';
  end if;
  if v_o.version <> coalesce(p_version, -1) then
    raise exception 'Alguém alterou este cliente antes de você. Recarregue para ver a versão atual.' using errcode = '40001';
  end if;
  if v_new is not null and char_length(v_new) > 10000 then raise exception 'Observações longas demais (máximo 10.000 letras).' using errcode = '22023'; end if;
  if v_new is not distinct from v_o.onboarding_notes then return v_o.version; end if;
  update public.ops_client_ops set onboarding_notes = v_new, onboarding_notes_at = now(), onboarding_notes_by = (select auth.uid()),
         version = version + 1, updated_by = (select auth.uid())
   where client_id = p_client;
  perform private.ops_log(null, p_client, 'cliente.observacoes', jsonb_build_object('texto', v_o.onboarding_notes), jsonb_build_object('texto', v_new));
  return v_o.version + 1;
end;
$$;
revoke all on function private.ops_client_onb_notes_save_impl(uuid, integer, text) from public, anon;
grant execute on function private.ops_client_onb_notes_save_impl(uuid, integer, text) to authenticated;
create function public.ops_client_onb_notes_save(p_client uuid, p_version integer, p_notes text)
returns integer language sql set search_path = '' as $$ select private.ops_client_onb_notes_save_impl(p_client, p_version, p_notes) $$;
revoke all on function public.ops_client_onb_notes_save(uuid, integer, text) from public, anon;
grant execute on function public.ops_client_onb_notes_save(uuid, integer, text) to authenticated;

-- ---------------------------------------------------------------- Ficha: aba Onboarding (contatos, observações, resumo do Comercial)
create or replace function private.ops_client_get_impl(p_client uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select case when not private.ops_client_visible(p_client) or not exists (select 1 from public.clients where id = p_client) then null else (
    select jsonb_build_object(
      'client', jsonb_build_object('id', c.id, 'name', c.name, 'status', c.status),
      'ops', (select jsonb_build_object('stage_id', o.stage_id, 'stage_since', o.stage_since, 'started_at', o.started_at, 'version', o.version,
                                        'am_user_id', o.am_user_id, 'am_name', pa.full_name,
                                        'stage_pending', private.ops_client_pending(o.client_id, st.position, st.position + 1))
                from public.ops_client_ops o join public.ops_client_stages st on st.id = o.stage_id
                left join public.profiles pa on pa.id = o.am_user_id where o.client_id = p_client),
      'summary', private.ops_client_summary(p_client),
      'demands', (select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'number', d.number, 'title', d.title, 'created_at', d.created_at,
                    'total', (select count(*) from public.ops_tasks t where t.demand_id = d.id and t.archived_at is null),
                    'done', (select count(*) from public.ops_tasks t join public.ops_statuses s on s.id = t.status_id
                              where t.demand_id = d.id and t.archived_at is null and s.category in ('concluido', 'cancelado')))
                    order by d.created_at desc), '[]') from public.ops_demands d where d.client_id = p_client),
      'notes', (select coalesce(jsonb_agg(jsonb_build_object('id', n.id, 'type_id', n.type_id, 'type_name', ty.name, 'title', n.title,
                    'description', n.description, 'happened_at', n.happened_at, 'responsible_id', n.responsible_id, 'responsible', pr.full_name,
                    'sector_id', n.sector_id, 'next_step', n.next_step, 'attachment_path', n.attachment_path, 'attachment_name', n.attachment_name,
                    'created_by', n.created_by, 'author', pc.full_name, 'created_at', n.created_at) order by n.happened_at desc), '[]')
                  from public.ops_client_notes n join public.ops_activity_types ty on ty.id = n.type_id
                  left join public.profiles pr on pr.id = n.responsible_id left join public.profiles pc on pc.id = n.created_by
                 where n.client_id = p_client and n.removed_at is null),
      'timeline', (select coalesce(jsonb_agg(y.x order by y.created_at desc), '[]') from (
                     select jsonb_build_object('id', a.id, 'action', a.action, 'actor', ph.full_name, 'origin', a.origin, 'before', a.before,
                                               'after', a.after, 'created_at', a.created_at, 'task_id', a.task_id, 'task_number', t.number,
                                               'task_visible', a.task_id is not null and private.ops_task_visible(a.task_id),
                                               'task_title', case when a.task_id is not null and private.ops_task_visible(a.task_id) then t.title end,
                                               'sector_id', t.sector_id) as x, a.created_at
                       from public.ops_activity a left join public.profiles ph on ph.id = a.actor_id left join public.ops_tasks t on t.id = a.task_id
                      where a.client_id = p_client order by a.created_at desc limit 300) y),
      'onboarding', jsonb_build_object(
        'notes', (select o.onboarding_notes from public.ops_client_ops o where o.client_id = p_client),
        'notes_at', (select o.onboarding_notes_at from public.ops_client_ops o where o.client_id = p_client),
        'notes_by', (select pn.full_name from public.ops_client_ops o join public.profiles pn on pn.id = o.onboarding_notes_by where o.client_id = p_client),
        'contacts', (select coalesce(jsonb_agg(jsonb_build_object('id', k.id, 'kind', k.kind, 'body', k.body, 'happened_at', k.happened_at,
                        'created_by', k.created_by, 'author', pk.full_name, 'created_at', k.created_at)
                        order by date_trunc('minute', k.happened_at) desc, k.created_at desc, k.id desc), '[]')
                      from public.ops_client_onb_contacts k left join public.profiles pk on pk.id = k.created_by
                     where k.client_id = p_client and k.removed_at is null),
        -- resumo do Comercial (sem contato, telefone, e-mail ou CNPJ do lead)
        'lead', (select jsonb_build_object('number', l.number, 'company_name', l.company_name, 'origin', l.origin, 'service_interest', l.service_interest,
                        'segment', l.segment, 'city', l.city, 'state', l.state, 'notes', l.notes, 'potential_value', l.potential_value,
                        'currency', l.currency, 'owner_name', po.full_name, 'entered_at', l.entered_at, 'converted_at', l.converted_at,
                        'contacts', (select coalesce(jsonb_agg(jsonb_build_object('kind', e.kind, 'body', e.body, 'at', coalesce(e.happened_at, e.created_at),
                                       'actor', pe.full_name)
                                       order by date_trunc('minute', coalesce(e.happened_at, e.created_at)) desc, e.created_at desc, e.id desc), '[]')
                                     from public.ops_lead_events e left join public.profiles pe on pe.id = e.actor_id
                                    where e.lead_id = l.id and e.action = 'lead.interacao'))
                   from public.ops_leads l left join public.profiles po on po.id = l.owner_id
                  where l.client_id = p_client order by l.converted_at desc nulls last limit 1)),
      'can', jsonb_build_object('move', private.ops_can_move_client(p_client), 'manage', private.ops_can_manage_clients(),
                                'note', private.ops_can('ops.history.edit'), 'release', private.ops_can('ops.tasks.create'), 'admin', private.is_admin(),
                                'contact', private.ops_can_move_client(p_client) or private.ops_can('ops.history.edit'),
                                'edit_data', private.ops_can_edit_client_data(p_client)))
      from public.clients c where c.id = p_client) end
$$;

-- ---------------------------------------------------------------- Quadro: último contato do onboarding + quem pode cadastrar cliente novo
create or replace function private.ops_client_board_impl(f jsonb)
returns jsonb language sql stable security definer set search_path = '' as $$
  select case when not private.ops_can('ops.access') then null else jsonb_build_object(
    'clients', (select coalesce(jsonb_agg(jsonb_build_object(
                  'client_id', c.id, 'name', c.name, 'client_status', c.status, 'stage_id', o.stage_id, 'stage_since', o.stage_since,
                  'version', o.version, 'am_user_id', o.am_user_id, 'am_name', pa.full_name,
                  'stage_pending', private.ops_client_pending(c.id, st.position, st.position + 1),
                  'can_move', private.ops_can_move_client(c.id),
                  'onboarding_meeting', case when m.id is null then null else jsonb_build_object('id', m.id, 'number', m.number, 'title', m.title,
                                          'status', m.status, 'starts_at', m.starts_at, 'cancel_kind', m.cancel_kind) end,
                  'meeting_ok', coalesce(m.status = 'realizada', false),
                  'meeting_scheduled', coalesce(m.status in ('agendada', 'realizada'), false),
                  'ops_task_ok', private.ops_onboarding_tem_tarefa_operacao(c.id),
                  'last_contact', (select jsonb_build_object('kind', k.kind, 'body', left(k.body, 140), 'at', k.happened_at)
                                     from public.ops_client_onb_contacts k where k.client_id = c.id and k.removed_at is null
                                    order by date_trunc('minute', k.happened_at) desc, k.created_at desc, k.id desc limit 1),
                  'summary', private.ops_client_summary(c.id)) order by c.name), '[]')
                  from public.ops_client_ops o
                  join public.clients c on c.id = o.client_id
                  join public.ops_client_stages st on st.id = o.stage_id
                  left join public.profiles pa on pa.id = o.am_user_id
                  left join public.ops_meetings m on m.id = o.onboarding_meeting_id
                 where private.ops_client_visible(c.id)
                   and (not coalesce((f ->> 'mine')::boolean, false) or o.am_user_id = (select auth.uid()))
                   and (nullif(f ->> 'am_user_id', '') is null or o.am_user_id::text = f ->> 'am_user_id')
                   and (nullif(f ->> 'q', '') is null or c.name ilike '%' || (f ->> 'q') || '%')),
    'available', case when private.ops_can_manage_clients() then
                   (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name) order by c.name), '[]')
                      from public.clients c
                     where c.status <> 'encerrado' and not exists (select 1 from public.ops_client_ops o where o.client_id = c.id))
                 else '[]'::jsonb end,
    'can', jsonb_build_object('manage', private.ops_can_manage_clients(), 'release', private.ops_can('ops.tasks.create'),
                              'note', private.ops_can('ops.history.edit'), 'create_client', private.ops_can_create_client())) end
$$;
