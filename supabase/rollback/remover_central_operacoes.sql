-- =============================================================================
-- REMOÇÃO da Central de Operações (Etapa 36: 36.1 e 36.2).
--
-- Apaga tarefas (com comentários, anexos registrados e histórico delas), status,
-- setores, equipe da Central e permissões da Central, e volta as regras
-- de clientes dos módulos de anúncios como eram antes (sem o papel "equipe").
-- NÃO mexe em clientes, usuários, métricas, campanhas nem anúncios.
-- Só rodar com decisão explícita, no SQL Editor. Depois: reverter o commit da
-- Etapa 36 no GitHub e publicar de novo a Edge Function "admin-users".
--
-- O papel "equipe" continua existindo no banco (o Postgres não remove valor de
-- tipo sem recriar a tabela de perfis): antes de rodar, troque o papel das
-- pessoas "Equipe" em Configurações → Usuários.
--
-- Arquivos anexados: o Supabase não deixa apagar arquivo nem bucket por SQL.
-- Antes de rodar, baixe o que quiser guardar e apague o bucket "ops-files" pelo
-- painel (Storage → ops-files → Delete bucket). O script confere isso.
-- =============================================================================
begin;

do $$ begin
  if exists (select 1 from public.profiles where role = 'equipe') then
    raise exception 'Ainda há usuários com papel Equipe. Troque o papel deles antes de remover a Central.';
  end if;
end $$;

do $$ begin
  if exists (select 1 from storage.buckets where id = 'ops-files') then
    raise exception 'O bucket ops-files ainda existe. Baixe o que quiser guardar e apague o bucket pelo painel (Storage) antes de remover.';
  end if;
end $$;

-- 36.2: tarefas
drop policy if exists "Central envia anexos das tarefas visíveis" on storage.objects;
drop policy if exists "Central abre anexos das tarefas visíveis" on storage.objects;
drop function if exists public.ops_status_set_active(text, boolean, text);
drop function if exists private.ops_status_set_active_impl(text, boolean, text);
drop function if exists public.ops_status_reorder(text[]);
drop function if exists private.ops_status_reorder_impl(text[]);
drop function if exists public.ops_status_save(text, text, text, text);
drop function if exists private.ops_status_save_impl(text, text, text, text);
drop function if exists public.ops_team_counts();
drop function if exists private.ops_team_counts_impl();
drop function if exists public.ops_directory();
drop function if exists private.ops_directory_impl();
drop function if exists public.ops_task_get(uuid);
drop function if exists private.ops_task_get_impl(uuid);
drop function if exists public.ops_task_list(jsonb, integer, integer);
drop function if exists private.ops_task_list_impl(jsonb, integer, integer);
drop function if exists public.ops_attachment_remove(uuid);
drop function if exists private.ops_attachment_remove_impl(uuid);
drop function if exists public.ops_attachment_add(uuid, text, text);
drop function if exists private.ops_attachment_add_impl(uuid, text, text);
drop function if exists public.ops_comment_remove(bigint);
drop function if exists private.ops_comment_remove_impl(bigint);
drop function if exists public.ops_comment_add(uuid, text, uuid[]);
drop function if exists private.ops_comment_add_impl(uuid, text, uuid[]);
drop function if exists public.ops_task_dependency(uuid, uuid, boolean);
drop function if exists private.ops_task_dependency_impl(uuid, uuid, boolean);
drop function if exists public.ops_task_archive(uuid, boolean);
drop function if exists private.ops_task_archive_impl(uuid, boolean);
drop function if exists public.ops_task_set_people(uuid, integer, jsonb);
drop function if exists private.ops_task_set_people_impl(uuid, integer, jsonb);
drop function if exists public.ops_task_set_status(uuid, integer, text);
drop function if exists private.ops_task_set_status_impl(uuid, integer, text);
drop function if exists public.ops_task_save(uuid, integer, jsonb);
drop function if exists private.ops_task_save_impl(uuid, integer, jsonb);
drop table if exists public.ops_activity;
drop table if exists public.ops_attachments;
drop table if exists public.ops_mentions;
drop table if exists public.ops_comments;
drop table if exists public.ops_task_tags;
drop table if exists public.ops_tags;
drop table if exists public.ops_task_deps;
drop table if exists public.ops_task_people;
drop table if exists public.ops_tasks;
drop table if exists public.ops_statuses;
drop function if exists private.ops_write_tags(uuid, jsonb);
drop function if exists private.ops_write_people(uuid, jsonb);
drop function if exists private.ops_task_people_json(uuid);
drop function if exists private.ops_task_snapshot(uuid);
drop function if exists private.ops_member_ok(uuid);
drop function if exists private.ops_task_blockers(uuid);
drop function if exists private.ops_log(uuid, uuid, text, jsonb, jsonb, text);
drop function if exists private.ops_need(text);
drop function if exists private.ops_task_folder_visible(text);
drop function if exists private.ops_task_visible(uuid);

-- 36.1: setores e equipe
drop function if exists public.ops_team();
drop function if exists private.ops_team_impl();
drop function if exists public.ops_my_permissions();
drop function if exists private.ops_my_permissions_impl();
drop function if exists public.ops_member_save(uuid, uuid, uuid[], text, boolean, boolean, text[]);
drop function if exists private.ops_member_save_impl(uuid, uuid, uuid[], text, boolean, boolean, text[]);
drop function if exists public.ops_sector_set_status(uuid, text, uuid);
drop function if exists private.ops_sector_set_status_impl(uuid, text, uuid);
drop function if exists public.ops_sector_reorder(uuid[]);
drop function if exists private.ops_sector_reorder_impl(uuid[]);
drop function if exists public.ops_sector_save(uuid, text, text);
drop function if exists private.ops_sector_save_impl(uuid, text, text);
drop function if exists private.ops_require_admin();
drop table if exists public.ops_member_permissions;
drop table if exists public.ops_member_sectors;
drop table if exists public.ops_members;
drop table if exists public.ops_sectors;
drop function if exists private.ops_can(text);

-- Regras de clientes como na Etapa 19.2
create or replace function private.visible_client_ids()
returns setof uuid language sql stable security definer set search_path = '' as $$
  select c.id from public.clients c where private.current_user_role() = 'admin'
  union
  select a.client_id from public.user_client_access a
  where a.user_id = (select auth.uid()) and private.current_user_role() is not null
    and (private.current_user_role() <> 'cliente'
         or exists (select 1 from public.client_portal p where p.client_id = a.client_id and p.login_enabled))
$$;
create or replace function private.can_view_client(target uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select case
    when private.current_user_role() is null then false
    when private.current_user_role() = 'admin' then true
    else exists (
      select 1 from public.user_client_access a
      where a.user_id = (select auth.uid()) and a.client_id = target
        and (private.current_user_role() <> 'cliente'
             or exists (select 1 from public.client_portal p where p.client_id = target and p.login_enabled))
    )
  end
$$;

commit;
