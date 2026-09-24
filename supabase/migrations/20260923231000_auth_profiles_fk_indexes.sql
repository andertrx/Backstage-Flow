-- Índices para as chaves estrangeiras apontadas pelo Supabase Advisor
-- (evita varreduras completas quando um usuário é referenciado).
create index if not exists audit_logs_actor_id_idx on public.audit_logs (actor_id);
create index if not exists profiles_created_by_idx on public.profiles (created_by);
