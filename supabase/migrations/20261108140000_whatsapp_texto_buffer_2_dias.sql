-- Tracking T5.6 (08/11/2026): o texto das conversas deixa de ser guardado por 15/30 dias e vira só um "buffer" de 2 dias,
-- para a IA ler uma vez por dia. O que fica guardado é a SUGESTÃO (próxima migração). Aplicada no banco em duas partes
-- (whatsapp_texto_so_buffer_2_dias e whatsapp_tirar_prazo_configuravel).
create or replace function private.wa_messages_retention_days()
returns integer language sql stable security definer set search_path = '' as $$ select 2 $$;
revoke all on function private.wa_messages_retention_days() from public, anon, authenticated;
comment on table public.tracking_wa_messages is 'T5.6: texto das conversas de WhatsApp (só em sites com a opção ligada), guardado por apenas 2 dias como buffer para a IA ler uma vez por dia; apagado sozinho. Só admin, gestor e o Account Manager do cliente leem.';
create or replace function public.wa_messages_settings(p_days integer default null)
returns integer language sql stable security definer set search_path = '' as $$ select 2 $$;
revoke all on function public.wa_messages_settings(integer) from public, anon, authenticated;
comment on function public.wa_messages_settings(integer) is 'T5.6: sem uso. O texto fica 2 dias (fixo). Mantida só para não quebrar quem chamava; devolve sempre 2.';
