-- Etapa 51.5 — Substituir a reunião de onboarding (pedido do Ander, 07/11/2026):
--   "Trocar reunião" vincula outra reunião (existente ou criada na hora) e a anterior é finalizada com a observação
--   "Substituída pela reunião #N em dd/mm/aaaa hh:mm":
--     - anterior ainda agendada: fica CANCELADA com esse motivo (decisão do Ander: não conta como realizada);
--     - anterior já finalizada (realizada ou cancelada): só ganha a observação na ata (nada é apagado).
--   O cliente não volta para Onboarding Pendente: a reunião nova já está vinculada antes de a anterior ser cancelada.
create function private.ops_client_meeting_replace_impl(p_client uuid, p_meeting uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_old uuid;
  o record;
  n record;
  v_note text;
begin
  select onboarding_meeting_id into v_old from public.ops_client_ops where client_id = p_client;
  if v_old is not null and v_old = p_meeting then
    raise exception 'Esta já é a reunião de onboarding deste cliente.' using errcode = '22023';
  end if;
  -- vincula a nova (confere permissão, cliente, reunião cancelada e reunião de outro cliente)
  perform private.ops_client_meeting_link_impl(p_client, p_meeting);
  select id, number into n from public.ops_meetings where id = p_meeting;
  if v_old is null then
    return jsonb_build_object('nova', n.number, 'anterior', null);
  end if;

  select * into o from public.ops_meetings where id = v_old for update;
  v_note := 'Substituída pela reunião #' || n.number || ' em ' || to_char(now() at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI') || '.';
  if o.status = 'agendada' then
    update public.ops_meetings set status = 'cancelada', cancel_reason = v_note, cancel_kind = 'outro',
           version = version + 1, updated_by = (select auth.uid())
     where id = v_old;
    perform private.ops_meeting_log(v_old, 'reuniao.cancelada', null, jsonb_build_object('motivo', v_note, 'substituida_por', n.number));
  else
    update public.ops_meetings set notes = coalesce(nullif(btrim(notes), '') || E'\n\n', '') || v_note,
           version = version + 1, updated_by = (select auth.uid())
     where id = v_old;
    perform private.ops_meeting_log(v_old, 'reuniao.substituida', null, jsonb_build_object('substituida_por', n.number));
  end if;
  perform private.ops_log(null, p_client, 'cliente.reuniao_substituida',
    jsonb_build_object('reuniao', v_old, 'numero', o.number, 'situacao', o.status),
    jsonb_build_object('reuniao', p_meeting, 'numero', n.number));
  return jsonb_build_object('nova', n.number, 'anterior', o.number, 'anterior_situacao', case when o.status = 'agendada' then 'cancelada' else o.status end);
end;
$$;
revoke all on function private.ops_client_meeting_replace_impl(uuid, uuid) from public, anon;
grant execute on function private.ops_client_meeting_replace_impl(uuid, uuid) to authenticated;
create function public.ops_client_meeting_replace(p_client uuid, p_meeting uuid)
returns jsonb language sql set search_path = '' as $$ select private.ops_client_meeting_replace_impl(p_client, p_meeting) $$;
revoke all on function public.ops_client_meeting_replace(uuid, uuid) from public, anon;
grant execute on function public.ops_client_meeting_replace(uuid, uuid) to authenticated;
