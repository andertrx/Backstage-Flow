-- 25/11/2026: a faixa de "WhatsApp caído" (Painel do Tracking) lê tracking_whatsapp_connections.health_since.
-- Essa coluna nasceu na Fase C (T5.38) só para o servidor; o site (authenticated) não tinha permissão de leitura nas colunas dessa tabela
-- (a tabela tem colunas secretas, então a leitura é coluna a coluna). Sem isto a consulta inteira das conexões falhava e os botões
-- de WhatsApp (Conectar, Reconectar, QR Code) não funcionavam. health_since é só uma data (não é segredo).
grant select (health_since) on public.tracking_whatsapp_connections to authenticated;
