-- T5.14 (09/11/2026): a IA que sugere vendas passa a ser ligada POR WHATSAPP (por empresa), não só no geral.
-- O interruptor geral e a chave continuam (chave mestra). A IA só lê conexões com "Guardar as conversas" ligado E "IA sugere vendas" ligada.
-- Quem já tinha as conversas guardadas (confirmadas) continua com a IA ligada; conexões novas nascem com a IA desligada.
alter table public.tracking_whatsapp_connections add column if not exists ai_suggest boolean not null default false;
update public.tracking_whatsapp_connections set ai_suggest = true where mode = 'nao_oficial' and store_messages and store_ack_at is not null;

create function private.wa_unofficial_set_ai_impl(p_id uuid, p_on boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare c public.tracking_whatsapp_connections;
begin
  select * into c from public.tracking_whatsapp_connections where id = p_id and mode = 'nao_oficial';
  if (select private.current_user_role()) not in ('admin', 'gestor') or c.id is null or c.client_id not in (select private.visible_client_ids()) then
    raise exception 'Só administrador e gestor ligam ou desligam a IA de vendas deste WhatsApp.' using errcode = '42501';
  end if;
  if p_on and not (c.store_messages and c.store_ack_at is not null) then
    raise exception 'Ligue antes "Guardar as conversas" (e confirme o aviso): a IA só lê conversas guardadas.' using errcode = '22023';
  end if;
  update public.tracking_whatsapp_connections set ai_suggest = p_on where id = c.id;
end;
$$;
revoke all on function private.wa_unofficial_set_ai_impl(uuid, boolean) from public, anon, authenticated;
grant execute on function private.wa_unofficial_set_ai_impl(uuid, boolean) to authenticated;
create function public.wa_unofficial_set_ai(p_id uuid, p_on boolean)
returns void language sql set search_path = '' as $$ select private.wa_unofficial_set_ai_impl(p_id, p_on) $$;
revoke all on function public.wa_unofficial_set_ai(uuid, boolean) from public, anon;
grant execute on function public.wa_unofficial_set_ai(uuid, boolean) to authenticated;

-- A rotina diária da IA só pega conexões com a IA ligada (troca uma condição, o resto da função fica igual).
do $$
declare d text;
begin
  d := pg_get_functiondef('public.wa_ai_batch(integer)'::regprocedure);
  if position('c.enabled and c.store_messages and c.ai_suggest' in d) = 0 then
    d := replace(d, 'c.enabled and c.store_messages', 'c.enabled and c.store_messages and c.ai_suggest');
    execute d;
  end if;
end $$;

-- A tela precisa ler a coluna nova (a tabela só libera colunas listadas).
grant select (ai_suggest) on public.tracking_whatsapp_connections to authenticated;
