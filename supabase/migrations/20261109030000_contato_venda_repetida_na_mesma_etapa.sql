-- T5.11 (09/11/2026): marcar uma NOVA venda de quem já está na etapa "Venda" (ganha) era ignorado em silêncio.
-- contact_update só registrava a venda quando a etapa MUDAVA; para a pessoa que já estava em "Venda" nada era gravado
-- e nada ia ao Meta, mas a tela dizia que deu certo. Agora, etapa "ganha" com valor informado sempre registra uma
-- venda nova (o nº do pedido continua sem poder repetir). Nada mais mudou.
create or replace function private.contact_update_impl(p_id bigint, p_stage uuid, p_profile uuid, p_value numeric, p_currency text, p_order text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  c       public.tracking_contacts;
  v_stage public.tracking_contact_stages;
  v_prof  public.tracking_contact_profiles;
  v_out   jsonb := '{}'::jsonb;
  v_res   text;
  v_order text;
  v_nova_venda boolean := false;
begin
  select * into c from public.tracking_contacts where id = p_id for update;
  if c.id is null or not private.contacts_can_mark(c.client_id) then
    raise exception 'Contato não encontrado ou sem permissão.' using errcode = '42501';
  end if;
  if c.archived_at is not null then raise exception 'Contato arquivado.' using errcode = '22023'; end if;

  -- Perfil (ex.: Lojista): vai ao Meta uma vez só por pessoa, se o perfil tiver evento.
  if p_profile is not null and p_profile is distinct from c.profile_id then
    select * into v_prof from public.tracking_contact_profiles where id = p_profile and client_id = c.client_id and archived_at is null;
    if v_prof.id is null then raise exception 'Perfil não encontrado.' using errcode = 'P0002'; end if;
    update public.tracking_contacts set profile_id = v_prof.id, last_change_at = now(), last_change_by = (select auth.uid()) where id = c.id;
    v_res := null;
    if v_prof.meta_event is not null and not (v_prof.meta_event = any (c.meta_sent)) then
      v_res := private.contact_send(c, 'Lead', v_prof.meta_event, 'ct.' || c.id || '.perfil.' || v_prof.id, null, null, null);
      if v_res not in ('sem_site', 'cliente_desativado') then
        update public.tracking_contacts set meta_sent = array_append(meta_sent, v_prof.meta_event) where id = c.id;
      end if;
    end if;
    insert into public.tracking_contact_history (contact_id, client_id, by_user, kind, profile_id, meta_event, meta_note)
    values (c.id, c.client_id, (select auth.uid()), 'perfil', v_prof.id,
            case when v_res is not null and v_res not in ('sem_site', 'cliente_desativado') then v_prof.meta_event end,
            case when v_res = 'sem_site' then 'Não enviado ao Meta: cliente sem site no Tracking.'
                 when v_prof.meta_event is not null and v_res is null then 'Já enviado antes ao Meta para esta pessoa.' end);
    v_out := v_out || jsonb_build_object('perfil', v_prof.name, 'perfil_meta', case when v_res is null then null else v_res end);
  end if;

  -- Etapa (ex.: Venda): etapa "ganha" exige valor e moeda e registra a compra.
  -- Novo (T5.11): quem já está na etapa "ganha" e recebe outra venda (com valor) também registra.
  if p_stage is not null then
    v_nova_venda := p_value is not null and exists (select 1 from public.tracking_contact_stages ss where ss.id = p_stage and ss.client_id = c.client_id and ss.kind = 'ganha');
  end if;
  if p_stage is not null and (p_stage is distinct from c.stage_id or v_nova_venda) then
    select * into v_stage from public.tracking_contact_stages where id = p_stage and client_id = c.client_id and archived_at is null;
    if v_stage.id is null then raise exception 'Etapa não encontrada.' using errcode = 'P0002'; end if;
    v_res := null;
    if v_stage.kind = 'ganha' then
      if p_value is null or p_value < 0 or p_currency !~ '^[A-Z]{3}$' then
        raise exception 'Informe o valor e a moeda da venda.' using errcode = '22023';
      end if;
      if p_order is not null and p_order !~ '^[A-Za-z0-9_.:/#-]{1,100}$' then raise exception 'Nº do pedido inválido.' using errcode = '22023'; end if;
      v_order := coalesce(p_order, 'ct' || c.id || '-' || (c.sales + 1));
      if exists (select 1 from public.tracking_contact_history h where h.client_id = c.client_id and h.kind = 'venda' and h.order_id = v_order) then
        raise exception 'Já existe uma venda com este nº de pedido.' using errcode = '23505';
      end if;
      v_res := private.contact_send(c, 'Purchase', v_stage.meta_event, 'ct.' || c.id || '.venda.' || v_order, p_value, p_currency, v_order);
      update public.tracking_contacts set sales = sales + 1 where id = c.id;
      insert into public.tracking_contact_history (contact_id, client_id, by_user, kind, stage_id, value_micros, currency, order_id, meta_event, meta_note)
      values (c.id, c.client_id, (select auth.uid()), 'venda', v_stage.id, round(p_value * 1000000)::bigint, p_currency, v_order,
              case when v_res not in ('sem_site', 'cliente_desativado') then v_stage.meta_event end,
              case when v_res = 'sem_site' then 'Venda registrada; não enviada ao Meta: cliente sem site no Tracking.'
                   when v_stage.meta_event is null then 'Venda registrada; esta etapa não envia ao Meta.' end);
    else
      insert into public.tracking_contact_history (contact_id, client_id, by_user, kind, stage_id)
      values (c.id, c.client_id, (select auth.uid()), 'etapa', v_stage.id);
    end if;
    update public.tracking_contacts set stage_id = v_stage.id, last_change_at = now(), last_change_by = (select auth.uid()) where id = c.id;
    v_out := v_out || jsonb_build_object('etapa', v_stage.name, 'venda_meta', v_res);
  end if;
  return v_out;
end;
$function$;
