-- Ponto de volta (23/10/2026): desfaz a migração clientes_desativar.
-- Tira os gatilhos novos, guarda as funções novas com o sufixo _nova_2026_10_23 e devolve as antigas
-- (que ficaram em private.*_antes_2026_10_23) ao nome e ao lugar originais. Não apaga dados.
-- ATENÇÃO (23/10/2026): rode ANTES o voltar_clientes_excluir_2026_10_23.sql. Depois dele, can_view_client
-- já é a função original (as linhas sobre can_view_client abaixo devem ser puladas).
-- Rodar inteiro no SQL Editor do Supabase.
begin;
drop trigger if exists clients_status_guard on public.clients;
drop trigger if exists clients_status_effects on public.clients;

alter function public.sync_claim_due(integer, integer) rename to sync_claim_due_nova_2026_10_23;
alter function public.sync_claim_due_nova_2026_10_23(integer, integer) set schema private;
alter function private.sync_claim_due_antes_2026_10_23(integer, integer) set schema public;
alter function public.sync_claim_due_antes_2026_10_23(integer, integer) rename to sync_claim_due;

alter function public.sync_claim_backfill(integer, integer) rename to sync_claim_backfill_nova_2026_10_23;
alter function public.sync_claim_backfill_nova_2026_10_23(integer, integer) set schema private;
alter function private.sync_claim_backfill_antes_2026_10_23(integer, integer) set schema public;
alter function public.sync_claim_backfill_antes_2026_10_23(integer, integer) rename to sync_claim_backfill;

alter function public.client_report_email_due(integer) rename to client_report_email_due_nova_2026_10_23;
alter function public.client_report_email_due_nova_2026_10_23(integer) set schema private;
alter function private.client_report_email_due_antes_2026_10_23(integer) set schema public;
alter function public.client_report_email_due_antes_2026_10_23(integer) rename to client_report_email_due;

-- client_report_public, tracking_whatsapp_* e tracking_ingest novos chamam as antigas: primeiro tirar as novas do caminho.
alter function public.client_report_public(text, text, date, date) rename to client_report_public_nova_2026_10_23;
alter function public.client_report_public_nova_2026_10_23(text, text, date, date) set schema private;
alter function private.client_report_public_antes_2026_10_23(text, text, date, date) set schema public;
alter function public.client_report_public_antes_2026_10_23(text, text, date, date) rename to client_report_public;

alter function public.ri_read_claim(uuid) rename to ri_read_claim_nova_2026_10_23;
alter function public.ri_read_claim_nova_2026_10_23(uuid) set schema private;
alter function private.ri_read_claim_antes_2026_10_23(uuid) set schema public;
alter function public.ri_read_claim_antes_2026_10_23(uuid) rename to ri_read_claim;

alter function public.tracking_capi_claim(integer) rename to tracking_capi_claim_nova_2026_10_23;
alter function public.tracking_capi_claim_nova_2026_10_23(integer) set schema private;
alter function private.tracking_capi_claim_antes_2026_10_23(integer) set schema public;
alter function public.tracking_capi_claim_antes_2026_10_23(integer) rename to tracking_capi_claim;

alter function public.tracking_whatsapp_inbound(jsonb) rename to tracking_whatsapp_inbound_nova_2026_10_23;
alter function public.tracking_whatsapp_inbound_nova_2026_10_23(jsonb) set schema private;
alter function private.tracking_whatsapp_inbound_antes_2026_10_23(jsonb) set schema public;
alter function public.tracking_whatsapp_inbound_antes_2026_10_23(jsonb) rename to tracking_whatsapp_inbound;

alter function public.tracking_whatsapp_register(jsonb) rename to tracking_whatsapp_register_nova_2026_10_23;
alter function public.tracking_whatsapp_register_nova_2026_10_23(jsonb) set schema private;
alter function private.tracking_whatsapp_register_antes_2026_10_23(jsonb) set schema public;
alter function public.tracking_whatsapp_register_antes_2026_10_23(jsonb) rename to tracking_whatsapp_register;

alter function private.monitor_prepare_accounts(text, date, integer) rename to monitor_prepare_accounts_nova_2026_10_23;
alter function private.monitor_prepare_accounts_antes_2026_10_23(text, date, integer) rename to monitor_prepare_accounts;
alter function private.can_view_client(uuid) rename to can_view_client_nova_2026_10_23;
alter function private.can_view_client_antes_2026_10_23(uuid) rename to can_view_client;
alter function private.tracking_ingest(jsonb) rename to tracking_ingest_nova_2026_10_23;
alter function private.tracking_ingest_antes_2026_10_23(jsonb) rename to tracking_ingest;

-- Permissões como eram antes.
grant execute on function public.sync_claim_due(integer, integer) to service_role;
grant execute on function public.sync_claim_backfill(integer, integer) to service_role;
grant execute on function public.client_report_email_due(integer) to service_role;
grant execute on function public.client_report_public(text, text, date, date) to service_role;
grant execute on function public.ri_read_claim(uuid) to service_role;
grant execute on function public.tracking_capi_claim(integer) to service_role;
grant execute on function public.tracking_whatsapp_inbound(jsonb) to service_role;
grant execute on function public.tracking_whatsapp_register(jsonb) to service_role;
grant execute on function private.tracking_ingest(jsonb) to service_role;
grant execute on function private.can_view_client(uuid) to authenticated, service_role;
commit;
