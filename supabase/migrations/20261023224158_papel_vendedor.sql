-- Tracking T3.1 (23/10/2026): papel "vendedor" = equipe do CLIENTE que marca os contatos.
-- Vê e marca SÓ os contatos dos clientes liberados para ele; nada mais do CRM.
-- (Em migração própria: o Postgres só deixa usar um valor novo de enum depois de gravado.)
alter type public.user_role add value if not exists 'vendedor';
