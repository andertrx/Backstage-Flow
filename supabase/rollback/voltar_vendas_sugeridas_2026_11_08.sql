-- Remove as Vendas sugeridas pela IA (Tracking T5.6b). Não mexe nas conversas guardadas (T5.6a).
select cron.unschedule('wa-ai');
drop function if exists private.trigger_wa_ai();
drop function if exists private.wa_suggestions_purge();
drop function if exists public.wa_suggestion_decide(uuid, text);
drop function if exists public.wa_ai_report(jsonb);
drop function if exists public.wa_suggestion_add(jsonb);
drop function if exists public.wa_ai_batch(integer);
drop function if exists public.wa_ai_key_get();
drop function if exists public.wa_ai_remove_key();
drop function if exists public.wa_ai_save(text, boolean);
drop table if exists public.tracking_wa_suggestions;
drop table if exists public.wa_ai_settings;
delete from vault.secrets where name = 'anthropic_api_key';
-- Servidor: apagar a função "wa-ai" no painel do Supabase.
