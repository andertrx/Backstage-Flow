-- =============================================================================
-- REMOÇÃO da Central de Operações (Etapa 36: 36.1 a 36.6).
--
-- Desliga os avisos diários e as repetições (pg_cron), apaga as notificações, as reuniões (Dailies, atas e itens), o Kanban comercial (leads e o histórico deles), o fluxo dos clientes (etapas, Account Manager, demandas, filas e
-- atividades registradas), tarefas (com comentários, anexos registrados e histórico), status,
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

-- 36.6: notificações (sino), avisos diários e repetição. As tarefas e reuniões
-- já criadas por repetição continuam (são tarefas e reuniões normais) até as partes delas.
select cron.unschedule(jobname) from cron.job where jobname in ('ops-recurrences', 'ops-notify-daily');
drop trigger if exists ops_task_people_notify on public.ops_task_people;
drop trigger if exists ops_mentions_notify on public.ops_mentions;
drop trigger if exists ops_comments_notify on public.ops_comments;
drop trigger if exists ops_tasks_notify_done on public.ops_tasks;
drop trigger if exists ops_meeting_people_notify on public.ops_meeting_people;
drop trigger if exists ops_meeting_items_notify on public.ops_meeting_items;
drop trigger if exists ops_client_ops_notify on public.ops_client_ops;
drop trigger if exists ops_leads_notify on public.ops_leads;
drop function if exists public.ops_notification_prefs_save(p_muted text[]);
drop function if exists public.ops_notifications_list(p_unread boolean, p_kind text, p_limit integer);
drop function if exists public.ops_notifications_read(p_ids bigint[]);
drop function if exists public.ops_notifications_unread();
drop function if exists public.ops_recurrence_for(p_kind text, p_id uuid);
drop function if exists public.ops_recurrence_save(p jsonb);
drop function if exists public.ops_recurrence_stop(p_id uuid);
drop function if exists private.ops_notification_prefs_save_impl(p_muted text[]);
drop function if exists private.ops_notifications_list_impl(p_unread boolean, p_kind text, p_limit integer);
drop function if exists private.ops_notifications_read_impl(p_ids bigint[]);
drop function if exists private.ops_notifications_unread_impl();
drop function if exists private.ops_notify_am_tg();
drop function if exists private.ops_notify_comment_tg();
drop function if exists private.ops_notify_daily();
drop function if exists private.ops_notify_lead_tg();
drop function if exists private.ops_notify_meeting_item_tg();
drop function if exists private.ops_notify_meeting_people_tg();
drop function if exists private.ops_notify_mention_tg();
drop function if exists private.ops_notify_task_done_tg();
drop function if exists private.ops_notify_task_people_tg();
drop function if exists private.ops_notify(p_user uuid, p_kind text, p_title text, p_body text, p_link text, p_dedupe text, p_task uuid, p_meeting uuid);
drop function if exists private.ops_recurrence_for_impl(p_kind text, p_id uuid);
drop function if exists private.ops_recurrence_save_impl(p jsonb);
drop function if exists private.ops_recurrence_stop_impl(p_id uuid);
drop function if exists private.ops_recurrence_can_stop(p_rec uuid);
drop function if exists private.ops_recurrence_generate(p_rec uuid);
drop function if exists private.ops_recurrence_matches(p_frequency text, p_weekdays smallint[], p_month_day smallint, p_day date);
alter table public.ops_tasks drop column if exists recurrence_id, drop column if exists occurrence_date;
alter table public.ops_meetings drop column if exists recurrence_id, drop column if exists occurrence_date;
drop table if exists public.ops_recurrences;
drop table if exists public.ops_notifications;
drop table if exists public.ops_notification_prefs;
drop function if exists private.ops_user_can(p_user uuid, p_permission text);
drop function if exists private.ops_person_name(p_user uuid);

-- 36.5: Dailies e reuniões (agenda, ata, presença e itens). As tarefas geradas
-- por reuniões são tarefas normais e saem junto com as tarefas, mais abaixo.
drop function if exists public.ops_meeting_cancel(p_id uuid, p_version integer, p_reason text);
drop function if exists public.ops_meeting_category_save(p_id text, p_name text, p_color text, p_active boolean);
drop function if exists public.ops_meeting_get(p_id uuid);
drop function if exists public.ops_meeting_item_add(p_meeting uuid, p jsonb);
drop function if exists public.ops_meeting_item_remove(p_id uuid);
drop function if exists public.ops_meeting_item_to_task(p_item uuid);
drop function if exists public.ops_meeting_list(f jsonb);
drop function if exists public.ops_meeting_record(p_id uuid, p_version integer, p_notes text, p_attended uuid[]);
drop function if exists public.ops_meeting_save(p_id uuid, p_version integer, p jsonb);
drop function if exists private.ops_meeting_cancel_impl(p_id uuid, p_version integer, p_reason text);
drop function if exists private.ops_meeting_category_save_impl(p_id text, p_name text, p_color text, p_active boolean);
drop function if exists private.ops_meeting_get_impl(p_id uuid);
drop function if exists private.ops_meeting_item_add_impl(p_meeting uuid, p jsonb);
drop function if exists private.ops_meeting_item_remove_impl(p_id uuid);
drop function if exists private.ops_meeting_item_to_task_impl(p_item uuid);
drop function if exists private.ops_meeting_list_impl(f jsonb);
drop function if exists private.ops_meeting_record_impl(p_id uuid, p_version integer, p_notes text, p_attended uuid[]);
drop function if exists private.ops_meeting_save_impl(p_id uuid, p_version integer, p jsonb);
drop function if exists private.ops_meeting_log(p_meeting uuid, p_action text, p_before jsonb, p_after jsonb, p_origin text);
drop function if exists private.ops_meeting_snapshot(p_meeting uuid);
alter table public.ops_activity drop column if exists meeting_id;
drop table if exists public.ops_meeting_items;
drop table if exists public.ops_meeting_people;
drop table if exists public.ops_meetings;
drop table if exists public.ops_meeting_categories;
drop function if exists private.ops_meeting_can_add(p_meeting uuid);
drop function if exists private.ops_meeting_can_edit(p_meeting uuid);
drop function if exists private.ops_meeting_visible(p_meeting uuid);

-- 36.4: Kanban comercial (leads, histórico dos leads, colunas e motivos de perda).
-- Os clientes criados pela conversão continuam existindo (são clientes normais).
drop function if exists public.ops_lead_archive(p_id uuid, p_archived boolean);
drop function if exists public.ops_lead_board(f jsonb);
drop function if exists public.ops_lead_convert(p_lead uuid, p_version integer, p_client uuid, p_start boolean, p_am uuid);
drop function if exists public.ops_lead_duplicates(p jsonb);
drop function if exists public.ops_lead_get(p_id uuid);
drop function if exists public.ops_lead_move(p_id uuid, p_version integer, p_stage text, p_loss_reason text, p_loss_note text);
drop function if exists public.ops_lead_note_add(p_lead uuid, p_kind text, p_body text, p_happened_at timestamp with time zone);
drop function if exists public.ops_lead_save(p_id uuid, p_version integer, p jsonb);
drop function if exists public.ops_lead_stage_reorder(p_ids text[]);
drop function if exists public.ops_lead_stage_save(p_id text, p_name text, p_color text, p_category text, p_require_previous boolean, p_require_next_action boolean);
drop function if exists public.ops_lead_stage_set_active(p_id text, p_active boolean, p_move_to text);
drop function if exists public.ops_loss_reason_save(p_id text, p_name text, p_active boolean);
drop function if exists private.ops_lead_archive_impl(p_id uuid, p_archived boolean);
drop function if exists private.ops_lead_board_impl(f jsonb);
drop function if exists private.ops_lead_convert_impl(p_lead uuid, p_version integer, p_client uuid, p_start boolean, p_am uuid);
drop function if exists private.ops_lead_duplicates_impl(p jsonb);
drop function if exists private.ops_lead_get_impl(p_id uuid);
drop function if exists private.ops_lead_move_impl(p_id uuid, p_version integer, p_stage text, p_loss_reason text, p_loss_note text);
drop function if exists private.ops_lead_note_add_impl(p_lead uuid, p_kind text, p_body text, p_happened_at timestamp with time zone);
drop function if exists private.ops_lead_save_impl(p_id uuid, p_version integer, p jsonb);
drop function if exists private.ops_lead_stage_reorder_impl(p_ids text[]);
drop function if exists private.ops_lead_stage_save_impl(p_id text, p_name text, p_color text, p_category text, p_require_previous boolean, p_require_next_action boolean);
drop function if exists private.ops_lead_stage_set_active_impl(p_id text, p_active boolean, p_move_to text);
drop function if exists private.ops_loss_reason_save_impl(p_id text, p_name text, p_active boolean);
drop function if exists private.ops_lead_log(p_lead uuid, p_action text, p_before jsonb, p_after jsonb, p_origin text);
drop function if exists private.ops_lead_snapshot(p_lead uuid);
drop function if exists private.ops_norm_name(t text);
drop function if exists private.ops_norm_phone(t text);
drop table if exists public.ops_lead_events;
drop table if exists public.ops_leads;
drop table if exists public.ops_loss_reasons;
drop table if exists public.ops_lead_stages;

-- 36.3: clientes no fluxo, filas, demandas e registro manual
drop policy if exists "Vê demandas com tarefa visível ou do cliente que acompanha" on public.ops_demands;
drop function if exists public.ops_activity_type_save(text, text, boolean);
drop function if exists private.ops_activity_type_save_impl(text, text, boolean);
drop function if exists public.ops_queue_column_set_active(uuid, boolean);
drop function if exists private.ops_queue_column_set_active_impl(uuid, boolean);
drop function if exists public.ops_queue_column_reorder(uuid, uuid[]);
drop function if exists private.ops_queue_column_reorder_impl(uuid, uuid[]);
drop function if exists public.ops_queue_column_save(uuid, uuid, text, text, text);
drop function if exists private.ops_queue_column_save_impl(uuid, uuid, text, text, text);
drop function if exists public.ops_client_stage_set_active(text, boolean, text);
drop function if exists private.ops_client_stage_set_active_impl(text, boolean, text);
drop function if exists public.ops_client_stage_reorder(text[]);
drop function if exists private.ops_client_stage_reorder_impl(text[]);
drop function if exists public.ops_client_stage_save(text, text, text, boolean, boolean);
drop function if exists private.ops_client_stage_save_impl(text, text, text, boolean, boolean);
drop function if exists public.ops_client_get(uuid);
drop function if exists private.ops_client_get_impl(uuid);
drop function if exists public.ops_client_board(jsonb);
drop function if exists private.ops_client_board_impl(jsonb);
drop function if exists public.ops_client_note_remove(uuid);
drop function if exists private.ops_client_note_remove_impl(uuid);
drop function if exists public.ops_client_note_add(jsonb);
drop function if exists private.ops_client_note_add_impl(jsonb);
drop function if exists public.ops_demand_release(jsonb);
drop function if exists private.ops_demand_release_impl(jsonb);
drop function if exists public.ops_client_stage_move(uuid, integer, text);
drop function if exists private.ops_client_stage_move_impl(uuid, integer, text);
drop function if exists public.ops_client_set_am(uuid, integer, uuid);
drop function if exists private.ops_client_set_am_impl(uuid, integer, uuid);
drop function if exists public.ops_client_start(uuid, text, uuid);
drop function if exists private.ops_client_start_impl(uuid, text, uuid);
drop function if exists public.ops_task_move_queue(uuid, integer, uuid);
drop function if exists private.ops_task_move_queue_impl(uuid, integer, uuid);

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
drop table if exists public.ops_client_notes;
drop table if exists public.ops_activity_types;
drop table if exists public.ops_demands;
drop table if exists public.ops_queue_columns;
drop table if exists public.ops_client_ops;
drop table if exists public.ops_client_stages;
drop function if exists private.ops_client_auto_advance_tg();
drop function if exists private.ops_client_summary(uuid);
drop function if exists private.ops_can_manage_clients();
drop function if exists private.ops_can_move_client(uuid);
drop function if exists private.ops_client_pending(uuid, integer, integer);
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
drop function if exists private.ops_client_visible(uuid);
drop function if exists private.ops_is_am(uuid);

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
