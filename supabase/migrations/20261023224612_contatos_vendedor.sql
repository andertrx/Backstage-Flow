-- =============================================================================
-- Tracking T3.1 (23/10/2026): contatos e vendas no CRM (fim da planilha)
--
-- • Papel "vendedor" (equipe do cliente): vê e marca SÓ os contatos dos clientes
--   liberados para ele. Para todo o resto do CRM ele é tratado como "equipe" (nada).
-- • Contato = uma pessoa de um cliente: origem (site, WhatsApp com código, manual),
--   contato só em hash, perfil (Lojista, Sacoleiro...) e etapa (Novo → Venda/Perdido).
-- • Marcar perfil ou venda manda o evento ao Meta pelo mesmo caminho do tracking
--   (private.tracking_ingest → fila do Meta), sem duplicar.
-- • Nada é apagado: contato arquivado continua no histórico; o histórico é permanente.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Trava do papel vendedor no resto do CRM (igual ao papel "equipe")
-- -----------------------------------------------------------------------------
create or replace function private.visible_client_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select c.id from public.clients c where private.current_user_role() = 'admin' and c.excluded_at is null
  union
  select a.client_id from public.user_client_access a
  join public.clients c on c.id = a.client_id and c.excluded_at is null
  where a.user_id = (select auth.uid()) and private.current_user_role() is not null
    and private.current_user_role() not in ('equipe', 'vendedor')
    and (private.current_user_role() <> 'cliente'
         or (c.status <> 'encerrado'
             and exists (select 1 from public.client_portal p where p.client_id = a.client_id and p.login_enabled)))
$$;

create or replace function private.can_view_client(target uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when exists (select 1 from public.clients c where c.id = target and c.excluded_at is not null) then false
    when private.current_user_role() is null then false
    when private.current_user_role() = 'admin' then true
    when private.current_user_role() in ('equipe', 'vendedor') then false
    else exists (
      select 1 from public.user_client_access a
      where a.user_id = (select auth.uid()) and a.client_id = target
        and (private.current_user_role() <> 'cliente'
             or (exists (select 1 from public.client_portal p where p.client_id = target and p.login_enabled)
                 and private.client_is_active(target)))
    )
  end
$$;

create or replace function private.ops_member_ok(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.profiles p where p.id = p_user and p.active and p.role = 'admin')
      or exists (select 1 from public.ops_members m join public.profiles p on p.id = m.user_id
                  where m.user_id = p_user and m.active and p.active and p.role not in ('cliente', 'vendedor')
                    and exists (select 1 from public.ops_member_permissions x where x.user_id = m.user_id and x.permission = 'ops.access'))
$$;

create or replace function private.ops_user_can(p_user uuid, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.profiles p where p.id = p_user and p.active and p.role = 'admin')
      or exists (select 1 from public.ops_members m join public.profiles p on p.id = m.user_id
                  where m.user_id = p_user and m.active and p.active and p.role not in ('cliente', 'vendedor')
                    and exists (select 1 from public.ops_member_permissions a where a.user_id = m.user_id and a.permission = 'ops.access')
                    and exists (select 1 from public.ops_member_permissions x where x.user_id = m.user_id and x.permission = p_permission))
$$;

-- -----------------------------------------------------------------------------
-- 2) Quem enxerga os contatos de quais clientes
-- -----------------------------------------------------------------------------
-- Admin: todos. Gestor, operador, visualizador e vendedor: os liberados para a pessoa.
-- Vendedor não vê cliente desativado.
create function private.contacts_client_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select c.id from public.clients c
   where c.excluded_at is null
     and (private.current_user_role() = 'admin'
          or (private.current_user_role() in ('gestor', 'operador', 'visualizador', 'vendedor')
              and exists (select 1 from public.user_client_access a where a.user_id = (select auth.uid()) and a.client_id = c.id)
              and (private.current_user_role() <> 'vendedor' or c.status <> 'encerrado')))
$$;
revoke all on function private.contacts_client_ids() from public, anon;
grant execute on function private.contacts_client_ids() to authenticated;

-- -----------------------------------------------------------------------------
-- 3) Tabelas
-- -----------------------------------------------------------------------------
create table public.tracking_contact_profiles (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references public.clients (id),
  name        text not null check (char_length(btrim(name)) between 1 and 40),
  position    integer not null default 0,
  meta_event  text check (meta_event ~ '^[A-Za-z][A-Za-z0-9_]{1,49}$'),
  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users (id)
);
comment on table public.tracking_contact_profiles is 'T3.1: perfis do contato por cliente (Lojista, Sacoleiro...). meta_event = nome do evento no Meta ao marcar (null = não envia).';
create unique index tracking_contact_profiles_name_idx on public.tracking_contact_profiles (client_id, lower(name)) where archived_at is null;

create table public.tracking_contact_stages (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references public.clients (id),
  name        text not null check (char_length(btrim(name)) between 1 and 40),
  position    integer not null default 0,
  kind        text not null check (kind in ('aberta', 'ganha', 'perdida')),
  meta_event  text check (meta_event ~ '^[A-Za-z][A-Za-z0-9_]{1,49}$'),
  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users (id),
  -- Só a etapa de venda manda compra (com valor) ao Meta.
  constraint tracking_contact_stages_meta check (meta_event is null or kind = 'ganha')
);
comment on table public.tracking_contact_stages is 'T3.1: etapas do contato por cliente (Novo, Qualificado, Venda, Perdido...). Etapa "ganha" pode mandar a compra ao Meta.';
create unique index tracking_contact_stages_name_idx on public.tracking_contact_stages (client_id, lower(name)) where archived_at is null;

create table public.tracking_contacts (
  id             bigint generated always as identity primary key,
  client_id      uuid not null references public.clients (id),
  container_id   uuid references public.tracking_containers (id),
  origin         text not null check (origin in ('site', 'whatsapp', 'manual')),
  ph_hash        text check (ph_hash ~ '^[0-9a-f]{64}$'),
  em_hash        text check (em_hash ~ '^[0-9a-f]{64}$'),
  visitor_id     text not null check (visitor_id ~ '^[A-Za-z0-9_-]{8,64}$'),
  session_id     text not null check (session_id ~ '^[A-Za-z0-9_-]{8,64}$'),
  lead_id        bigint references public.tracking_leads (id),
  wa_click_id    bigint references public.tracking_whatsapp_clicks (id),
  ref_code       text check (ref_code ~ '^[2-9A-HJ-NP-Z]{6}$'),
  touchpoint_id  bigint,
  fbp            text,
  fbc            text,
  profile_id     uuid references public.tracking_contact_profiles (id),
  stage_id       uuid not null references public.tracking_contact_stages (id),
  meta_sent      text[] not null default '{}',
  sales          integer not null default 0,
  created_at     timestamptz not null default now(),
  created_by     uuid references auth.users (id),
  last_change_at timestamptz not null default now(),
  last_change_by uuid references auth.users (id),
  archived_at    timestamptz
);
comment on table public.tracking_contacts is 'T3.1: contatos dos clientes (substitui a planilha). Contato só em hash; nome nunca guardado.';
create unique index tracking_contacts_phone_idx on public.tracking_contacts (client_id, ph_hash) where ph_hash is not null;
create unique index tracking_contacts_click_idx on public.tracking_contacts (wa_click_id) where wa_click_id is not null;
create unique index tracking_contacts_lead_idx on public.tracking_contacts (lead_id) where lead_id is not null;
create index tracking_contacts_list_idx on public.tracking_contacts (client_id, last_change_at desc);
create index tracking_contacts_visitor_idx on public.tracking_contacts (client_id, visitor_id);

create table public.tracking_contact_history (
  id           bigint generated always as identity primary key,
  contact_id   bigint not null references public.tracking_contacts (id),
  client_id    uuid not null references public.clients (id),
  at           timestamptz not null default now(),
  by_user      uuid references auth.users (id),
  kind         text not null check (kind in ('criado', 'etapa', 'perfil', 'venda', 'arquivado')),
  stage_id     uuid references public.tracking_contact_stages (id),
  profile_id   uuid references public.tracking_contact_profiles (id),
  value_micros bigint,
  currency     text,
  order_id     text,
  meta_event   text,
  meta_note    text
);
comment on table public.tracking_contact_history is 'T3.1: cada mudança do contato (quem, quando, etapa, perfil, venda, evento enviado ao Meta). Permanente.';
create index tracking_contact_history_contact_idx on public.tracking_contact_history (contact_id, at desc);
create index tracking_contact_history_client_idx on public.tracking_contact_history (client_id, at desc);

alter table public.tracking_contact_profiles enable row level security;
alter table public.tracking_contact_stages enable row level security;
alter table public.tracking_contacts enable row level security;
alter table public.tracking_contact_history enable row level security;

create policy "Quem acompanha o cliente vê os perfis" on public.tracking_contact_profiles for select to authenticated
  using (client_id in (select private.contacts_client_ids()));
create policy "Admin e gestor configuram os perfis" on public.tracking_contact_profiles for insert to authenticated
  with check (client_id in (select private.contacts_client_ids()) and (select private.current_user_role()) in ('admin', 'gestor'));
create policy "Admin e gestor editam os perfis" on public.tracking_contact_profiles for update to authenticated
  using (client_id in (select private.contacts_client_ids()) and (select private.current_user_role()) in ('admin', 'gestor'))
  with check (client_id in (select private.contacts_client_ids()) and (select private.current_user_role()) in ('admin', 'gestor'));
create policy "Quem acompanha o cliente vê as etapas" on public.tracking_contact_stages for select to authenticated
  using (client_id in (select private.contacts_client_ids()));
create policy "Admin e gestor configuram as etapas" on public.tracking_contact_stages for insert to authenticated
  with check (client_id in (select private.contacts_client_ids()) and (select private.current_user_role()) in ('admin', 'gestor'));
create policy "Admin e gestor editam as etapas" on public.tracking_contact_stages for update to authenticated
  using (client_id in (select private.contacts_client_ids()) and (select private.current_user_role()) in ('admin', 'gestor'))
  with check (client_id in (select private.contacts_client_ids()) and (select private.current_user_role()) in ('admin', 'gestor'));
create policy "Quem acompanha o cliente vê os contatos" on public.tracking_contacts for select to authenticated
  using (client_id in (select private.contacts_client_ids()));
create policy "Quem acompanha o cliente vê o histórico" on public.tracking_contact_history for select to authenticated
  using (client_id in (select private.contacts_client_ids()));

grant select, insert, update on public.tracking_contact_profiles, public.tracking_contact_stages to authenticated;
-- Contatos e histórico: a tela só lê. Gravar passa pelas funções abaixo.
grant select (id, client_id, container_id, origin, lead_id, ref_code, profile_id, stage_id, sales, created_at, last_change_at, archived_at)
  on public.tracking_contacts to authenticated;
grant select on public.tracking_contact_history to authenticated;

create trigger tracking_contact_profiles_set_updated_by before update on public.tracking_contact_profiles
  for each row execute function private.tracking_set_updated_by();
create trigger tracking_contact_profiles_touch before update on public.tracking_contact_profiles
  for each row execute function private.touch_updated_at();
create trigger tracking_contact_stages_set_updated_by before update on public.tracking_contact_stages
  for each row execute function private.tracking_set_updated_by();
create trigger tracking_contact_stages_touch before update on public.tracking_contact_stages
  for each row execute function private.touch_updated_at();
create trigger tracking_contact_profiles_audit after insert or update on public.tracking_contact_profiles
  for each row execute function private.audit_row_change('tracking_contact_profile', 'id');
create trigger tracking_contact_stages_audit after insert or update on public.tracking_contact_stages
  for each row execute function private.audit_row_change('tracking_contact_stage', 'id');

-- -----------------------------------------------------------------------------
-- 4) Perfis e etapas padrão (aprovados pelo Ander): só Lojista e Venda vão ao Meta
-- -----------------------------------------------------------------------------
create function private.contacts_seed(p_client uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.tracking_contact_stages where client_id = p_client) then
    insert into public.tracking_contact_stages (client_id, name, position, kind, meta_event) values
      (p_client, 'Novo', 0, 'aberta', null),
      (p_client, 'Qualificado', 1, 'aberta', null),
      (p_client, 'Venda', 2, 'ganha', 'Purchase'),
      (p_client, 'Perdido', 3, 'perdida', null);
  end if;
  if not exists (select 1 from public.tracking_contact_profiles where client_id = p_client) then
    insert into public.tracking_contact_profiles (client_id, name, position, meta_event) values
      (p_client, 'Lojista', 0, 'LeadLojista'),
      (p_client, 'Sacoleiro', 1, null),
      (p_client, 'Cliente final', 2, null),
      (p_client, 'Outro', 3, null);
  end if;
end;
$$;
revoke all on function private.contacts_seed(uuid) from public, anon, authenticated;
select private.contacts_seed(c.id) from public.clients c where c.excluded_at is null;

create function private.contacts_seed_new_client()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.contacts_seed(new.id);
  return new;
end;
$$;
revoke all on function private.contacts_seed_new_client() from public, anon, authenticated;
create trigger clients_contacts_seed after insert on public.clients
  for each row execute function private.contacts_seed_new_client();

-- -----------------------------------------------------------------------------
-- 5) Lead novo do site (ou marcado pelo WhatsApp na tela de Tracking) vira contato
-- -----------------------------------------------------------------------------
create function private.contacts_from_lead()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_contact bigint;
  v_click   record;
  v_event   record;
  v_profile uuid;
  v_stage   uuid;
  v_meta    text;
begin
  if new.test then return new; end if;
  -- Contato criado pela tela (manual ou pelo código) que acabou de virar lead: só liga.
  select id into v_contact from public.tracking_contacts
   where client_id = new.client_id and lead_id is null
     and (visitor_id = new.first_visitor_id or (new.ph_hash is not null and ph_hash = new.ph_hash))
   order by id limit 1;
  if v_contact is not null then
    update public.tracking_contacts set lead_id = new.id, em_hash = coalesce(em_hash, new.em_hash), ph_hash = coalesce(ph_hash, new.ph_hash)
     where id = v_contact;
    return new;
  end if;
  if exists (select 1 from public.tracking_contacts where client_id = new.client_id and new.ph_hash is not null and ph_hash = new.ph_hash) then
    return new;
  end if;

  select w.id, w.code, w.session_id, w.touchpoint_id, w.fbp, w.fbc into v_click
    from public.tracking_whatsapp_clicks w
   where w.container_id = new.container_id and w.visitor_id = new.first_visitor_id
   order by w.clicked_at desc limit 1;
  -- Resposta do formulário (regra do site, T2) que já diz o perfil, e o nome com que foi ao Meta.
  select e.custom_data, e.session_id into v_event from public.tracking_events e
   where e.container_id = new.container_id and e.visitor_id = new.first_visitor_id and e.event_name = new.first_event_name
   order by e.occurred_at desc limit 1;
  if v_event.custom_data ? 'resposta' then
    select p.id into v_profile from public.tracking_contact_profiles p
     where p.client_id = new.client_id and p.archived_at is null and lower(p.name) = lower(v_event.custom_data ->> 'resposta');
  end if;
  v_meta := coalesce(nullif(v_event.custom_data ->> 'bf_meta', ''), new.first_event_name);
  select s.id into v_stage from public.tracking_contact_stages s
   where s.client_id = new.client_id and s.archived_at is null and s.kind = 'aberta' order by s.position limit 1;
  if v_stage is null then return new; end if;

  insert into public.tracking_contacts (client_id, container_id, origin, ph_hash, em_hash, visitor_id, session_id, lead_id, wa_click_id,
                                        ref_code, touchpoint_id, fbp, fbc, profile_id, stage_id, meta_sent, created_at, last_change_at)
  values (new.client_id, new.container_id, case when v_click.id is not null then 'whatsapp' else 'site' end, new.ph_hash, new.em_hash,
          new.first_visitor_id, coalesce(v_click.session_id, v_event.session_id, new.first_visitor_id), new.id, v_click.id, v_click.code,
          coalesce(v_click.touchpoint_id, new.first_touch_id), v_click.fbp, v_click.fbc, v_profile, v_stage,
          case when v_meta = 'nao_enviar' then '{}'::text[] else array[v_meta] end, new.first_converted_at, new.first_converted_at)
  on conflict do nothing
  returning id into v_contact;
  if v_contact is not null then
    insert into public.tracking_contact_history (contact_id, client_id, at, kind, stage_id, profile_id, meta_note)
    values (v_contact, new.client_id, new.first_converted_at, 'criado', v_stage, v_profile,
            case when v_meta = 'nao_enviar' then null else 'Chegou pelo ' || (case when v_click.id is not null then 'WhatsApp' else 'site' end)
                 || ' (' || v_meta || ')' end);
  end if;
  return new;
end;
$$;
revoke all on function private.contacts_from_lead() from public, anon, authenticated;
create trigger tracking_leads_contacts after insert on public.tracking_leads
  for each row execute function private.contacts_from_lead();

-- -----------------------------------------------------------------------------
-- 6) Funções da tela
-- -----------------------------------------------------------------------------
create function private.contacts_can_mark(p_client uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select private.current_user_role()) in ('admin', 'gestor', 'operador', 'vendedor')
     and p_client in (select private.contacts_client_ids())
     and private.client_is_active(p_client)
$$;
revoke all on function private.contacts_can_mark(uuid) from public, anon, authenticated;

create function private.contacts_normalize_code(p_code text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when v ~ '^[2-9A-HJ-NP-Z]{6}$' then v end
    from (select regexp_replace(upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g')), '^REF', '') as v) x
$$;

-- Clientes que a pessoa acompanha (o vendedor não lê a tabela de clientes).
create function private.contacts_clients_impl()
returns table (id uuid, name text, has_site boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.name, exists (select 1 from public.tracking_containers t where t.client_id = c.id)
    from public.clients c where c.id in (select private.contacts_client_ids()) order by c.name
$$;

-- Lista com a origem já resolvida (canal e campanha), sem dado pessoal.
create function private.contacts_list_impl(p_client uuid, p_code text, p_ph_hash text, p_stage uuid, p_limit integer)
returns table (id bigint, origin text, created_at timestamptz, last_change_at timestamptz, ref_code text, stage_id uuid, profile_id uuid,
               sales integer, has_phone boolean, has_email boolean, channel text, campaign text, site text, archived boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select k.id, k.origin, k.created_at, k.last_change_at, k.ref_code, k.stage_id, k.profile_id, k.sales,
         k.ph_hash is not null, k.em_hash is not null, t.channel,
         coalesce((select cp.name from public.campaigns cp where cp.client_id = k.client_id and cp.external_id = t.ad_campaign_id limit 1),
                  t.utm_campaign),
         ct.name, k.archived_at is not null
    from public.tracking_contacts k
    left join public.tracking_touchpoints t on t.id = k.touchpoint_id
    left join public.tracking_containers ct on ct.id = k.container_id
   where k.client_id = p_client and p_client in (select private.contacts_client_ids())
     and (p_code is null or k.ref_code = private.contacts_normalize_code(p_code))
     and (p_ph_hash is null or k.ph_hash = p_ph_hash)
     and (p_stage is null or k.stage_id = p_stage)
   order by k.last_change_at desc
   limit least(greatest(coalesce(p_limit, 200), 1), 500)
$$;

-- Criar contato: pelo código "ref." do WhatsApp (pega a origem do clique) ou manual (telefone cifrado na tela).
-- Mesmo telefone ou mesmo código no mesmo cliente devolve o contato que já existe.
create function private.contact_create_impl(p_client uuid, p_code text, p_ph_hash text, p_em_hash text, p_container uuid)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code    text := private.contacts_normalize_code(p_code);
  v_click   record;
  v_id      bigint;
  v_stage   uuid;
  v_vis     text;
  v_cont    uuid;
  v_lead    record;
begin
  if not private.contacts_can_mark(p_client) then
    raise exception 'Sem permissão para marcar contatos deste cliente.' using errcode = '42501';
  end if;
  if p_ph_hash is not null and p_ph_hash !~ '^[0-9a-f]{64}$' then raise exception 'Telefone inválido.' using errcode = '22023'; end if;
  if p_em_hash is not null and p_em_hash !~ '^[0-9a-f]{64}$' then raise exception 'E-mail inválido.' using errcode = '22023'; end if;
  if p_code is not null and v_code is null then
    raise exception 'Código inválido. São 6 letras/números, como K7Q2M9.' using errcode = '22023';
  end if;
  if v_code is null and p_ph_hash is null and p_em_hash is null then
    raise exception 'Informe o código da mensagem ou o telefone.' using errcode = '22023';
  end if;

  if v_code is not null then
    select w.* into v_click from public.tracking_whatsapp_clicks w where w.client_id = p_client and w.code = v_code and not w.test;
    if v_click.id is null then raise exception 'Código não encontrado neste cliente.' using errcode = 'P0002'; end if;
    select id into v_id from public.tracking_contacts
     where wa_click_id = v_click.id or (client_id = p_client and visitor_id = v_click.visitor_id and origin = 'whatsapp')
     order by id limit 1;
    if v_id is not null then return v_id; end if;
  end if;
  if p_ph_hash is not null then
    select id into v_id from public.tracking_contacts where client_id = p_client and ph_hash = p_ph_hash;
    if v_id is not null then
      if v_click.id is not null then
        update public.tracking_contacts set wa_click_id = coalesce(wa_click_id, v_click.id), ref_code = coalesce(ref_code, v_code) where id = v_id;
      end if;
      return v_id;
    end if;
  end if;

  select s.id into v_stage from public.tracking_contact_stages s
   where s.client_id = p_client and s.archived_at is null and s.kind = 'aberta' order by s.position limit 1;
  if v_stage is null then raise exception 'Cadastre ao menos uma etapa aberta para este cliente.' using errcode = '22023'; end if;

  -- Mesmo telefone já é lead do site? Herda a origem dele.
  if p_ph_hash is not null and v_click.id is null then
    select l.id, l.container_id, l.first_visitor_id, l.first_touch_id into v_lead from public.tracking_leads l
     where l.client_id = p_client and l.ph_hash = p_ph_hash and not l.test order by l.first_converted_at limit 1;
  end if;
  v_cont := coalesce(v_click.container_id, v_lead.container_id, p_container,
                     (select t.id from public.tracking_containers t where t.client_id = p_client order by t.created_at limit 1));
  if v_cont is not null and not exists (select 1 from public.tracking_containers t where t.id = v_cont and t.client_id = p_client) then
    raise exception 'Site não é deste cliente.' using errcode = '22023';
  end if;
  v_vis := coalesce(v_click.visitor_id, v_lead.first_visitor_id, 'ct' || replace(gen_random_uuid()::text, '-', ''));

  insert into public.tracking_contacts (client_id, container_id, origin, ph_hash, em_hash, visitor_id, session_id, lead_id, wa_click_id, ref_code,
                                        touchpoint_id, fbp, fbc, stage_id, created_by, last_change_by)
  values (p_client, v_cont, case when v_click.id is not null then 'whatsapp' when v_lead.id is not null then 'site' else 'manual' end,
          p_ph_hash, p_em_hash, v_vis, coalesce(v_click.session_id, v_vis), v_lead.id, v_click.id, v_code,
          coalesce(v_click.touchpoint_id, v_lead.first_touch_id), v_click.fbp, v_click.fbc, v_stage, (select auth.uid()), (select auth.uid()))
  returning id into v_id;
  insert into public.tracking_contact_history (contact_id, client_id, by_user, kind, stage_id)
  values (v_id, p_client, (select auth.uid()), 'criado', v_stage);
  return v_id;
end;
$$;

-- Manda um evento do contato pelo caminho do tracking (lead, compra, fila do Meta, sem duplicar).
create function private.contact_send(p_contact public.tracking_contacts, p_name text, p_meta text, p_event_id text,
                                     p_value numeric, p_currency text, p_order text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_test boolean;
  v_url  text;
  v_res  jsonb;
begin
  if p_contact.container_id is null then return 'sem_site'; end if;
  select t.test_mode, 'https://' || coalesce(t.allowed_domains[1], 'site') || '/' into v_test, v_url
    from public.tracking_containers t where t.id = p_contact.container_id;
  v_res := private.tracking_ingest(jsonb_build_object(
    'container_id', p_contact.container_id, 'client_id', p_contact.client_id,
    'visitor_id', p_contact.visitor_id, 'session_id', p_contact.session_id, 'test', v_test,
    'device_type', 'desconhecido', 'consent_status', 'nao_exigido', 'consent_version', null,
    'user', nullif(jsonb_strip_nulls(jsonb_build_object('ph', p_contact.ph_hash, 'em', p_contact.em_hash)), '{}'::jsonb),
    'capi', jsonb_build_object('user_agent', null, 'ip', null, 'fbp', p_contact.fbp, 'fbc', p_contact.fbc,
                               'action_source', case when p_contact.origin = 'site' then 'website' else 'chat' end),
    'event', jsonb_strip_nulls(jsonb_build_object(
      'event_id', left(p_event_id, 80), 'name', p_name, 'occurred_at', now(), 'page_url', v_url, 'page_path', '/', 'referrer_host', null,
      'custom_data', jsonb_build_object('canal', 'crm', 'bf_meta', coalesce(p_meta, 'nao_enviar'), 'contato', p_contact.id),
      'value_micros', case when p_value is not null then round(p_value * 1000000)::bigint end,
      'currency', p_currency, 'transaction_id', p_order)),
    'touch', null));
  return coalesce(v_res ->> 'status', 'ok');
end;
$$;
revoke all on function private.contact_send(public.tracking_contacts, text, text, text, numeric, text, text) from public, anon, authenticated;

-- Mudar etapa/perfil e registrar venda. Devolve o que foi feito (para a tela avisar).
create function private.contact_update_impl(p_id bigint, p_stage uuid, p_profile uuid, p_value numeric, p_currency text, p_order text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  c       public.tracking_contacts;
  v_stage public.tracking_contact_stages;
  v_prof  public.tracking_contact_profiles;
  v_out   jsonb := '{}'::jsonb;
  v_res   text;
  v_order text;
begin
  select * into c from public.tracking_contacts where id = p_id for update;
  if c.id is null or not private.contacts_can_mark(c.client_id) then
    raise exception 'Contato não encontrado ou sem permissão.' using errcode = '42501';
  end if;
  if c.archived_at is not null then raise exception 'Contato arquivado.' using errcode = '22023'; end if;

  -- Perfil (ex.: Lojista): vai ao Meta uma vez só por pessoa, se o perfil tiver evento.
  if p_profile is not null and p_profile is distinct from c.profile_id then
    select * into v_prof from public.tracking_contact_profiles where id = p_profile and client_id = c.client_id and archived_at is null;
    if v_prof.id is null then raise exception 'Perfil não encontrado.' using errcode = 'P0002'; end if;
    update public.tracking_contacts set profile_id = v_prof.id, last_change_at = now(), last_change_by = (select auth.uid()) where id = c.id;
    v_res := null;
    if v_prof.meta_event is not null and not (v_prof.meta_event = any (c.meta_sent)) then
      v_res := private.contact_send(c, 'Lead', v_prof.meta_event, 'ct.' || c.id || '.perfil.' || v_prof.id, null, null, null);
      if v_res not in ('sem_site', 'cliente_desativado') then
        update public.tracking_contacts set meta_sent = array_append(meta_sent, v_prof.meta_event) where id = c.id;
      end if;
    end if;
    insert into public.tracking_contact_history (contact_id, client_id, by_user, kind, profile_id, meta_event, meta_note)
    values (c.id, c.client_id, (select auth.uid()), 'perfil', v_prof.id,
            case when v_res is not null and v_res not in ('sem_site', 'cliente_desativado') then v_prof.meta_event end,
            case when v_res = 'sem_site' then 'Não enviado ao Meta: cliente sem site no Tracking.'
                 when v_prof.meta_event is not null and v_res is null then 'Já enviado antes ao Meta para esta pessoa.' end);
    v_out := v_out || jsonb_build_object('perfil', v_prof.name, 'perfil_meta', case when v_res is null then null else v_res end);
  end if;

  -- Etapa (ex.: Venda): etapa "ganha" exige valor e moeda e registra a compra.
  if p_stage is not null and p_stage is distinct from c.stage_id then
    select * into v_stage from public.tracking_contact_stages where id = p_stage and client_id = c.client_id and archived_at is null;
    if v_stage.id is null then raise exception 'Etapa não encontrada.' using errcode = 'P0002'; end if;
    v_res := null;
    if v_stage.kind = 'ganha' then
      if p_value is null or p_value < 0 or p_currency !~ '^[A-Z]{3}$' then
        raise exception 'Informe o valor e a moeda da venda.' using errcode = '22023';
      end if;
      if p_order is not null and p_order !~ '^[A-Za-z0-9_.:/#-]{1,100}$' then raise exception 'Nº do pedido inválido.' using errcode = '22023'; end if;
      v_order := coalesce(p_order, 'ct' || c.id || '-' || (c.sales + 1));
      if exists (select 1 from public.tracking_contact_history h where h.client_id = c.client_id and h.kind = 'venda' and h.order_id = v_order) then
        raise exception 'Já existe uma venda com este nº de pedido.' using errcode = '23505';
      end if;
      v_res := private.contact_send(c, 'Purchase', v_stage.meta_event, 'ct.' || c.id || '.venda.' || v_order, p_value, p_currency, v_order);
      update public.tracking_contacts set sales = sales + 1 where id = c.id;
      insert into public.tracking_contact_history (contact_id, client_id, by_user, kind, stage_id, value_micros, currency, order_id, meta_event, meta_note)
      values (c.id, c.client_id, (select auth.uid()), 'venda', v_stage.id, round(p_value * 1000000)::bigint, p_currency, v_order,
              case when v_res not in ('sem_site', 'cliente_desativado') then v_stage.meta_event end,
              case when v_res = 'sem_site' then 'Venda registrada; não enviada ao Meta: cliente sem site no Tracking.'
                   when v_stage.meta_event is null then 'Venda registrada; esta etapa não envia ao Meta.' end);
    else
      insert into public.tracking_contact_history (contact_id, client_id, by_user, kind, stage_id)
      values (c.id, c.client_id, (select auth.uid()), 'etapa', v_stage.id);
    end if;
    update public.tracking_contacts set stage_id = v_stage.id, last_change_at = now(), last_change_by = (select auth.uid()) where id = c.id;
    v_out := v_out || jsonb_build_object('etapa', v_stage.name, 'venda_meta', v_res);
  end if;
  return v_out;
end;
$$;

create function private.contact_archive_impl(p_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_client uuid;
begin
  select client_id into v_client from public.tracking_contacts where id = p_id;
  if v_client is null or not private.contacts_can_mark(v_client) or (select private.current_user_role()) = 'vendedor' then
    raise exception 'Só a equipe da agência arquiva contatos.' using errcode = '42501';
  end if;
  update public.tracking_contacts set archived_at = now(), last_change_at = now(), last_change_by = (select auth.uid()) where id = p_id and archived_at is null;
  insert into public.tracking_contact_history (contact_id, client_id, by_user, kind) values (p_id, v_client, (select auth.uid()), 'arquivado');
end;
$$;

do $$
declare f text;
begin
  foreach f in array array['contacts_clients_impl()', 'contacts_list_impl(uuid, text, text, uuid, integer)',
                           'contact_create_impl(uuid, text, text, text, uuid)', 'contact_update_impl(bigint, uuid, uuid, numeric, text, text)',
                           'contact_archive_impl(bigint)', 'contacts_normalize_code(text)'] loop
    execute format('revoke all on function private.%s from public, anon', f);
    execute format('grant execute on function private.%s to authenticated', f);
  end loop;
end $$;

-- Funções finas (o que a tela chama)
create function public.contacts_clients()
returns table (id uuid, name text, has_site boolean)
language sql stable set search_path = '' as $$ select * from private.contacts_clients_impl() $$;
create function public.contacts_list(p_client uuid, p_code text default null, p_ph_hash text default null, p_stage uuid default null, p_limit integer default 200)
returns table (id bigint, origin text, created_at timestamptz, last_change_at timestamptz, ref_code text, stage_id uuid, profile_id uuid,
               sales integer, has_phone boolean, has_email boolean, channel text, campaign text, site text, archived boolean)
language sql stable set search_path = '' as $$ select * from private.contacts_list_impl(p_client, p_code, p_ph_hash, p_stage, p_limit) $$;
create function public.contact_create(p_client uuid, p_code text default null, p_ph_hash text default null, p_em_hash text default null, p_container uuid default null)
returns bigint
language sql set search_path = '' as $$ select private.contact_create_impl(p_client, p_code, p_ph_hash, p_em_hash, p_container) $$;
create function public.contact_update(p_id bigint, p_stage uuid default null, p_profile uuid default null, p_value numeric default null,
                                      p_currency text default null, p_order text default null)
returns jsonb
language sql set search_path = '' as $$ select private.contact_update_impl(p_id, p_stage, p_profile, p_value, p_currency, p_order) $$;
create function public.contact_archive(p_id bigint)
returns void
language sql set search_path = '' as $$ select private.contact_archive_impl(p_id) $$;

revoke all on function public.contacts_clients() from public, anon;
revoke all on function public.contacts_list(uuid, text, text, uuid, integer) from public, anon;
revoke all on function public.contact_create(uuid, text, text, text, uuid) from public, anon;
revoke all on function public.contact_update(bigint, uuid, uuid, numeric, text, text) from public, anon;
revoke all on function public.contact_archive(bigint) from public, anon;
grant execute on function public.contacts_clients() to authenticated;
grant execute on function public.contacts_list(uuid, text, text, uuid, integer) to authenticated;
grant execute on function public.contact_create(uuid, text, text, text, uuid) to authenticated;
grant execute on function public.contact_update(bigint, uuid, uuid, numeric, text, text) to authenticated;
grant execute on function public.contact_archive(bigint) to authenticated;
