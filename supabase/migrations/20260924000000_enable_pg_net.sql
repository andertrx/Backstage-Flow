-- pg_net: permite ao banco fazer chamadas HTTP assíncronas.
-- Usado nos testes de ponta a ponta das Edge Functions e, na Etapa 16,
-- pelo Supabase Cron para disparar a sincronização.
create extension if not exists pg_net;
