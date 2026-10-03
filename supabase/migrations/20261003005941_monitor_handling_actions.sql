-- Etapa 37.4 — Central de alertas (parte 2): estado, visto, responsável, comentário, providência e resolver.
-- Quem pode: admin, gestor e operador (monitor.handle), só nos clientes liberados. Tudo vira evento permanente.

create or replace function private.monitor_alert_set_status_impl(p_id bigint, p_status text, p_version integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.monitor_alerts;
begin
  if p_status is null or p_status not in ('visualizado', 'em_analise', 'aguardando_acao', 'ignorado') then
    raise exception 'Estado inválido.' using errcode = '22023';
  end if;
  v := private.monitor_alert_lock(p_id, p_version);
  if v.status = p_status then return v.version; end if;
  update public.monitor_alerts set status = p_status, status_changed_at = now(), version = version + 1 where id = p_id;
  insert into public.monitor_alert_events (alert_id, kind, from_value, to_value, actor)
  values (p_id, 'estado', v.status, p_status, (select auth.uid()));
  return v.version + 1;
end;
$$;

-- Ao abrir o alerta, quem pode tratar marca "Visualizado" (só se ainda era "Novo"). Para os demais, não faz nada.
create or replace function private.monitor_alert_seen_impl(p_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.monitor_alerts;
begin
  if not private.monitor_can('handle') then return; end if;
  select * into v from public.monitor_alerts where id = p_id for update;
  if v.id is null or v.status <> 'novo' or v.resolved_at is not null or not private.can_view_client(v.client_id) then return; end if;
  update public.monitor_alerts set status = 'visualizado', status_changed_at = now(), version = version + 1 where id = p_id;
  insert into public.monitor_alert_events (alert_id, kind, from_value, to_value, actor)
  values (p_id, 'estado', 'novo', 'visualizado', (select auth.uid()));
end;
$$;

create or replace function private.monitor_alert_assign_impl(p_id bigint, p_user uuid, p_version integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.monitor_alerts;
begin
  v := private.monitor_alert_lock(p_id, p_version);
  if p_user is not null and not private.monitor_user_can_handle(p_user, v.client_id) then
    raise exception 'Essa pessoa não pode tratar alertas deste cliente.' using errcode = '22023';
  end if;
  if v.assigned_to is not distinct from p_user then return v.version; end if;
  update public.monitor_alerts set assigned_to = p_user, version = version + 1 where id = p_id;
  insert into public.monitor_alert_events (alert_id, kind, from_value, to_value, actor, data)
  values (p_id, 'atribuido', private.monitor_user_name(v.assigned_to), coalesce(private.monitor_user_name(p_user), 'ninguém'),
          (select auth.uid()), jsonb_build_object('user_id', p_user));
  return v.version + 1;
end;
$$;

-- Comentário: texto livre (1 a 2.000 caracteres). Vale também em alerta encerrado.
create or replace function private.monitor_alert_comment_impl(p_id bigint, p_text text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if char_length(btrim(coalesce(p_text, ''))) not between 1 and 2000 then
    raise exception 'Escreva o comentário (até 2.000 caracteres).' using errcode = '22023';
  end if;
  perform private.monitor_alert_lock(p_id, null, false);
  insert into public.monitor_alert_events (alert_id, kind, note, actor) values (p_id, 'comentario', btrim(p_text), (select auth.uid()));
end;
$$;

-- Providência: o que foi feito (ex.: "troquei o criativo"). 3 e 7 dias depois o sistema compara o antes e o depois.
create or replace function private.monitor_alert_action_impl(p_id bigint, p_text text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.monitor_alerts;
begin
  if char_length(btrim(coalesce(p_text, ''))) not between 3 and 2000 then
    raise exception 'Descreva a providência (de 3 a 2.000 caracteres).' using errcode = '22023';
  end if;
  v := private.monitor_alert_lock(p_id, null, false);
  insert into public.monitor_alert_events (alert_id, kind, note, actor, data)
  values (p_id, 'providencia', btrim(p_text), (select auth.uid()), jsonb_build_object('metric', v.metric));
end;
$$;

-- Resolver à mão: encerra o alerta (fica no histórico). O motor respeita por 24 h e não reabre na hora.
create or replace function private.monitor_alert_resolve_impl(p_id bigint, p_note text, p_version integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.monitor_alerts;
begin
  if char_length(coalesce(p_note, '')) > 2000 then raise exception 'Observação longa demais (até 2.000 caracteres).' using errcode = '22023'; end if;
  v := private.monitor_alert_lock(p_id, p_version);
  update public.monitor_alerts set status = 'resolvido', status_changed_at = now(), resolved_at = now(), resolution = 'manual',
         resolved_by = (select auth.uid()), version = version + 1
   where id = p_id;
  insert into public.monitor_alert_events (alert_id, kind, from_value, to_value, note, actor)
  values (p_id, 'estado', v.status, 'resolvido', nullif(btrim(p_note), ''), (select auth.uid()));
end;
$$;

do $$
declare f text;
begin
  foreach f in array array['monitor_alert_set_status_impl(bigint, text, integer)', 'monitor_alert_seen_impl(bigint)',
                           'monitor_alert_assign_impl(bigint, uuid, integer)', 'monitor_alert_comment_impl(bigint, text)',
                           'monitor_alert_action_impl(bigint, text)', 'monitor_alert_resolve_impl(bigint, text, integer)'] loop
    execute format('revoke all on function private.%s from public, anon', f);
    execute format('grant execute on function private.%s to authenticated', f);
  end loop;
end $$;

create or replace function public.monitor_alert_set_status(p_id bigint, p_status text, p_version integer) returns integer
language sql set search_path = '' as $$ select private.monitor_alert_set_status_impl(p_id, p_status, p_version) $$;
create or replace function public.monitor_alert_seen(p_id bigint) returns void
language sql set search_path = '' as $$ select private.monitor_alert_seen_impl(p_id) $$;
create or replace function public.monitor_alert_assign(p_id bigint, p_user uuid, p_version integer) returns integer
language sql set search_path = '' as $$ select private.monitor_alert_assign_impl(p_id, p_user, p_version) $$;
create or replace function public.monitor_alert_comment(p_id bigint, p_text text) returns void
language sql set search_path = '' as $$ select private.monitor_alert_comment_impl(p_id, p_text) $$;
create or replace function public.monitor_alert_action(p_id bigint, p_text text) returns void
language sql set search_path = '' as $$ select private.monitor_alert_action_impl(p_id, p_text) $$;
create or replace function public.monitor_alert_resolve(p_id bigint, p_note text, p_version integer) returns void
language sql set search_path = '' as $$ select private.monitor_alert_resolve_impl(p_id, p_note, p_version) $$;

do $$
declare f text;
begin
  foreach f in array array['monitor_alert_set_status(bigint, text, integer)', 'monitor_alert_seen(bigint)',
                           'monitor_alert_assign(bigint, uuid, integer)', 'monitor_alert_comment(bigint, text)',
                           'monitor_alert_action(bigint, text)', 'monitor_alert_resolve(bigint, text, integer)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
