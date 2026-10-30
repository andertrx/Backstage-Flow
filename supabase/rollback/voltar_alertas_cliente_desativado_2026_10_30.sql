-- Volta a verificação de alertas ao que era antes de 30/10/2026 (cliente desativado volta a gerar alerta).
-- Os alertas já encerrados continuam encerrados (histórico mantido).
begin;
  alter table public.clients disable trigger clients_status_alertas;
  alter function private.alert_candidates() rename to alert_candidates_nova_2026_10_30;
  alter function private.alert_candidates_antes_2026_10_30() rename to alert_candidates;
  drop trigger clients_status_alertas on public.clients;
  drop function private.clients_status_alertas();
  drop function private.alert_candidates_nova_2026_10_30();
commit;
