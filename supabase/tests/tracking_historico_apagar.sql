-- Teste SQL (26/11/2026) — "Apagar histórico do cliente". Roda dentro de um bloco que SEMPRE desfaz no final (o erro final é proposital).
-- Como usar: troque <ADMIN_ID> pelo id de um administrador e <CLIENTE_ID> pelo cliente; rode no SQL Editor do Supabase.
-- Esperado: a mensagem de erro final começa com TESTE_OK e mostra antes / apagou / depois; contatos e vendas ficam iguais; nada é apagado de verdade.
do $$
declare r_antes jsonb; r_apagou jsonb; r_depois jsonb;
  v_cli uuid := '<CLIENTE_ID>';
begin
  perform set_config('request.jwt.claims', '{"sub":"<ADMIN_ID>","role":"authenticated"}', true);
  r_antes := private.tracking_historico_contagem_impl(v_cli);
  r_apagou := private.tracking_historico_apagar_impl(v_cli, 'ambos', 'APAGAR');
  r_depois := private.tracking_historico_contagem_impl(v_cli);
  if (r_antes -> 'mantidos') is distinct from (r_depois -> 'mantidos') then raise exception 'FALHOU: contatos/vendas mudaram'; end if;
  if (r_depois #>> '{site,eventos}')::int <> 0 or (r_depois #>> '{whatsapp,mensagens}')::int <> 0 then raise exception 'FALHOU: ainda sobrou histórico'; end if;
  raise exception 'TESTE_OK (desfeito) antes=% | apagou=% | depois=%', r_antes, r_apagou, r_depois;
end $$;
