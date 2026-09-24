-- Corrige aviso do Supabase Advisor ("Extension in Public"): a extensão pg_net
-- foi criada no schema public na Etapa 1. Ela não aceita "SET SCHEMA", então é
-- recriada no schema "extensions". Suas funções continuam no schema "net".
drop extension if exists pg_net;
create extension if not exists pg_net with schema extensions;
