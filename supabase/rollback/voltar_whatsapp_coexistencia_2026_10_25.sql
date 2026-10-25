-- Volta da fase "Tracking T4.2 — ligar o WhatsApp por Coexistence" (25/10/2026).
-- Desliga os números ligados por Coexistence e as funções novas. NADA é apagado (conexões, tokens no cofre e histórico ficam).
update public.tracking_whatsapp_connections set enabled = false where mode = 'coexistencia';
revoke execute on function public.wa_app_settings_save(text, text, text) from authenticated;
revoke execute on function public.wa_app_settings_get() from authenticated;
revoke execute on function public.wa_coex_connect(jsonb) from service_role;
revoke execute on function public.wa_coex_connection_for(text) from service_role;
revoke execute on function public.wa_app_credentials() from service_role;
-- (Para tirar os segredos do cofre: no painel do Supabase → Vault, nomes "wa_app_global:*" e "wa_token:*".)
