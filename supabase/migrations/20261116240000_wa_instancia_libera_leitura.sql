-- T5.38 — correção: a tela lê tracking_whatsapp_connections com permissão por coluna. As colunas novas (instance_name, gateway_state,
-- gateway_state_at) ficaram sem leitura e a consulta da tela inteira falhava, escondendo TODAS as conexões de WhatsApp.
-- Não são segredos (nome da conexão no servidor, estado e quando foi conferido).
grant select (instance_name, gateway_state, gateway_state_at) on public.tracking_whatsapp_connections to authenticated;
