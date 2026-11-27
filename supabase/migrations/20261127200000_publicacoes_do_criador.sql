-- Criador de campanhas, Fase B: registro de cada PUBLICAÇÃO no Meta (o que foi criado, o ID do Meta e o erro, se houve).
-- Só a função do servidor (meta-builder) grava; as pessoas só leem (o RLS confere cliente e módulo). Nunca se apaga: é o histórico.

create table public.publish_operations (
  id             uuid primary key default gen_random_uuid(),
  draft_id       uuid not null references public.builder_drafts (id),
  client_id      uuid not null references public.clients (id),
  ad_account_id  uuid not null references public.ad_accounts (id),
  operation_key  text not null unique check (char_length(operation_key) between 8 and 80),
  status         text not null default 'processando' check (status in ('processando', 'concluida', 'parcial', 'falhou')),
  summary        jsonb not null default '{}'::jsonb,
  error_message  text check (error_message is null or char_length(error_message) <= 1000),
  created_by     uuid references auth.users (id) on delete set null,
  created_at     timestamptz not null default now(),
  finished_at    timestamptz
);
comment on table public.publish_operations is 'Criador de campanhas (Fase B): uma publicação no Meta. operation_key evita publicar duas vezes (duplo clique, recarregar). Permanente: histórico.';
create index publish_operations_draft_idx on public.publish_operations (draft_id, created_at desc);
create index publish_operations_client_idx on public.publish_operations (client_id, created_at desc);
create index publish_operations_account_idx on public.publish_operations (ad_account_id);
create index publish_operations_created_by_idx on public.publish_operations (created_by);

create table public.publish_items (
  id               uuid primary key default gen_random_uuid(),
  operation_id     uuid not null references public.publish_operations (id),
  kind             text not null check (kind in ('campanha', 'conjunto', 'criativo', 'anuncio')),
  local_id         text not null,
  name             text not null default '' check (char_length(name) <= 300),
  position         integer not null,
  status           text not null default 'pendente' check (status in ('pendente', 'criado', 'falhou', 'pulado')),
  meta_id          text check (meta_id is null or char_length(meta_id) <= 60),
  confirmed        boolean not null default false,
  effective_status text check (effective_status is null or char_length(effective_status) <= 60),
  error_code       integer,
  error_message    text check (error_message is null or char_length(error_message) <= 1000),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
comment on table public.publish_items is 'Cada objeto de uma publicação (campanha, conjunto, criativo, anúncio) com o ID que o Meta devolveu e a confirmação por releitura. Permanente.';
create index publish_items_operation_idx on public.publish_items (operation_id, position);

alter table public.publish_operations enable row level security;
alter table public.publish_items enable row level security;
revoke all on table public.publish_operations, public.publish_items from anon, authenticated;
grant select on table public.publish_operations, public.publish_items to authenticated;

create policy "Publicações: vê as dos clientes que enxerga" on public.publish_operations for select to authenticated
  using ((select private.builder_pode_ver()) and (select private.can_view_client(client_id)));
create policy "Itens da publicação: vê os dos clientes que enxerga" on public.publish_items for select to authenticated
  using ((select private.builder_pode_ver()) and exists (
    select 1 from public.publish_operations o where o.id = operation_id and (select private.can_view_client(o.client_id))));
