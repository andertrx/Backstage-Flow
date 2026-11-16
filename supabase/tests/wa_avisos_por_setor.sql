-- Avisos no WhatsApp por setor. Transação desfeita no final.
do $$
declare
  adm uuid; sec_d uuid; sec_g uuid; sec_c uuid; sec_a uuid; m public.monitor_alerts; cli uuid;
  n int := 0; msg text; t1 uuid; cnt int; p1 jsonb; p2 jsonb; vv int; lead_id uuid;
  G_D text := '120363000000000001@g.us'; G_G text := '120363000000000002@g.us'; G_C text := '120363000000000003@g.us'; G_A text := '120363000000000004@g.us';
begin
  select id into adm from public.profiles where role = 'admin' and active limit 1;
  select id into sec_d from public.ops_sectors where name = 'Design' and status = 'ativo';
  select id into sec_g from public.ops_sectors where name = 'Gestão de Tráfego' and status = 'ativo';
  select id into sec_c from public.ops_sectors where name = 'Comercial' and status = 'ativo';
  select id into sec_a from public.ops_sectors where name = 'Account Manager' and status = 'ativo';
  select * into m from public.monitor_alerts where level = 'campaign' and severity = 'critico' limit 1;
  select id into cli from public.clients where status = 'ativo' limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  -- opções específicas só existem no setor certo
  begin perform public.wa_avisos_setor_save(sec_d, true, G_D, 'Design', array['campanha_critica']); exception when others then msg := sqlerrm; end;
  if msg like '%não tem esse tipo%' then n := n + 1; end if; msg := null;                                  -- 1: Design não vê campanha
  begin perform public.wa_avisos_setor_save(sec_d, true, G_D, 'Design', array['com:lead.novo']); exception when others then msg := sqlerrm; end;
  if msg like '%não tem esse tipo%' then n := n + 1; end if; msg := null;                                  -- 2: Design não vê lead
  begin perform public.wa_avisos_setor_save(sec_d, true, null, null, array['st:tarefa.nova']); exception when others then msg := sqlerrm; end;
  if msg like '%Escolha o grupo do setor%' then n := n + 1; end if; msg := null;                           -- 3: precisa de grupo
  perform public.wa_avisos_setor_save(sec_d, true, G_D, 'Design', array['st:tarefa.nova', 'st:tarefa.concluida']);
  perform public.wa_avisos_setor_save(sec_g, true, G_G, 'Gestores', array['st:tarefa.nova', 'campanha_critica']);
  perform public.wa_avisos_setor_save(sec_c, true, G_C, 'Comercial', array['com:lead.novo']);
  perform public.wa_avisos_setor_save(sec_a, true, G_A, 'AMs', array['am:cliente.etapa']);
  reset role;
  if (select count(*) from public.wa_avisos_setores where ativo) = 4 then n := n + 1; end if;               -- 4: 4 setores ligados
  -- só quem não é admin é barrado
  perform set_config('request.jwt.claims', json_build_object('sub', (select id from public.profiles where role <> 'admin' and active limit 1), 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin perform public.wa_avisos_setor_save(sec_d, true, G_D, 'Design', array['st:tarefa.nova']); exception when others then msg := sqlerrm; end;
  if msg like '%Só o administrador%' then n := n + 1; end if; msg := null;                                 -- 5
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  -- eventos: tarefa no Design, caso crítico de campanha, lead novo, mudança de etapa do cliente
  set local role authenticated;
  t1 := public.ops_task_save(null, null, jsonb_build_object('title', 'Arte do post SETOR', 'sector_id', sec_d, 'people', jsonb_build_object('principal', adm)));
  reset role;
  insert into public.monitor_alerts overriding system value select (jsonb_populate_record(null::public.monitor_alerts, to_jsonb(m) || jsonb_build_object(
    'id', (select max(id) + 1 from public.monitor_alerts), 'dedupe_key', 'teste-setor', 'status', 'novo', 'first_detected_at', now()))).*;
  insert into public.ops_leads (company_name, stage_id, created_by) values ('Empresa Teste SETOR', 'prospeccao', adm) returning id into lead_id;
  insert into public.ops_activity (client_id, action, actor_id, origin, before, after) values (cli, 'cliente.etapa', adm, 'sistema', jsonb_build_object('etapa', 'onboarding_pendente'), jsonb_build_object('etapa', 'coleta_acessos'));
  perform private.wa_avisos_gerar();
  if exists (select 1 from public.wa_avisos where grupo_id = G_D and texto like '%Arte do post SETOR%' and tipo = 'st:tarefa.nova') then n := n + 1; end if;      -- 6: tarefa vai ao grupo do Design
  if not exists (select 1 from public.wa_avisos where grupo_id = G_D and tipo = 'campanha_critica') and exists (select 1 from public.wa_avisos where grupo_id = G_G and tipo = 'campanha_critica') then n := n + 1; end if;  -- 7: campanha só no grupo do gestor
  if exists (select 1 from public.wa_avisos where grupo_id = G_G and texto like '%Arte do post SETOR%') is false then n := n + 1; end if;  -- 8: tarefa do Design não vai ao grupo do gestor (sem 'nova' de outro setor)
  if exists (select 1 from public.wa_avisos where grupo_id = G_C and tipo = 'com:lead.novo' and texto like '%Empresa Teste SETOR%') then n := n + 1; end if;       -- 9: lead no Comercial
  if exists (select 1 from public.wa_avisos where grupo_id = G_A and tipo = 'am:cliente.etapa') then n := n + 1; end if;                                          -- 10: etapa no Account Manager
  if not exists (select 1 from public.wa_avisos where grupo_id is null and (tipo like 'st:%' or tipo like 'com:%' or tipo like 'am:%')) then n := n + 1; end if; -- 11: nada vaza para o grupo principal
  select count(*) into cnt from public.wa_avisos; perform private.wa_avisos_gerar();
  if (select count(*) from public.wa_avisos) = cnt then n := n + 1; end if;                                  -- 12: segunda rodada não repete
  -- envio por grupo: cada mensagem vai para um grupo só
  update public.wa_gateway_settings set enabled = true, connection_state = 'conectado' where id;
  update public.wa_avisos_config set silencio_inicio = 0, silencio_fim = 0 where id;
  p1 := private.wa_aviso_proximo();
  if p1 is not null and (p1 ->> 'grupo_id') in (G_D, G_G, G_C, G_A) then n := n + 1; end if;                  -- 13: sai para um grupo de setor
  update public.wa_avisos set status = 'enviado', enviado_em = now() - interval '5 minutes' where id = any (array(select jsonb_array_elements_text(p1 -> 'ids')::bigint));
  p2 := private.wa_aviso_proximo();
  if p2 is not null and (p2 ->> 'grupo_id') <> (p1 ->> 'grupo_id') then n := n + 1; end if;                   -- 14: a próxima vai para outro grupo
  raise exception 'avisos por setor: % verificações OK de 14 (desfeito)', n;
end $$;
