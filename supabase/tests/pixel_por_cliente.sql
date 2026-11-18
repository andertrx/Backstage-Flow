-- Teste: pixel por cliente + Lead qualificado. Transação desfeita ("R: N verificações OK").
-- Precisa de: 1 admin ativo e 1 cliente ativo, sem pixel, com as etapas padrão (cria o contato de teste sozinho).
do $$
declare
  v_admin uuid; k public.tracking_contacts; v_qual uuid; v_venda uuid; v_dest uuid := gen_random_uuid(); v_cont uuid; v_cli uuid;
  r jsonb; n0 int; n1 int; v_ok int := 0;
begin
  select id into v_admin from public.profiles where role = 'admin' limit 1;
  -- Contato de teste NOVO num cliente ativo que ainda não tem pixel (nada do que existe é alterado; tudo é desfeito no fim).
  select t.id, t.client_id into v_cont, v_cli from public.tracking_containers t
   where private.client_is_active(t.client_id)
     and not exists (select 1 from public.tracking_destinations d where d.client_id = t.client_id)
     and exists (select 1 from public.tracking_contact_stages s where s.client_id = t.client_id and s.name = 'Qualificado' and s.meta_event = 'LeadQualificado' and s.archived_at is null)
     and exists (select 1 from public.tracking_contact_stages s where s.client_id = t.client_id and s.name = 'Novo' and s.archived_at is null)
     and exists (select 1 from public.tracking_contact_stages s where s.client_id = t.client_id and s.kind = 'ganha' and s.archived_at is null)
   order by t.created_at limit 1;
  if v_cont is null then raise exception 'Sem cliente de teste adequado'; end if;
  insert into public.tracking_contacts (client_id, container_id, origin, visitor_id, session_id, stage_id)
  values (v_cli, v_cont, 'whatsapp', 'wa_teste_pixel', 'wa_teste_pixel',
          (select id from public.tracking_contact_stages where client_id = v_cli and name = 'Novo' and archived_at is null))
  returning * into k;
  select id into v_qual from public.tracking_contact_stages where client_id = k.client_id and name = 'Qualificado' and archived_at is null;
  select id into v_venda from public.tracking_contact_stages where client_id = k.client_id and kind = 'ganha' and archived_at is null order by position limit 1;

  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- 1) Sem pixel no cliente: nada na fila e o aviso "pixel_ok = false".
  select count(*) into n0 from public.tracking_capi_queue where client_id = k.client_id;
  r := public.contact_update(k.id, v_qual, null, null, null, null);
  select count(*) into n1 from public.tracking_capi_queue where client_id = k.client_id;
  if n1 <> n0 then raise exception 'FALHA 1: enfileirou sem pixel'; end if;
  if (r ->> 'pixel_ok')::boolean is not false then raise exception 'FALHA 1b: pixel_ok deveria ser false: %', r; end if;
  v_ok := v_ok + 1;

  -- 2) Pixel do cliente ligado (token fictício).
  reset role;
  insert into public.tracking_destinations (id, container_id, client_id, pixel_id, vault_secret_id, enabled)
  values (v_dest, v_cont, k.client_id, '999000111222333', gen_random_uuid(), true);
  -- Outra pessoa (o mesmo evento da pessoa 1 já foi registrado sem pixel e não repete).
  insert into public.tracking_contacts (client_id, container_id, origin, visitor_id, session_id, stage_id)
  values (k.client_id, v_cont, 'whatsapp', 'wa_teste_pixel2', 'wa_teste_pixel2',
          (select id from public.tracking_contact_stages where client_id = k.client_id and name = 'Novo' and archived_at is null))
  returning * into k;
  set local role authenticated;
  r := public.contact_update(k.id, v_qual, null, null, null, null);
  if (r ->> 'pixel_ok')::boolean is not true then raise exception 'FALHA 2: pixel_ok deveria ser true: %', r; end if;
  if (select count(*) from public.tracking_capi_queue where client_id = k.client_id and event_name = 'LeadQualificado') <> 1 then
    raise exception 'FALHA 2b: LeadQualificado não entrou na fila'; end if;
  v_ok := v_ok + 1;

  -- 3) Voltar e passar de novo pela etapa: não duplica (uma vez por pessoa).
  perform public.contact_update(k.id, (select id from public.tracking_contact_stages where client_id = k.client_id and name = 'Novo' and archived_at is null), null, null, null, null);
  perform public.contact_update(k.id, v_qual, null, null, null, null);
  if (select count(*) from public.tracking_capi_queue where client_id = k.client_id and event_name = 'LeadQualificado') <> 1 then
    raise exception 'FALHA 3: duplicou LeadQualificado'; end if;
  v_ok := v_ok + 1;

  -- 4) Venda: manda Purchase e NÃO duplica o LeadQualificado (já enviado).
  r := public.contact_update(k.id, v_venda, null, 150.00, 'BRL', 'TESTE-PIXEL-1');
  reset role; -- a fila só é lida pelo servidor
  if (select count(*) from public.tracking_capi_queue where client_id = k.client_id and event_name = 'Purchase' and custom_data ->> 'order_id' = 'TESTE-PIXEL-1') <> 1 then
    raise exception 'FALHA 4: Purchase não entrou'; end if;
  if (select count(*) from public.tracking_capi_queue where client_id = k.client_id and event_name = 'LeadQualificado') <> 1 then
    raise exception 'FALHA 4b: LeadQualificado duplicado na venda'; end if;
  v_ok := v_ok + 1;

  -- 5) Venda de quem NUNCA foi qualificado (pessoa nova): qualifica antes da compra (2 eventos).
  reset role;
  insert into public.tracking_contacts (client_id, container_id, origin, visitor_id, session_id, stage_id)
  values (k.client_id, v_cont, 'whatsapp', 'wa_teste_pixel3', 'wa_teste_pixel3',
          (select id from public.tracking_contact_stages where client_id = k.client_id and name = 'Novo' and archived_at is null))
  returning * into k;
  delete from public.tracking_capi_queue where client_id = k.client_id and event_name = 'LeadQualificado';
  set local role authenticated;
  r := public.contact_update(k.id, v_venda, null, 99.90, 'BRL', 'TESTE-PIXEL-2');
  reset role;
  if (select count(*) from public.tracking_capi_queue where client_id = k.client_id and event_name = 'LeadQualificado') <> 1 then
    raise exception 'FALHA 5: venda não qualificou o lead'; end if;
  if (select count(*) from public.tracking_capi_queue where client_id = k.client_id and event_name = 'Purchase' and custom_data ->> 'order_id' = 'TESTE-PIXEL-2') <> 1 then
    raise exception 'FALHA 5b: Purchase 2 não entrou'; end if;
  v_ok := v_ok + 1;

  raise exception 'R: % verificações OK (desfeito)', v_ok;
end $$;
