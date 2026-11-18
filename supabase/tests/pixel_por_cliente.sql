-- Teste: pixel por cliente + Lead qualificado. Transação desfeita ("R: N verificações OK").
-- Precisa de: 1 admin ativo e 1 contato (com recipiente) de cliente ativo que ainda não tenha LeadQualificado.
do $$
declare
  v_admin uuid; k public.tracking_contacts; v_qual uuid; v_venda uuid; v_dest uuid := gen_random_uuid(); v_cont uuid;
  r jsonb; n0 int; n1 int; v_ok int := 0;
begin
  select id into v_admin from public.profiles where role = 'admin' limit 1;
  select c.* into k from public.tracking_contacts c
   where c.container_id is not null and c.archived_at is null and private.client_is_active(c.client_id)
     and not ('LeadQualificado' = any (c.meta_sent))
     and not exists (select 1 from public.tracking_destinations d where d.client_id = c.client_id)
     and exists (select 1 from public.tracking_contact_stages s where s.client_id = c.client_id and s.name = 'Qualificado' and s.meta_event = 'LeadQualificado' and s.archived_at is null)
     and exists (select 1 from public.tracking_contact_stages s where s.client_id = c.client_id and s.kind = 'ganha' and s.archived_at is null)
   order by c.id limit 1;
  if k.id is null then raise exception 'Sem contato de teste adequado'; end if;
  select id into v_qual from public.tracking_contact_stages where client_id = k.client_id and name = 'Qualificado' and archived_at is null;
  select id into v_venda from public.tracking_contact_stages where client_id = k.client_id and kind = 'ganha' and archived_at is null order by position limit 1;
  v_cont := k.container_id;

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
  update public.tracking_contacts set meta_sent = array_remove(meta_sent, 'LeadQualificado'), stage_id = (select id from public.tracking_contact_stages where client_id = k.client_id and name = 'Novo' and archived_at is null) where id = k.id;
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
  if (select count(*) from public.tracking_capi_queue where client_id = k.client_id and event_name = 'Purchase' and custom_data ->> 'order_id' = 'TESTE-PIXEL-1') <> 1 then
    raise exception 'FALHA 4: Purchase não entrou'; end if;
  if (select count(*) from public.tracking_capi_queue where client_id = k.client_id and event_name = 'LeadQualificado') <> 1 then
    raise exception 'FALHA 4b: LeadQualificado duplicado na venda'; end if;
  v_ok := v_ok + 1;

  -- 5) Venda de quem NUNCA foi qualificado: qualifica antes da compra (2 eventos).
  reset role;
  update public.tracking_contacts set meta_sent = array_remove(meta_sent, 'LeadQualificado'), stage_id = (select id from public.tracking_contact_stages where client_id = k.client_id and name = 'Novo' and archived_at is null) where id = k.id;
  delete from public.tracking_capi_queue where client_id = k.client_id and event_name = 'LeadQualificado';
  set local role authenticated;
  r := public.contact_update(k.id, v_venda, null, 99.90, 'BRL', 'TESTE-PIXEL-2');
  if (select count(*) from public.tracking_capi_queue where client_id = k.client_id and event_name = 'LeadQualificado') <> 1 then
    raise exception 'FALHA 5: venda não qualificou o lead'; end if;
  if (select count(*) from public.tracking_capi_queue where client_id = k.client_id and event_name = 'Purchase' and custom_data ->> 'order_id' = 'TESTE-PIXEL-2') <> 1 then
    raise exception 'FALHA 5b: Purchase 2 não entrou'; end if;
  v_ok := v_ok + 1;

  raise exception 'R: % verificações OK (desfeito)', v_ok;
end $$;
