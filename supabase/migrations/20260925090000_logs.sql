-- =============================================================================
-- ETAPA 17 — Logs
--
-- Nenhuma tabela nova: usamos public.audit_logs (Etapa 1) e public.sync_runs
-- (Etapa 16). Esta migração:
--   1. Auditoria sem "ruído": atualizações automáticas que só mudam datas de
--      verificação (details_updated_at, last_checked_at) deixam de gerar
--      registro — antes, cada sincronização de hora em hora criava uma linha.
--      Os registros antigos NÃO são apagados.
--   2. Login e logout passam a ser registrados (log_auth_event).
--   3. audit_log_list(): a lista da tela Logs, com nome de quem fez e do
--      que foi alterado, sem nenhum campo sensível. Só o administrador lê
--      (regra da tabela audit_logs).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Auditoria: ignora campos que só registram "quando foi verificado"
-- -----------------------------------------------------------------------------
create or replace function private.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_type text := tg_argv[0];
  key_column  text := coalesce(tg_argv[1], case tg_argv[0] when 'client' then 'id' else 'client_id' end);
  before_row  jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  after_row   jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  changed     jsonb;
  actor       uuid;
begin
  if tg_op = 'UPDATE' then
    select jsonb_object_agg(key, jsonb_build_object('before', before_row -> key, 'after', value))
      into changed
    from jsonb_each(after_row)
    where key not in ('updated_at', 'updated_by', 'details_updated_at', 'last_checked_at')
      and value is distinct from before_row -> key;
    if changed is null then return new; end if;
  else
    changed := coalesce(after_row, before_row);
  end if;

  actor := coalesce((select auth.uid()), nullif(coalesce(after_row, before_row) ->> 'updated_by', '')::uuid);

  insert into public.audit_logs (actor_id, action, target_type, target_id, details)
  values (actor, target_type || '.' || lower(tg_op), target_type,
          coalesce(after_row, before_row) ->> key_column, changed);

  return coalesce(new, old);
end;
$$;

-- -----------------------------------------------------------------------------
-- 2. Login e logout
-- -----------------------------------------------------------------------------
create function private.log_auth_event_impl(p_event text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
begin
  if v_user is null then
    raise exception 'Faça login para continuar.' using errcode = '42501';
  end if;
  if p_event not in ('login', 'logout') then
    raise exception 'Evento inválido.' using errcode = '22023';
  end if;
  -- Sem repetição: o mesmo evento do mesmo usuário em menos de 1 minuto conta uma vez.
  if exists (
    select 1 from public.audit_logs l
    where l.actor_id = v_user and l.action = 'auth.' || p_event and l.created_at > now() - interval '1 minute'
  ) then
    return;
  end if;
  insert into public.audit_logs (actor_id, action, target_type, target_id, details)
  values (v_user, 'auth.' || p_event, 'user', v_user::text, '{}'::jsonb);
end;
$$;

revoke all on function private.log_auth_event_impl(text) from public, anon;
grant execute on function private.log_auth_event_impl(text) to authenticated;

create function public.log_auth_event(p_event text)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.log_auth_event_impl(p_event)
$$;

comment on function public.log_auth_event(text) is 'Registra login ou logout do próprio usuário na auditoria.';
revoke all on function public.log_auth_event(text) from public, anon;
grant execute on function public.log_auth_event(text) to authenticated;

-- Índice para a busca por pessoa + ação (tela Logs e a regra de "sem repetição").
create index audit_logs_actor_action_time_idx on public.audit_logs (actor_id, action, created_at desc);

-- -----------------------------------------------------------------------------
-- 3. Lista da tela Logs (com o RLS de quem pergunta: só admin lê a auditoria)
-- -----------------------------------------------------------------------------
create function public.audit_log_list(
  p_from      timestamptz default null,
  p_to        timestamptz default null,
  p_actor     uuid default null,
  p_category  text default null,
  p_before_id bigint default null,
  p_limit     integer default 100
)
returns table (
  id bigint, created_at timestamptz, actor_id uuid, actor_name text, actor_email text,
  action text, target_type text, target_id text, target_label text, details jsonb
)
language sql
stable
security invoker
set search_path = ''
as $$
  select l.id, l.created_at, l.actor_id, nullif(p.full_name, ''), p.email,
         l.action, l.target_type, l.target_id,
         case l.target_type
           when 'client'        then (select c.name from public.clients c where c.id::text = l.target_id)
           when 'client_access' then (select c.name from public.clients c where c.id::text = l.target_id)
           when 'ad_account'    then (select a.name from public.ad_accounts a where a.id::text = l.target_id)
           when 'connection'    then (select k.label from public.platform_connections k where k.id::text = l.target_id)
           when 'user'          then (select coalesce(nullif(u.full_name, ''), u.email) from public.profiles u where u.id::text = l.target_id)
         end,
         -- Nunca mostra campos de credencial (mesmo que só referências).
         (select coalesce(jsonb_object_agg(d.key, d.value), '{}'::jsonb)
            from jsonb_each(l.details) d
           where d.key !~* '(token|secret|password|senha|vault)')
  from public.audit_logs l
  left join public.profiles p on p.id = l.actor_id
  where (p_from is null or l.created_at >= p_from)
    and (p_to is null or l.created_at < p_to)
    and (p_actor is null or l.actor_id = p_actor)
    and (p_category is null or l.target_type = p_category or (p_category = 'auth' and l.action like 'auth.%'))
    and (p_category <> 'user' or p_category is null or l.action not like 'auth.%')
    and (p_before_id is null or l.id < p_before_id)
  order by l.id desc
  limit least(greatest(coalesce(p_limit, 100), 1), 500)
$$;

comment on function public.audit_log_list(timestamptz, timestamptz, uuid, text, bigint, integer) is
  'Auditoria para a tela Logs, com nomes e sem campos sensíveis. Só o administrador recebe linhas (RLS de audit_logs).';
revoke all on function public.audit_log_list(timestamptz, timestamptz, uuid, text, bigint, integer) from public, anon;
grant execute on function public.audit_log_list(timestamptz, timestamptz, uuid, text, bigint, integer) to authenticated;
