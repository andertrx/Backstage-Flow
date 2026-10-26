-- Volta da fase "Central 36.17 — lembretes de tarefa vencida" (26/10/2026).
-- Para o agendador e desliga os aparelhos. NADA é apagado (vistos e aparelhos ficam guardados).
select cron.unschedule('ops-due-push');
update public.ops_push_subscriptions set disabled_at = now(), last_error = 'Lembretes desligados (volta da fase 36.17).' where disabled_at is null;
revoke execute on function public.ops_due_reminder() from authenticated;
revoke execute on function public.ops_push_subscribe(text, text, text, text) from authenticated;
