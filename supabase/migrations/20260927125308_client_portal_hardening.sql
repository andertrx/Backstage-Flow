-- =============================================================================
-- Etapa 19.2 (segurança) — mesmo padrão do resto do projeto:
--   * interruptores e geração do link: a lógica com poder elevado fica em
--     private.*_impl (confere admin/gestor lá dentro); a função pública é
--     só uma porta de entrada comum;
--   * leitura pelo link: só o servidor (Edge Function "client-report-link",
--     com a chave de serviço) pode chamar. Visitante sem login não chama
--     nenhuma função do banco diretamente.
-- =============================================================================

alter function public.client_portal_set(uuid, boolean, boolean) set schema private;
alter function private.client_portal_set(uuid, boolean, boolean) rename to client_portal_set_impl;
alter function public.client_portal_new_link(uuid, integer) set schema private;
alter function private.client_portal_new_link(uuid, integer) rename to client_portal_new_link_impl;
revoke all on function private.client_portal_set_impl(uuid, boolean, boolean) from public, anon;
revoke all on function private.client_portal_new_link_impl(uuid, integer) from public, anon;
grant execute on function private.client_portal_set_impl(uuid, boolean, boolean) to authenticated;
grant execute on function private.client_portal_new_link_impl(uuid, integer) to authenticated;

create function public.client_portal_set(p_client_id uuid, p_login_enabled boolean default null, p_link_enabled boolean default null)
returns void
language sql
set search_path = ''
as $$ select private.client_portal_set_impl(p_client_id, p_login_enabled, p_link_enabled) $$;
revoke all on function public.client_portal_set(uuid, boolean, boolean) from public, anon;
grant execute on function public.client_portal_set(uuid, boolean, boolean) to authenticated;

create function public.client_portal_new_link(p_client_id uuid, p_valid_days integer default null)
returns text
language sql
set search_path = ''
as $$ select private.client_portal_new_link_impl(p_client_id, p_valid_days) $$;
revoke all on function public.client_portal_new_link(uuid, integer) from public, anon;
grant execute on function public.client_portal_new_link(uuid, integer) to authenticated;

-- Leitura pelo link: só o servidor.
revoke all on function public.client_report_public(text, text, date, date) from public, anon, authenticated;
grant execute on function public.client_report_public(text, text, date, date) to service_role;
