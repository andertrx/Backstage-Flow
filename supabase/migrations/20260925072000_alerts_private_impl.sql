-- =============================================================================
-- Etapa 15 — ajuste de segurança (verificador do Supabase)
--
-- As funções que precisam de privilégio (verificar alertas e mudar status)
-- passam para o esquema privado, que NÃO é exposto pela API. Na API ficam só
-- "portas" simples (security invoker) que repassam a chamada. As regras de
-- permissão continuam dentro das funções privadas.
-- =============================================================================

alter function public.refresh_alerts() rename to refresh_alerts_impl;
alter function public.refresh_alerts_impl() set schema private;
alter function public.set_alert_status(bigint, text) rename to set_alert_status_impl;
alter function public.set_alert_status_impl(bigint, text) set schema private;

revoke all on function private.refresh_alerts_impl() from public, anon;
grant execute on function private.refresh_alerts_impl() to authenticated, service_role;
revoke all on function private.set_alert_status_impl(bigint, text) from public, anon;
grant execute on function private.set_alert_status_impl(bigint, text) to authenticated;

create function public.refresh_alerts()
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.refresh_alerts_impl()
$$;

comment on function public.refresh_alerts() is
  'Verifica os problemas agora: cria alertas novos, atualiza os que continuam e resolve os que sumiram. Admin, gestor e operador; e o agendador.';

revoke all on function public.refresh_alerts() from public, anon;
grant execute on function public.refresh_alerts() to authenticated, service_role;

create function public.set_alert_status(p_id bigint, p_status text)
returns public.alerts
language sql
security invoker
set search_path = ''
as $$
  select * from private.set_alert_status_impl(p_id, p_status)
$$;

comment on function public.set_alert_status(bigint, text) is
  'Marca um alerta como visto, resolvido ou volta para aberto. Admin, gestor e operador; só clientes liberados.';

revoke all on function public.set_alert_status(bigint, text) from public, anon;
grant execute on function public.set_alert_status(bigint, text) to authenticated;
