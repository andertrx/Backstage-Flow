-- Correção da contatos_vendedor: criar contato sem código (manual) não pode ler variável vazia.
create or replace function private.contact_create_impl(p_client uuid, p_code text, p_ph_hash text, p_em_hash text, p_container uuid)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code    text := private.contacts_normalize_code(p_code);
  v_click   public.tracking_whatsapp_clicks;
  v_id      bigint;
  v_stage   uuid;
  v_vis     text;
  v_cont    uuid;
  v_lead    record;
begin
  if not private.contacts_can_mark(p_client) then
    raise exception 'Sem permissão para marcar contatos deste cliente.' using errcode = '42501';
  end if;
  if p_ph_hash is not null and p_ph_hash !~ '^[0-9a-f]{64}$' then raise exception 'Telefone inválido.' using errcode = '22023'; end if;
  if p_em_hash is not null and p_em_hash !~ '^[0-9a-f]{64}$' then raise exception 'E-mail inválido.' using errcode = '22023'; end if;
  if p_code is not null and v_code is null then
    raise exception 'Código inválido. São 6 letras/números, como K7Q2M9.' using errcode = '22023';
  end if;
  if v_code is null and p_ph_hash is null and p_em_hash is null then
    raise exception 'Informe o código da mensagem ou o telefone.' using errcode = '22023';
  end if;
  select null::bigint as id, null::uuid as container_id, null::text as first_visitor_id, null::bigint as first_touch_id into v_lead;

  if v_code is not null then
    select w.* into v_click from public.tracking_whatsapp_clicks w where w.client_id = p_client and w.code = v_code and not w.test;
    if v_click.id is null then raise exception 'Código não encontrado neste cliente.' using errcode = 'P0002'; end if;
    select id into v_id from public.tracking_contacts
     where wa_click_id = v_click.id or (client_id = p_client and visitor_id = v_click.visitor_id and origin = 'whatsapp')
     order by id limit 1;
    if v_id is not null then return v_id; end if;
  end if;
  if p_ph_hash is not null then
    select id into v_id from public.tracking_contacts where client_id = p_client and ph_hash = p_ph_hash;
    if v_id is not null then
      if v_click.id is not null then
        update public.tracking_contacts set wa_click_id = coalesce(wa_click_id, v_click.id), ref_code = coalesce(ref_code, v_code) where id = v_id;
      end if;
      return v_id;
    end if;
  end if;

  select s.id into v_stage from public.tracking_contact_stages s
   where s.client_id = p_client and s.archived_at is null and s.kind = 'aberta' order by s.position limit 1;
  if v_stage is null then raise exception 'Cadastre ao menos uma etapa aberta para este cliente.' using errcode = '22023'; end if;

  -- Mesmo telefone já é lead do site? Herda a origem dele.
  if p_ph_hash is not null and v_click.id is null then
    select l.id, l.container_id, l.first_visitor_id, l.first_touch_id into v_lead from public.tracking_leads l
     where l.client_id = p_client and l.ph_hash = p_ph_hash and not l.test order by l.first_converted_at limit 1;
  end if;
  v_cont := coalesce(v_click.container_id, v_lead.container_id, p_container,
                     (select t.id from public.tracking_containers t where t.client_id = p_client order by t.created_at limit 1));
  if v_cont is not null and not exists (select 1 from public.tracking_containers t where t.id = v_cont and t.client_id = p_client) then
    raise exception 'Site não é deste cliente.' using errcode = '22023';
  end if;
  v_vis := coalesce(v_click.visitor_id, v_lead.first_visitor_id, 'ct' || replace(gen_random_uuid()::text, '-', ''));

  insert into public.tracking_contacts (client_id, container_id, origin, ph_hash, em_hash, visitor_id, session_id, lead_id, wa_click_id, ref_code,
                                        touchpoint_id, fbp, fbc, stage_id, created_by, last_change_by)
  values (p_client, v_cont, case when v_click.id is not null then 'whatsapp' when v_lead.id is not null then 'site' else 'manual' end,
          p_ph_hash, p_em_hash, v_vis, coalesce(v_click.session_id, v_vis), v_lead.id, v_click.id, v_code,
          coalesce(v_click.touchpoint_id, v_lead.first_touch_id), v_click.fbp, v_click.fbc, v_stage, (select auth.uid()), (select auth.uid()))
  returning id into v_id;
  insert into public.tracking_contact_history (contact_id, client_id, by_user, kind, stage_id)
  values (v_id, p_client, (select auth.uid()), 'criado', v_stage);
  return v_id;
end;
$$;
