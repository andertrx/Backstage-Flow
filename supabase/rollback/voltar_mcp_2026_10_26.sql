-- Volta da Etapa 40 — servidor MCP (26/10/2026).
-- Desliga o MCP sem apagar nada: tira as permissões das funções novas e para a limpeza do registro.
-- A Edge Function "mcp" para de responder sozinha sem a função de gravar (ou desligue-a no painel do Supabase → Edge Functions).
-- Para cortar o acesso dos programas de IA já autorizados: Supabase → Authentication → OAuth Server → desligar.
select cron.unschedule('mcp-log-purge');
revoke execute on function public.mcp_log_call(uuid, text, boolean, text, integer, uuid) from service_role;
revoke execute on function public.mcp_health(integer) from authenticated;
revoke execute on function private.mcp_health_impl(integer) from authenticated;

-- Etapa 40.3: parar de marcar "via MCP" no histórico (o que já foi marcado fica como está).
alter table public.ops_activity disable trigger ops_activity_origin_mcp;
alter table public.ops_lead_events disable trigger ops_lead_events_origin_mcp;
alter table public.monitor_alert_events disable trigger monitor_alert_events_origin_mcp;
alter table public.audit_logs disable trigger audit_logs_origin_mcp;
