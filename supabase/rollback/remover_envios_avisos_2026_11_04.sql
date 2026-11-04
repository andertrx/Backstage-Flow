-- Remove os avisos para aprovar o envio semanal (41.6). O tipo "envio.aprovar" continua aceito no sino (inofensivo).
select cron.unschedule('envio-avisos');
drop function if exists public.ops_envio_aviso_mark(bigint, text, text, text);
drop function if exists public.ops_envio_aviso_fila();
drop function if exists private.trigger_envio_avisos();
drop function if exists private.ops_envio_aviso_mark(bigint, text, text, text);
drop function if exists private.ops_envio_aviso_fila();
drop function if exists private.envio_avisar();
-- A tabela guarda histórico: só remover se o Ander pedir.
-- drop table public.ops_envio_avisos;
