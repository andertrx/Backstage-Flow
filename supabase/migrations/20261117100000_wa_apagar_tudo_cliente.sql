-- "Apagar tudo deste cliente (começar do zero)" para o WhatsApp pelo servidor (não oficial). Só administrador, por cliente.
-- Diferente da limpeza de dados de conversa (que mantém as conversas), esta também apaga as conversas e DESLIGA as conexões
-- do cliente. Mantém as conversas em que houve VENDA marcada (elas carregam a venda e as contagens dos relatórios).
-- Não toca em nenhum outro cliente, nem em site, tracking, leads ou eventos.

-- Passo 1: quanto será apagado
create function private.wa_unofficial_apagar_tudo_contagem_impl(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare c public.tracking_whatsapp_connections;
begin
  select * into c from public.tracking_whatsapp_connections where id = p_id and mode = 'nao_oficial';
  if (select private.current_user_role()) <> 'admin' or c.id is null then
    raise exception 'Só o administrador apaga os dados do cliente.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'mensagens', (select count(*) from public.tracking_wa_messages where client_id = c.client_id),
    'pessoas', (select count(*) from public.tracking_wa_people where client_id = c.client_id),
    'sugestoes', (select count(*) from public.tracking_wa_suggestions where client_id = c.client_id),
    'conversas_apagar', (select count(*) from public.tracking_whatsapp_conversations where client_id = c.client_id and coalesce(sales, 0) = 0),
    'conversas_com_venda_mantidas', (select count(*) from public.tracking_whatsapp_conversations where client_id = c.client_id and coalesce(sales, 0) > 0),
    'conexoes', (select count(*) from public.tracking_whatsapp_connections where client_id = c.client_id and mode = 'nao_oficial'));
end;
$$;

-- Passo 2: só com a palavra APAGAR
create function private.wa_unofficial_apagar_tudo_impl(p_id uuid, p_confirmar text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare c public.tracking_whatsapp_connections; v_m integer; v_p integer; v_s integer; v_c integer; v_x integer; v_kept integer;
begin
  select * into c from public.tracking_whatsapp_connections where id = p_id and mode = 'nao_oficial';
  if (select private.current_user_role()) <> 'admin' or c.id is null then
    raise exception 'Só o administrador apaga os dados do cliente.' using errcode = '42501';
  end if;
  if btrim(coalesce(p_confirmar, '')) <> 'APAGAR' then raise exception 'Confirmação inválida: digite APAGAR.' using errcode = '22023'; end if;
  delete from public.tracking_wa_messages where client_id = c.client_id; get diagnostics v_m = row_count;
  delete from public.tracking_wa_people where client_id = c.client_id; get diagnostics v_p = row_count;
  delete from public.tracking_wa_suggestions where client_id = c.client_id; get diagnostics v_s = row_count;
  delete from public.tracking_whatsapp_conversations where client_id = c.client_id and coalesce(sales, 0) = 0; get diagnostics v_c = row_count;
  select count(*) into v_kept from public.tracking_whatsapp_conversations where client_id = c.client_id;
  -- Desliga as conexões do cliente e zera o "última mensagem recebida" (a tela volta a mostrar "desligado", como um cliente novo)
  update public.tracking_whatsapp_connections
     set enabled = false, last_webhook_at = null, updated_by = (select auth.uid()), updated_at = now()
   where client_id = c.client_id and mode = 'nao_oficial';
  get diagnostics v_x = row_count;
  insert into public.audit_logs (actor_id, action, target_type, target_id, details)
  values ((select auth.uid()), 'wa_cliente.apagar_tudo', 'client', c.client_id::text,
    jsonb_build_object('conexao', p_id, 'mensagens', v_m, 'pessoas', v_p, 'sugestoes', v_s, 'conversas', v_c, 'conversas_com_venda_mantidas', v_kept, 'conexoes_desligadas', v_x));
  return jsonb_build_object('mensagens', v_m, 'pessoas', v_p, 'sugestoes', v_s, 'conversas', v_c, 'conversas_com_venda_mantidas', v_kept, 'conexoes_desligadas', v_x);
end;
$$;

revoke all on function private.wa_unofficial_apagar_tudo_contagem_impl(uuid), private.wa_unofficial_apagar_tudo_impl(uuid, text) from public, anon, authenticated;
grant execute on function private.wa_unofficial_apagar_tudo_contagem_impl(uuid), private.wa_unofficial_apagar_tudo_impl(uuid, text) to authenticated;

create function public.wa_unofficial_apagar_tudo_contagem(p_id uuid)
returns jsonb language sql stable set search_path = '' as $$ select private.wa_unofficial_apagar_tudo_contagem_impl(p_id) $$;
create function public.wa_unofficial_apagar_tudo(p_id uuid, p_confirmar text)
returns jsonb language sql set search_path = '' as $$ select private.wa_unofficial_apagar_tudo_impl(p_id, p_confirmar) $$;
revoke all on function public.wa_unofficial_apagar_tudo_contagem(uuid), public.wa_unofficial_apagar_tudo(uuid, text) from public, anon;
grant execute on function public.wa_unofficial_apagar_tudo_contagem(uuid), public.wa_unofficial_apagar_tudo(uuid, text) to authenticated;
