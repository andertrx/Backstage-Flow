-- Etapa 19.4 (ajuste): a conferência do link do e-mail passa a morar em
-- private (security definer); a função pública só repassa (sem privilégios próprios).
drop function if exists public.client_report_email_link_status(uuid);

create function private.client_report_email_link_status_impl(p_client_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_token text;
begin
  if not private.can_view_client(p_client_id) or private.current_user_role() = 'cliente' then return null; end if;
  select decrypted_secret into v_token from vault.decrypted_secrets where name = 'report_link:' || p_client_id::text;
  if v_token is null then return 'sem_link'; end if;
  if exists (select 1 from public.client_portal p where p.client_id = p_client_id and p.link_enabled
               and (p.link_expires_at is null or p.link_expires_at > now())
               and p.link_token_hash = encode(extensions.digest(v_token, 'sha256'), 'hex')) then
    return 'ok';
  end if;
  return 'desatualizado';
end;
$$;
revoke all on function private.client_report_email_link_status_impl(uuid) from public, anon;
grant execute on function private.client_report_email_link_status_impl(uuid) to authenticated;

create function public.client_report_email_link_status(p_client_id uuid)
returns text language sql stable set search_path = ''
as $$ select private.client_report_email_link_status_impl(p_client_id) $$;
revoke all on function public.client_report_email_link_status(uuid) from public, anon;
grant execute on function public.client_report_email_link_status(uuid) to authenticated;
