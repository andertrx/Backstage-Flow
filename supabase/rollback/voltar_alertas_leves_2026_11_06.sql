-- Volta a verificação de alertas ao que era antes de 06/11/2026 (sem trava de 4 minutos e com a regra antiga de entrega).
begin;
  create or replace function private.alert_candidates()
  returns table (
    alert_key text, type text, severity text, client_id uuid, platform_id text, ad_account_id uuid, campaign_id uuid,
    description text, recommended_action text, details jsonb
  )
  language sql stable security definer set search_path = '' as $$
    select c.* from private.alert_candidates_antes_2026_10_30() c where private.client_is_active(c.client_id)
  $$;
  -- A trava de 4 minutos está dentro de private.refresh_alerts_impl(): para tirar, recriar a função sem o bloco
  -- "Sistema (sem pessoa logada)" (texto original em supabase/migrations/20260925070000_alerts.sql).
commit;
