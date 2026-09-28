-- =============================================================================
-- Etapa 36.4 (parte 1): Kanban comercial — etapas, motivos de perda, leads e
-- histórico comercial. Dados de contato do lead ficam legíveis (a equipe precisa
-- ligar), protegidos: só quem tem "Comercial" (e o admin) lê; nunca vão para os
-- Logs nem para o histórico (lá fica só "telefone alterado").
-- Remoção: supabase/rollback/remover_central_operacoes.sql
-- =============================================================================

create table public.ops_lead_stages (
  id                  text primary key default gen_random_uuid()::text,
  name                text not null check (char_length(btrim(name)) between 2 and 40),
  color               text not null check (color ~ '^#[0-9A-Fa-f]{6}$'),
  -- Grupo fixo: aberto (em negociação), ganho (pode virar cliente), perdido (exige motivo).
  category            text not null check (category in ('aberto', 'ganho', 'perdido')),
  position            integer not null default 0,
  active              boolean not null default true,
  -- Regras de transição (configuráveis):
  require_previous    boolean not null default false,  -- só entra vindo da etapa imediatamente anterior
  require_next_action boolean not null default false,  -- exige próxima ação com data para entrar
  updated_at          timestamptz not null default now(),
  updated_by          uuid references auth.users (id) on delete set null
);
comment on table public.ops_lead_stages is 'Etapa 36: colunas do Kanban comercial (nome, cor, ordem e regras de transição configuráveis).';
create index ops_lead_stages_updated_by_idx on public.ops_lead_stages (updated_by);
insert into public.ops_lead_stages (id, name, color, category, position) values
  ('prospeccao', 'Prospecção', '#64748B', 'aberto', 1),
  ('primeiro_contato', 'Primeiro Contato', '#06B6D4', 'aberto', 2),
  ('reuniao_agendada', 'Reunião Agendada', '#22D3EE', 'aberto', 3),
  ('reuniao_realizada', 'Reunião Realizada', '#3B82F6', 'aberto', 4),
  ('proposta_enviada', 'Proposta Enviada', '#A855F7', 'aberto', 5),
  ('negociacao', 'Negociação', '#F59E0B', 'aberto', 6),
  ('contrato_enviado', 'Contrato Enviado', '#EAB308', 'aberto', 7),
  ('contrato_assinado', 'Contrato Assinado', '#EC4899', 'aberto', 8),
  ('aguardando_pagamento', 'Aguardando Pagamento', '#7C3AED', 'aberto', 9),
  ('contrato_pago', 'Contrato Pago', '#10B981', 'ganho', 10),
  ('perdido', 'Perdido', '#EF4444', 'perdido', 11);

create table public.ops_loss_reasons (
  id        text primary key default gen_random_uuid()::text,
  name      text not null check (char_length(btrim(name)) between 2 and 60),
  position  integer not null default 0,
  active    boolean not null default true
);
comment on table public.ops_loss_reasons is 'Etapa 36: motivos de perda de lead (configuráveis).';
insert into public.ops_loss_reasons (id, name, position) values
  ('sem_fit', 'Sem fit com a empresa', 1), ('sem_interesse', 'Sem interesse no plano', 2),
  ('valor', 'Valor incompatível', 3), ('sem_retorno', 'Sem retorno', 4), ('outros', 'Outros motivos', 5);

create table public.ops_leads (
  id                uuid primary key default gen_random_uuid(),
  number            bigint generated always as identity unique,
  company_name      text not null check (char_length(btrim(company_name)) between 2 and 160),
  contact_name      text check (char_length(contact_name) <= 120),
  phone             text check (phone is null or phone ~ '^\+?[0-9]{10,15}$'),
  email             text check (email is null or (char_length(email) <= 254 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  cnpj              text check (cnpj is null or private.is_valid_cnpj(cnpj)),
  segment           text check (char_length(segment) <= 80),
  city              text check (char_length(city) <= 80),
  state             text check (state is null or state ~ '^[A-Z]{2}$'),
  origin            text check (char_length(origin) <= 60),
  service_interest  text check (char_length(service_interest) <= 160),
  owner_id          uuid references public.profiles (id),
  notes             text check (char_length(notes) <= 5000),
  -- Valor potencial com moeda: os totais somam só dentro da mesma moeda.
  potential_value   numeric(14, 2) check (potential_value is null or potential_value >= 0),
  currency          text not null default 'BRL' check (currency ~ '^[A-Z]{3}$'),
  priority          text not null default 'media' check (priority in ('baixa', 'media', 'alta', 'urgente')),
  entered_at        date not null default (now() at time zone 'America/Sao_Paulo')::date,
  next_action       text check (char_length(next_action) <= 200),
  next_action_date  date,
  stage_id          text not null references public.ops_lead_stages (id),
  stage_since       timestamptz not null default now(),
  last_interaction_at timestamptz,
  loss_reason_id    text references public.ops_loss_reasons (id),
  loss_note         text check (char_length(loss_note) <= 1000),
  lost_at           timestamptz,
  client_id         uuid references public.clients (id),
  converted_at      timestamptz,
  converted_by      uuid references auth.users (id) on delete set null,
  archived_at       timestamptz,
  version           integer not null default 1,
  created_by        uuid references auth.users (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  updated_by        uuid references auth.users (id) on delete set null
);
comment on table public.ops_leads is 'Etapa 36: leads do Kanban comercial. Contato legível só para o Comercial e o admin. Nunca apagar: arquivar.';
create index ops_leads_stage_idx on public.ops_leads (stage_id) where archived_at is null;
create index ops_leads_owner_idx on public.ops_leads (owner_id);
create index ops_leads_client_idx on public.ops_leads (client_id);
create index ops_leads_next_action_idx on public.ops_leads (next_action_date) where archived_at is null;
create index ops_leads_loss_reason_idx on public.ops_leads (loss_reason_id);
create index ops_leads_created_by_idx on public.ops_leads (created_by);
create index ops_leads_updated_by_idx on public.ops_leads (updated_by);
create index ops_leads_converted_by_idx on public.ops_leads (converted_by);
create index ops_leads_company_search_idx on public.ops_leads using gin (private.search_norm(company_name) extensions.gin_trgm_ops);
create trigger ops_leads_touch before update on public.ops_leads for each row execute function private.touch_updated_at();

-- Histórico comercial: mudanças (sem dados de contato) e interações registradas.
create table public.ops_lead_events (
  id          bigint generated always as identity primary key,
  lead_id     uuid not null references public.ops_leads (id) on delete cascade,
  action      text not null,
  -- Interações: contato, reuniao, proposta, contrato, observacao.
  kind        text check (kind in ('contato', 'reuniao', 'proposta', 'contrato', 'observacao')),
  body        text check (char_length(body) <= 5000),
  happened_at timestamptz,
  actor_id    uuid references auth.users (id) on delete set null,
  origin      text not null default 'manual' check (origin in ('manual', 'sistema')),
  before      jsonb,
  after       jsonb,
  created_at  timestamptz not null default now()
);
comment on table public.ops_lead_events is 'Etapa 36: histórico comercial do lead (permanente; dados de contato nunca aparecem aqui).';
create index ops_lead_events_lead_idx on public.ops_lead_events (lead_id, created_at desc);
create index ops_lead_events_actor_idx on public.ops_lead_events (actor_id);

-- -----------------------------------------------------------------------------
-- Acesso: tudo exige "Comercial" (admin sempre). Configuração: só admin.
-- -----------------------------------------------------------------------------
alter table public.ops_lead_stages enable row level security;
alter table public.ops_loss_reasons enable row level security;
alter table public.ops_leads enable row level security;
alter table public.ops_lead_events enable row level security;
revoke all on public.ops_lead_stages, public.ops_loss_reasons, public.ops_leads, public.ops_lead_events from anon, authenticated;
grant select on public.ops_lead_stages, public.ops_loss_reasons, public.ops_leads, public.ops_lead_events to authenticated;
create policy "Comercial vê as etapas" on public.ops_lead_stages for select to authenticated using ((select private.ops_can('ops.commercial')));
create policy "Comercial vê os motivos de perda" on public.ops_loss_reasons for select to authenticated using ((select private.ops_can('ops.commercial')));
create policy "Comercial vê os leads" on public.ops_leads for select to authenticated using ((select private.ops_can('ops.commercial')));
create policy "Comercial vê o histórico comercial" on public.ops_lead_events for select to authenticated using ((select private.ops_can('ops.commercial')));

create function private.ops_lead_log(p_lead uuid, p_action text, p_before jsonb, p_after jsonb, p_origin text default 'manual')
returns void language sql security definer set search_path = '' as $$
  insert into public.ops_lead_events (lead_id, action, actor_id, origin, before, after)
  values (p_lead, p_action, (select auth.uid()), p_origin, p_before, p_after)
$$;
revoke all on function private.ops_lead_log(uuid, text, jsonb, jsonb, text) from public, anon, authenticated;

-- Fotografia do lead para o histórico. Dados de contato entram só como "preenchido"
-- (nunca o valor): o histórico mostra "telefone alterado", sem o número.
create function private.ops_lead_snapshot(p_lead uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'empresa', l.company_name, 'segmento', l.segment, 'cidade', l.city, 'uf', l.state, 'origem', l.origin,
    'servico', l.service_interest, 'observacoes', l.notes, 'valor', l.potential_value, 'moeda', l.currency, 'prioridade', l.priority,
    'entrada', l.entered_at, 'proxima_acao', l.next_action, 'data_proxima_acao', l.next_action_date,
    'contato', md5(coalesce(l.contact_name, '')), 'telefone', md5(coalesce(l.phone, '')), 'email', md5(coalesce(l.email, '')),
    'cnpj', md5(coalesce(l.cnpj, '')))
  from public.ops_leads l where l.id = p_lead
$$;
revoke all on function private.ops_lead_snapshot(uuid) from public, anon, authenticated;

-- Normaliza texto para comparar nomes (minúsculo, sem acento, sem pontuação).
create function private.ops_norm_name(t text)
returns text language sql immutable set search_path = '' as $$
  select btrim(regexp_replace(private.search_norm(coalesce(t, '')), '[^a-z0-9]+', ' ', 'g'))
$$;
revoke all on function private.ops_norm_name(text) from public, anon;
grant execute on function private.ops_norm_name(text) to authenticated;
