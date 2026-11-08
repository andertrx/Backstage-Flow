-- Remove o guardar texto das conversas do WhatsApp (Tracking T5.6a). Rode antes o voltar_vendas_sugeridas_2026_11_08.sql.
select cron.unschedule('wa-messages-purge');
drop function if exists private.wa_messages_purge();
drop function if exists public.wa_message_store(jsonb);
drop function if exists public.wa_messages_delete_all(uuid);
drop function if exists public.wa_messages_settings(integer);
drop function if exists public.wa_unofficial_set_store(uuid, boolean);
drop table if exists public.tracking_wa_messages;
drop function if exists private.wa_messages_can_read(uuid);
drop function if exists private.wa_messages_retention_days();
delete from private.app_settings where key = 'wa_messages_retention_days';
alter table public.tracking_whatsapp_connections drop column if exists store_messages;
-- Atenção: private.wa_unofficial_auth também devolve store_messages; recrie a versão anterior (migração 20261108070000) depois de remover a coluna.
