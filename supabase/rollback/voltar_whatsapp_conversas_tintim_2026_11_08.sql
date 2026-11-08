-- Volta a fase T5.7 (conversas do WhatsApp estilo Tintim). ATENÇÃO: apaga a lista de pessoas e o telefone completo guardados.
-- As mensagens (tracking_wa_messages) NÃO são apagadas aqui; passam a vencer pela regra antiga (2 dias) só se você pôr um prazo de volta.
-- Rode só com o "pode" do Ander.
drop function if exists public.wa_person_contact(bigint);
drop function if exists private.wa_person_contact_impl(bigint);
drop function if exists public.wa_conversation_delete(bigint);
drop function if exists private.wa_conversation_delete_impl(bigint);
drop function if exists public.wa_conversation_messages(bigint, timestamptz, integer);
drop function if exists private.wa_conversation_messages_impl(bigint, timestamptz, integer);
drop function if exists public.wa_conversations_list(uuid, text, integer, timestamptz);
drop function if exists private.wa_conversations_list_impl(uuid, text, integer, timestamptz);
drop function if exists private.wa_phone_ph_hash(text, text);
drop table if exists public.tracking_wa_people;
-- Volta a ligar/desligar a guarda sem o aviso
drop function if exists public.wa_unofficial_set_store(uuid, boolean, boolean);
drop function if exists private.wa_unofficial_set_store_impl(uuid, boolean, boolean);
create function private.wa_unofficial_set_store_impl(p_id uuid, p_on boolean) returns void language plpgsql security definer set search_path = '' as $$
begin
  if (select private.current_user_role()) not in ('admin', 'gestor')
     or not exists (select 1 from public.tracking_whatsapp_connections c where c.id = p_id and c.mode = 'nao_oficial' and c.client_id in (select private.visible_client_ids())) then
    raise exception 'Só administrador e gestor ligam ou desligam a guarda das conversas.' using errcode = '42501';
  end if;
  update public.tracking_whatsapp_connections set store_messages = p_on where id = p_id;
end $$;
revoke all on function private.wa_unofficial_set_store_impl(uuid, boolean) from public, anon;
grant execute on function private.wa_unofficial_set_store_impl(uuid, boolean) to authenticated;
create function public.wa_unofficial_set_store(p_id uuid, p_on boolean) returns void language sql set search_path = '' as $$ select private.wa_unofficial_set_store_impl(p_id, p_on) $$;
revoke all on function public.wa_unofficial_set_store(uuid, boolean) from public, anon;
grant execute on function public.wa_unofficial_set_store(uuid, boolean) to authenticated;
alter table public.tracking_whatsapp_connections drop column if exists store_ack_by, drop column if exists store_ack_at;
-- A função de guardar volta a exigir a opção ligada, sem aviso nem telefone completo: reaplique a versão de 20261108141000.
