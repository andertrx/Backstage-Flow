-- T5.16 (09/11/2026): mostrar, na lista "Conversas recebidas" do Tracking → Painel → WhatsApp, o valor e o nº do pedido
-- das vendas marcadas em cada conversa (vêm da fila de envio ao Meta). Só leitura; só clientes que a pessoa enxerga.
create function private.wa_conversation_sales_impl()
returns table (conversation_id bigint, order_id text, value numeric, currency text, at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select (regexp_match(q.event_id, '^wac\.(\d+)\.venda\.'))[1]::bigint,
         q.custom_data ->> 'order_id',
         nullif(q.custom_data ->> 'value', '')::numeric,
         q.custom_data ->> 'currency',
         q.created_at
    from public.tracking_capi_queue q
   where q.event_name = 'Purchase' and q.event_id ~ '^wac\.\d+\.venda\.'
     and q.client_id in (select private.visible_client_ids())
   order by q.created_at desc
$$;
revoke all on function private.wa_conversation_sales_impl() from public, anon, authenticated;
grant execute on function private.wa_conversation_sales_impl() to authenticated;
create function public.wa_conversation_sales()
returns table (conversation_id bigint, order_id text, value numeric, currency text, at timestamptz)
language sql stable set search_path = '' as $$ select * from private.wa_conversation_sales_impl() $$;
revoke all on function public.wa_conversation_sales() from public, anon;
grant execute on function public.wa_conversation_sales() to authenticated;
