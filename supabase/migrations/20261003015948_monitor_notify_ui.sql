-- Etapa 37.5 — Notificações (parte 4): funções da tela (meus avisos, marcar lido, preferências, histórico de envios).

create or replace function private.monitor_notifications_list_impl(p_limit integer, p_unread boolean)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.monitor_can('view') then
    raise exception 'Sem permissão para ver o monitoramento' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'unread', (select count(*) from public.monitor_notifications n where n.user_id = (select auth.uid()) and n.read_at is null),
    'items', coalesce((select jsonb_agg(jsonb_build_object('id', n.id, 'kind', n.kind, 'title', n.title, 'body', n.body, 'link', n.link,
                                                           'alert_id', n.alert_id, 'created_at', n.created_at, 'read_at', n.read_at)
                                        order by n.created_at desc, n.id desc)
                         from (select * from public.monitor_notifications n
                                where n.user_id = (select auth.uid()) and (not coalesce(p_unread, false) or n.read_at is null)
                                order by n.created_at desc, n.id desc
                                limit least(greatest(coalesce(p_limit, 30), 1), 200)) n), '[]'));
end;
$$;

-- Marca como lidos (os meus). Sem lista = todos.
create or replace function private.monitor_notifications_read_impl(p_ids bigint[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n integer;
begin
  if not private.monitor_can('view') then
    raise exception 'Sem permissão para ver o monitoramento' using errcode = '42501';
  end if;
  update public.monitor_notifications set read_at = now()
   where user_id = (select auth.uid()) and read_at is null and (p_ids is null or id = any (p_ids));
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- Preferências (as minhas; o administrador também vê e muda as de outra pessoa).
create or replace function private.monitor_prefs_target(p_user uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := coalesce(p_user, (select auth.uid()));
begin
  if not private.monitor_can('view') then
    raise exception 'Sem permissão para ver o monitoramento' using errcode = '42501';
  end if;
  if v_user <> (select auth.uid()) and not private.monitor_can('admin') then
    raise exception 'Só o administrador muda as notificações de outra pessoa' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles p where p.id = v_user and p.role::text in ('admin', 'gestor', 'operador', 'visualizador')) then
    raise exception 'Pessoa não encontrada.' using errcode = '22023';
  end if;
  return v_user;
end;
$$;

create or replace function private.monitor_prefs_get_impl(p_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := private.monitor_prefs_target(p_user);
  pr public.monitor_notify_prefs := private.monitor_prefs_of(v_user);
begin
  return (to_jsonb(pr) - 'updated_by') || jsonb_build_object(
    'is_default', not exists (select 1 from public.monitor_notify_prefs x where x.user_id = v_user),
    'user_name', (select p.full_name from public.profiles p where p.id = v_user),
    'has_email', exists (select 1 from public.profiles p where p.id = v_user and p.email is not null),
    'email_ready', coalesce((select s.has_key from public.email_settings s where s.id), false));
end;
$$;

create or replace function private.monitor_prefs_save_impl(p_user uuid, p jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := private.monitor_prefs_target(p_user);
  v_clients uuid[];
  v_qs smallint := nullif(p ->> 'quiet_start', '')::smallint;
  v_qe smallint := nullif(p ->> 'quiet_end', '')::smallint;
begin
  if coalesce(p ->> 'min_severity', '') not in ('critico', 'atencao', 'informativo') then
    raise exception 'Gravidade mínima inválida.' using errcode = '22023';
  end if;
  if coalesce(p ->> 'mode', '') not in ('imediato', 'resumo', 'ambos') then
    raise exception 'Escolha quando receber: na hora, só resumo diário ou os dois.' using errcode = '22023';
  end if;
  if coalesce((p ->> 'digest_hour')::int, -1) not between 0 and 23 then
    raise exception 'Hora do resumo inválida.' using errcode = '22023';
  end if;
  if (v_qs is null) <> (v_qe is null) or (v_qs is not null and (v_qs not between 0 and 23 or v_qe not between 0 and 23 or v_qs = v_qe)) then
    raise exception 'Horário de silêncio inválido: informe início e fim diferentes (0 a 23 h).' using errcode = '22023';
  end if;
  -- Clientes: só os que a pessoa enxerga (lista vazia = todos).
  if jsonb_typeof(p -> 'client_ids') = 'array' and jsonb_array_length(p -> 'client_ids') > 0 then
    select array_agg(x::uuid) into v_clients
      from jsonb_array_elements_text(p -> 'client_ids') x
     where private.monitor_user_sees(v_user, x::uuid);
    if v_clients is null then raise exception 'Nenhum dos clientes escolhidos está liberado para essa pessoa.' using errcode = '22023'; end if;
  end if;
  insert into public.monitor_notify_prefs as t (user_id, enabled, internal, email, whatsapp, min_severity, client_ids, mode, digest_hour,
                                                quiet_start, quiet_end, notify_assigned, notify_followups, updated_at, updated_by)
  values (v_user, coalesce((p ->> 'enabled')::boolean, true), coalesce((p ->> 'internal')::boolean, true),
          coalesce((p ->> 'email')::boolean, false), coalesce((p ->> 'whatsapp')::boolean, false), p ->> 'min_severity', v_clients,
          p ->> 'mode', (p ->> 'digest_hour')::smallint, v_qs, v_qe, coalesce((p ->> 'notify_assigned')::boolean, true),
          coalesce((p ->> 'notify_followups')::boolean, true), now(), (select auth.uid()))
  on conflict (user_id) do update set enabled = excluded.enabled, internal = excluded.internal, email = excluded.email,
         whatsapp = excluded.whatsapp, min_severity = excluded.min_severity, client_ids = excluded.client_ids, mode = excluded.mode,
         digest_hour = excluded.digest_hour, quiet_start = excluded.quiet_start, quiet_end = excluded.quiet_end,
         notify_assigned = excluded.notify_assigned, notify_followups = excluded.notify_followups,
         updated_at = excluded.updated_at, updated_by = excluded.updated_by;
end;
$$;

-- Pessoas que podem receber avisos (para o administrador escolher de quem mexer).
create or replace function private.monitor_notify_people_impl()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.monitor_can('admin') then
    raise exception 'Só o administrador vê as notificações de outras pessoas' using errcode = '42501';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.full_name, 'role', p.role) order by p.full_name)
                     from public.profiles p where p.active and p.role::text in ('admin', 'gestor', 'operador', 'visualizador')), '[]');
end;
$$;

-- Histórico de envios: os meus; o administrador vê de todos.
create or replace function private.monitor_deliveries_list_impl(p_limit integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.monitor_can('view') then
    raise exception 'Sem permissão para ver o monitoramento' using errcode = '42501';
  end if;
  return coalesce((select jsonb_agg(x.j order by x.created_at desc, x.id desc) from (
    select d.id, d.created_at, jsonb_build_object('id', d.id, 'user_name', p.full_name, 'channel', d.channel, 'kind', d.kind, 'status', d.status,
                              'reason', d.reason, 'title', coalesce(d.title, n.title), 'alert_id', d.alert_id, 'attempts', d.attempts,
                              'created_at', d.created_at, 'sent_at', d.sent_at) as j
      from public.monitor_deliveries d
      join public.profiles p on p.id = d.user_id
      left join public.monitor_notifications n on n.id = d.notification_id
     where d.user_id = (select auth.uid()) or private.monitor_can('admin')
     order by d.created_at desc, d.id desc
     limit least(greatest(coalesce(p_limit, 100), 1), 500)) x), '[]');
end;
$$;

do $$
declare f text;
begin
  foreach f in array array['monitor_notifications_list_impl(integer, boolean)', 'monitor_notifications_read_impl(bigint[])',
                           'monitor_prefs_get_impl(uuid)', 'monitor_prefs_save_impl(uuid, jsonb)', 'monitor_notify_people_impl()',
                           'monitor_deliveries_list_impl(integer)'] loop
    execute format('revoke all on function private.%s from public, anon', f);
    execute format('grant execute on function private.%s to authenticated', f);
  end loop;
  revoke all on function private.monitor_prefs_target(uuid) from public, anon;
  grant execute on function private.monitor_prefs_target(uuid) to authenticated;
end $$;

create or replace function public.monitor_notifications_list(p_limit integer default 30, p_unread boolean default false) returns jsonb
language sql stable set search_path = '' as $$ select private.monitor_notifications_list_impl(p_limit, p_unread) $$;
create or replace function public.monitor_notifications_read(p_ids bigint[] default null) returns integer
language sql set search_path = '' as $$ select private.monitor_notifications_read_impl(p_ids) $$;
create or replace function public.monitor_prefs_get(p_user uuid default null) returns jsonb
language sql stable set search_path = '' as $$ select private.monitor_prefs_get_impl(p_user) $$;
create or replace function public.monitor_prefs_save(p_user uuid, p jsonb) returns void
language sql set search_path = '' as $$ select private.monitor_prefs_save_impl(p_user, p) $$;
create or replace function public.monitor_notify_people() returns jsonb
language sql stable set search_path = '' as $$ select private.monitor_notify_people_impl() $$;
create or replace function public.monitor_deliveries_list(p_limit integer default 100) returns jsonb
language sql stable set search_path = '' as $$ select private.monitor_deliveries_list_impl(p_limit) $$;

do $$
declare f text;
begin
  foreach f in array array['monitor_notifications_list(integer, boolean)', 'monitor_notifications_read(bigint[])', 'monitor_prefs_get(uuid)',
                           'monitor_prefs_save(uuid, jsonb)', 'monitor_notify_people()', 'monitor_deliveries_list(integer)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
