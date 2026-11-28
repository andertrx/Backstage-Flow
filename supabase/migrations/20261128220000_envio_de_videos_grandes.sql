-- Fase J.4 — Vídeos grandes: estado do envio em partes (Drive → Meta) e reaproveitamento do vídeo já enviado.
-- Só o servidor grava (função meta-builder com a chave de serviço). Quem vê o Criador e o cliente da conta pode ler o andamento.
-- Nenhum conteúdo do vídeo fica aqui: só códigos, tamanhos e posição do envio.

create table public.builder_media_uploads (
  id                uuid primary key default gen_random_uuid(),
  ad_account_id     uuid not null references public.ad_accounts (id),
  drive_file_id     text not null check (drive_file_id ~ '^[A-Za-z0-9_-]{10,100}$'),
  drive_modified_at text not null check (char_length(drive_modified_at) <= 40),
  file_name         text not null default '' check (char_length(file_name) <= 300),
  file_size         bigint not null check (file_size > 0),
  upload_session_id text not null default '' check (char_length(upload_session_id) <= 100),
  meta_video_id     text not null default '' check (meta_video_id ~ '^[0-9]{0,30}$'),
  start_offset      bigint not null default 0 check (start_offset >= 0),
  end_offset        bigint not null default 0 check (end_offset >= 0),
  status            text not null default 'enviando' check (status in ('enviando', 'processando', 'pronto', 'falhou')),
  thumbnail_url     text not null default '' check (thumbnail_url = '' or thumbnail_url ~ '^https://'),
  error_message     text not null default '' check (char_length(error_message) <= 500),
  created_by        uuid references auth.users (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
comment on table public.builder_media_uploads is 'Fase J.4: envio de vídeo em partes do Drive para o Meta (posição, código do vídeo, miniatura). O mesmo arquivo do Drive, sem alteração, é reaproveitado na mesma conta. Sem prazo; linhas pequenas, sem o conteúdo do vídeo.';
-- Um envio "vivo" por conta + arquivo + versão do arquivo (os que falharam ficam no histórico).
create unique index builder_media_uploads_uq on public.builder_media_uploads (ad_account_id, drive_file_id, drive_modified_at) where status <> 'falhou';
create index builder_media_uploads_created_by_idx on public.builder_media_uploads (created_by);

alter table public.builder_media_uploads enable row level security;
revoke all on table public.builder_media_uploads from anon, authenticated;
grant select on table public.builder_media_uploads to authenticated;
create policy "Criador: vê o andamento dos envios das contas que enxerga" on public.builder_media_uploads for select to authenticated
  using ((select private.builder_pode_ver()) and exists (
    select 1 from public.ad_accounts a where a.id = ad_account_id and (select private.can_view_client(a.client_id))));
