-- 25/11/2026 (aprovado pelo Ander): em Tracking → Contatos e vendas, o contato que veio do WhatsApp mostra o NOME da conversa
-- e ganha "Abrir conversa". Mesma regra das Conversas: só admin, gestor e o Account Manager do cliente (private.wa_messages_can_read),
-- e só nos clientes que guardam as conversas (sem pessoa guardada, não há nome). Para os demais a função devolve vazio
-- e a tela continua mostrando "Contato #N". Nada novo é guardado: só reúne o que já existe. Telefone não sai daqui.
create function private.contacts_wa_people_impl(p_client uuid)
returns table (contact_id bigint, person_id bigint, push_name text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_client is null or not private.wa_messages_can_read(p_client) then return; end if;
  return query
  select distinct on (k.id) k.id, p.id, p.push_name
    from public.tracking_contacts k
    join public.tracking_wa_people p
      on p.client_id = k.client_id
     and (k.wa_hash = p.wa_hash or k.ph_hash in (p.wa_hash, private.wa_phone_ph_hash(p.phone, p.wa_hash)))
   where k.client_id = p_client and k.archived_at is null
   order by k.id, p.last_at desc;
end;
$$;
revoke all on function private.contacts_wa_people_impl(uuid) from public, anon;
grant execute on function private.contacts_wa_people_impl(uuid) to authenticated;

create function public.contacts_wa_people(p_client uuid)
returns table (contact_id bigint, person_id bigint, push_name text)
language sql stable set search_path = '' as $$ select * from private.contacts_wa_people_impl(p_client) $$;
revoke all on function public.contacts_wa_people(uuid) from public, anon;
grant execute on function public.contacts_wa_people(uuid) to authenticated;
