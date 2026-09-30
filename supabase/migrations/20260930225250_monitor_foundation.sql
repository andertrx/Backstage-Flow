-- Etapa 37.1 — Monitoramento de Desempenho: base.
-- Permissões do módulo, limites/regras (monitor_rules) com a tabela inicial,
-- e os campos do criativo nos anúncios. Nada é apagado: editar uma regra
-- arquiva a versão anterior e cria outra (o histórico fica completo).

-- ------------------------------------------------------------ permissões
-- view   = ver monitoramento e alertas         (admin, gestor, operador, visualizador)
-- handle = tratar alertas                      (admin, gestor, operador)
-- rules  = gerenciar regras e limites          (admin, gestor; regra global só admin)
-- admin  = administrar o módulo                (admin)
create or replace function private.monitor_can(p_what text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select private.current_user_role())::text, '') = any (
    case p_what
      when 'view' then array['admin', 'gestor', 'operador', 'visualizador']
      when 'handle' then array['admin', 'gestor', 'operador']
      when 'rules' then array['admin', 'gestor']
      when 'admin' then array['admin']
      else array[]::text[]
    end)
$$;
revoke all on function private.monitor_can(text) from public, anon;
grant execute on function private.monitor_can(text) to authenticated;

-- ------------------------------------------------------------ criativo
alter table public.ads add column if not exists creative_external_id text;
alter table public.ads add column if not exists preview_link text;
comment on column public.ads.creative_external_id is 'ID do criativo informado pela plataforma (Meta: creative.id). Agrupa anúncios que usam o mesmo criativo.';
comment on column public.ads.preview_link is 'Link oficial de prévia devolvido pela plataforma (Meta: preview_shareable_link). Nunca montado por suposição.';
create index if not exists ads_creative_idx on public.ads (ad_account_id, creative_external_id) where creative_external_id is not null;

-- ------------------------------------------------------------ regras
create table public.monitor_rules (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('global', 'client', 'account', 'campaign', 'ad')),
  scope_id uuid,
  -- Cliente dono do escopo (para as permissões); null na regra global.
  client_id uuid references public.clients (id),
  metric text not null check (metric in ('cost_per_result', 'results', 'cpc', 'cpm', 'ctr', 'roas', 'spend', 'frequency')),
  direction text not null check (direction in ('up', 'down', 'both')),
  attention_pct numeric(7, 2) not null check (attention_pct > 0 and attention_pct <= 1000),
  critical_pct numeric(7, 2) not null check (critical_pct > 0 and critical_pct <= 1000),
  min_volume integer check (min_volume >= 0),
  active boolean not null default true,
  note text check (char_length(note) <= 300),
  -- Versões: editar = arquivar esta e criar a próxima (replaces_id aponta a anterior).
  replaces_id uuid references public.monitor_rules (id),
  archived_at timestamptz,
  archived_by uuid references auth.users (id),
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  check (critical_pct >= attention_pct),
  check ((scope = 'global') = (scope_id is null)),
  check ((scope = 'global') = (client_id is null))
);
comment on table public.monitor_rules is 'Etapa 37: limites de variação por métrica. Vale a mais específica (anúncio > campanha > conta > cliente > global). Guardada para sempre; editar arquiva a versão anterior.';

-- Uma regra em vigor por escopo + métrica.
create unique index monitor_rules_current_uq
  on public.monitor_rules (scope, coalesce(scope_id, '00000000-0000-0000-0000-000000000000'::uuid), metric)
  where archived_at is null;
create index monitor_rules_client_idx on public.monitor_rules (client_id) where archived_at is null;
create index monitor_rules_replaces_idx on public.monitor_rules (replaces_id);

alter table public.monitor_rules enable row level security;
create policy monitor_rules_select on public.monitor_rules for select to authenticated
  using ((select private.monitor_can('view')) and (client_id is null or (select private.can_view_client(client_id))));
revoke insert, update, delete on public.monitor_rules from anon, authenticated;
grant select on public.monitor_rules to authenticated;

-- Tabela inicial (sugestões do prompt, ajustáveis).
insert into public.monitor_rules (scope, metric, direction, attention_pct, critical_pct) values
  ('global', 'cost_per_result', 'up', 20, 40),
  ('global', 'cpc', 'up', 20, 40),
  ('global', 'cpm', 'up', 20, 40),
  ('global', 'ctr', 'down', 15, 30),
  ('global', 'results', 'down', 20, 40),
  ('global', 'roas', 'down', 20, 40);

-- Cliente dono de um escopo (null se não existir).
create or replace function private.monitor_scope_client(p_scope text, p_scope_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select case p_scope
    when 'client' then (select c.id from public.clients c where c.id = p_scope_id)
    when 'account' then (select a.client_id from public.ad_accounts a where a.id = p_scope_id)
    when 'campaign' then (select c.client_id from public.campaigns c where c.id = p_scope_id)
    when 'ad' then (select d.client_id from public.ads d where d.id = p_scope_id)
  end
$$;
revoke all on function private.monitor_scope_client(text, uuid) from public, anon, authenticated;

-- Nome legível do escopo (para a tela).
create or replace function private.monitor_scope_name(p_scope text, p_scope_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case p_scope
    when 'global' then 'Todos os clientes'
    when 'client' then (select c.name from public.clients c where c.id = p_scope_id)
    when 'account' then (select a.name from public.ad_accounts a where a.id = p_scope_id)
    when 'campaign' then (select c.name from public.campaigns c where c.id = p_scope_id)
    when 'ad' then (select d.name from public.ads d where d.id = p_scope_id)
  end
$$;
revoke all on function private.monitor_scope_name(text, uuid) from public, anon, authenticated;

-- Lista das regras em vigor (ou todas, com o histórico), só dos clientes visíveis.
create or replace function private.monitor_rules_list_impl(p_include_history boolean)
returns table (
  id uuid, scope text, scope_id uuid, scope_name text, client_id uuid, client_name text,
  metric text, direction text, attention_pct numeric, critical_pct numeric, min_volume integer,
  active boolean, note text, replaces_id uuid, archived_at timestamptz, created_at timestamptz, created_by_name text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.monitor_can('view') then
    raise exception 'Sem permissão para ver o monitoramento' using errcode = '42501';
  end if;
  return query
    select r.id, r.scope, r.scope_id, private.monitor_scope_name(r.scope, r.scope_id), r.client_id, c.name,
           r.metric, r.direction, r.attention_pct, r.critical_pct, r.min_volume,
           r.active, r.note, r.replaces_id, r.archived_at, r.created_at, p.full_name
      from public.monitor_rules r
      left join public.clients c on c.id = r.client_id
      left join public.profiles p on p.id = r.created_by
     where (r.client_id is null or private.can_view_client(r.client_id))
       and (p_include_history or r.archived_at is null)
     order by array_position(array['global', 'client', 'account', 'campaign', 'ad'], r.scope),
              c.name nulls first, r.scope_id, r.metric, r.created_at desc;
end;
$$;
revoke all on function private.monitor_rules_list_impl(boolean) from public, anon;
grant execute on function private.monitor_rules_list_impl(boolean) to authenticated;

create or replace function public.monitor_rules_list(p_include_history boolean default false)
returns table (
  id uuid, scope text, scope_id uuid, scope_name text, client_id uuid, client_name text,
  metric text, direction text, attention_pct numeric, critical_pct numeric, min_volume integer,
  active boolean, note text, replaces_id uuid, archived_at timestamptz, created_at timestamptz, created_by_name text
)
language sql
stable
set search_path = ''
as $$ select * from private.monitor_rules_list_impl(p_include_history) $$;
revoke all on function public.monitor_rules_list(boolean) from public, anon;
grant execute on function public.monitor_rules_list(boolean) to authenticated;

-- Cria ou edita uma regra. Editar = arquivar a versão em vigor (p_replaces_id) e criar a nova.
-- Regra global só o admin; nas demais, o gestor precisa enxergar o cliente.
create or replace function private.monitor_rule_save_impl(
  p_replaces_id uuid, p_scope text, p_scope_id uuid, p_metric text, p_direction text,
  p_attention numeric, p_critical numeric, p_min_volume integer, p_active boolean, p_note text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_client uuid;
  v_old public.monitor_rules;
  v_id uuid;
begin
  if not private.monitor_can('rules') then
    raise exception 'Sem permissão para gerenciar as regras do monitoramento' using errcode = '42501';
  end if;
  if p_scope is null or p_scope not in ('global', 'client', 'account', 'campaign', 'ad') then
    raise exception 'Escolha onde a regra vale.' using errcode = '22023';
  end if;
  if p_metric is null or p_metric not in ('cost_per_result', 'results', 'cpc', 'cpm', 'ctr', 'roas', 'spend', 'frequency') then
    raise exception 'Métrica inválida.' using errcode = '22023';
  end if;
  if p_direction is null or p_direction not in ('up', 'down', 'both') then
    raise exception 'Escolha quando alertar (subida, queda ou os dois).' using errcode = '22023';
  end if;
  if p_attention is null or p_attention <= 0 or p_attention > 1000 then
    raise exception 'O limite de atenção precisa ser maior que 0%% e até 1000%%.' using errcode = '22023';
  end if;
  if p_critical is null or p_critical <= 0 or p_critical > 1000 then
    raise exception 'O limite crítico precisa ser maior que 0%% e até 1000%%.' using errcode = '22023';
  end if;
  if p_critical < p_attention then
    raise exception 'O limite crítico não pode ser menor que o de atenção.' using errcode = '22023';
  end if;
  if p_min_volume is not null and p_min_volume < 0 then
    raise exception 'O volume mínimo precisa ser 0 ou maior.' using errcode = '22023';
  end if;
  if char_length(coalesce(p_note, '')) > 300 then
    raise exception 'A observação pode ter até 300 caracteres.' using errcode = '22023';
  end if;

  if p_scope = 'global' then
    if p_scope_id is not null then
      raise exception 'A regra global não tem cliente.' using errcode = '22023';
    end if;
    if not private.monitor_can('admin') then
      raise exception 'Só o administrador muda as regras que valem para todos os clientes' using errcode = '42501';
    end if;
  else
    if p_scope_id is null then
      raise exception 'Escolha onde a regra vale.' using errcode = '22023';
    end if;
    v_client := private.monitor_scope_client(p_scope, p_scope_id);
    if v_client is null or not private.can_view_client(v_client) then
      raise exception 'Cliente, conta, campanha ou anúncio não encontrado' using errcode = '22023';
    end if;
  end if;

  if p_replaces_id is not null then
    select * into v_old from public.monitor_rules r where r.id = p_replaces_id for update;
    if not found or (v_old.client_id is not null and not private.can_view_client(v_old.client_id)) then
      raise exception 'Regra não encontrada' using errcode = '22023';
    end if;
    if v_old.archived_at is not null then
      raise exception 'Esta regra foi alterada por outra pessoa. Atualize a página.' using errcode = '40001';
    end if;
    if v_old.scope is distinct from p_scope or v_old.scope_id is distinct from p_scope_id or v_old.metric is distinct from p_metric then
      raise exception 'Para mudar onde a regra vale ou a métrica, crie uma regra nova.' using errcode = '22023';
    end if;
    if v_old.scope = 'global' and not private.monitor_can('admin') then
      raise exception 'Só o administrador muda as regras que valem para todos os clientes' using errcode = '42501';
    end if;
    update public.monitor_rules set archived_at = now(), archived_by = (select auth.uid()) where id = p_replaces_id;
  elsif exists (
    select 1 from public.monitor_rules r
     where r.archived_at is null and r.scope = p_scope and r.metric = p_metric
       and r.scope_id is not distinct from p_scope_id
  ) then
    raise exception 'Já existe uma regra desta métrica neste lugar. Edite a existente.' using errcode = '22023';
  end if;

  insert into public.monitor_rules (scope, scope_id, client_id, metric, direction, attention_pct, critical_pct,
                                    min_volume, active, note, replaces_id, created_by)
  values (p_scope, p_scope_id, v_client, p_metric, p_direction, p_attention, p_critical,
          p_min_volume, coalesce(p_active, true), nullif(btrim(p_note), ''), p_replaces_id, (select auth.uid()))
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function private.monitor_rule_save_impl(uuid, text, uuid, text, text, numeric, numeric, integer, boolean, text) from public, anon;
grant execute on function private.monitor_rule_save_impl(uuid, text, uuid, text, text, numeric, numeric, integer, boolean, text) to authenticated;

create or replace function public.monitor_rule_save(
  p_replaces_id uuid, p_scope text, p_scope_id uuid, p_metric text, p_direction text,
  p_attention numeric, p_critical numeric, p_min_volume integer default null, p_active boolean default true, p_note text default null
)
returns uuid
language sql
set search_path = ''
as $$ select private.monitor_rule_save_impl(p_replaces_id, p_scope, p_scope_id, p_metric, p_direction, p_attention, p_critical, p_min_volume, p_active, p_note) $$;
revoke all on function public.monitor_rule_save(uuid, text, uuid, text, text, numeric, numeric, integer, boolean, text) from public, anon;
grant execute on function public.monitor_rule_save(uuid, text, uuid, text, text, numeric, numeric, integer, boolean, text) to authenticated;

-- Tira uma regra específica de vigor (volta a valer a mais geral). A global não sai: desative-a.
create or replace function private.monitor_rule_archive_impl(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.monitor_rules;
begin
  if not private.monitor_can('rules') then
    raise exception 'Sem permissão para gerenciar as regras do monitoramento' using errcode = '42501';
  end if;
  select * into v from public.monitor_rules r where r.id = p_id for update;
  if not found or (v.client_id is not null and not private.can_view_client(v.client_id)) then
    raise exception 'Regra não encontrada' using errcode = '22023';
  end if;
  if v.archived_at is not null then
    raise exception 'Esta regra já foi alterada ou removida. Atualize a página.' using errcode = '40001';
  end if;
  if v.scope = 'global' then
    raise exception 'A regra global não pode ser removida. Para parar de monitorar a métrica, desative-a.' using errcode = '22023';
  end if;
  update public.monitor_rules set archived_at = now(), archived_by = (select auth.uid()) where id = p_id;
end;
$$;
revoke all on function private.monitor_rule_archive_impl(uuid) from public, anon;
grant execute on function private.monitor_rule_archive_impl(uuid) to authenticated;

create or replace function public.monitor_rule_archive(p_id uuid)
returns void
language sql
set search_path = ''
as $$ select private.monitor_rule_archive_impl(p_id) $$;
revoke all on function public.monitor_rule_archive(uuid) from public, anon;
grant execute on function public.monitor_rule_archive(uuid) to authenticated;
