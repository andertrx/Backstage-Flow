-- Etapa 37.3 — agendamento do motor de alertas. Roda a cada 15 minutos; o motor só avalia quando
-- passou o intervalo configurado (padrão 60 min) e pula sozinho se o monitoramento estiver desligado.
select cron.schedule('monitor-evaluate', '*/15 * * * *', $$select private.monitor_evaluate('agendada')$$);
