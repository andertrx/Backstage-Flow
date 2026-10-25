-- Volta da fase "Tracking T4.1 — frases do WhatsApp" (25/10/2026).
-- Desliga as frases. NADA é apagado: frases, registro e vendas já marcadas ficam guardados.
update public.tracking_wa_triggers set enabled = false where enabled;
revoke execute on function public.wa_echo(jsonb) from service_role;
revoke execute on function public.wa_triggers_for(uuid) from service_role;
-- (O envio ao Meta com o ctwa_clid do anúncio de WhatsApp, em private.contact_send, pode ficar: só melhora a ligação ao anúncio.
--  Para voltar exatamente como era, recriar contact_send a partir de 20261023224612_contatos_vendedor.sql.)
