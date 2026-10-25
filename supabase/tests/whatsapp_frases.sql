-- Teste da fase Tracking T4.1 (frases do WhatsApp, como no Tintim). Roda numa transação desfeita
-- (termina com "R: N verificações OK", que desfaz tudo).
do $$
declare
  v_admin uuid; v_visu uuid; v_a uuid; v_b uuid; v_ct uuid; v_dest uuid; v_conn uuid;
  v_venda uuid; v_qual uuid; v_loja uuid; v_outra uuid;
  t_venda uuid; t_loja uuid; t_qual uuid;
  v_res jsonb; v_k bigint; v_bia bigint; v_n integer; v_ok integer := 0;
  -- Ana: o WhatsApp manda o número sem o 9 (554599998888); normalizado fica 5545999998888.
  v_ana_wa text := encode(extensions.digest('554599998888', 'sha256'), 'hex');
  v_ana_ph text := encode(extensions.digest('5545999998888', 'sha256'), 'hex');
  v_bia_wa text := encode(extensions.digest('554591112222', 'sha256'), 'hex');
  v_bia_ph text := encode(extensions.digest('5545991112222', 'sha256'), 'hex');
  v_caio   text := encode(extensions.digest('5545933334444', 'sha256'), 'hex');
begin
  select id into v_admin from public.profiles where role = 'admin' and active order by created_at limit 1;
  select id into v_visu from public.profiles where role = 'visualizador' and active order by created_at limit 1;
  select id into v_a from public.clients where status <> 'encerrado' and excluded_at is null order by created_at limit 1;
  select id into v_b from public.clients where status <> 'encerrado' and excluded_at is null and id <> v_a order by created_at limit 1;
  perform private.contacts_seed(v_a);
  perform private.contacts_seed(v_b);
  select id into v_venda from public.tracking_contact_stages where client_id = v_a and kind = 'ganha' and archived_at is null order by position limit 1;
  select id into v_qual from public.tracking_contact_stages where client_id = v_a and name = 'Qualificado' and archived_at is null;
  select id into v_loja from public.tracking_contact_profiles where client_id = v_a and meta_event = 'LeadLojista' and archived_at is null;
  select id into v_outra from public.tracking_contact_stages where client_id = v_b and kind = 'ganha' and archived_at is null limit 1;

  insert into public.tracking_containers (client_id, name, allowed_domains, test_mode) values (v_a, 'teste-frases', '{loja.test}', false) returning id into v_ct;
  insert into public.tracking_destinations (container_id, client_id, pixel_id, enabled, vault_secret_id)
  values (v_ct, v_a, '123456789', true, gen_random_uuid()) returning id into v_dest;
  insert into public.tracking_whatsapp_connections (container_id, client_id, phone_number_id, waba_id, enabled)
  values (v_ct, v_a, '990000000000001', '880000000000001', true) returning id into v_conn;

  -- Admin cadastra as frases; frase com etapa de outro cliente é recusada
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  insert into public.tracking_wa_triggers (client_id, phrase, stage_id) values (v_a, '  Parabéns pela sua   compra ', v_venda) returning id into t_venda;
  insert into public.tracking_wa_triggers (client_id, phrase, profile_id) values (v_a, 'cadastro de lojista', v_loja) returning id into t_loja;
  insert into public.tracking_wa_triggers (client_id, phrase, stage_id) values (v_a, 'orçamento enviado', v_qual) returning id into t_qual;
  if (select phrase from public.tracking_wa_triggers where id = t_venda) <> 'Parabéns pela sua compra' then raise exception 'frase arrumada (espaços)'; end if;
  begin
    insert into public.tracking_wa_triggers (client_id, phrase, stage_id) values (v_a, 'outra', v_outra);
    raise exception 'etapa de outro cliente deveria ser recusada';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform wa_hash from public.tracking_contacts;
    raise exception 'a tela não pode ler o número do WhatsApp (hash)';
  exception when insufficient_privilege then null;
  end;
  v_ok := v_ok + 1;

  -- Visualizador não cadastra
  perform set_config('request.jwt.claims', json_build_object('sub', v_visu, 'role', 'authenticated')::text, true);
  begin
    insert into public.tracking_wa_triggers (client_id, phrase, stage_id) values (v_a, 'frase do visualizador', v_venda);
    raise exception 'visualizador não cadastra frase';
  exception when insufficient_privilege then null;
  end;
  v_ok := v_ok + 1;

  -- Servidor
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'postgres', true);
  v_res := private.wa_triggers_for(v_conn);
  if jsonb_array_length(v_res) <> 3 or not v_res @> jsonb_build_array(jsonb_build_object('id', t_venda, 'kind', 'venda'))
     or not v_res @> jsonb_build_array(jsonb_build_object('id', t_loja, 'kind', 'perfil')) or not v_res @> jsonb_build_array(jsonb_build_object('id', t_qual, 'kind', 'etapa')) then
    raise exception 'frases para o servidor: %', v_res;
  end if;
  v_ok := v_ok + 1;

  -- Ana chegou por anúncio de clique para o WhatsApp (conversa com ctwa_clid)
  perform public.tracking_whatsapp_inbound(jsonb_build_object('connection_id', v_conn, 'wa_hash', v_ana_wa,
    'message_key', 'aaaa0000bbbb1111cccc2222dddd3333eeee5551', 'at', now(),
    'referral', jsonb_build_object('ctwa_clid', 'ARAkTesteFrase', 'source_id', '120210000000009')));

  -- Atendente manda "cadastro de lojista ... Parabéns pela sua compra de R$ 297,50"
  v_res := private.wa_echo(jsonb_build_object('connection_id', v_conn, 'wa_hash', v_ana_wa, 'ph_hash', v_ana_ph,
    'message_key', 'ffff0000eeee1111dddd2222cccc3333', 'matches', jsonb_build_array(
      jsonb_build_object('trigger_id', t_loja), jsonb_build_object('trigger_id', t_venda, 'value', '297.5', 'currency', 'BRL'))));
  select id into v_k from public.tracking_contacts where client_id = v_a and ph_hash = v_ana_ph;
  if v_k is null or (select origin from public.tracking_contacts where id = v_k) <> 'whatsapp'
     or (select wa_hash from public.tracking_contacts where id = v_k) <> v_ana_wa
     or (select profile_id from public.tracking_contacts where id = v_k) <> v_loja or (select sales from public.tracking_contacts where id = v_k) <> 1
     or (select stage_id from public.tracking_contacts where id = v_k) <> v_venda then
    raise exception 'contato criado pelo número, com perfil e venda: %', v_res;
  end if;
  v_ok := v_ok + 1;

  if not exists (select 1 from public.tracking_capi_queue where destination_id = v_dest and event_name = 'Purchase' and action_source = 'business_messaging' and ctwa_clid = 'ARAkTesteFrase' and waba_id = '880000000000001')
     or not exists (select 1 from public.tracking_capi_queue where destination_id = v_dest and event_name = 'LeadLojista' and ctwa_clid = 'ARAkTesteFrase')
     or not exists (select 1 from public.tracking_purchases where container_id = v_ct and value_micros = 297500000 and currency = 'BRL')
     or not exists (select 1 from public.tracking_contact_history where contact_id = v_k and kind = 'venda' and meta_note like 'Frase "Parabéns pela sua compra" no WhatsApp%' and by_user is null)
     or (select status from public.tracking_whatsapp_conversations where connection_id = v_conn and wa_hash = v_ana_wa) <> 'venda' then
    raise exception 'venda e Lojista vão ao Meta ligados ao anúncio (business_messaging + ctwa_clid), histórico e conversa';
  end if;
  v_ok := v_ok + 1;

  -- O Meta manda o mesmo aviso de novo: não conta duas vezes
  v_res := private.wa_echo(jsonb_build_object('connection_id', v_conn, 'wa_hash', v_ana_wa, 'ph_hash', v_ana_ph,
    'message_key', 'ffff0000eeee1111dddd2222cccc3333', 'matches', jsonb_build_array(jsonb_build_object('trigger_id', t_venda, 'value', '297.5', 'currency', 'BRL'))));
  if v_res -> 'items' -> 0 ->> 'result' <> 'repetido' or (select sales from public.tracking_contacts where id = v_k) <> 1 then
    raise exception 'aviso repetido não conta: %', v_res;
  end if;
  v_ok := v_ok + 1;

  -- Outra mensagem com venda: conta de novo
  v_res := private.wa_echo(jsonb_build_object('connection_id', v_conn, 'wa_hash', v_ana_wa, 'ph_hash', v_ana_ph,
    'message_key', '1111000022223333444455556666aaaa', 'matches', jsonb_build_array(
      jsonb_build_object('trigger_id', t_venda, 'value', '10', 'currency', 'BRL'))));
  if (select sales from public.tracking_contacts where id = v_k) <> 2 then raise exception 'segunda venda em outra mensagem conta: %', v_res; end if;
  v_ok := v_ok + 1;

  -- Venda sem valor (e sem valor padrão): não registra, nada inventado
  v_res := private.wa_echo(jsonb_build_object('connection_id', v_conn, 'wa_hash', v_ana_wa, 'ph_hash', v_ana_ph,
    'message_key', '2222000033334444555566667777bbbb', 'matches', jsonb_build_array(jsonb_build_object('trigger_id', t_venda))));
  if v_res -> 'items' -> 0 ->> 'result' <> 'sem_valor' or (select sales from public.tracking_contacts where id = v_k) <> 2 then
    raise exception 'venda sem valor não é registrada: %', v_res;
  end if;
  -- Com valor padrão na frase, usa o valor padrão
  update public.tracking_wa_triggers set default_value = 150 where id = t_venda;
  v_res := private.wa_echo(jsonb_build_object('connection_id', v_conn, 'wa_hash', v_ana_wa, 'ph_hash', v_ana_ph,
    'message_key', '3333000044445555666677778888cccc', 'matches', jsonb_build_array(jsonb_build_object('trigger_id', t_venda))));
  if not exists (select 1 from public.tracking_wa_trigger_log where message_key = '3333000044445555666677778888cccc' and value_micros = 150000000 and result = 'aplicado') then
    raise exception 'valor padrão da frase: %', v_res;
  end if;
  v_ok := v_ok + 1;

  -- Bia já era contato (telefone digitado com o 9); o WhatsApp manda sem o 9: liga ao mesmo contato
  insert into public.tracking_contacts (client_id, container_id, origin, ph_hash, visitor_id, session_id, stage_id)
  values (v_a, v_ct, 'manual', v_bia_ph, 'ctbia0001', 'ctbia0001', (select id from public.tracking_contact_stages where client_id = v_a and name = 'Novo' and archived_at is null))
  returning id into v_bia;
  v_res := private.wa_echo(jsonb_build_object('connection_id', v_conn, 'wa_hash', v_bia_wa, 'ph_hash', v_bia_ph,
    'message_key', '4444000055556666777788889999dddd', 'matches', jsonb_build_array(jsonb_build_object('trigger_id', t_qual))));
  if (select stage_id from public.tracking_contacts where id = v_bia) <> v_qual or (select wa_hash from public.tracking_contacts where id = v_bia) <> v_bia_wa
     or (select count(*) from public.tracking_contacts where client_id = v_a and ph_hash = v_bia_ph) <> 1 then
    raise exception 'contato que já existia é ligado (sem duplicar): %', v_res;
  end if;
  -- Mesma etapa de novo: ignorado (sem histórico novo)
  v_res := private.wa_echo(jsonb_build_object('connection_id', v_conn, 'wa_hash', v_bia_wa, 'ph_hash', v_bia_ph,
    'message_key', '5555000066667777888899990000eeee', 'matches', jsonb_build_array(jsonb_build_object('trigger_id', t_qual))));
  if v_res -> 'items' -> 0 ->> 'result' <> 'ignorado' then raise exception 'mesma etapa é ignorada: %', v_res; end if;
  v_ok := v_ok + 1;

  -- Frase arquivada não vale; conexão desligada não faz nada
  update public.tracking_wa_triggers set archived_at = now() where id = t_loja;
  if jsonb_array_length(private.wa_triggers_for(v_conn)) <> 2 then raise exception 'frase arquivada sai da lista'; end if;
  update public.tracking_whatsapp_connections set enabled = false where id = v_conn;
  v_res := private.wa_echo(jsonb_build_object('connection_id', v_conn, 'wa_hash', v_caio, 'message_key', '6666000077778888999900001111ffff',
    'matches', jsonb_build_array(jsonb_build_object('trigger_id', t_qual))));
  if v_res ->> 'result' <> 'desligado' or jsonb_array_length(private.wa_triggers_for(v_conn)) <> 0
     or exists (select 1 from public.tracking_contacts where client_id = v_a and ph_hash = v_caio) then
    raise exception 'conexão desligada não marca: %', v_res;
  end if;
  v_ok := v_ok + 1;

  select count(*) into v_n from public.tracking_wa_trigger_log where connection_id = v_conn;
  if v_n <> 7 then raise exception 'registro de cada frase reconhecida (7): %', v_n; end if;
  v_ok := v_ok + 1;

  raise exception 'R: % verificações OK', v_ok;
end $$;
