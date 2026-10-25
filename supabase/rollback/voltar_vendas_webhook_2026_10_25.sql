-- Volta da fase "Tracking T3.2 — vendas pelo webhook" (25/10/2026).
-- Desliga o recebimento. NADA é apagado: endereços, registro dos avisos e vendas já registradas ficam guardados.
update public.tracking_sales_webhooks set enabled = false where enabled;
revoke execute on function public.sales_webhook_create(uuid, text) from authenticated;
revoke execute on function public.sales_webhook_new_key(uuid) from authenticated;
revoke execute on function public.sales_webhook_receive(jsonb) from service_role;
-- (A Edge Function sales-webhook passa a responder erro; pode ser removida no painel do Supabase.)
