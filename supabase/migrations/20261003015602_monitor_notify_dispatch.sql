-- Etapa 37.5 — Notificações do monitoramento (parte 2): entrega por pessoa e disparo a partir da linha do tempo do alerta.

-- Entrega um aviso a UMA pessoa, respeitando as preferências dela:
-- ligado/desligado, clientes, gravidade mínima (só alerta novo/piorou), limite de 10 por hora, silêncio (e-mail), canais.
create or replace function private.monitor_deliver(p_user uuid, p_kind text, p_title text, p_body text, p_alert bigint,
                                                   p_dedupe text, p_client uuid, p_severity text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  pr public.monitor_notify_prefs;
  v_hour integer;
  v_quiet boolean;
  v_nid bigint;
begin
  pr := private.monitor_prefs_of(p_user);
  if not pr.enabled then return; end if;
  if p_client is not null and pr.client_ids is not null and not (p_client = any (pr.client_ids)) then return; end if;
  if p_kind in ('alerta.novo', 'alerta.piorou') then
    if private.monitor_severity_rank(p_severity) < private.monitor_severity_rank(pr.min_severity) then return; end if;
    -- "Só resumo": alerta novo não avisa na hora (entra no resumo diário).
    if pr.mode = 'resumo' then return; end if;
    -- Anti-excesso: até 10 avisos de alerta por hora; o resto fica para o resumo diário.
    if (select count(*) from public.monitor_deliveries d
         where d.user_id = p_user and d.channel = 'interno' and d.kind in ('alerta.novo', 'alerta.piorou')
           and d.status = 'enviado' and d.created_at > now() - interval '1 hour') >= 10 then
      insert into public.monitor_deliveries (user_id, channel, kind, alert_id, dedupe_key, status, reason)
      values (p_user, 'interno', p_kind, p_alert, p_dedupe, 'pulado', 'Limite de 10 avisos por hora: vai no resumo diário.')
      on conflict (user_id, channel, dedupe_key) do nothing;
      return;
    end if;
  end if;
  v_hour := extract(hour from now() at time zone 'America/Sao_Paulo')::int;
  v_quiet := pr.quiet_start is not null and case when pr.quiet_start <= pr.quiet_end
                                                 then v_hour >= pr.quiet_start and v_hour < pr.quiet_end
                                                 else v_hour >= pr.quiet_start or v_hour < pr.quiet_end end;
  if pr.internal then
    insert into public.monitor_notifications (user_id, kind, title, body, link, alert_id, dedupe_key)
    values (p_user, p_kind, left(p_title, 300), left(p_body, 600),
            '/monitoramento?aba=alertas' || coalesce('&alerta=' || p_alert, ''), p_alert, p_dedupe)
    on conflict (user_id, dedupe_key) do nothing
    returning id into v_nid;
    if v_nid is null then return; end if; -- já avisado antes (sem duplicar)
    insert into public.monitor_deliveries (user_id, channel, kind, alert_id, notification_id, dedupe_key, status, sent_at)
    values (p_user, 'interno', p_kind, p_alert, v_nid, p_dedupe, 'enviado', now())
    on conflict (user_id, channel, dedupe_key) do nothing;
  end if;
  if pr.email then
    insert into public.monitor_deliveries (user_id, channel, kind, alert_id, notification_id, dedupe_key, status, reason)
    values (p_user, 'email', p_kind, p_alert, v_nid, p_dedupe, case when v_quiet then 'pulado' else 'pendente' end,
            case when v_quiet then 'Horário de silêncio da pessoa.' end)
    on conflict (user_id, channel, dedupe_key) do nothing;
  end if;
  if pr.whatsapp then
    insert into public.monitor_deliveries (user_id, channel, kind, alert_id, notification_id, dedupe_key, status, reason)
    values (p_user, 'whatsapp', p_kind, p_alert, v_nid, p_dedupe, 'preparado', 'O envio por WhatsApp ainda não está ligado (preparado).')
    on conflict (user_id, channel, dedupe_key) do nothing;
  end if;
end;
$$;
revoke all on function private.monitor_deliver(uuid, text, text, text, bigint, text, uuid, text) from public, anon, authenticated;

-- Disparo: cada evento da linha do tempo decide quem recebe. Nunca derruba a ação que gerou o evento.
create or replace function private.monitor_event_notify_tg()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.monitor_alerts;
  v_entity text; v_client text; v_title text; v_body text; v_kind text;
  u uuid;
begin
  if new.kind not in ('criado', 'piorou', 'atribuido', 'avaliacao') then return null; end if;
  begin
    select * into a from public.monitor_alerts where id = new.alert_id;
    v_entity := coalesce(case when a.level = 'ad' then (select ad.name from public.ads ad where ad.id = a.ad_id)
                              else (select c.name from public.campaigns c where c.id = a.campaign_id) end, 'item');
    v_client := (select cl.name from public.clients cl where cl.id = a.client_id);
    if new.kind in ('criado', 'piorou') then
      -- Só avisa quando o nível PIORA para crítico (melhora não gera aviso).
      if new.kind = 'piorou' and new.to_value <> 'critico' then return null; end if;
      v_kind := case new.kind when 'criado' then 'alerta.novo' else 'alerta.piorou' end;
      v_title := case when new.kind = 'piorou' then 'Alerta piorou para crítico'
                      when a.severity = 'critico' then 'Alerta crítico'
                      when a.severity = 'atencao' then 'Alerta de atenção' else 'Alerta informativo' end || ': ' || v_entity;
      v_body := v_client || ' · ' || a.explanation;
      for u in select p.id from public.profiles p where p.active and p.role::text in ('admin', 'gestor', 'operador', 'visualizador') loop
        if private.monitor_user_sees(u, a.client_id) then
          perform private.monitor_deliver(u, v_kind, v_title, v_body, a.id,
                                          'alerta:' || a.id || ':' || case new.kind when 'criado' then 'novo' else 'piorou:' || new.id end,
                                          a.client_id, a.severity);
        end if;
      end loop;
    elsif new.kind = 'atribuido' then
      u := nullif(new.data ->> 'user_id', '')::uuid;
      if u is not null and u is distinct from new.actor and private.monitor_user_sees(u, a.client_id)
         and (private.monitor_prefs_of(u)).notify_assigned then
        perform private.monitor_deliver(u, 'alerta.atribuido', 'Você é o responsável por um alerta: ' || v_entity,
                                        v_client || ' · ' || a.explanation, a.id, 'atribuido:' || new.id, a.client_id, null);
      end if;
    else
      -- Avaliação posterior: avisa o responsável e quem registrou a providência.
      for u in select distinct x from unnest(array[a.assigned_to,
                 (select e.actor from public.monitor_alert_events e where e.id = nullif(new.data ->> 'providencia_id', '')::bigint)]) x
               where x is not null loop
        if private.monitor_user_sees(u, a.client_id) and (private.monitor_prefs_of(u)).notify_followups then
          perform private.monitor_deliver(u, 'alerta.avaliacao', 'Resultado da providência: ' || v_entity,
                                          v_client || ' · ' || coalesce(new.note, ''), a.id, 'avaliacao:' || new.id, a.client_id, null);
        end if;
      end loop;
    end if;
  exception when others then
    raise warning 'monitor_event_notify_tg: %', sqlerrm;
  end;
  return null;
end;
$$;
revoke all on function private.monitor_event_notify_tg() from public, anon, authenticated;

create trigger monitor_alert_events_notify
  after insert on public.monitor_alert_events
  for each row execute function private.monitor_event_notify_tg();
