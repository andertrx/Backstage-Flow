-- T5.27: o período do histórico do WhatsApp passa a aceitar qualquer quantidade de dias (até 10 anos),
-- e o padrão para conexões novas sobe de 30 para 180 dias (6 meses). Conexões já existentes não mudam.
alter table public.tracking_whatsapp_connections drop constraint if exists tracking_whatsapp_connections_history_days_check;
alter table public.tracking_whatsapp_connections add constraint tracking_whatsapp_connections_history_days_check
  check (history_days is null or history_days between 0 and 3650);
alter table public.tracking_whatsapp_connections alter column history_days set default 180;
comment on column public.tracking_whatsapp_connections.history_days is 'T5.27: quantos dias do histórico antigo do aparelho entram ao guardar as conversas (0 = não importar histórico; vazio = tudo; até 3650). Padrão de conexão nova: 180. Vale para as mensagens que chegarem depois.';

create or replace function private.wa_unofficial_set_history_impl(p_id uuid, p_days integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare c public.tracking_whatsapp_connections;
begin
  select * into c from public.tracking_whatsapp_connections where id = p_id and mode = 'nao_oficial';
  if (select private.current_user_role()) not in ('admin', 'gestor') or c.id is null or c.client_id not in (select private.visible_client_ids()) then
    raise exception 'Só administrador e gestor mudam o período do histórico.' using errcode = '42501';
  end if;
  if p_days is not null and (p_days < 0 or p_days > 3650) then raise exception 'Período inválido: use de 0 a 3650 dias.' using errcode = '22023'; end if;
  update public.tracking_whatsapp_connections set history_days = p_days where id = p_id;
  insert into public.audit_logs (actor_id, action, target_type, target_id, details)
  values ((select auth.uid()), 'wa_messages.history_days', 'tracking_whatsapp_connection', p_id::text, jsonb_build_object('dias', p_days));
end;
$$;
