-- T4.2: a tela do Tracking precisa saber se o app do Meta da agência já está configurado, para mostrar
-- (ou não) o botão "Ligar WhatsApp Business". Só diz sim/não; nenhum dado do app sai daqui.
create function private.wa_app_ready_impl()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select private.current_user_role())::text, '') in ('admin', 'gestor')
     and exists (select 1 from public.wa_app_settings s
                  where s.id = 1 and s.app_id is not null and s.config_id is not null and s.app_secret_vault_id is not null)
$$;
revoke all on function private.wa_app_ready_impl() from public, anon;
grant execute on function private.wa_app_ready_impl() to authenticated;

create function public.wa_app_ready()
returns boolean language sql stable set search_path = '' as $$ select private.wa_app_ready_impl() $$;
revoke all on function public.wa_app_ready() from public, anon;
grant execute on function public.wa_app_ready() to authenticated;
