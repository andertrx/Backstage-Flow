-- Teste da Etapa 45.1 — avisos no WhatsApp. Transação desfeita: termina com "R: N verificações OK".
do $$
declare
  v_admin uuid; v_sem uuid; v_c1 uuid; v_ok int := 0; v_n int; v_p jsonb; v_a1 bigint; v_a2 bigint;
  v_h int := extract(hour from now() at time zone 'America/Sao_Paulo')::int;
  v_ids bigint[];
begin
  select id into v_admin from public.profiles where role = 'admin' and active order by created_at limit 1;
  select id into v_sem from public.profiles where active and role not in ('admin', 'cliente') order by created_at limit 1;
  select id into v_c1 from public.clients where excluded_at is null and status = 'ativo' order by name limit 1;
  update public.wa_gateway_settings set enabled = true, connection_state = 'conectado' where id;

  -- 1) só o administrador configura; grupo e tipo inválidos são recusados
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_sem, 'role', 'authenticated')::text, true);
  begin perform public.wa_avisos_config_save(true, '120363000000000077@g.us', 'Avisos', array['sem_saldo'], 22, 7, 12); raise exception 'não-admin configurou';
  exception when insufficient_privilege then null; end;
  select count(*) into v_n from public.wa_avisos_config;
  if v_n <> 0 then raise exception 'não-admin enxerga a configuração'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  begin perform public.wa_avisos_config_save(true, null, null, array['sem_saldo'], 22, 7, 12); raise exception 'ligou sem grupo';
  exception when sqlstate '22023' then null; end;
  begin perform public.wa_avisos_config_save(true, '5511999990000@s.whatsapp.net', 'x', array['sem_saldo'], 22, 7, 12); raise exception 'aceitou telefone';
  exception when sqlstate '22023' then null; end;
  begin perform public.wa_avisos_config_save(true, '120363000000000077@g.us', 'x', array['inventado'], 22, 7, 12); raise exception 'tipo inválido';
  exception when sqlstate '22023' then null; end;
  v_ok := v_ok + 1;

  -- 2) liga (sem silêncio agora): gera 1 aviso por alerta aberto; rodar de novo não duplica; só tipos escolhidos
  perform public.wa_avisos_config_save(true, '120363000000000077@g.us', 'Avisos', array['sem_saldo', 'erro_api'], (v_h + 2) % 24, (v_h + 3) % 24, 12);
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
  insert into public.alerts (alert_key, type, severity, client_id, description) values ('teste451:a', 'sem_saldo', 'critica', v_c1, 'Sem saldo disponível.') returning id into v_a1;
  insert into public.alerts (alert_key, type, severity, client_id, description) values ('teste451:b', 'erro_api', 'alta', v_c1, 'Erro de conexão.') returning id into v_a2;
  insert into public.alerts (alert_key, type, severity, client_id, description) values ('teste451:c', 'queda_resultados', 'media', v_c1, 'Queda.');
  if private.wa_avisos_gerar() <> 2 then raise exception 'gerou número errado'; end if;
  if private.wa_avisos_gerar() <> 0 then raise exception 'duplicou avisos'; end if;
  if exists (select 1 from public.wa_avisos where tipo = 'queda_resultados') then raise exception 'avisou tipo desligado'; end if;
  v_ok := v_ok + 1;

  -- 3) alerta resolvido ou "visto" não gera; cliente desativado não gera
  update public.alerts set status = 'visto', seen_at = now() where id = v_a1;
  insert into public.alerts (alert_key, type, severity, client_id, description) values ('teste451:d', 'sem_saldo', 'critica', v_c1, 'Outro.') returning id into v_a1;
  update public.clients set status = 'pausado' where id = v_c1;
  if private.wa_avisos_gerar() <> 0 then raise exception 'avisou cliente pausado'; end if;
  update public.clients set status = 'ativo' where id = v_c1;
  v_ok := v_ok + 1;

  -- 4) servidor: entrega os avisos numa mensagem só, uma vez; resultado ok fecha; ritmo de 2 minutos
  v_p := private.wa_aviso_proximo();
  if v_p is null or jsonb_array_length(v_p -> 'ids') <> 2 or v_p ->> 'grupo_id' <> '120363000000000077@g.us' or position('Sem saldo' in v_p ->> 'mensagem') = 0 then raise exception 'lote errado: %', v_p; end if;
  if private.wa_aviso_proximo() is not null then raise exception 'entregou o mesmo lote duas vezes'; end if;
  select array_agg(x::bigint) into v_ids from jsonb_array_elements_text(v_p -> 'ids') x;
  perform private.wa_aviso_resultado(v_ids, true, null, false);
  if (select count(*) from public.wa_avisos where status = 'enviado') <> 2 then raise exception 'não marcou enviado'; end if;
  perform private.wa_avisos_gerar();
  if private.wa_aviso_proximo() is not null then raise exception 'ignorou o ritmo de 2 minutos'; end if;
  v_ok := v_ok + 1;

  -- 5) falha temporária volta para a fila; horário de silêncio segura; trava desligada segura
  update public.wa_avisos set enviado_em = now() - interval '5 minutes' where status = 'enviado';
  v_p := private.wa_aviso_proximo();
  if v_p is null then raise exception 'não pegou o novo aviso'; end if;
  select array_agg(x::bigint) into v_ids from jsonb_array_elements_text(v_p -> 'ids') x;
  perform private.wa_aviso_resultado(v_ids, false, 'sem resposta', true);
  if (select count(*) from public.wa_avisos where id = any (v_ids) and status = 'pendente') <> array_length(v_ids, 1) then raise exception 'não voltou para a fila'; end if;
  update public.wa_avisos_config set silencio_inicio = v_h, silencio_fim = (v_h + 1) % 24 where id;
  if private.wa_aviso_proximo() is not null then raise exception 'enviou no horário de silêncio'; end if;
  update public.wa_avisos_config set silencio_inicio = (v_h + 2) % 24, silencio_fim = (v_h + 3) % 24 where id;
  update public.wa_gateway_settings set enabled = false where id;
  if private.wa_aviso_proximo() is not null then raise exception 'enviou com a trava desligada'; end if;
  v_ok := v_ok + 1;

  raise exception 'R: % verificações OK', v_ok;
end $$;
