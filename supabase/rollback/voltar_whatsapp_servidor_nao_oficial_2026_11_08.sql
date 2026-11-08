-- Volta a T5.3: remove as conexões "nao_oficial" (e o que dependia delas) e as colunas novas.
delete from public.tracking_whatsapp_conversations where connection_id in (select id from public.tracking_whatsapp_connections where mode = 'nao_oficial');
delete from public.tracking_whatsapp_connections where mode = 'nao_oficial';
drop function if exists public.wa_unofficial_auth(uuid, text);
drop function if exists public.wa_unofficial_set_enabled(uuid, boolean);
drop function if exists public.wa_unofficial_new_key(uuid);
drop function if exists public.wa_unofficial_save(uuid, text);
drop function if exists private.wa_unofficial_auth(uuid, text);
drop function if exists private.wa_unofficial_set_enabled_impl(uuid, boolean);
drop function if exists private.wa_unofficial_new_key_impl(uuid);
drop function if exists private.wa_unofficial_save_impl(uuid, text);
alter table public.tracking_whatsapp_connections drop column if exists has_inbound_key, drop column if exists inbound_key_hint, drop column if exists inbound_key_hash;
alter table public.tracking_whatsapp_connections drop constraint if exists tracking_whatsapp_connections_mode_check;
alter table public.tracking_whatsapp_connections add constraint tracking_whatsapp_connections_mode_check check (mode in ('manual', 'coexistencia'));
alter table public.tracking_whatsapp_connections alter column waba_id set not null;
