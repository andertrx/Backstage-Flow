-- Volta da Etapa 41.1 — Envios semanais (27/10/2026).
-- Desliga o módulo sem apagar nada: as tabelas e o histórico continuam guardados; só as ações deixam de funcionar.
-- A aba some da tela quando ninguém tiver a permissão "ops.envios" (o admin continua vendo a aba vazia/sem ações até o site voltar).
revoke execute on function public.ops_envio_list(jsonb), public.ops_envio_get(uuid), public.ops_envio_save(uuid, integer, jsonb),
  public.ops_envio_archive(uuid, boolean), public.ops_envio_execucao_add(uuid, uuid, text, text, timestamptz),
  public.ops_envio_historico(jsonb) from authenticated;
revoke select on table public.ops_envios, public.ops_envio_clientes, public.ops_envio_execucoes from authenticated;

-- Etapa 41.2 (aprovação semanal): parar o fechamento automático e as ações de aprovação (as decisões já gravadas ficam).
select cron.unschedule('envios-sem-resposta');
revoke execute on function public.ops_envio_pendentes(), public.ops_envio_decidir(uuid, integer, boolean), public.ops_envio_aprovacoes(jsonb) from authenticated;
revoke select on table public.ops_envio_aprovacoes from authenticated;
